/** Bash adapter integration: the same game journals must retain every golden commit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Engine} from '../src/engine/index.js';
import {executeBash} from '../src/shell/bash-runtime.js';
import {execute as executeLegacy} from '../src/shell/exec.js';

const vectors=JSON.parse(await readFile(new URL('../../demo/testvectors/walkthrough.json',import.meta.url),'utf8'));

for(const walk of vectors.walkthroughs) {
  test(`Bash Engine: ${walk.name} retains golden dialogue, commits and summary`,async()=>{
    let calls=0;
    const engine=new Engine({shell:'bash',shellExecutor:(...args)=>{calls++;return executeBash(...args);}});
    await engine.start();
    for(const step of walk.steps) {
      if(step.in==='wait')await engine.advance(step.dt);
      else await engine.feed(step.in,step.dt);
    }
    assert.deepEqual(engine.trace.filter(t=>t[0]==='say').map(t=>t[1]),walk.says,'says');
    assert.deepEqual(engine.save.commits.map(c=>[c.kind,c.data,c.branch,c.chapter,c.t,c.r,c.id]),walk.commits,'commits');
    assert.deepEqual(await engine.summary(),walk.summary,'summary');
    assert.ok(calls>0,'the injected Bash executor actually ran');
  });
}

test('Bash Engine: world handoff retains shell variables with the destination cwd',async()=>{
  const engine=new Engine({shellExecutor:executeBash});
  await executeBash('TOKEN=across; greet() { printf "%s\\n" "$TOKEN"; }; false',engine.vfs);
  const previous=engine.vfs, state=structuredClone(previous.shellState);
  await engine.action({world:'ch1'});
  assert.notEqual(engine.vfs,previous);
  assert.deepEqual(previous.shellState,state);
  assert.notEqual(engine.vfs.shellState,previous.shellState);
  const result=await executeBash('printf "%s\\n" "$?"; greet; printf "%s\\n" "$PWD"; pwd',engine.vfs);
  assert.equal(result.rc,0,result.stderr);
  assert.equal(result.stdout,`1\nacross\n${engine.vfs.cwd}\n${engine.vfs.cwd}\n`);
});

test('Bash Engine: rejected transaction restores files and serializable shell state',async()=>{
  const engine=new Engine({shellExecutor:executeBash});
  await executeBash('TOKEN=before; printf before > note',engine.vfs);
  const world=engine.vfs, before=world.clone();
  await assert.rejects(engine.transaction(async()=>{
    await executeBash('TOKEN=after; printf after > note; alias changed="echo changed"',engine.vfs);
    throw new DOMException('cancel','AbortError');
  }),{name:'AbortError'});
  assert.equal(engine.vfs,world);
  assert.deepEqual(world.shellState,before.shellState);
  assert.equal(world.readFile('note'),'before');
  const result=await executeBash('printf "%s\\n" "$TOKEN"',world);
  assert.equal(result.stdout,'before\n');
});

test('Bash Engine: mixed legacy and Bash journal reproduces files, state and commits',async()=>{
  const steps=[
    {raw:'zien'},
    {raw:'echo original > note'},
    {raw:'ls',shell:'legacy'},
    {raw:'N=7; report() { printf "%s\\n" "$N"; }; printf "%s\\n" "$RANDOM" > random-note',shell:'bash'},
    {raw:'N=$((N+1)); report >> note; false',shell:'bash'},
    {raw:'printf "%s\\n" "$?"; cat note',shell:'bash'},
  ];
  async function replay() {
    const engine=new Engine();await engine.start();
    for(const step of steps) {
      engine.shellExecutor=step.shell==='bash'?executeBash:executeLegacy;
      await engine.feed(step.raw,1);
    }
    return engine;
  }
  const live=await replay(),restored=await replay();
  assert.deepEqual(restored.save.commits,live.save.commits);
  assert.deepEqual(restored.vfs.nodes,live.vfs.nodes);
  assert.deepEqual(restored.vfs.inodes,live.vfs.inodes);
  assert.deepEqual(restored.vfs.shellState,live.vfs.shellState);
  assert.equal(restored.vfs.cwd,live.vfs.cwd);
  assert.equal(restored.vfs.readFile('note'),'original\n8\n');
});

test('Bash Engine: leaving a sandbox restores the main shell session with its files',async()=>{
  const engine=new Engine({shellExecutor:executeBash});
  await engine.start();await engine.feed('zien');
  await executeBash('TOKEN=main; printf main > note',engine.vfs);
  const main=engine.vfs,state=structuredClone(main.shellState);
  await engine.action({branch_enter:{name:'alt/sandbox',from:'main'}});
  await executeBash('TOKEN=branch; printf branch > note',engine.vfs,{branch:'alt/sandbox'});
  assert.equal(main.readFile('note'),'main');
  assert.deepEqual(main.shellState,state);
  await engine.action({branch_exit:{mode:'abandon'}});
  assert.equal(engine.vfs,main);
  assert.deepEqual(engine.vfs.shellState,state);
  assert.equal((await executeBash('printf "%s\\n" "$TOKEN"; cat note',engine.vfs)).stdout,'main\nmain');
});

test('Engine: a submitted runtime remains immutable across asynchronous clock commits',async()=>{
  const engine=new Engine();await engine.start();await engine.feed('zien');
  const advance=engine.advance.bind(engine);
  let release;const gate=new Promise(resolve=>{release=resolve;});
  engine.advance=async dt=>{await gate;return advance(dt);};
  const pending=engine.feed('printf replay-race > note',31);
  engine.shellExecutor=executeBash;engine.shellDialect='bash';
  release();await pending;
  assert.equal(engine.history.at(-1).rc,127);
  assert.equal(engine.vfs.readFile('note'),'');
  assert.equal(engine.vfs.shellState,null);
  await engine.feed('printf next > next-note');
  assert.equal(engine.vfs.readFile('next-note'),'next');
});

test('Engine: cancellation before shell dispatch rolls back the whole input transaction',async()=>{
  let calls=0;
  const engine=new Engine({shellExecutor:(...args)=>{calls++;return executeBash(...args);}});
  await engine.start();await engine.feed('zien');
  const advance=engine.advance.bind(engine),before=structuredClone(engine.save);
  let release;const gate=new Promise(resolve=>{release=resolve;});
  engine.advance=async dt=>{await gate;return advance(dt);};
  const controller=new AbortController(),pending=engine.feed('printf cancelled > note',31,{signal:controller.signal});
  controller.abort();release();
  await assert.rejects(pending,{name:'AbortError'});
  assert.equal(calls,0);
  assert.equal(engine.vfs.exists('note'),false);
  assert.deepEqual(engine.save,before);
});

test('Engine: legacy journals retain their original whole-line story dispatch',async()=>{
  const legacy=new Engine();await legacy.start();await legacy.feed('zien');
  await legacy.feed('help ; echo surprise > unexpected.txt');
  assert.equal(legacy.vfs.exists('unexpected.txt'),false);
  const bash=new Engine({shellExecutor:executeBash});await bash.start();await bash.feed('zien');
  await bash.feed('help ; echo surprise > unexpected.txt');
  assert.equal(bash.history.at(-1).rc,0);
  assert.match(bash.history.at(-1).output,/just-bash shell builtins/);
  assert.equal(bash.vfs.readFile('unexpected.txt'),'surprise\n');
});
