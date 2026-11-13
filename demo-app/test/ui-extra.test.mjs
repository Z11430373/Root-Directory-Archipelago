/**
 * T12 追加互動 QA：依賴 dist/index.html、選用 Playwright/RA_CHROME 與 Node zlib（只讀 RA1 payload）。
 * 每個命名案例 callback 回傳 Promise，以 DOM 操作驗鍵盤/本機重播/主持/動畫；不 import 私有 Engine 造結果。
 * 全域 browser 在 hooks 開關，open 以 t.after 關 context 並驗錯誤；時鐘真正 pause 保持 commit ID 可比對。
 */
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';

// Optional, external tooling, matching browser.test.mjs. Never rebuild dist here.
let chromium;
try {
  ({chromium} = await import(process.env.RA_PLAYWRIGHT || 'playwright'));
} catch { /* Missing optional tooling is a skip, not a passing browser run. */ }
const browserPath = process.env.RA_CHROME;
const skip = !chromium ? 'Optional Playwright is unavailable (RA_PLAYWRIGHT)'
  : !browserPath ? 'RA_CHROME is not set' : false;
const htmlURL = new URL('../dist/index.html', import.meta.url);
const epoch = new Date('2026-10-30T00:00:00Z');
let browser;
before(async () => {
  if (!skip) browser = await chromium.launch({executablePath:browserPath, headless:true});
});
after(async () => { await browser?.close(); });

/** 案例宣告呼叫；名稱/測試 callback → undefined，以共同 skip/timeout 註冊，不執行或弱化案例。 */
function uiTest(name, fn) {
  test(`T12-extra: ${name}`, {skip, timeout:45_000}, fn);
}

/** 案例呼叫；TestContext/模式/動態偏好 → page，建立 context 並凍結時鐘；t.after 負責 close/蒐錯斷言。 */
async function open(t, {mode, reducedMotion='reduce'}={}) {
  const context = await browser.newContext({viewport:{width:1280,height:800}, reducedMotion});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type()==='error') errors.push(message.text()); });
  t.after(async () => {
    await context.close();
    assert.deepEqual(errors, [], 'No uncaught browser/console errors');
  });
  page.setDefaultTimeout(8_000);
  // Install before application startup, then really pause performance/timers.
  // Merely installing the clock leaves it running and can change commit.r/head.
  await page.clock.install({time:epoch});
  await page.clock.pauseAt(new Date(epoch.getTime()+1000));
  const url = new URL(htmlURL);
  if (mode) url.searchParams.set('mode', mode);
  await page.goto(url.href);
  await page.locator('#new-game').waitFor();
  return page;
}

/** 其他 helper 呼叫；page → Promise<void>，等真實輸入框 enabled，避免送入尚未提交的交易。 */
async function ready(page) {
  await page.locator('#command-input:enabled').waitFor();
}

/** 案例呼叫；page/暱稱 → Promise<void>，按開始再送暱稱，建立該頁 Engine 與存檔。 */
async function start(page, nick='extraqa') {
  await page.locator('#new-game').click();
  await ready(page);
  await send(page, nick);
}

/** 案例/helper 呼叫；page/文字 → 本次新增且非回顯的輸出字串，會經表單改遊戲/本機紀錄。 */
async function send(page, text) {
  const lines = page.locator('#terminal > .terminal-line');
  const from = await lines.count();
  const input = page.locator('#command-input');
  await input.fill(text);
  await input.press('Enter');
  await ready(page);
  // Only newly produced output, not echoed commands or old/replayed terminal text.
  // Otherwise a marker in `echo MARKER > file` can falsely prove cat succeeded.
  return page.locator('#terminal > .terminal-line').evaluateAll((nodes, offset) =>
    nodes.slice(offset).filter(node => !node.classList.contains('command'))
      .map(node => node.textContent).join(''), from);
}

