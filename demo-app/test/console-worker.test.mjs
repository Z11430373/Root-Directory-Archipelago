/**
 * Worker/Engine 邊界測試：以 node:worker_threads 載入真正的 shell/worker.js，
 * 模擬瀏覽器 Worker 的 structured clone 與 Blob URL；不建置、不寫入 dist。
 * 暫停回傳僅用於精確取消時點；另有可選真瀏覽器案例驗證續玩取消及原始存檔保留。
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { resolveObjectURL } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { Engine } from '../src/engine/index.js';
import { execute } from '../src/shell/exec.js';
import { ShellJob } from '../src/ui/shell-job.js';
import { createWorld } from '../src/vfs.js';
import { SAVE_KEY, RECOVERY_KEY } from '../src/storage.js';
import * as S from '../src/save/index.js';
import {send as sendCommand,typeDraft,expectDraft,expectPrompt,terminalText,freezeGameTime,advanceGameTime} from './helpers/xterm.mjs';

// 所有頂層非同步載入須先完成，才註冊 hooks/tests，避免 root teardown 提早執行。
let chromium;
try { ({ chromium } = await import(process.env.RA_PLAYWRIGHT || 'playwright')); } catch {}
const browserSkip = !chromium || !process.env.RA_CHROME ? 'Optional browser tools unavailable' : false;
const html = new URL('../dist/index.html', import.meta.url).href;
const walks = JSON.parse(await readFile(new URL('../../demo/testvectors/walkthrough.json', import.meta.url), 'utf8')).walkthroughs;

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const workerURL = new URL('../src/shell/worker.js', import.meta.url).href;
const originalGlobals = new Map(['Worker', '__SHELL_WORKER_SOURCE__'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function deferred() {
  let resolve;
  const promise = new Promise(accept => { resolve = accept; });
  return { promise, resolve };
}

/** 真正隔離執行 production worker；Blob 讀取與模組載入皆在測試自己的資源內。 */
class ThreadWorker {
  static instances = [];
  constructor(url) {
    ThreadWorker.instances.push(this);
    this.received = deferred();
    this.terminated = false;
    this.holdReply = false;
    const blob = resolveObjectURL(url);
    this.ready = blob.text().then(source => {
      if (this.terminated) return;
      const bootstrap = `
        import { parentPort } from 'node:worker_threads';
        globalThis.self = { postMessage: data => parentPort.postMessage(data) };
        ${source}
        parentPort.on('message', data => self.onmessage({ data }));
      `;
      this.worker = new NodeWorker(new URL(`data:text/javascript;base64,${Buffer.from(bootstrap).toString('base64')}`));
      this.worker.on('message', data => {
        if (this.terminated) return;
        this.received.resolve(data);
        if (!this.holdReply) this.onmessage?.({ data });
      });
      this.worker.on('error', error => {
        if (!this.terminated) this.onerror?.({ message: error.message, preventDefault() {} });
      });
    });
  }
  postMessage(data) {
    // 瀏覽器於呼叫當下複製／拋 DataCloneError，不能延到 worker 啟動後才複製。
    const copy = structuredClone(data);
    this.ready.then(() => { if (!this.terminated) this.worker.postMessage(copy); });
  }
  terminate() {
    this.terminated = true;
    this.closed = this.worker?.terminate();
  }
}

before(() => {
  globalThis.Worker = ThreadWorker;
  globalThis.__SHELL_WORKER_SOURCE__ = `await import(${JSON.stringify(workerURL)});`;
});
after(async () => {
  for (const worker of ThreadWorker.instances) {
    worker.terminate();
    await worker.closed;
  }
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});

function projection(engine) {
  const immutable = new Set(['cfg', 'flow', 'nodes', 'quests', 'whitelist', 'ladderIds', 'manifest', 'man']);
  return structuredClone(Object.fromEntries(Object.entries(engine).filter(([key, value]) => !immutable.has(key) && typeof value !== 'function')));
}

async function started(options) {
  const engine = new Engine(options);
  await engine.start();
  await engine.feed('workerqa');
  return engine;
}

test('Console worker: real structured clone preserves hard links, read-time aliases, cwd and live flags', { timeout: 15000 }, async () => {
  const flags = new Set(), world = createWorld('ch0', 5, flags), control = world.clone();
  const raw = 'echo original > source.txt; ln source.txt linked.txt; cat linked.txt; rm linked.txt; echo updated > source.txt; cd notes; pwd';
  const expected = execute(raw, control, { flags, branch: 'main' });
  const job = new ShellJob();
  const result = await job.run(raw, world, { flags, branch: 'main' });
  assert.deepEqual(result, expected);
  assert.deepEqual(structuredClone(world), structuredClone(control));
  assert.equal(world.flags, flags, 'Worker must not replace Engine-owned flags with a clone');
  assert.deepEqual(result.readEvents[0].same_inode, ['/home/op/source.txt', '/home/op/linked.txt']);
  flags.add('flag.lamp_lit');
  assert.equal((await job.run('systemctl status lamp', world, { flags })).stdout, 'active (running)');
  assert.equal(job.pending, null);
  assert.equal(job.cancel(), false);
});

