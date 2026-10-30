import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { Engine } from '../src/engine/index.js';
import * as S from '../src/save/index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

async function started(options) {
  const engine = new Engine(options);
  await engine.start();
  await engine.feed('harden');
  return engine;
}

async function send(engine, raw, dt = 0) {
  await engine.feed(raw, dt);
  assert.equal(S.checkShape(engine.save), true, raw);
  assert.ok(engine.save.commits.length <= 400);
  assert.ok(engine.canSpendCommits(0), 'Every settled state retains its continuation budget');
}

async function portable(engine) {
  S.seal(engine.save);
  assert.equal(S.checkShape(engine.save), true);
  assert.deepEqual(await S.verifyChain(engine.save), [true, null]);
  const before = JSON.stringify(engine.save);
  const code = await S.exportCode(engine.save);
  const imported = await S.importCode(code);
  assert.deepEqual(imported, JSON.parse(before));
  assert.equal(JSON.stringify(await S.importFile(before)), before);
  const restored = await Engine.fromSave(imported);
  assert.equal(JSON.stringify(restored.save), JSON.stringify(imported));
  assert.equal(JSON.stringify(engine.save), before, 'Export/restore must not rewrite the chain');
  return restored;
}

async function hints(engine, count = 3, dt = 0) {
  for (let i = 0; i < count; i++) await send(engine, 'hint', dt);
}

const ch0 = ['ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log', 'grep -r KEY-FRAG ~'];
async function lamp(engine) {
  await send(engine, 'systemctl start lamp');
  await send(engine, 'lamp-before-sudo');
}

test('hardening: skip belongs to its quest, clears on completion, and expires after ten seconds', async () => {
  const engine = await started();
  await send(engine, 'skip', 1);
  assert.deepEqual(engine.skip_pending, { questId: 'Q0-1', at: 1 });
  await send(engine, 'ls', 1);
  assert.equal(engine.skip_pending, null);
  assert.equal(engine.active, 'Q0-2');
  await send(engine, 'skip', 1);
  assert.equal(engine.active, 'Q0-2');
  await send(engine, 'skip', 10.001);
  assert.deepEqual(engine.skipped, []);
  await send(engine, 'skip', 10);
  assert.deepEqual(engine.skipped, ['Q0-2']);
  assert.equal(engine.active, 'Q0-3');
  assert.equal(engine.skip_pending, null);
  await send(engine, 'skip');
  const restored = await portable(engine);
  assert.equal(restored.skip_pending, null, 'A non-durable confirmation is never revived by import');
  await send(restored, 'skip');
  assert.equal(restored.active, 'Q0-3');
  assert.deepEqual(restored.skipped, ['Q0-2']);
});

test('hardening: 405 hints preserve fourth-hint compatibility and every later task, hint rung, vote and ending', async () => {
  const engine = await started();
  await hints(engine, 405, 1);
  assert.equal(engine.ended, false);
  assert.equal(engine.now, 405);
  assert.deepEqual(engine.save.commits.filter(c => c.kind === 'hint').slice(0, 4).map(c => c.data.n), [1, 2, 3, 3]);
  assert.equal(engine.save.commits.length + engine.reservedCommits(), 400);
  assert.ok(engine.outputs.some(o => o.kind === 'system' && o.text.includes('不再新增重複紀錄')));
  const prefix = JSON.stringify(engine.save.commits);
  const restored = await portable(engine);
  assert.equal(restored.reservedCommits(), engine.reservedCommits());
  for (const raw of ch0) {
    await hints(engine);
    await send(engine, raw, 1);
  }
  await hints(engine); // g.lamp has its own protected first three rungs.
  await lamp(engine);
  await hints(engine); // g.branch (two dialogue nodes, three counter values).
  await send(engine, 'git checkout -b alt/sandbox');
  assert.equal(engine.inBranch, true, 'The first story branch is reserved, not blocked by earlier hints');
  await hints(engine);
  await send(engine, 'rm -rf ~/notes');
  await hints(engine);
  await send(engine, 'cat /lost+found/#0');
  await hints(engine);
  await send(engine, 'git merge --knowledge');
  assert.equal(engine.branch, 'main');
  assert.ok(engine.cards.has('K0'));
  await hints(engine);
  await send(engine, 'ssh logport');
  await hints(engine);
  await send(engine, "grep -c ' 404 ' access.log");
  await hints(engine);
  await send(engine, "grep '02:00:00' access.log");
  await hints(engine, 405);
  await send(engine, 'block');
  assert.deepEqual(engine.done, [...ch0.map((_, i) => `Q0-${i + 1}`), 'Q1-1', 'Q1-3']);
  assert.equal(engine.ended, true);
  assert.ok(engine.flags.has('flag.demo.vote_block'));
  assert.ok(engine.flags.has('flag.demo.finished'));
  assert.equal(engine.save.commits.at(-1).kind, 'end');
  assert.equal(JSON.stringify(engine.save.commits.slice(0, JSON.parse(prefix).length)), prefix);
  await portable(engine);
});

test('hardening: 405 hints still allow the complete timeout fallback and an importable ending', async () => {
  const engine = await started();
  await hints(engine, 405, 1);
  const prefix = JSON.stringify(engine.save.commits);
  await engine.advance(900 - engine.now);
  assert.equal(S.checkShape(engine.save), true);
  assert.equal(engine.inputMode, 'choice');
  await hints(engine, 405);
  await portable(engine);
  await engine.advance(60);
  assert.equal(engine.ended, true);
  assert.ok(engine.flags.has('flag.demo.time_up'));
  assert.ok(engine.flags.has('flag.demo.finished'));
  assert.equal(engine.save.commits.at(-1).r, 960000);
  assert.equal(engine.save.commits.at(-1).kind, 'end');
  assert.ok(!engine.save.commits.some(c => c.kind === 'choice'), 'Timeout must not invent a vote');
  assert.equal(JSON.stringify(engine.save.commits.slice(0, JSON.parse(prefix).length)), prefix);
  await portable(engine);
});

