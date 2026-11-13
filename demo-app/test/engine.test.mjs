/**
 * 流程/互通 QA（T5/T10/T11）：依賴 Engine/expr/save/data 與 walkthrough.json、Python check_codes.py。
 * 命名案例描述輸入/預期，callback 回傳 void/Promise；所有引擎操作依序 await，不使用真實等待。
 * T11 會重寫 notes/codes.txt 再啟動 Python（30 秒限制）；其餘只改各案例記憶體，不改測資。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const vectors = JSON.parse(await readFile(new URL('../../demo/testvectors/walkthrough.json', import.meta.url), 'utf8'));

test('T5: expression cases and errors match the Python reference', async () => {
  const { evaluate, ExprError } = await import('../src/expr.js');
  const source = vectors.expr.env;
  const env = {
    flags: new Set(source.flags), vars: source.vars,
    funcs: Object.fromEntries(['done', 'empty', 'exists'].map(key => [key, value => source[key].includes(value)])),
  };
  for (const { expr, expect } of vectors.expr.cases) assert.equal(evaluate(expr, env), expect, expr);
  for (const expr of vectors.expr.errors) assert.throws(() => evaluate(expr, env), ExprError, expr);
  assert.equal(evaluate("1 == true", env), false);
  assert.equal(evaluate("'02' < 3", env), false);
  assert.throws(() => evaluate('false and foo(1)', env), ExprError);
});

const runs = new Map();
/** T10/T11 呼叫；走法物件 → Promise<{engine,output}>，每條只重播一次並快取 Promise，後續應只讀結果。 */
async function replay(walk) {
  if (!runs.has(walk.name)) runs.set(walk.name, (async () => {
    const { Engine } = await import('../src/engine/index.js');
    const output = [];
    const engine = new Engine({ onOutput: (text, kind) => output.push({ text, kind }) });
    await engine.start();
    for (const step of walk.steps) {
      if (step.in === 'wait') await engine.advance(step.dt);
      else await engine.feed(step.in, step.dt);
    }
    return { engine, output };
  })());
  return runs.get(walk.name);
}

for (const walk of vectors.walkthroughs) {
  test(`T10: ${walk.name} says, every commit including id, and summary`, async () => {
    const { engine, output } = await replay(walk);
    assert.deepEqual(engine.trace.filter(t => t[0] === 'say').map(t => t[1]), walk.says, 'says');
    assert.deepEqual(engine.save.commits.map(c => [c.kind, c.data, c.branch, c.chapter, c.t, c.r, c.id]), walk.commits, 'commits');
    assert.deepEqual(await engine.summary(), walk.summary, 'summary');
    assert.ok(output.some(o => o.text.includes('值班登記完成')), 'actual ending text, not only node IDs');
    assert.ok(output.some(o => o.text.includes('你有一封信')), 'text_ref and conditional lines');
    assert.ok(output.every(o => typeof o.text === 'string' && !/\{(?:nick|suggest|quest_hint_1|quest_hint_2|quest_reference_cmd)\}/.test(o.text)), 'template variables expanded');
    if (walk.name === 'digger') assert.ok(output.some(o => o.text.includes('茶水間有一片三明治。不是我放的。')), 'delayed dialogue');
  });
}

