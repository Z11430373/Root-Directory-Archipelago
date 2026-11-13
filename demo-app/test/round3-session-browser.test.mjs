/**
 * 跨分頁/交易 UI 回歸：依賴 dist、選用 Playwright/RA_CHROME；同 context 分頁共享儲存才有競態意義。
 * 命名 callback 回傳 Promise，驗同 head 檔案修改、舊 kiosk 清除與失敗後重試；不直接改 app 私有狀態。
 * browser hooks 管生命週期，context helper 註冊 t.after 關閉所有頁並驗錯誤；缺工具 skip。
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
let chromium;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional external tooling. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
let browser;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});
/** 案例/pair 呼叫；TestContext → 共享儲存的隔離 context，蒐所有頁面錯誤並於 t.after 關閉。 */
async function context(t){
  const c=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),errors=[];
  c.on('page',p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});});
  t.after(async()=>{await c.close();assert.deepEqual(errors,[]);});return c;
}
/** 案例/pair 呼叫；context/網址 query → 凍結時鐘 page，頁面由所屬 context 的 t.after 清理。 */
async function open(c,query=''){
  const p=await c.newPage();p.setDefaultTimeout(8000);
  const epoch=new Date('2026-10-30T17:00:00Z');await p.clock.install({time:epoch});await p.clock.pauseAt(new Date(+epoch+1000));
  await p.goto(new URL('../dist/index.html',import.meta.url).href+query);await p.locator('#new-game').waitFor();return p;
}
/** 明確切到要操作的真分頁再提交；背景 idle／storage 事件仍由各案自行觸發。 */
async function send(p,raw){await p.bringToFront();await p.locator('#command-input').fill(raw);await p.locator('#command-input').press('Enter');await p.locator('#command-input:enabled').waitFor();}
/** 跨頁案例呼叫；TestContext/舊頁 query → {a,b}，a 建檔、b 明示續玩，兩頁基準刻意形成先後關係。 */
async function pair(t,query=''){
  const c=await context(t),a=await open(c,query);await a.locator('#new-game').click();await send(a,'pairqa');await send(a,'echo ALPHA > notes/a.txt');
  const b=await open(c);await b.locator('#continue-game').click();await b.locator('#command-input:enabled').waitFor();
  return {a,b};
}
/** 案例呼叫；page → Promise<完整本機 envelope>，唯讀共享儲存，避免只憑 head 遺漏檔案紀錄。 */
const saved=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')));

test('R3 session control: same-head file-only changes are protected from an older tab and its export',{skip,timeout:30000},async t=>{
  const {a,b}=await pair(t);const before=await saved(b);
  await send(b,'echo BETA > notes/b.txt');const newer=await saved(b);
  assert.equal(newer.save.head,before.save.head,'This control must not rely on a new commit/head');
  await send(a,'echo OLD > notes/old.txt');await send(a,'save');await a.locator('#save-code').waitFor();
  const after=await saved(b);
  assert.ok(after.journal.some(s=>s.raw==='echo BETA > notes/b.txt'));
  assert.ok(!after.journal.some(s=>s.raw==='echo OLD > notes/old.txt'));
  assert.match(await a.locator('#save-status').textContent(),/分頁|衝突|停止/);
  assert.ok((await a.locator('#save-code').inputValue()).startsWith('RA1-'),'Stale tab can still export its own portable progress');
});
test('R3 session control: a stale kiosk idle reset cannot delete another tab\'s newer journal',{skip,timeout:30000},async t=>{
  const {a,b}=await pair(t,'?mode=kiosk');await send(b,'echo BETA > notes/b.txt');
  await a.clock.fastForward(121000);await a.locator('#new-game').waitFor();
  const after=await saved(b);assert.ok(after);assert.ok(after.journal.some(s=>s.raw==='echo BETA > notes/b.txt'));
  await b.reload();await b.locator('#continue-game').click();await b.locator('#command-input:enabled').waitFor();await send(b,'cat notes/b.txt');
  assert.equal(await b.locator('#terminal .stdout').last().textContent(),'BETA\n');
});
test('R3 session control: kiosk cleanup preserves a recovery copy changed by an observed external tab',{skip,timeout:30000},async t=>{
  const {a,b}=await pair(t,'?mode=kiosk');
  await a.evaluate(()=>window.addEventListener('storage',event=>{if(event.key==='ra.demo.recovery.v1')window.recoverySeen=true;}));
  await b.evaluate(()=>localStorage.setItem('ra.demo.recovery.v1','{"private":"other tab new recovery"}'));
  await a.waitForFunction(()=>window.recoverySeen===true);await a.clock.fastForward(121000);await a.locator('#new-game').waitFor();
  assert.equal(await b.evaluate(()=>localStorage.getItem('ra.demo.recovery.v1')),'{"private":"other tab new recovery"}');
});
test('R3 session control: a failed state action rolls back and can be retried after fixing the blocking file',{skip,timeout:30000},async t=>{
  const c=await context(t),p=await open(c);await p.locator('#new-game').click();await send(p,'atomicqa');
  for(const raw of ['ls','cat handbook.md','ls -a notes','grep lamp logs/lamp.log','grep -r KEY-FRAG ~','systemctl start lamp','lamp-before-sudo','echo BLOCK > /lost+found','git checkout -b alt/sandbox'])await send(p,raw);
  await send(p,'rm -rf ~/notes');await send(p,'ls ~/notes');assert.match(await p.locator('#terminal .stdout').last().textContent(),/./);
  await send(p,'rm /lost+found');await send(p,'rm -rf ~/notes');await send(p,'cat /lost+found/#0');
  assert.doesNotMatch(await p.locator('#terminal .stdout').last().textContent(),/No such file/);
  const state=await saved(p);assert.ok(state.save.commits.some(c=>c.kind==='flag'&&c.data.name==='flag.b0.lost0_created'));
  await p.reload();await p.locator('#continue-game').click();await p.locator('#command-input:enabled').waitFor();assert.equal(await p.locator('#local-recovery').count(),0);
});
