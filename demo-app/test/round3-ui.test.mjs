/**
 * 第三輪 UI/鍵盤/可及性回歸：依賴 dist 與選用 Playwright/RA_CHROME，不改來源或建置產物。
 * callback 回傳 Promise，從實際 DOM/幾何/焦點驗捲動、表單邊界、觸控尺寸與低視窗輸入。
 * browser hooks 開關，open 的 context 用 t.after 關閉並斷言零錯誤/子資源；缺工具明確 skip。
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {send,expectDraft,expectPrompt,terminalText,screenText,scrollPosition,scrollToEdge,freezeGameTime,advanceGameTime,eventually,ready,cellBox} from './helpers/xterm.mjs';
let chromium;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional tool, never bundled. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
let browser;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});
/** 案例呼叫；TestContext/視窗尺寸/動態偏好 → page，安裝/暫停時鐘；context 在 t.after 關閉。 */
async function open(t,{width=1280,height=800,motion='reduce',touch=false}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:motion,hasTouch:touch});
  const page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(r.resourceType()!=='document'&&!r.url().startsWith('blob:'))requests.push(r.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
  const epoch=new Date('2026-10-30T15:00:00Z');await freezeGameTime(page,epoch);
  await page.goto(new URL('../dist/index.html',import.meta.url).href);await page.locator('#new-game').waitFor();return page;
}
/** 案例呼叫；page → Promise<void>，開始固定暱稱遊戲。 */
async function start(page){await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();await send(page,'uicheck');}
/** 捲動案例呼叫；page → log locator，讀多份手冊產生真實溢出，不直接假造 scrollHeight。 */
async function longLog(page){await send(page,'cat handbook.md handbook.md handbook.md handbook.md');return page.locator('#terminal');}
/** 對比案例呼叫；兩個 CSS rgb 字串 → 對比值，純亮度運算，不改樣式。 */
function ratio(a,b){const luminance=text=>{const c=text.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

for(const style of ['islands','server'])test(`R3-UI01: repeated PageUp can read past more than one page of ${style} terminal history`,{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await page.locator('#visual-style').selectOption(style);const log=await longLog(page);
  if(style==='server'){
    await page.locator('#command-input').focus();
    const bottom=await scrollPosition(page),height=(await page.locator('.xterm-rows > div').first().boundingBox()).height;
    await page.keyboard.press('PageUp');const first=await eventually(()=>scrollPosition(page),row=>row<bottom,'PageUp changes visible scrollback');
    const firstScreen=await screenText(page);
    await page.keyboard.press('PageUp');const second=await eventually(()=>scrollPosition(page),row=>row<first,'A second PageUp continues into older history');
    assert.ok((bottom-first)*height>100);assert.ok((first-second)*height>100);
    assert.notEqual(await screenText(page),firstScreen);return;
  }
  await log.focus();
  const bottom=await log.evaluate(n=>n.scrollTop);await page.keyboard.press('PageUp');await page.waitForTimeout(250);const first=await log.evaluate(n=>n.scrollTop);
  await page.keyboard.press('PageUp');await page.waitForTimeout(250);const second=await log.evaluate(n=>n.scrollTop);
  assert.ok(first<bottom-100);assert.ok(second<first-100,`bottom=${bottom}, first=${first}, second=${second}`);
});
for(const style of ['islands','server'])test(`R3-UI02: idle hint does not pull a player away from earlier ${style} terminal output`,{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await page.locator('#visual-style').selectOption(style);const log=await longLog(page);
  if(style==='server'){
    await scrollToEdge(page,-1);const earlier=await screenText(page);assert.equal(await scrollPosition(page),1);
    await advanceGameTime(page,30100);
    assert.equal(await scrollPosition(page),1);assert.equal(await screenText(page),earlier);
    await scrollToEdge(page,1);await send(page,'pwd');assert.ok(await scrollPosition(page)>1);
    assert.match(await terminalText(page),/提示|hint/);return;
  }
  await log.evaluate(n=>{n.scrollTop=0;});await page.waitForTimeout(100);
  await advanceGameTime(page,30100);await page.waitForFunction(()=>document.querySelector('#hint-state').textContent.includes('●'));
  assert.equal(await log.evaluate(n=>n.scrollTop),0,'New output must respect a reader who scrolled back');
  await send(page,'pwd');assert.ok(await log.evaluate(n=>n.scrollTop>100),'Submitting a new command explicitly follows its output');
});
test('R3-UI03: desktop task summary works with both pointer and keyboard',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const summary=page.locator('#panel-summary'),panel=page.locator('.task-panel');
  const box=await summary.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.equal(await panel.getAttribute('open'),null);assert.equal(await page.locator('#task-title').isVisible(),false);
  await summary.focus();await page.keyboard.press('Space');assert.notEqual(await panel.getAttribute('open'),null);assert.equal(await page.locator('#task-title').isVisible(),true);
});
test('R3-UI04: form boundaries and terminal caret/focus cues meet contrast requirements in both themes',{skip,timeout:30000},async t=>{
  const page=await open(t);
  for(const style of ['islands','server'])for(const theme of ['dark','contrast']){
    if(await page.locator('html').getAttribute('data-style')!==style)await page.locator('#visual-style').selectOption(style);
    if(style==='islands'){
      await page.locator('#theme').selectOption(theme);
      const colors=await page.locator('#import-code').evaluate(n=>{const s=getComputedStyle(n);return[s.borderTopColor,s.backgroundColor];});
      assert.ok(ratio(...colors)>=3,`${style}/${theme}: ${colors.join(' / ')} is ${ratio(...colors)}`);
    }else{
      await send(page,`game theme ${theme}`);
      const colors=await eventually(()=>page.locator('.xterm-cursor').evaluateAll(nodes=>{
        const n=nodes.find(n=>n.isConnected&&n.closest('.xterm'));if(!n)return null;
        return[getComputedStyle(n).backgroundColor,getComputedStyle(n.closest('.xterm').querySelector('.xterm-scrollable-element')).backgroundColor];
      }),value=>!!value,'The actual terminal cursor has computed colors');
      assert.ok(ratio(...colors)>=3,`terminal caret/${theme}: ${colors}`);
      await page.locator('#command-input').press('Shift+Tab');
      const focus=await page.evaluate(()=>{const n=document.activeElement,s=getComputedStyle(n);return{style:s.outlineStyle,color:s.outlineColor,active:n!==document.body&&!n.matches('.xterm-helper-textarea'),visible:n.getBoundingClientRect().width>0};});
      assert.ok(focus.active&&focus.visible,'Shift+Tab reaches a visible keyboard-focus target');assert.equal(focus.style,'solid');assert.ok(ratio(focus.color,colors[1])>=3);
    }
  }
});
test('R3-UI05: mobile GUI controls retain 44px hit areas; terminal viewport activates native input by touch',{skip,timeout:30000},async t=>{
  const page=await open(t,{width:360,height:740,touch:true});await start(page);
  for(const style of ['islands','server']){
    await page.locator('#visual-style').selectOption(style);
    if(style==='islands'){
      const sizes=await page.locator('#visual-style,#theme,#font-size,.chips button').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-label'),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
      for(const size of sizes){assert.ok(size.w>=44&&size.h>=44,`${style}: ${JSON.stringify(size)}`);}
    }else{
      assert.equal(await page.locator('.chips').count(),0);assert.equal(await page.locator('.settings').isVisible(),false);
      const viewport=page.locator('.xterm-screen'),box=await cellBox(viewport);assert.ok(box.width>=44&&box.height>=44);
      await viewport.tap({position:{x:box.width-10,y:box.height-10}});
      assert.equal(await page.locator('#command-input').evaluate(n=>document.activeElement===n),true);
      await page.keyboard.insertText('pwd');await expectDraft(page,'pwd');
      const caret=await cellBox(page.locator('.xterm-cursor'));assert.ok(caret.width>0&&caret.height>0,'The touched terminal displays a real insertion cell');
      await page.keyboard.press('Enter');await ready(page);await expectDraft(page,'');assert.match(await terminalText(page),/\/home\/op/);
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
});
test('R3-UI06: changing reduced-motion while text is animating completes it without another key',{skip,timeout:30000},async t=>{
  const page=await open(t,{motion:'no-preference'});await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();
  await advanceGameTime(page,24);assert.equal(await page.locator('#terminal').getAttribute('aria-busy'),'true');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#terminal').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('#terminal').textContent(),/請輸入你的暱稱/);
});
test('R3-UI07: input accessible name follows nickname, shell, password and vote modes',{skip,timeout:30000},async t=>{
  const page=await open(t);await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();
  assert.match(await page.locator('#command-input').getAttribute('aria-label'),/暱稱/);await send(page,'uicheck');
  assert.match(await page.locator('#command-input').getAttribute('aria-label'),/指令/);
  assert.match(await page.locator('#command-input').getAttribute('aria-describedby'),/keyboard-help/);
  await send(page,'systemctl start lamp');assert.match(await page.locator('#command-input').getAttribute('aria-label'),/口令/);
  await send(page,'lamp-before-sudo');await advanceGameTime(page,901000);await expectPrompt(page,/block \/ pass/);
  assert.match(await page.locator('#command-input').getAttribute('aria-label'),/block.*pass/);
});
test('R3-UI08: rejected code is identified, described and focused without hiding the prior save',{skip,timeout:30000},async t=>{
  const page=await open(t);await page.locator('#import-code').fill('RA1-bad-00000000');await page.locator('#import-submit').click();
  await page.locator('#welcome-error').filter({hasText:/CRC/}).waitFor();
  assert.equal(await page.locator('#import-code').getAttribute('aria-invalid'),'true');
  assert.match(await page.locator('#import-code').getAttribute('aria-describedby'),/welcome-error/);
  assert.equal(await page.locator('#import-code').evaluate(n=>document.activeElement===n),true);
  assert.equal(await page.locator('#welcome').isVisible(),true);
});
test('R3-UI control: editing a rejected code clears the stale error and Shift+Tab leaves command input',{skip,timeout:30000},async t=>{
  const page=await open(t);await page.locator('#import-code').fill('RA1-bad-00000000');await page.locator('#import-submit').click();
  await page.locator('#welcome-error').filter({hasText:/CRC/}).waitFor();await page.locator('#import-code').fill('RA1-');
  assert.equal(await page.locator('#import-code').getAttribute('aria-invalid'),null);assert.equal(await page.locator('#welcome-error').textContent(),'');
  await start(page);await page.locator('#command-input').focus();await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('#terminal').evaluate(n=>document.activeElement===n),true);
  assert.match(await page.locator('#keyboard-help').textContent(),/Shift\+Tab/);
  assert.equal(await page.locator('#terminal').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
});
test('R3-UI control: a rejected file points to the file field rather than an unrelated code field',{skip,timeout:30000},async t=>{
  const page=await open(t);await page.locator('.welcome-import details summary').click();
  await page.locator('#import-file').setInputFiles({name:'bad.rasave.json',mimeType:'application/json',buffer:Buffer.from('{bad')});
  await page.locator('#welcome-error').filter({hasText:/./}).waitFor();
  assert.equal(await page.locator('#import-file').getAttribute('aria-invalid'),'true');
  assert.equal(await page.locator('#import-file').evaluate(n=>document.activeElement===n),true);
  assert.match(await page.locator('#import-file').getAttribute('aria-describedby'),/welcome-error/);
  assert.equal(await page.locator('#import-code').getAttribute('aria-invalid'),null);
});
test('R3-UI09: the command input stays inside its workspace and hit-testable with a low mobile visual viewport',{skip,timeout:30000},async t=>{
  const page=await open(t,{width:360,height:280});await start(page);
  for(const style of ['islands','server']){
    await page.locator('#visual-style').selectOption(style);
    // Do not focus/scroll the input here: that would programmatically scroll
    // overflow:hidden and mask the clipping caused by changing the style.
    if(style==='server'){
      await expectDraft(page,'');
      const hit=await eventually(()=>page.locator('.xterm-cursor').evaluateAll(nodes=>{
        const n=nodes.find(n=>n.isConnected&&n.closest('.xterm-screen'));if(!n)return null;
        const input=n.getBoundingClientRect(),workspace=n.closest('.xterm-screen').getBoundingClientRect();
        const target=document.elementFromPoint(input.x+input.width/2,input.y+input.height/2);
        return{top:input.top,bottom:input.bottom,workspaceTop:workspace.top,workspaceBottom:workspace.bottom,x:input.x+input.width/2,y:input.y+input.height/2,visible:!!target?.closest('.xterm'),viewport:innerHeight};
      }),value=>!!value,'Read the live cursor and its hit target without moving focus');
      assert.ok(hit.top>=hit.workspaceTop&&hit.bottom<=hit.workspaceBottom&&hit.bottom<=hit.viewport,`${style}: ${JSON.stringify(hit)}`);
      assert.equal(hit.visible,true,`${style}: ${JSON.stringify(hit)}`);
      await page.mouse.click(hit.x,hit.y);await page.keyboard.insertText('pwd');await expectDraft(page,'pwd');
      await page.keyboard.press('Enter');await ready(page);await expectDraft(page,'');assert.match(await terminalText(page),/\/home\/op/);continue;
    }
    const hit=await page.locator('#command-input').evaluate(n=>{
      const input=n.getBoundingClientRect(),workspace=n.closest('.workspace,.console-viewport').getBoundingClientRect();
      const target=document.elementFromPoint(input.x+input.width/2,input.y+input.height/2);
      return{top:input.top,bottom:input.bottom,workspaceTop:workspace.top,workspaceBottom:workspace.bottom,target:target?.id||target?.textContent,visible:target===n};
    });
    assert.ok(hit.top>=hit.workspaceTop&&hit.bottom<=hit.workspaceBottom,`${style}: ${JSON.stringify(hit)}`);
    assert.equal(hit.visible,true,`${style}: ${JSON.stringify(hit)}`);
    await send(page,'pwd');assert.match(await page.locator('#terminal .stdout').last().textContent(),/\/home\/op/);
  }
});
test('R3-UI control: each native resize updates the task panel before its event microtask with a paused UI clock',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  /** 本案呼叫；寬/高 → Promise<void>，訂一次 resize 並於符合尺寸時解除 listener，以事件微任務驗面板同步。 */
  async function resize(width,height){
    // CDP setViewportSize can return before the browser dispatches resize.
    // Observe that event, not a DOM polling condition or an arbitrary delay.
    await page.evaluate(width=>{window.nextResize=new Promise(resolve=>{
      const changed=()=>{if(innerWidth===width){window.removeEventListener('resize',changed);queueMicrotask(resolve);}};
      window.addEventListener('resize',changed);
    });},width);
    await page.setViewportSize({width,height});await page.evaluate(()=>window.nextResize);
  }
  for(let i=0;i<5;i++){
    await resize(360,740);assert.equal(await page.locator('.task-panel').getAttribute('open'),null);
    await resize(1280,800);assert.notEqual(await page.locator('.task-panel').getAttribute('open'),null);
  }
});
