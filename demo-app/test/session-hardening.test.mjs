/**
 * 本機 session 硬化 QA：依賴 storage/Engine/save、dist 與選用 Playwright；不更改原對照檔。
 * callback 回傳 void/Promise，核心案只改 journal，browser 案驗救援、模式保留與 kiosk 隱私清除。
 * browser 在 hooks 開關；open 的可選 envelope 只注入隔離 context，t.after 關閉並驗無未捕捉錯誤。
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {appendAdvance,checkJournal} from '../src/storage.js';
import {Engine} from '../src/engine/index.js';
import {seal,addCommit,exportCode} from '../src/save/index.js';
import {inflateSync} from 'node:zlib';

let chromium;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional tooling. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
let browser;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});

test('Session: journal compaction retains every live IEEE754 endpoint, including half-ms ties',()=>{
  const journal=[];let live=0,random=5;
  for(let i=0;i<5000;i++){
    random=(Math.imul(random,1664525)+1013904223)>>>0;
    const dt=[.25,.0035,.0005,.0001,.1,.35,(random%1000)/10000][random%7];
    if(i%23===0)journal.push({type:'input',raw:'pwd',dt:0});
    appendAdvance(journal,dt);live+=dt;
    assert.equal(journal.reduce((n,step)=>n+step.dt,0),live,`tick ${i}`);
  }
  assert.ok(checkJournal(journal));
});
test('Session: invalid clock interval cannot poison the last readable journal',()=>{
  const journal=[{type:'advance',dt:1}];
  for(const value of [-1,NaN,Infinity,'1',Number.MAX_VALUE]){
    assert.throws(()=>appendAdvance(journal,value),RangeError);
    assert.deepEqual(journal,[{type:'advance',dt:1}]);
  }
  appendAdvance(journal,86400*60);assert.ok(checkJournal(journal));
  assert.equal(journal.reduce((n,step)=>n+step.dt,0),86400*60+1);
});

/** 案例呼叫；TestContext/可選本機 envelope/網址模式 → page，凍結時間，context 由 t.after 清理。 */
async function open(t,{envelope,mode}={}){
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  if(envelope)await context.addInitScript(value=>localStorage.setItem('ra.demo.save.v1',JSON.stringify(value)),envelope);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);});
  page.setDefaultTimeout(10000);
  const epoch=new Date('2026-10-30T13:00:00Z');await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(+epoch+1000));
  const url=new URL('../dist/index.html',import.meta.url);if(mode)url.searchParams.set('mode',mode);
  await page.goto(url.href);await page.locator('#new-game').waitFor();return page;
}
/** 案例/helper 呼叫；page/raw → Promise<void>，送表單並等 enabled；不直接呼叫私有 Engine。 */
async function send(page,raw){await page.locator('#command-input').fill(raw);await page.locator('#command-input').press('Enter');await page.locator('#command-input:enabled').waitFor();}
/** 案例呼叫；page → Promise<head 字串>，唯讀 DOM。 */
const head=page=>page.locator('#save-status').getAttribute('data-head');
/** 案例呼叫；page/暱稱 → Promise<void>，開始新遊戲並完成暱稱輸入，後續保存由 app 負責。 */
async function start(page,nick='sessionqa'){await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();await send(page,nick);}

test('Session browser: nickname shortcuts cannot overwrite a previous shift; typed hint nickname stays legal',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const previous=await page.evaluate(()=>localStorage.getItem('ra.demo.save.v1'));
  await page.reload();await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();
  for(const selector of ['.hint-button','[aria-label="執行 hint"]','[aria-label="執行 save"]'])assert.equal(await page.locator(selector).isDisabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ra.demo.save.v1')),previous);
  assert.equal(await head(page),'');await send(page,'hint');
  assert.match(await page.locator('#prompt').textContent(),/op-hint@/);
  for(const selector of ['.hint-button','[aria-label="執行 hint"]','[aria-label="執行 save"]'])assert.equal(await page.locator(selector).isDisabled(),false);
});

