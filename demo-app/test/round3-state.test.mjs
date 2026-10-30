import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine/index.js';
import * as S from '../src/save/index.js';
import {appendAdvance, checkJournal, writeLocal, SAVE_KEY} from '../src/storage.js';

// Optional tooling must finish loading before registering tests/hooks (F-11).
let chromium;
try { ({chromium} = await import(process.env.RA_PLAYWRIGHT || 'playwright')); }
catch { /* Missing optional tooling is a skip, not a passing browser audit. */ }
const skip = !chromium ? 'Optional Playwright unavailable (RA_PLAYWRIGHT)'
  : !process.env.RA_CHROME ? 'RA_CHROME is not set' : false;
let browser;
before(async () => {
  if (!skip) browser = await chromium.launch({executablePath:process.env.RA_CHROME, headless:true});
}, {timeout:15_000});
after(async () => { await browser?.close(); }, {timeout:15_000});

// This file intentionally retains ordinary failing assertions for confirmed new
// defects. No builds, fixture writes, existing-test edits, or weakened checks.
async function started() {
  const engine = new Engine();
  await engine.start();
  await engine.feed('roundthree');
  return engine;
}

for (const [name, r, t] of [['t', 1000, 1_000_000], ['r', 2_700_000, 30]]) {
  test(`R3-STATE-02 ${name}: an admitted hard-limit clock cannot poison the next supported input`,
    {timeout:10_000}, async () => {
      const source = await started();
      await S.addCommit(source.save, 'checkpoint', {id:'ckpt/clock-edge'}, r, t);
      S.seal(source.save);
      assert.equal(S.checkShape(source.save), true);
      assert.deepEqual(await S.level(source.save), ['intact', []]);
      const imported = await S.importCode(await S.exportCode(source.save));
      const original = JSON.stringify(imported);
      const target = await started();
      await target.feed('ls');
      S.seal(target.save);
      const previous = JSON.stringify(target.save), previousVfs = target.vfs;
      try {
        await target.restore(imported);
      } catch (error) {
        // Safe, explicit admission refusal is allowed, like the event budget.
        assert.ok(error instanceof S.CodeError);
        assert.equal(JSON.stringify(target.save), previous);
        assert.equal(target.vfs, previousVfs);
        assert.equal(JSON.stringify(imported), original);
        return;
      }
      await target.feed('hint', .001);
      S.seal(target.save);
      assert.doesNotThrow(() => S.checkShape(target.save),
        'If restore admits an active save, a supported hint must not exceed the immutable r/t hard limits');
      const roundTrip = await S.importCode(await S.exportCode(target.save));
      assert.equal(roundTrip.head, target.save.head);
      assert.equal(JSON.stringify(imported), original, 'Never rewrite the imported source chain');
    });
}

test('R3 control: a completed save at both clock maxima still remains readable and exportable',
  {timeout:10_000}, async () => {
    const source = await started();
    await S.addCommit(source.save, 'end', {time_up:true}, 2_700_000, 1_000_000);
    S.seal(source.save);
    const original = JSON.parse(JSON.stringify(source.save));
    const restored = await Engine.fromSave(await S.importCode(await S.exportCode(source.save)));
    assert.equal(restored.ended, true);
    await restored.feed('help', .001);
    assert.deepEqual(restored.save, original);
    assert.equal(S.checkShape(restored.save), true);
});

test('R3 control: journal/string capacity failures preserve the previous readable storage value',
  {timeout:5_000}, () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map();
    Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{
      getItem:key => values.get(key) ?? null,
      setItem:(key,value) => values.set(key,value),
      removeItem:key => values.delete(key),
    }});
    try {
      assert.equal(writeLocal({previous:'readable'}), true);
      const previous = values.get(SAVE_KEY);
      assert.equal(writeLocal({oversize:'x'.repeat(2_000_000)}), false);
      assert.equal(values.get(SAVE_KEY), previous);
      const journal = Array.from({length:20_000}, () => ({type:'input',raw:'pwd',dt:0}));
      assert.equal(checkJournal(journal), true);
      appendAdvance(journal, .25);
      assert.equal(checkJournal(journal), false);
      assert.equal(values.get(SAVE_KEY), previous);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
      else delete globalThis.localStorage;
    }
});