test('Console worker: nonzero shell rc still commits completed writes, exactly like synchronous execution', { timeout: 15000 }, async () => {
  const world = createWorld(), control = world.clone(), job = new ShellJob();
  const raw = 'echo persisted > kept.txt; cat missing-file.txt';
  const result = await job.run(raw, world, {});
  assert.deepEqual(result, execute(raw, control));
  assert.equal(result.rc, 1);
  assert.equal(world.readFile('kept.txt'), 'persisted\n');
  assert.deepEqual(structuredClone(world), structuredClone(control));
});

test('Console worker: construction, cloning and worker exceptions release resources and permit retry', { timeout: 15000 }, async t => {
  const revoke = t.mock.method(URL, 'revokeObjectURL');
  const world = createWorld(), job = new ShellJob(), beforeState = structuredClone(world);
  globalThis.Worker = class { constructor() { throw new Error('constructor failed'); } };
  try { assert.throws(() => job.run('pwd', world, {}), /constructor failed/); }
  finally { globalThis.Worker = ThreadWorker; }
  assert.equal(revoke.mock.callCount(), 1);
  assert.equal(job.pending, null);
  await assert.rejects(job.run('echo no > unexpected.txt', world, { callback() {} }), { name: 'DataCloneError' });
  assert.equal(revoke.mock.callCount(), 2);
  assert.equal(job.pending, null);
  globalThis.__SHELL_WORKER_SOURCE__ = 'throw new Error("worker failed");';
  try { await assert.rejects(job.run('pwd', world, {}), /worker failed/); }
  finally { globalThis.__SHELL_WORKER_SOURCE__ = `await import(${JSON.stringify(workerURL)});`; }
  assert.equal(revoke.mock.callCount(), 3);
  assert.equal(job.pending, null);
  assert.deepEqual(structuredClone(world), beforeState);
  assert.equal((await job.run('pwd', world, {})).stdout, '/home/op\n');
  assert.equal(revoke.mock.callCount(), 4);
});

test('Console worker: cancellation rolls back idle commits, branch VFS, clocks and outputs; successful journal alone replays', { timeout: 20000 }, async t => {
  const observed = [], engine = await started({ onOutput: (text, kind) => observed.push({ text, kind }) });
  const journal = [{ raw: 'workerqa', dt: 0 }];
  const send = async (raw, dt = 0) => { await engine.feed(raw, dt); journal.push({ raw, dt }); };
  for (const raw of [
    'echo baseline > keep.txt; ln keep.txt linked.txt',
    'ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log', 'grep -r KEY-FRAG ~',
    'systemctl start lamp', 'lamp-before-sudo', 'git checkout -b alt/sandbox',
  ]) await send(raw);
  const job = new ShellJob(), launched = deferred();
  t.after(() => job.cancel());
  engine.shellExecutor = (...args) => {
    const promise = job.run(...args), worker = ThreadWorker.instances.at(-1);
    worker.holdReply = true;
    launched.resolve(worker);
    return promise;
  };
  const beforeState = projection(engine), outputCount = observed.length;
  const original = { vfs: engine.vfs, main: engine.main_snapshot, flags: engine.flags, save: engine.save, commits: engine.save.commits };
  const pending = send('echo changed > ~/linked.txt; echo isolated > ~/aborted.txt; cd ~/notes; cat ~/handbook.md', 31);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  const worker = await launched.promise, reply = await worker.received.promise;
  assert.ok(reply.state.nodes.has('/home/op/aborted.txt'), 'The isolated worker really completed a write before cancellation');
  assert.equal(engine.vfs.exists('aborted.txt'), false, 'No Worker write is visible before reply acceptance');
  assert.ok(engine.save.commits.length > beforeState.save.commits.length, 'Idle handling created pending commits before the shell');
  assert.equal(engine.now, 31);
  assert.equal(observed.length, outputCount, 'Pre-shell idle dialogue is withheld until transaction commit');
  assert.throws(() => job.run('pwd', engine.vfs, {}), /已有指令/);
  assert.equal(job.cancel(), true);
  assert.equal(job.cancel(), false);
  await rejected;
  assert.deepEqual(projection(engine), beforeState);
  assert.equal(engine.vfs, original.vfs);
  assert.equal(engine.main_snapshot, original.main);
  assert.equal(engine.flags, original.flags);
  assert.equal(engine.save, original.save);
  assert.equal(engine.save.commits, original.commits);
  assert.equal(engine.vfs.flags, original.flags);
  assert.equal(engine.main_snapshot.flags, original.flags);
  assert.equal(observed.length, outputCount);
  assert.ok(!journal.some(step => step.raw.includes('aborted.txt')));
  engine.shellExecutor = (...args) => job.run(...args);
  await send('echo continued > linked.txt; cat keep.txt', 0.125);
  assert.equal(engine.vfs.readFile('keep.txt'), 'continued\n');
  assert.equal(engine.main_snapshot.readFile('keep.txt'), 'baseline\n');
  const replay = new Engine();
  await replay.start();
  for (const step of journal) await replay.feed(step.raw, step.dt);
  assert.deepEqual(projection(replay), projection(engine));
  assert.deepEqual(await S.verifyChain(engine.save), [true, null]);
});

