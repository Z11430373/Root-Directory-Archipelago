import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../src/engine/index.js';
import * as S from '../src/save/index.js';
import {appendAdvance, checkJournal} from '../src/storage.js';

// Load optional tooling before registering tests/hooks. A late top-level await
// after test registration can leave Node 24's runner waiting after passing tests.
let chromium;
try { ({chromium} = await import(process.env.RA_PLAYWRIGHT || 'playwright')); }
catch { /* Optional tooling missing is a skip, never a browser pass. */ }
const browserPath = process.env.RA_CHROME;
const skip = !chromium ? 'Optional Playwright is unavailable (RA_PLAYWRIGHT)'
  : !browserPath ? 'RA_CHROME is not set' : false;
let browser;
before(async () => {
  if (!skip) browser = await chromium.launch({executablePath:browserPath, headless:true});
});
after(async () => { await browser?.close(); });

// Independent critique regressions. These intentionally assert the required
// successful outcome, not the current failure. Do not skip/todo or weaken them
// merely to make the pre-existing suite green. No build or fixture writes here.
test('CRIT-01: coalesced fractional UI clock journal reproduces every commit exactly', async () => {
  const live = new Engine();
  await live.start();
  const journal = [];
  const steps = [
    {type:'advance', dt:0.5},
    {type:'input', raw:'critique', dt:0},
    {type:'advance', dt:0.25},
    {type:'advance', dt:0.25},
    {type:'advance', dt:0.0035},
    {type:'input', raw:'hint', dt:0},
  ];
  for (const step of steps) {
    if (step.type === 'advance') {
      appendAdvance(journal, step.dt);
      await live.advance(step.dt);
    } else {
      journal.push({...step});
      await live.feed(step.raw, step.dt);
    }
  }
  assert.equal(checkJournal(journal), true);
  const replay = new Engine();
  await replay.start();
  for (const step of journal) {
    if (step.type === 'advance') await replay.advance(step.dt);
    else await replay.feed(step.raw, step.dt);
  }
  assert.deepEqual(replay.save.commits, live.save.commits,
    'The journal written by the app must restore the original millisecond timestamps and chain IDs');
});

test('CRIT-02: one-hour browser suspension creates a valid, lossless local journal', () => {
  const journal = [];
  appendAdvance(journal, 3600);
  assert.equal(checkJournal(journal), true,
    'appendAdvance must not write an interval that checkJournal rejects on the next reload');
  assert.equal(journal.reduce((total, step) => total + step.dt, 0), 3600,
    'A fix must preserve elapsed time instead of silently capping the game clock');
});

test('CRIT-03: skip confirmation from a completed quest cannot skip the next quest', async () => {
  const engine = new Engine();
  await engine.start();
  await engine.feed('critique');
  await engine.feed('skip', 1);
  await engine.feed('ls', 1);
  assert.equal(engine.active, 'Q0-2');
  assert.deepEqual(engine.skipped, []);
  await engine.feed('skip', 1);
  assert.equal(engine.active, 'Q0-2', 'The first skip for Q0-2 only asks for its own confirmation');
  assert.deepEqual(engine.skipped, []);
  await engine.feed('skip', 1);
  assert.deepEqual(engine.skipped, ['Q0-2']);
});

test('CRIT-04: repeated supported hint input never makes the app own save unimportable', async () => {
  const engine = new Engine();
  await engine.start();
  await engine.feed('critique');
  for (let n = 0; n < 405; n++) await engine.feed('hint', 1);
  assert.equal(engine.ended, false, 'This is still inside the ordinary fifteen-minute session');
  await S.seal(engine.save);
  const code = await S.exportCode(engine.save);
  const imported = await S.importCode(code);
  assert.equal(imported.head, engine.save.head);
});

async function open(t) {
  const context = await browser.newContext({viewport:{width:1280, height:800}, reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'No uncaught browser/console errors');
  });
  page.setDefaultTimeout(8_000);
  const epoch = new Date('2026-10-30T00:00:00Z');
  await page.clock.install({time:epoch});
  await page.clock.pauseAt(new Date(epoch.getTime()+1000));
  await page.goto(new URL('../dist/index.html', import.meta.url).href);
  await page.locator('#new-game').click();
  await page.locator('#command-input:enabled').waitFor();
  return page;
}
async function send(page, raw) {
  const input = page.locator('#command-input');
  await input.fill(raw);
  await input.press('Enter');
  await page.locator('#command-input:enabled').waitFor();
}

test('CRIT-02 browser: a saved shift survives one-hour suspension then reload/continue', {skip, timeout:30_000}, async t => {
  const page = await open(t);
  await send(page, 'suspendqa');
  await send(page, 'echo SLEEP_VALUE > notes/sleep.txt');
  await page.clock.fastForward(3_600_000);
  await page.locator('#end-screen').waitFor();
  const head = await page.locator('#save-status').getAttribute('data-head');
  await page.reload();
  await page.locator('#continue-game').click();
  await page.waitForFunction(() => document.querySelector('#welcome-error')?.textContent ||
    document.querySelector('#command-input')?.disabled === false);
  assert.equal(await page.locator('#welcome-error').textContent(), '',
    'An automatically saved, untampered local journal must remain resumable');
  await page.locator('#end-screen').waitFor();
  assert.equal(await page.locator('#save-status').getAttribute('data-head'), head);
});

test('CRIT-05 browser: hint shortcut cannot silently register hint as the player nickname', {skip, timeout:30_000}, async t => {
  const page = await open(t);
  const headBefore = await page.locator('#save-status').getAttribute('data-head');
  assert.equal(headBefore, '');
  const hint = page.getByRole('button', {name:'執行 hint', exact:true});
  if (await hint.count() && await hint.isEnabled()) {
    await hint.click();
    await page.locator('#command-input:enabled').waitFor();
  }
  assert.equal(await page.locator('#save-status').getAttribute('data-head'), '',
    'Clicking a help affordance before nickname entry must not start a shift as op-hint');
  assert.match(await page.locator('#prompt').textContent(), /暱稱/);
});