async function newContext(t) {
  const context = await browser.newContext({viewport:{width:1280,height:800}, reducedMotion:'reduce'});
  const errors = [];
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'No uncaught browser/console errors');
  });
  return context;
}
async function open(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(6_000);
  const epoch = new Date('2026-10-30T13:00:00Z');
  await page.clock.install({time:epoch});
  await page.clock.pauseAt(new Date(+epoch + 1000));
  await page.goto(new URL('../dist/index.html', import.meta.url).href);
  await page.locator('#new-game').waitFor();
  return page;
}
async function send(page, raw) {
  const input = page.locator('#command-input');
  await page.locator('#command-input:enabled').waitFor();
  await input.fill(raw);
  await input.press('Enter');
  await page.locator('#command-input:enabled').waitFor();
}
async function start(page, nick) {
  await page.locator('#new-game').click();
  await send(page, nick);
}
const localText = page => page.evaluate(() => localStorage.getItem('ra.demo.save.v1'));

test('R3-STATE-01 browser: a handled state-rule failure cannot autosave an unreplayable journal',
  {skip, timeout:30_000}, async t => {
    const context = await newContext(t), page = await open(context);
    await start(page, 'atomicqa');
    for (const raw of ['ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log',
      'grep -r KEY-FRAG ~', 'systemctl start lamp', 'lamp-before-sudo',
      'echo BLOCK > /lost+found', 'git checkout -b alt/sandbox']) await send(page, raw);
    const previous = JSON.parse(await localText(page));
    assert.equal(previous.journal.at(-1).raw, 'git checkout -b alt/sandbox');
    // A supported player write causes the subsequent engine create_file action
    // to fail. This is not injected JavaScript, a mocked VFS, or edited storage.
    await send(page, 'rm -rf ~/notes');
    await page.clock.runFor(250); // Next real autosave transaction boundary.
    await page.reload();
    await page.locator('#continue-game').click();
    await page.waitForFunction(() => document.querySelector('#local-recovery') ||
      document.querySelector('#command-input')?.disabled === false);
    assert.equal(await page.locator('#welcome-error').textContent(), '',
      'The app must retain/recover a replayable snapshot after a handled action failure, not report a broken save on reload');
    assert.equal(await page.locator('#local-recovery').count(), 0);
    await page.locator('#command-input:enabled').waitFor();
});

test('R3-STATE-03 browser: an idle older tab must not overwrite a newer continued shift',
  {skip, timeout:30_000}, async t => {
    const context = await newContext(t), older = await open(context);
    await start(older, 'twotabs');
    await send(older, 'echo ALPHA > notes/a.txt');
    const newer = await open(context);
    await newer.locator('#continue-game').click();
    await send(newer, 'ls');
    await send(newer, 'echo BETA > notes/b.txt');
    const latest = JSON.parse(await localText(newer));
    assert.ok(latest.journal.some(step => step.raw === 'echo BETA > notes/b.txt'));
    assert.equal(await newer.locator('#save-status').textContent(), '● 已自動存檔');
    await older.clock.runFor(250); // No user action at all in the stale tab.
    const afterIdleTick = JSON.parse(await localText(newer));
    assert.ok(afterIdleTick.journal.some(step => step.raw === 'echo BETA > notes/b.txt'),
      'An idle stale writer must not erase the only journal entry for the newer tab\'s saved file');
    assert.equal(afterIdleTick.save.head, latest.save.head,
      'Cross-tab conflict handling must not roll back already saved quest progress');
    await newer.reload();
    await newer.locator('#continue-game').click();
    await send(newer, 'cat notes/b.txt');
    assert.equal(await newer.locator('#terminal .stdout').last().textContent(), 'BETA\n');
});