test('Session browser: an old fractional journal mismatch exposes backups without overwriting its original',{skip,timeout:30000},async t=>{
  const original=new Engine();await original.start();await original.advance(.5);await original.feed('legacyqa');
  for(const dt of [.25,.25,.0035])await original.advance(dt);
  await original.feed('hint');seal(original.save);
  const envelope={version:1,runMode:'self',save:original.save,baseSave:null,journal:[{type:'advance',dt:.5},{type:'input',raw:'legacyqa',dt:0},{type:'advance',dt:.5035},{type:'input',raw:'hint',dt:0}]};
  const page=await open(t,{envelope});await page.locator('#continue-game').click();await page.locator('#local-recovery').waitFor();
  assert.match(await page.locator('#welcome-error').textContent(),/鏈尾不同/);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1'))),envelope);
  assert.deepEqual(JSON.parse(await page.locator('#recovery-journal').inputValue()),envelope);
  assert.equal(await page.locator('#download-journal').isEnabled(),true);assert.equal(await page.locator('#download-recovery-save').isEnabled(),true);
  await page.locator('#restore-events').click();await page.locator('#command-input:enabled').waitFor();
  assert.equal(await head(page),original.save.head);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.recovery.v1'))),envelope);
  await send(page,'save');assert.match(await page.locator('#save-code').inputValue(),/^RA1-/);
});

test('Session browser: self journal and code opened under host URL keep original mode, event and exact head',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  await send(page,'systemctl start lamp');await send(page,'lamp-before-sudo');const before=await head(page);
  const original=await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')));
  const url=new URL(page.url());url.searchParams.set('mode','host');await page.goto(url.href);await page.locator('#continue-game').click();await page.locator('#command-input:enabled').waitFor();
  assert.equal(await head(page),before);assert.equal(await page.locator('#welcome-error').textContent(),'');
  assert.match(await page.locator('#session-mode-notice').textContent(),/沿用原存檔的自助流程/);
  assert.doesNotMatch(await page.locator('#prompt').textContent(),/block \/ pass/);
  await send(page,'save');const code=await page.locator('#save-code').inputValue();
  const packed=JSON.parse(inflateSync(Buffer.from(code.slice(4,code.lastIndexOf('-')),'base64url')).toString('utf8'));
  assert.equal(packed.m.event,original.save.event);assert.equal(packed.m.seed,original.save.seed);assert.equal(packed.m.head,before);
  assert.equal(await page.locator('dialog .mode-notice').count(),0);
  await page.reload();await page.locator('#import-code').fill(code);await page.locator('#import-submit').click();await page.locator('#command-input:enabled').waitFor();
  assert.equal(await head(page),before);assert.match(await page.locator('#task-title').textContent(),/Q0-1/);
  assert.match(await page.locator('#session-mode-notice').textContent(),/沿用原存檔的自助流程/);
});

test('Session browser: rejecting a valid but over-budget legacy code cannot replace the welcome or previous save',{skip,timeout:30000},async t=>{
  const legacy=new Engine();await legacy.start();await legacy.feed('fulllegacy');
  for(let i=0;i<3;i++)await legacy.feed('hint');
  while(legacy.save.commits.length<399)await addCommit(legacy.save,'hint',{n:3,full:true},1,legacy.world_t);
  seal(legacy.save);const code=await exportCode(legacy.save);
  const page=await open(t);await start(page);await send(page,'echo KEEP_PREVIOUS > notes/keep.txt');const before=await head(page);
  const saved=await page.evaluate(()=>localStorage.getItem('ra.demo.save.v1'));
  await page.reload();await page.locator('#import-code').fill(code);await page.locator('#import-submit').click();
  await page.locator('#welcome-error').filter({hasText:/剩餘事件空間不足/}).waitFor();
  assert.equal(await page.locator('#welcome').isVisible(),true);assert.equal(await page.locator('#game').isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ra.demo.save.v1')),saved);
  await page.locator('#continue-game').click();await page.locator('#command-input:enabled').waitFor();assert.equal(await head(page),before);
  await send(page,'cat notes/keep.txt');assert.equal(await page.locator('#terminal .stdout').last().textContent(),'KEEP_PREVIOUS\n');
});

test('Session browser: kiosk reset also clears the private recovery copy',{skip,timeout:30000},async t=>{
  const page=await open(t,{mode:'kiosk'});await start(page);
  await page.evaluate(()=>localStorage.setItem('ra.demo.recovery.v1','{"private":"previous shift"}'));
  await page.clock.fastForward(121000);await page.locator('#new-game').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('ra.demo.recovery.v1')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ra.demo.save.v1')),null);
});
