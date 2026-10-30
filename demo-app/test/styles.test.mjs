import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {sanitizePreferences,resolvePreferences} from '../src/ui/preferences.js';

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
  function luminance(hex){const a=[0,2,4].map(i=>parseInt(hex.slice(i+1,i+3),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
  for(const fg of ['ink','muted','accent','amber'])for(const bg of ['bg','surface','raised']){
    const a=luminance(colors[fg]),b=luminance(colors[bg]);assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${fg} on ${bg}`);
  }
});
const html=new URL('../dist/index.html',import.meta.url).href;
async function open(t,{width=1280,height=800,init}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  if(init)await context.addInitScript(init);
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('request',req=>{if(req.resourceType()!=='document')requests.push(req.url());});
  const time=new Date('2026-10-30T12:00:00Z');
  await page.clock.install({time});await page.clock.pauseAt(new Date(+time+1000));
  await page.goto(html);await page.locator('#new-game').waitFor();
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
  return page;
}
async function send(page,text){await page.locator('#command-input').fill(text);await page.locator('#command-input').press('Enter');await page.locator('#command-input:enabled').waitFor();}
async function start(page){await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();await send(page,'styleqa');await send(page,'ls');}
const head=page=>page.locator('#save-status').getAttribute('data-head');
async function portable(page){await send(page,'save');const code=await page.locator('#save-code').inputValue();await page.locator('#close-save').click();return JSON.parse(inflateSync(Buffer.from(code.slice(4,code.lastIndexOf('-')),'base64url')).toString('utf8'));}

test('Styles browser: live Server and islands switching preserves draft, head, transcript and cwd',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'cd notes');
  const before={head:await head(page),prompt:await page.locator('#prompt').textContent(),output:await page.locator('#terminal').textContent()};
  await page.locator('#command-input').fill('cat .dra');
  await page.locator('#visual-style').selectOption('server');
  assert.equal(await page.locator('html').getAttribute('data-style'),'server');
  assert.equal(await page.locator('#command-input').inputValue(),'cat .dra');
  assert.equal(await head(page),before.head);assert.equal(await page.locator('#prompt').textContent(),before.prompt);
  assert.equal(await page.locator('#terminal').textContent(),before.output);
  assert.equal(await page.locator('.workspace').evaluate(node=>getComputedStyle(node).borderRadius),'0px');
  assert.equal(await page.locator('.window-dots').evaluate(node=>getComputedStyle(node).display),'none');
  assert.match(await page.locator('h1').evaluate(node=>getComputedStyle(node).fontFamily),/monospace/);
  await page.locator('#visual-style').selectOption('islands');
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  assert.equal(await page.locator('.workspace').evaluate(node=>getComputedStyle(node).borderRadius),'8px');
  assert.equal(await head(page),before.head);assert.equal(await page.locator('#command-input').inputValue(),'cat .dra');
});

test('Styles browser: style, contrast and font persist independently and never enter RA1',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const original=await portable(page),before=await head(page);
  await page.locator('#visual-style').selectOption('server');
  await page.locator('#theme').selectOption('contrast');await page.locator('#font-size').selectOption('large');
  assert.deepEqual(await portable(page),original);
  await page.reload();assert.equal(await page.locator('#visual-style').inputValue(),'server');
  assert.equal(await page.locator('html').getAttribute('data-style'),'server');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'contrast');
  assert.equal(await page.locator('html').getAttribute('data-font'),'large');
  await page.locator('#continue-game').click();await page.locator('#command-input:enabled').waitFor();
  assert.equal(await head(page),before);assert.deepEqual(await portable(page),original);
});

for(const width of [320,360,768])test(`Styles browser: both styles usable at ${width}px, with keyboard and both contrast palettes`,{skip,timeout:45000},async t=>{
  const page=await open(t,{width,height:740});
  for(const style of ['server','islands']){
    await page.locator('#visual-style').selectOption(style);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${style} welcome overflow`);
  }
  await start(page);
  for(const style of ['server','islands'])for(const theme of ['dark','contrast']){
    await page.locator('#visual-style').selectOption(style);await page.locator('#theme').selectOption(theme);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${style}/${theme} game overflow`);
    const ratio=await page.locator('#terminal').evaluate(node=>{
      const style=getComputedStyle(node),root=getComputedStyle(document.documentElement);
      const luminance=text=>{const a=text.startsWith('#')?[0,2,4].map(i=>parseInt((text.length===4?[...text.slice(1)].map(x=>x+x).join(''):text.slice(1)).slice(i,i+2),16)):text.match(/[\d.]+/g).slice(0,3).map(Number);const c=a.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
      const a=luminance(style.color),b=luminance(root.getPropertyValue('--bg').trim());return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    });assert.ok(ratio>=4.5);
    await page.locator('#command-input').focus();await page.keyboard.type('pw');await page.keyboard.press('Tab');
    assert.equal(await page.locator('#command-input').inputValue(),'pwd ');await page.keyboard.press('Enter');await page.locator('#command-input:enabled').waitFor();
    await page.getByRole('button',{name:'填入 ls -a',exact:true}).click();assert.equal(await page.locator('#command-input').inputValue(),'ls -a ');await page.locator('#command-input').fill('');
  }
});

test('Styles browser: unavailable preference storage does not break either style',{skip,timeout:30000},async t=>{
  const page=await open(t,{init:()=>Object.defineProperty(window,'localStorage',{get(){throw Error('blocked');}})});
  await page.locator('#visual-style').selectOption('server');await start(page);assert.match(await page.locator('#task-title').textContent(),/Q0-2/);
  await page.locator('#visual-style').selectOption('islands');await send(page,'cat handbook.md');assert.match(await page.locator('#task-title').textContent(),/Q0-3/);
});

test('Styles browser: primitive saved preferences can be changed without errors',{skip,timeout:30000},async t=>{
  const page=await open(t,{init:()=>localStorage.setItem('ra.demo.preferences.v1','false')});
  await page.locator('#visual-style').selectOption('server');await page.locator('#theme').selectOption('dark');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.preferences.v1'))),{style:'server',theme:'dark'});
  await start(page);assert.match(await page.locator('#task-title').textContent(),/Q0-2/);
});

test('Styles browser: Server end screen keeps the DOM card, portable code and mobile layout',{skip,timeout:45000},async t=>{
  const page=await open(t,{width:360,height:740});await page.locator('#visual-style').selectOption('server');await start(page);
  await page.clock.fastForward(961000);await page.locator('#end-screen').waitFor();
  const code=await page.locator('#save-code').inputValue();assert.match(code,/^RA1-/);
  const pack=JSON.parse(inflateSync(Buffer.from(code.slice(4,code.lastIndexOf('-')),'base64url')).toString('utf8'));
  assert.equal(pack.m.head,await head(page));assert.match(await page.locator('.duty-card').textContent(),/值班時間到/);
  assert.equal(await page.locator('dialog').evaluate(node=>getComputedStyle(node).borderRadius),'0px');
  assert.ok(await page.locator('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await page.locator('#copy-card').isEnabled(),true);assert.equal(await page.locator('#download-save').isEnabled(),true);
});