/** 案例/匯出 helper 呼叫；page → 非空八碼 head，讀 DOM 並斷言，不改進度。 */
async function head(page) {
  const value = await page.locator('#save-status').getAttribute('data-head');
  assert.match(value, /^[0-9a-f]{8}$/, 'A real chain tail must exist');
  return value;
}

/** 續玩案例呼叫；page → Promise<void>，重載並點繼續，斷言實際 journal 重播訊息，不直接還原 Engine。 */
async function resume(page) {
  await page.reload();
  await page.locator('#continue-game').click();
  await ready(page);
  assert.match(await page.locator('#terminal').textContent(), /已從本機操作紀錄還原/);
}

/** 分支/主持案例呼叫；page → 點燈輸出字串，以狀態命令/口令走真表單，改頁面進度。 */
async function lightLamp(page) {
  assert.match(await send(page, 'systemctl status lamp'), /inactive \(dead\)/);
  await send(page, 'systemctl start lamp');
  assert.equal((await page.locator('#prompt').textContent()).trim(), '口令:');
  const output = await send(page, 'lamp-before-sudo');
  assert.match(output, /lamp\.service: active \(running\)/);
  assert.match(output, /燈亮了/);
  return output;
}

// Read only the documented portable RA1 payload (AGENT_BUILD_PROMPT.md §4).
// No Engine/Save imports, injected application calls, or storage-envelope access.
// This helper is not a CRC/integrity verifier; those belong to T1–T4/T11.
/** 匯出案例呼叫；RA1 字串 → 解開的 m/c 物件，唯讀格式輔助，刻意不當 CRC/安全驗證器使用。 */
function portable(code) {
  assert.match(code, /^RA1-[A-Za-z0-9_-]+-[0-9a-f]{8}$/);
  const body = code.slice(4, code.lastIndexOf('-'));
  return JSON.parse(inflateSync(Buffer.from(body, 'base64url')).toString('utf8'));
}

/** 案例呼叫；page/是否快捷按鈕 → {code,packed}，打開保存 dialog 並核對 DOM head，呼叫端負責關閉。 */
async function exportSave(page, {chip=false}={}) {
  if (chip) {
    await page.getByRole('button', {name:'執行 save', exact:true}).click();
    await ready(page);
  } else await send(page, 'save');
  await page.locator('dialog[open] #save-code').waitFor();
  const code = await page.locator('#save-code').inputValue();
  const packed = portable(code);
  assert.equal(packed.m.head, await head(page), 'Visible head agrees with exported RA1');
  return {code, packed};
}

/** 續玩案例呼叫；歡迎頁/code → Promise<void>，經匯入表單恢復並檢查完整性文字，改該頁遊戲狀態。 */
async function importOwn(page, code) {
  await page.locator('#import-code').fill(code);
  await page.locator('#import-submit').click();
  await ready(page);
  assert.match(await page.locator('#terminal').textContent(), /存檔完整性：完整/);
}