test('T11: four JS codes import intact in JS and in Python check_codes.py', async () => {
  const S = await import('../src/save/index.js');
  const codes = [];
  for (const walk of vectors.walkthroughs) {
    const { engine } = await replay(walk);
    const code = await S.exportCode(engine.save);
    const imported = await S.importCode(code);
    assert.equal(imported.head, walk.summary.head);
    assert.deepEqual(await S.level(imported), ['intact', []]);
    codes.push(code);
  }
  const file = new URL('../notes/codes.txt', import.meta.url);
  await mkdir(new URL('../notes/', import.meta.url), { recursive: true });
  await writeFile(file, `${codes.join('\n')}\n`, 'utf8');
  const result = spawnSync('python', ['demo/tools/check_codes.py', 'demo-app/notes/codes.txt'], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal((result.stdout.match(/完整/g) || []).length, 4, result.stdout);
  assert.ok(!/可疑|損毀|拒絕/.test(result.stdout), result.stdout);
  const { DATA } = await import('../src/data.js');
  const rows = result.stdout.trim().split(/\r?\n/);
  for (const [index, walk] of vectors.walkthroughs.entries()) {
    const expected = walk.summary;
    const title = DATA.yaml['demo/demo.yaml'].titles.find(t => t.id === expected.title_id).text;
    const time = `${Math.floor(expected.seconds / 60)}:${String(expected.seconds % 60).padStart(2, '0')}`;
    assert.ok(rows[index].includes(`commits=${expected.n_commits}  分數=${expected.score}  稱號=${title}  耗時=${time}`), rows[index]);
  }
});

test('Engine: fractional clock crosses all boundaries; split and merged advance agree', async () => {
  const { Engine } = await import('../src/engine/index.js');
  const split = new Engine(), merged = new Engine();
  for (const engine of [split, merged]) { await engine.start(); await engine.feed('zien'); }
  await split.advance(29.75);
  assert.equal(split.save.commits.filter(c => c.kind === 'hint').length, 0);
  await split.advance(0.5);
  assert.equal(split.save.commits.filter(c => c.kind === 'hint').length, 1);
  assert.equal(split.save.commits.at(-1).r, 30000);
  await split.advance(809.6);
  assert.ok(!split.trace.some(t => t[1] === 'init.demo_time_warning'));
  await split.advance(0.3);
  assert.ok(split.trace.some(t => t[1] === 'init.demo_time_warning'));
  await split.advance(59.7);
  assert.equal(split.inputMode, null);
  await split.advance(0.3);
  assert.equal(split.inputMode, 'choice');
  await split.advance(59.7);
  assert.equal(split.ended, false);
  await split.advance(0.3);
  assert.equal(split.ended, true);
  assert.equal(split.save.commits.at(-1).r, 960000);
  await merged.advance(960.15);
  assert.deepEqual(split.save.commits, merged.save.commits);
  assert.deepEqual(split.trace, merged.trace);
  assert.deepEqual(split.outputs, merged.outputs);
  assert.deepEqual(split.save.commits.filter(c => c.kind === 'hint').map(c => c.r), [30000, 60000, 90000]);
});

test('Engine: actual text, wrong-answer tiers, INPUT escape, and delayed output', async () => {
  const { Engine } = await import('../src/engine/index.js');
  const engine = new Engine();
  await engine.start();
  await engine.feed('zien');
  assert.ok(engine.outputs.some(o => o.text === '[init] 暱稱已記錄：op-zien。\n'));
  await engine.feed('systemctl start lamp');
  const before = engine.save.commits.length;
  await engine.advance(91.25);
  assert.equal(engine.save.commits.length, before, 'INPUT suppresses idle hints');
  const expected = ['[init] 口令不符。\n', '[init] 口令不符。它在手冊裡。\n', '[init] 口令不符。cat handbook.md，第 5 節。\n'];
  for (const text of expected) { await engine.feed('wrong'); assert.equal(engine.outputs.at(-1).text, text); }
  assert.equal(engine.inputMode, 'input');
  await engine.feed('cat handbook.md');
  assert.equal(engine.mode, null);
  await engine.feed('sudo make me a sandwich');
  const sandwich = () => engine.outputs.filter(o => o.text.includes('茶水間有一片三明治。不是我放的。')).length;
  await engine.feed('ls'); await engine.feed('pwd');
  assert.equal(sandwich(), 0);
  await engine.feed('ls');
  assert.equal(sandwich(), 1);
});

test('Engine: hints share persistent counters with idle and expand quest text', async () => {
  const { Engine } = await import('../src/engine/index.js');
  const engine = new Engine();
  await engine.start(); await engine.feed('zien');
  await engine.advance(30.125);
  await engine.feed('hint');
  await engine.advance(30.125);
  assert.equal(engine.ladders['q.Q0-1'], 3);
  assert.ok(engine.flags.has('flag.demo.used_full_hint'));
  assert.deepEqual(engine.save.commits.filter(c => c.kind === 'hint').map(c => c.data), [
    { n: 1, full: false }, { n: 2, full: false }, { n: 3, full: true },
  ]);
  assert.ok(engine.outputs.some(o => o.text.includes('這一題的指令是：ls')));
});

test('Engine: host votes immediately after lamp and carries host-led event; seed is configurable', async () => {
  const { Engine } = await import('../src/engine/index.js');
  const engine = new Engine({ seed: 17, event: 'custom-event', mode: 'host' });
  await engine.start(); await engine.feed('zien');
  for (const raw of ['ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log', 'grep -r KEY-FRAG ~', 'systemctl start lamp', 'lamp-before-sudo']) await engine.feed(raw, 20);
  assert.equal(engine.save.seed, 17);
  assert.equal(engine.save.event, 'host-led');
  assert.equal(engine.world, 'ch0');
  assert.equal(engine.branch, 'main');
  assert.equal(engine.inputMode, 'choice');
  assert.ok(!engine.trace.some(t => t[0] === 'say' && t[1] === 'init.branch_offer'));
  assert.ok(!engine.save.commits.some(c => c.kind === 'branch.enter' || c.chapter === 'ch1'));
  await engine.feed('pass', 20);
  assert.equal(engine.ended, true);
  const self = new Engine({ seed: 17, event: 'custom-event' });
  await self.start(); await self.feed('zien');
  assert.equal(self.save.event, 'custom-event');
  assert.equal(self.manifest.seed, 17);
});

test('Engine: restore preserves every byte of save and rebuilds known branch/lost0/choice states', async () => {
  const { Engine } = await import('../src/engine/index.js');
  const S = await import('../src/save/index.js');
  const original = new Engine();
  await original.start(); await original.feed('zien');
  for (const raw of ['ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log', 'grep -r KEY-FRAG ~', 'systemctl start lamp', 'lamp-before-sudo', 'git checkout -b alt/sandbox', 'rm -rf ~/notes', 'hint']) await original.feed(raw, 20);
  await S.seal(original.save);
  const json = JSON.stringify(original.save);
  const restored = await Engine.fromSave(original.save);
  assert.equal(JSON.stringify(restored.save), json);
  assert.equal(JSON.stringify(original.save), json);
  assert.equal(restored.branch, 'alt/sandbox');
  assert.ok(restored.vfs.empty('~/notes'));
  assert.ok(restored.vfs.exists('/lost+found/#0'));
  assert.deepEqual(restored.ladders, original.ladders);
  assert.deepEqual([...restored.flags].sort(), [...original.flags].sort());
  await restored.feed('cat /lost+found/#0', 10);
  await restored.feed('git merge --knowledge', 10);
  assert.ok(restored.cards.has('K0'));
  assert.equal(restored.branch, 'main');
  assert.ok(restored.vfs.exists('~/notes/.draft.txt'));
  assert.ok(!restored.vfs.exists('/lost+found/#0'));
  await original.advance(900 - original.now);
  await S.seal(original.save);
  const choice = await Engine.fromSave(original.save);
  assert.equal(choice.inputMode, 'choice');
  assert.equal(choice.save.head, original.save.head);
  assert.equal(choice.save.commits.length, original.save.commits.length);
  await choice.feed('block', 1);
  assert.equal(choice.ended, true);
});
