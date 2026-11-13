/**
 * 顯示偏好/雙外觀 QA：依賴 preferences.js、theme/server.css、dist 及選用 Playwright/RA_CHROME。
 * callback 回傳 void/Promise；靜態色彩計算不取代實際幾何，瀏覽器案驗切換不改 head/草稿/RA1。
 * browser hooks 管開關，open 的 context 在 t.after 關閉並斷言零錯誤/外部子資源請求；不建置或改 fixture。
 */
import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {sanitizePreferences,resolvePreferences} from '../src/ui/preferences.js';
import {send,typeDraft,clearDraft,expectDraft,expectPrompt,terminalText,transcriptOutput,saveCode,renderedEditor,freezeGameTime,advanceGameTime} from './helpers/xterm.mjs';

let chromium;
try {({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional tool, never bundled. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
let browser;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});

test('Styles: legacy, malformed and unknown preferences normalize without changing game data',()=>{
  for(const input of [null,undefined,false,1,'server',[],{style:'<script>',theme:'pink',font:'huge'}]) {
    assert.deepEqual(sanitizePreferences(input),{});
    assert.deepEqual(resolvePreferences(input),{style:'islands',theme:'dark',font:'medium'});
  }
  assert.deepEqual(resolvePreferences({theme:'contrast',font:'large'}),{style:'islands',theme:'contrast',font:'large'});
  assert.deepEqual(resolvePreferences({style:'server',extra:'ignored'},{prefersLight:true,hostMode:true}),{style:'server',theme:'contrast',font:'large'});
  assert.deepEqual(sanitizePreferences({style:'server',theme:'dark',font:'small',extra:true}),{style:'server',theme:'dark',font:'small'});
});
test('Styles: Server dark palette keeps every text color at least 4.5:1 on all surfaces',async()=>{
  const css=await readFile(new URL('../src/ui/server.css',import.meta.url),'utf8');
  const block=css.split(':root[data-style=server][data-theme=dark]{')[1].split('}')[0];
  const colors=Object.fromEntries([...block.matchAll(/--([a-z]+):(#[0-9a-f]+)/g)].map(m=>[m[1],m[2]]));
  /** 本靜態色彩案例呼叫；六碼 hex → 相對亮度，純計算供 4.5:1 文字對比斷言。 */
  function luminance(hex){const a=[0,2,4].map(i=>parseInt(hex.slice(i+1,i+3),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
  for(const fg of ['ink','muted','accent','amber'])for(const bg of ['bg','surface','raised']){
    const a=luminance(colors[fg]),b=luminance(colors[bg]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fg} on ${bg}`);
  }
});
const html=new URL('../dist/index.html',import.meta.url).href;
/** browser 案例呼叫；TestContext/尺寸/初始化 → page，凍結時鐘、蒐錯與請求；context 由 t.after 清理。 */
async function open(t,{width=1280,height=800,init}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  if(init)await context.addInitScript(init);
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('request',req=>{if(req.resourceType()!=='document'&&!req.url().startsWith('blob:'))requests.push(req.url());});
  const time=new Date('2026-10-30T12:00:00Z');
  await freezeGameTime(page,time);
  await page.goto(html);await page.locator('#new-game').waitFor();
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
  return page;
}
async function setStyle(page,style){
  if(await page.locator('html').getAttribute('data-style')===style)return;
  if(style==='islands')await page.locator('#command-input').press('F2');
  else await page.locator('#visual-style').selectOption(style);
}
/** browser 案例呼叫；page → Promise<void>，開始固定暱稱並過 Q0-1，避免各案前置狀態不同。 */
async function start(page){if(await page.locator('html').getAttribute('data-style')==='server')await send(page,'start');else await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();await send(page,'styleqa');await send(page,'ls');}
/** browser 案例呼叫；page → Promise<head 字串>，只讀 DOM。 */
const head=page=>page.locator('#save-status').getAttribute('data-head');
/** browser 案例呼叫；page → packed RA1，打開保存後解碼，再關 dialog 還焦點，不直接改存檔。 */
async function portable(page){await send(page,'save');const terminal=await page.locator('html').getAttribute('data-style')==='server';const code=terminal?await saveCode(page):await page.locator('#save-code').inputValue();if(!terminal)await page.locator('#close-save').click();return JSON.parse(inflateSync(Buffer.from(code.slice(4,code.lastIndexOf('-')),'base64url')).toString('utf8'));}

test('Styles browser: live Server and islands switching preserves draft, head, transcript and cwd',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'cd notes');
  const normalize=text=>text.replace(/\s+/g,' ').trim();
  const before={head:await head(page),prompt:await page.locator('#prompt').textContent(),output:normalize(await transcriptOutput(page))};
  await page.locator('#command-input').fill('cat .dra');
  await page.locator('#visual-style').selectOption('server');
  assert.equal(await page.locator('html').getAttribute('data-style'),'server');
  await expectDraft(page,'cat .dra');
  assert.equal(await head(page),before.head);await expectPrompt(page,before.prompt);
  assert.equal(normalize(await transcriptOutput(page)),before.output);
  assert.equal(await page.locator('.task-panel,.chips,.execute,.workspace').count(),0);
  assert.equal(await page.locator('.console-session .xterm-screen').count(),1);
  assert.match(await page.locator('.xterm-rows').evaluate(node=>getComputedStyle(node).fontFamily),/monospace/);
  await setStyle(page,'islands');
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  assert.equal(await page.locator('.workspace').evaluate(node=>getComputedStyle(node).borderRadius),'8px');
  assert.equal(await head(page),before.head);await expectDraft(page,'cat .dra');
  assert.equal((await renderedEditor(page)).prompt,before.prompt);assert.equal(normalize(await transcriptOutput(page)),before.output);
});

test('Styles browser: style, contrast and font persist independently and never enter RA1',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const original=await portable(page),before=await head(page);
  await page.locator('#visual-style').selectOption('server');
  await send(page,'theme contrast');await send(page,'font large');
  assert.deepEqual(await portable(page),original);
  await page.reload();assert.equal(await page.locator('#visual-style').inputValue(),'server');
  assert.equal(await page.locator('html').getAttribute('data-style'),'server');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'contrast');
  assert.equal(await page.locator('html').getAttribute('data-font'),'large');
  await send(page,'resume');
  assert.equal(await head(page),before);assert.deepEqual(await portable(page),original);
});

for(const width of [320,360,768])test(`Styles browser: both styles usable at ${width}px, with keyboard and both contrast palettes`,{skip,timeout:45000},async t=>{
  const page=await open(t,{width,height:740});
  for(const style of ['server','islands']){
    await setStyle(page,style);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${style} welcome overflow`);
  }
  await start(page);
  for(const style of ['server','islands'])for(const theme of ['dark','contrast']){
    await setStyle(page,style);if(style==='server')await send(page,`theme ${theme}`);else await page.locator('#theme').selectOption(theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${style}/${theme} game overflow`);
    const ratio=await page.locator(style==='server'?'.xterm-rows':'#terminal').evaluate(node=>{
      const style=getComputedStyle(node),root=getComputedStyle(document.documentElement);
      const luminance=text=>{const a=text.startsWith('#')?[0,2,4].map(i=>parseInt((text.length===4?[...text.slice(1)].map(x=>x+x).join(''):text.slice(1)).slice(i,i+2),16)):text.match(/[\d.]+/g).slice(0,3).map(Number);const c=a.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const a=luminance(style.color),b=luminance(root.getPropertyValue('--bg').trim());return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert.ok(ratio>=4.5);
    await page.locator('#command-input').focus();await page.keyboard.type('pw');await page.keyboard.press('Tab');
    await expectDraft(page,'pwd ');await page.keyboard.press('Enter');await page.locator('#command-input:enabled').waitFor();await expectDraft(page,'');
    if(style==='islands'){await page.getByRole('button',{name:'填入 ls -a',exact:true}).click();assert.equal(await page.locator('#command-input').inputValue(),'ls -a ');}
    else {assert.equal(await page.locator('.chips').count(),0);await typeDraft(page,'cat han');await page.keyboard.press('Tab');await expectDraft(page,'cat handbook.md ');}
    await clearDraft(page);
  }
});

test('Styles browser: unavailable preference storage does not break either style',{skip,timeout:30000},async t=>{
  const page=await open(t,{init:()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}})});
  await page.locator('#visual-style').selectOption('server');await start(page);assert.match(await terminalText(page),/Q0-2/);
  await setStyle(page,'islands');await send(page,'cat handbook.md');assert.match(await page.locator('#task-title').textContent(),/Q0-3/);
});

test('Styles browser: primitive saved preferences can be changed without errors',{skip,timeout:30000},async t=>{
  const page=await open(t,{init:()=>localStorage.setItem('ra.demo.preferences.v1','false')});
  await page.locator('#visual-style').selectOption('server');await send(page,'theme dark');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.preferences.v1'))),{style:'server',theme:'dark'});
  await start(page);assert.match(await terminalText(page),/Q0-2/);
});

test('Modes browser: terminal ending, certificate and export stay in scrollback at mobile width',{skip,timeout:45000},async t=>{
  const page=await open(t,{width:360,height:740});await page.locator('#visual-style').selectOption('server');await start(page);
  await advanceGameTime(page,961000);await expectPrompt(page,'archipelago:finished$ ');await send(page,'save');
  const code=await saveCode(page);assert.match(code,/^RA1-/);
  const pack=JSON.parse(inflateSync(Buffer.from(code.slice(4,code.lastIndexOf('-')),'base64url')).toString('utf8'));
  assert.equal(pack.m.head,await head(page));assert.match(await terminalText(page),/值班時間到/);
  assert.equal(await page.locator('dialog,.duty-card').count(),0);
  assert.ok(await page.locator('.xterm-screen').evaluate(node=>node.scrollWidth<=node.clientWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await send(page,'start');await expectPrompt(page,'暱稱: ');
});