/** 純鍵盤案例呼叫；page/selector → Promise<void>，有限次 Tab 找焦點，失敗 assert；不程式化 focus。 */
async function tabTo(page, selector) {
  for (let n=0; n<16; n++) {
    if (await page.locator(selector).evaluate(node => node===document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  assert.fail(`${selector} was not reachable by Tab`);
}

uiTest('keyboard-only Q0-1, unique command/path Tab completion and real ls submission', async t => {
  const page = await open(t);
  // No click(), fill(), focus(), DOM events, or application calls on this path.
  await tabTo(page, '#new-game');
  await page.keyboard.press('Enter');
  await ready(page);
  assert.equal(await page.locator('#command-input').evaluate(node => node===document.activeElement), true);
  await page.keyboard.type('keyqa');
  await page.keyboard.press('Enter');
  await ready(page);
  assert.match(await page.locator('#task-title').textContent(), /Q0-1/);

  await page.keyboard.type('pw');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#command-input').inputValue(), 'pwd ');
  await page.keyboard.press('Enter');
  await ready(page);
  assert.equal(await page.locator('#terminal .stdout').last().textContent(), '/home/op\n');
  assert.match(await page.locator('#task-title').textContent(), /Q0-1/, 'pwd is not Q0-1');

  await page.keyboard.type('l');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#command-input').inputValue(), 'l', 'ls and ln are ambiguous');
  assert.match(await page.locator('#terminal .system').last().textContent(), /\bls\b.*\bln\b/);
  await page.keyboard.type('s');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#command-input').inputValue(), 'ls ', 'Unique ls completion adds a space');
  await page.keyboard.press('Enter');
  await ready(page);
  assert.match(await page.locator('#task-title').textContent(), /Q0-2/);

  await page.keyboard.type('cat han');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#command-input').inputValue(), 'cat handbook.md ');
  await page.keyboard.press('Enter');
  await ready(page);
  assert.match(await page.locator('#task-title').textContent(), /Q0-3/);
});

uiTest('local resume retains uncommitted echo/append files and cd cwd over two reloads', async t => {
  const page = await open(t);
  await start(page);
  const before = await head(page);
  await send(page, 'echo LOCAL_UNCOMMITTED_QA > notes/qa-local.txt');
  await send(page, 'cd notes');
  assert.equal(await head(page), before, 'echo and cd did not create commits');
  await resume(page);
  assert.equal(await head(page), before);
  assert.match(await page.locator('#prompt').textContent(), /:~\/notes\$ /);
  assert.equal(await send(page, 'pwd'), '/home/op/notes\n');
  assert.equal(await send(page, 'cat qa-local.txt'), 'LOCAL_UNCOMMITTED_QA\n');
  await send(page, 'echo LOCAL_APPEND_QA >> qa-local.txt');
  assert.equal(await head(page), before);
  await resume(page);
  assert.equal(await send(page, 'pwd'), '/home/op/notes\n');
  assert.equal(await send(page, 'cat qa-local.txt'), 'LOCAL_UNCOMMITTED_QA\nLOCAL_APPEND_QA\n');
  assert.equal(await head(page), before, 'No committed event was needed to retain these changes');
});

uiTest('local branch resume retains cloned hardlinks/files/cwd without mutating main', async t => {
  const page = await open(t);
  await start(page);
  await lightLamp(page);
  const mainHead = await head(page);
  await send(page, 'echo MAIN_CLONE_QA > notes/qa-clone.txt');
  await send(page, 'cd notes');
  await send(page, 'ln qa-clone.txt qa-alias.txt');
  assert.equal(await head(page), mainHead);
  await send(page, 'git checkout -b alt/sandbox');
  const branchHead = await head(page);
  assert.notEqual(branchHead, mainHead);
  await send(page, 'echo BRANCH_CLONE_QA > qa-alias.txt');
  assert.equal(await send(page, 'cat qa-clone.txt'), 'BRANCH_CLONE_QA\n', 'Clone preserves its own hardlinks');
  await send(page, 'echo BRANCH_ONLY_QA > qa-branch-only.txt');
  await send(page, 'cd ~/shelf');
  assert.equal(await head(page), branchHead, 'Branch file mutations/cd are also uncommitted');
  await resume(page);
  assert.equal(await head(page), branchHead);
  assert.match(await page.locator('#prompt').textContent(), /\(alt\/sandbox\):~\/shelf\$ /);
  assert.equal(await send(page, 'pwd'), '/home/op/shelf\n');
  assert.equal(await send(page, 'cat ~/notes/qa-clone.txt ~/notes/qa-alias.txt'), 'BRANCH_CLONE_QA\nBRANCH_CLONE_QA\n');
  assert.equal(await send(page, 'cat ~/notes/qa-branch-only.txt'), 'BRANCH_ONLY_QA\n');
  assert.equal(await head(page), branchHead);

  await send(page, 'git abandon');
  assert.match(await page.locator('#prompt').textContent(), /@lighthouse:~\/notes\$ /);
  assert.equal(await send(page, 'pwd'), '/home/op/notes\n', 'Main keeps its pre-branch cwd');
  assert.equal(await send(page, 'cat qa-clone.txt qa-alias.txt'), 'MAIN_CLONE_QA\nMAIN_CLONE_QA\n');
  assert.match(await send(page, 'cat qa-branch-only.txt'), /No such file/);
});

uiTest('UI imports its own in-progress RA1 without changing head or portable state while clock is paused', async t => {
  const source = await open(t);
  await start(source, 'codeqa');
  await send(source, 'ls');
  await send(source, 'hint');
  const before = await head(source);
  const hint = await source.locator('#hint-state').textContent();
  const {code, packed} = await exportSave(source);
  assert.equal(await head(source), before, 'Export itself adds no event');

  const restored = await open(t);
  const frozenAt = await restored.evaluate(() => performance.now());
  await importOwn(restored, code);
  assert.equal(await head(restored), before);
  assert.match(await restored.locator('#prompt').textContent(), /op-codeqa@lighthouse:~\$ /);
  assert.match(await restored.locator('#task-title').textContent(), /Q0-2/);
  assert.equal(await restored.locator('#hint-state').textContent(), hint);
  const again = await exportSave(restored);
  assert.deepEqual(again.packed, packed, 'No extra commit, time delta or metadata change on UI import/export');
  assert.equal(await restored.evaluate(() => performance.now()), frozenAt);
});

uiTest('host really lights lamp then votes directly; typed/chip save and RA1 import preserve the choice', async t => {
  const page = await open(t, {mode:'host'});
  await start(page, 'hostqa');
  // Complete only seg1–seg4, not browser.test.mjs\'s full digger route.
  for (const command of ['ls', 'cat handbook.md', 'ls -a notes', 'grep lamp logs/lamp.log', 'grep -r KEY-FRAG ~']) {
    await send(page, command);
  }
  assert.notEqual((await page.locator('#prompt').textContent()).trim(), 'block / pass:');
  const lit = await lightLamp(page);
  assert.doesNotMatch(lit, /你可以開一條分支/);
  assert.equal((await page.locator('#prompt').textContent()).trim(), 'block / pass:');
  assert.equal(await page.locator('#task-title').textContent(), '02:00 的訪客');
  assert.equal(await page.locator('#host-label').textContent(), 'lighthouse / main');
  assert.match(await page.locator('.task-panel .mode-notice').textContent(), /共享.*不供正式版個人匯入/);
  const voteHead = await head(page);
  const first = await exportSave(page);
  assert.equal(first.packed.m.event, 'host-led');
  assert.ok(first.packed.c.some(c => c[0]==='flag' && c[1]==='lamp_lit'));
  assert.ok(first.packed.c.some(c => c[0]==='checkpoint' && c[1].id==='ckpt/ch0-lamp'));
  assert.ok(first.packed.c.some(c => c[0]==='flag' && c[1]==='demo.in_vote'));
  assert.ok(first.packed.c.every(c => c[0]!=='branch.enter' && c[5]!== 'ch1'), 'No branch/Ch1 detour');
  assert.ok(!first.packed.c.some(c => c[0]==='choice'), 'save is not a vote');
  assert.match(await page.locator('dialog .mode-notice').textContent(), /主持人共享紀錄，不供正式版個人匯入/);
  await page.locator('#close-save').click();
  assert.equal((await page.locator('#prompt').textContent()).trim(), 'block / pass:');
  const second = await exportSave(page, {chip:true});
  assert.deepEqual(second.packed, first.packed, 'Repeated vote save does not advance world time or commits');
  assert.equal(await head(page), voteHead);
  await page.locator('#close-save').click();

  // Restore this same UI-created choice through the welcome textarea, in self mode.
  const restored = await open(t);
  await importOwn(restored, first.code);
  assert.equal(await head(restored), voteHead);
  assert.equal((await restored.locator('#prompt').textContent()).trim(), 'block / pass:');
  const third = await exportSave(restored);
  assert.deepEqual(third.packed, first.packed);
  assert.match(await restored.locator('dialog .mode-notice').textContent(), /主持人共享紀錄，不供正式版個人匯入/);
  await restored.locator('#close-save').click();
  await send(restored, 'block');
  await restored.locator('#end-screen').waitFor();
  const ended = portable(await restored.locator('#save-code').inputValue());
  assert.equal(ended.c.filter(c => c[0]==='choice').length, 1);
  assert.deepEqual(ended.c.find(c => c[0]==='choice')[1], {id:'vote', value:'block'});
  assert.match(await restored.locator('.duty-card').textContent(), /02:00 的訪客擋/);

  await send(page, 'pass');
  await page.locator('#end-screen').waitFor();
  assert.match(await page.locator('.duty-card').textContent(), /02:00 的訪客放行/);
  assert.match(await page.locator('dialog .mode-notice').textContent(), /共享紀錄/);
});

const welcomeLines = [
  'ROOT ARCHIPELAGO  試玩版〈第一夜〉\n',
  '預計 15 分鐘。你可以隨時輸入 hint。\n',
  '[init] 請輸入你的暱稱（英文或數字，最多 12 字）。\n',
];

/** 動畫案例呼叫；TestContext → 尚有未完文字的 page，明示前進 24ms 並驗證真的只顯示部分內容。 */
async function pendingWelcome(t) {
  const page = await open(t, {reducedMotion:'no-preference'});
  await page.locator('#new-game').click();
  await ready(page);
  assert.equal(await page.locator('#terminal').getAttribute('aria-busy'), 'true');
  const empty = await page.locator('#terminal').textContent();
  await page.clock.runFor(24);
  const partial = await page.locator('#terminal').textContent();
  assert.ok(partial.length>empty.length, 'Text really progresses with the fake clock');
  assert.ok(partial.length<welcomeLines.join('').length, 'Text is genuinely unfinished');
  assert.equal(await page.locator('#terminal').getAttribute('aria-busy'), 'true');
  return page;
}

/** 動畫案例呼叫；page/凍結時間 → Promise<void>，唯讀斷言所有文字已補完且無推進 timer。 */
async function assertWelcomeFinished(page, frozenAt) {
  assert.deepEqual(await page.locator('#terminal > .terminal-line').allTextContents(), welcomeLines,
    'The same input event must finish every queued line, not only the first');
  assert.equal(await page.locator('#terminal').getAttribute('aria-busy'), 'false');
  assert.equal(await page.evaluate(() => performance.now()), frozenAt, 'No timer advancement needed');
}

uiTest('a non-submit key instantly finishes genuinely animated text', async t => {
  const page = await pendingWelcome(t);
  const frozenAt = await page.evaluate(() => performance.now());
  await page.keyboard.press('Shift');
  await assertWelcomeFinished(page, frozenAt);
  assert.equal(await page.locator('#command-input').inputValue(), '');
});

uiTest('a terminal click instantly finishes genuinely animated text', async t => {
  const page = await pendingWelcome(t);
  const frozenAt = await page.evaluate(() => performance.now());
  await page.locator('#terminal').click();
  await assertWelcomeFinished(page, frozenAt);
});

uiTest('a click outside the terminal also instantly finishes animated text', async t => {
  const page = await pendingWelcome(t);
  const frozenAt = await page.evaluate(() => performance.now());
  await page.locator('.masthead .edition').click();
  await assertWelcomeFinished(page, frozenAt);
});

uiTest('prefers-reduced-motion renders all welcome text without a key/click to skip it', async t => {
  const page = await open(t, {reducedMotion:'reduce'});
  const frozenAt = await page.evaluate(() => performance.now());
  await page.locator('#new-game').click();
  await ready(page);
  await assertWelcomeFinished(page, frozenAt);
  const output = await send(page, 'motionqa');
  assert.match(output, /暱稱已記錄：op-motionqa/);
  assert.match(output, /你有一封信。指令是 mail/);
  assert.equal(await page.locator('#terminal').getAttribute('aria-busy'), 'false');
  assert.equal(await page.evaluate(() => performance.now()), frozenAt);
});