test('hardening: host voting and all skip effects retain their protected commits after hint saturation', async () => {
  const engine = await started({ mode: 'host' });
  await hints(engine, 405);
  for (let i = 0; i < 5; i++) {
    await send(engine, 'skip');
    await send(engine, 'skip');
  }
  assert.deepEqual(engine.skipped, ch0.map((_, i) => `Q0-${i + 1}`));
  assert.ok(engine.items.has('F1'));
  assert.ok(engine.flags.has('flag.f1'));
  await lamp(engine);
  assert.equal(engine.inputMode, 'choice');
  await hints(engine, 405);
  await send(engine, 'pass');
  assert.ok(engine.flags.has('flag.demo.vote_pass'));
  assert.ok(engine.save.commits.some(c => c.kind === 'choice' && c.data.value === 'pass'));
  assert.equal(engine.ended, true);
  await portable(engine);
});

test('hardening: repeated merge/abandon rounds are admitted atomically and cannot consume later task or ending slots', async () => {
  const engine = await started();
  for (const raw of ch0) await send(engine, raw);
  await lamp(engine);
  await send(engine, 'git checkout -b alt/sandbox');
  await send(engine, 'rm -rf ~/notes');
  await send(engine, 'cat /lost+found/#0');
  await send(engine, 'git merge --knowledge');
  let admitted = 0, rejected = 0;
  for (let i = 0; i < 405; i++) {
    const count = engine.save.commits.length;
    const originalVfs = engine.vfs;
    const outputCount = engine.outputs.length;
    await send(engine, 'git checkout -b alt/sandbox');
    if (engine.inBranch) {
      admitted++;
      await send(engine, i % 2 ? 'git abandon' : 'git merge --knowledge');
      assert.equal(engine.branch, 'main');
      assert.equal(engine.vfs, originalVfs);
    } else {
      rejected++;
      assert.equal(engine.save.commits.length, count);
      assert.equal(engine.vfs, originalVfs);
      assert.equal(engine.main_snapshot, null);
      assert.ok(engine.outputs.slice(outputCount).some(o => o.text.includes('不能再開重複分支')));
      assert.ok(!engine.outputs.slice(outputCount).some(o => o.text.includes('Switched to a new branch')));
    }
  }
  assert.ok(admitted > 1 && rejected > 1);
  assert.equal(engine.save.commits.filter(c => c.kind === 'branch.enter').length,
    engine.save.commits.filter(c => c.kind === 'branch.exit').length);
  await portable(engine);
  await send(engine, 'ssh logport');
  await send(engine, "grep -c ' 404 ' access.log");
  await send(engine, "grep '02:00:00' access.log");
  await send(engine, 'pass');
  assert.equal(engine.ended, true);
  assert.ok(engine.done.includes('Q1-3'));
  await portable(engine);
});

test('hardening: hint saturation inside a branch leaves both merge and exit slots available after import', async () => {
  const engine = await started();
  for (const raw of ch0) await send(engine, raw);
  await lamp(engine);
  await send(engine, 'git checkout -b alt/sandbox');
  await send(engine, 'rm -rf ~/notes');
  await send(engine, 'cat /lost+found/#0');
  await hints(engine, 405);
  const restored = await portable(engine);
  assert.equal(restored.inBranch, true);
  await send(restored, 'git merge --knowledge');
  assert.equal(restored.branch, 'main');
  assert.ok(restored.cards.has('K0'));
  assert.ok(restored.flags.has('flag.b0.done'));
  assert.ok(restored.save.commits.some(c => c.kind === 'merge'));
  assert.ok(restored.save.commits.some(c => c.kind === 'branch.exit'));
  await restored.advance(960 - restored.now);
  assert.equal(restored.ended, true);
  await portable(restored);
});

test('hardening: a shape-valid 399-event active import is rejected without partial restore; a completed 400-event save stays readable', async () => {
  const source = await started();
  await hints(source);
  while (source.save.commits.length < 399) {
    await S.addCommit(source.save, 'hint', { n: 3, full: true }, 1, source.world_t);
  }
  S.seal(source.save);
  const json = JSON.stringify(source.save);
  assert.equal(S.checkShape(source.save), true);
  const imported = await S.importCode(await S.exportCode(source.save));
  assert.deepEqual(await S.verifyChain(imported), [true, null]);
  const target = await started();
  await send(target, 'ls');
  S.seal(target.save);
  const before = JSON.stringify(target.save);
  const flags = [...target.flags], vfs = target.vfs, active = target.active;
  await assert.rejects(target.restore(imported), /剩餘事件空間不足/);
  await assert.rejects(Engine.fromSave(imported), /剩餘事件空間不足/);
  assert.equal(JSON.stringify(target.save), before);
  assert.deepEqual([...target.flags], flags);
  assert.equal(target.vfs, vfs);
  assert.equal(target.active, active);
  assert.equal(JSON.stringify(source.save), json);
  assert.deepEqual(imported, JSON.parse(json));
  await send(target, 'cat handbook.md');
  await portable(target);

  await S.addCommit(source.save, 'end', { time_up: true }, 960000, source.world_t);
  S.seal(source.save);
  assert.equal(source.save.commits.length, 400);
  const ended = await portable(source);
  assert.equal(ended.ended, true);
  await send(ended, 'hint');
  await send(ended, 'save');
  assert.equal(ended.save.commits.length, 400);
});
