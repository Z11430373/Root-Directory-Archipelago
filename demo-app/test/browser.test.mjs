/**
 * T12 瀏覽器整合 QA：依賴生成 dist、walkthrough.json、save codec 與選用 Playwright/RA_CHROME。
 * 測試由使用者路徑輸入並檢查 DOM/請求/CSP；缺工具會 skip，不等於完成跨瀏覽器或真人驗收。
 * 主 callback 回傳 Promise；t.after 關 browser/HTTPS server，context 用後 close，自簽 TLS 僅在隔離 context 容許。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import { deflateSync } from 'node:zlib';

// Optional test tooling lives outside the app and is never included in dist.
let chromium;
try {
  ({chromium} = await import(process.env.RA_PLAYWRIGHT || 'playwright'));
} catch { /* Explicitly reported as skipped if browser tooling is absent. */ }
const browserPath = process.env.RA_CHROME;
const enabled = !!chromium && !!browserPath;
const htmlURL = new URL('../dist/index.html', import.meta.url);
const walk = JSON.parse(await readFile(new URL('../../demo/testvectors/walkthrough.json', import.meta.url), 'utf8')).walkthroughs.find(w => w.name === 'digger');

test('T12: offline file + HTTPS, safety, keyboard, mobile, resume, kiosk, exports and themes', {skip: !enabled, timeout: 180_000}, async t => {
  const browser = await chromium.launch({executablePath: browserPath, headless: true});
  t.after(() => browser.close());
  /** 本案例呼叫；網址/可選初始化腳本 → browser 環境與蒐集清單，建立 context；呼叫端負責 close。 */
  async function open(url=htmlURL.href, init) {
    const context = await browser.newContext({viewport:{width:1280,height:800}, reducedMotion:'reduce', ignoreHTTPSErrors:true});
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    const errors=[], requests=[], violations=[];
    page.on('console', msg => {if(msg.type()==='error') errors.push(msg.text());});
    page.on('pageerror', error => errors.push(error.message));
    // A bundled Blob Worker is local execution, not an external subresource.
    // Keep rejecting every non-document URL other than these CSP-authorized blobs.
    page.on('request', request => {if(request.resourceType()!=='document'&&!request.url().startsWith('blob:')) requests.push(request.url());});
    await page.exposeFunction('recordCSP', value => violations.push(value));
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.recordCSP(event.violatedDirective)));
    await page.goto(url);
    await page.locator('#new-game').waitFor();
    return {context,page,errors,requests,violations};
  }
  /** 本案例呼叫；page/文字 → Promise<void>，經真表單送出並等輸入解鎖，推進頁面狀態。 */
  async function send(page, text) {
    const input=page.locator('#command-input');
    await input.fill(text);
    await input.press('Enter');
    await page.waitForFunction(() => document.querySelector('#command-input')?.disabled === false);
  }
  const env=await open();
  const {page}=env;
  await page.clock.install();
  await page.locator('#new-game').click();
  await send(page,'<img src=x onerror=alert(1)>');
  await page.waitForFunction(() => document.querySelector('#terminal').textContent.includes('只接受英文'));
  assert.equal(await page.locator('#terminal img').count(),0);
  assert.equal(await page.locator('#save-status').getAttribute('data-head'),'');
  await page.clock.fastForward(6000);
  await send(page,'zien');
  // Keyboard-only Tab completion and Q0-1.
  await page.locator('#command-input').fill('l');
  await page.locator('#command-input').press('Tab');
  assert.match(await page.locator('#command-input').inputValue(),/^l/);
  await page.locator('#command-input').fill('ls');
  await page.locator('#command-input').press('Enter');
  await page.waitForFunction(() => document.querySelector('#task-title').textContent.includes('Q0-2'));
  // Refresh must preserve the exact chain tail.
  const head=await page.locator('#save-status').getAttribute('data-head');
  await page.reload();
  await page.locator('#continue-game').click();
  await page.waitForFunction(h => document.querySelector('#save-status')?.dataset.head===h,head);
  await page.locator('#theme').selectOption('contrast');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'contrast');
  await page.locator('#font-size').selectOption('large');
  assert.equal(await page.locator('html').getAttribute('data-font'),'large');
  await page.setViewportSize({width:360,height:740});
  await page.waitForFunction(()=>document.querySelector('.task-panel')?.open===false);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('.task-panel').getAttribute('open'),null);
  assert.ok((await page.locator('#panel-summary').textContent()).includes('Q0-2'));
  assert.ok(await page.locator('#command-input').evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=16));
  await page.getByRole('button',{name:'填入 ls -a',exact:true}).click();
  assert.equal(await page.locator('#command-input').inputValue(),'ls -a ');
  // Complete the remaining digger commands with the supplied timing.
  for(const step of walk.steps.slice(1)) {
    await page.clock.fastForward(step.dt*1000);
    await send(page,step.in);
  }
  await page.locator('#end-screen').waitFor();
  const code=await page.locator('#save-code').inputValue();
  const {importCode}=await import('../src/save/index.js');
  const imported=await importCode(code);
  assert.equal(imported.head,await page.locator('#save-status').getAttribute('data-head'));
  assert.deepEqual(env.requests,[],'No resource/network requests after document');
  assert.deepEqual(env.errors,[],'No console or uncaught errors');
  assert.deepEqual(env.violations,[],'No CSP violations');
  // A malicious save nickname must be refused too.
  const {crc32}=await import('../src/save/index.js');
  const malformed={m:{schema:1,game:'root-archipelago',demo:true,nick:'<img src=x onerror=alert(1)>',seed:5,event:null,head:null},c:[]};
  const body=deflateSync(JSON.stringify(malformed)).toString('base64url');
  const badCode=`RA1-${body}-${(crc32('RA1-'+body)>>>0).toString(16).padStart(8,'0')}`;
  await page.locator('#restart').click();
  await page.locator('#import-code').fill(badCode);
  await page.locator('#import-submit').click();
  await page.locator('#welcome-error').filter({hasText:/暱稱/}).waitFor();
  // Storage / clipboard unavailable must not disable play.
  const blocked=await open(htmlURL.href,() => {
    Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});
    Object.defineProperty(navigator,'clipboard',{get(){throw new Error('blocked');}});
  });
  await blocked.page.locator('#new-game').click();
  await send(blocked.page,'guest');
  await send(blocked.page,'ls');
  await blocked.page.waitForFunction(() => document.querySelector('#task-title').textContent.includes('Q0-2'));
  await send(blocked.page,'save');
  await blocked.page.locator('#copy-code').click();
  await blocked.page.locator('#copy-status').filter({hasText:/手動/}).waitFor();
  await blocked.page.locator('#close-save').click();
  for(const step of walk.steps.slice(1)) await send(blocked.page,step.in);
  await blocked.page.locator('#end-screen').waitFor();
  assert.ok((await blocked.page.locator('#save-code').inputValue()).startsWith('RA1-'));
  assert.deepEqual(blocked.errors,[]);
  // Kiosk idle uses fake clock, resets to welcome, no download button.
  const kiosk=await open(htmlURL.href+'?mode=kiosk');
  await kiosk.page.clock.install();
  await kiosk.page.locator('#new-game').click();
  await send(kiosk.page,'guest');
  await kiosk.page.clock.fastForward(121000);
  await kiosk.page.locator('#new-game').waitFor();
  await kiosk.page.locator('#new-game').click();
  for(const step of walk.steps) await send(kiosk.page,step.in);
  await kiosk.page.locator('#end-screen').waitFor();
  assert.equal(await kiosk.page.locator('#download-save').count(),0);
  assert.equal(await kiosk.page.locator('#clear-local').isChecked(),true);
  assert.deepEqual(kiosk.errors,[]);
  // HTTPS opening also uses one document and zero subresources.
  if(process.env.RA_TLS_KEY && process.env.RA_TLS_CERT) {
    const server=createServer({key:await readFile(process.env.RA_TLS_KEY),cert:await readFile(process.env.RA_TLS_CERT)},async(req,res) => {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
      res.end(await readFile(htmlURL));
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    t.after(() => new Promise(resolve=>server.close(resolve)));
    const secure=await open(`https://127.0.0.1:${server.address().port}/`);
    await secure.page.clock.install();
    await secure.page.locator('#new-game').click();
    for(const step of walk.steps) {
      await secure.page.clock.fastForward(step.dt*1000);
      await send(secure.page,step.in);
    }
    await secure.page.locator('#end-screen').waitFor();
    const secureSave=await importCode(await secure.page.locator('#save-code').inputValue());
    assert.equal(secureSave.head,await secure.page.locator('#save-status').getAttribute('data-head'));
    assert.deepEqual(secure.requests,[]);
    assert.deepEqual(secure.errors,[]);
    assert.deepEqual(secure.violations,[]);
    await secure.context.close();
  } else assert.fail('RA_TLS_KEY and RA_TLS_CERT required to claim HTTPS verification');
  await Promise.all([env.context.close(),blocked.context.close(),kiosk.context.close()]);
});