for (const walk of walks) test(`Console worker: ${walk.name} keeps every golden commit ID and matches synchronous replay`, { timeout: 30000 }, async t => {
  const job = new ShellJob(), engine = new Engine(), replay = new Engine();
  t.after(() => job.cancel());
  engine.shellExecutor = (...args) => job.run(...args);
  for (const current of [engine, replay]) {
    await current.start();
    for (const step of walk.steps) {
      if (step.in === 'wait') await current.advance(step.dt);
      else await current.feed(step.in, step.dt);
    }
  }
  assert.deepEqual(engine.save.commits.map(c => [c.kind, c.data, c.branch, c.chapter, c.t, c.r, c.id]), walk.commits);
  assert.deepEqual(projection(engine), projection(replay));
  assert.deepEqual(await engine.summary(), walk.summary);
});

test('Console worker browser: resume uses Workers and Ctrl+C preserves the exact local save without recovery', { skip: browserSkip, timeout: 45000 }, async t => {
  const browser = await chromium.launch({ executablePath: process.env.RA_CHROME, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem('ra.demo.preferences.v1', JSON.stringify({ style: 'server' })));
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const time = new Date('2026-11-02T12:00:00Z');
  await freezeGameTime(page,time);
  await page.goto(html);
  const ready = () => page.locator('.console-session[data-state=ready]').waitFor();
  const send = raw => sendCommand(page,raw);
  const stored = () => page.evaluate(({ save, recovery }) => ({
    raw: localStorage.getItem(save), recovery: localStorage.getItem(recovery),
  }), { save: SAVE_KEY, recovery: RECOVERY_KEY });
  await ready();
  await send('game start');
  await send('resumeqa');
  await send(`echo ${'a'.repeat(70)} > replay-slow.txt`);
  const slow = "grep 'a*a*a*a*a*a*b' replay-slow.txt";
  await send(slow);
  await send('game exit');
  await expectPrompt(page,'archipelago$ ');
  const original = await stored();
  assert.ok(original.raw, 'A real completed session journal must exist before resume');
  assert.ok(JSON.parse(original.raw).journal.some(step => step.raw === slow));
  assert.equal(original.recovery, null);

  // 第一個 replay Worker 重建檔案；第二個真的執行耗時 grep 時再按鍵，避免只取消排隊中的 resume。
  let replayWorkers = 0;
  const secondWorker = page.waitForEvent('worker', { predicate: () => ++replayWorkers === 2, timeout: 10000 });
  await typeDraft(page,'game resume');
  await Promise.all([secondWorker, page.locator('#command-input').press('Enter')]);
  assert.equal(replayWorkers, 2, 'Both journal Shell commands must execute in browser Workers');
  assert.equal(await page.locator('.console-session').getAttribute('data-state'), 'running');
  await page.keyboard.press('Control+C');
  await ready();
  await expectDraft(page,'');await expectPrompt(page,'archipelago$ ');
  const transcript = await terminalText(page);
  assert.match(transcript, /\^C/);
  assert.doesNotMatch(transcript, /本機紀錄無法完整重播|recover journal|recover events/);
  assert.equal(await page.locator('#local-recovery').count(), 0);
  assert.deepEqual(await stored(), original, 'Cancellation must preserve the original envelope byte-for-byte and create no recovery');
  await advanceGameTime(page,1000);
  assert.deepEqual(await stored(), original, 'A later autosave tick must not publish the abandoned replay');
  assert.deepEqual(errors, []);
});
