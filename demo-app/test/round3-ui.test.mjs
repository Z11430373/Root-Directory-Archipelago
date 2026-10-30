import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
let chromium;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional tool, never bundled. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
let browser;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});
async function open(t,{width=1280,height=800,motion='reduce'}={}){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:motion});
  const page=await context.newPage(),errors=[],requests=[];
  page.setDefaultTimeout(8000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(r.resourceType()!=='document')requests.push(r.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
  const epoch=new Date('2026-10-30T15:00:00Z');await page.clock.install({time:epoch});await page.clock.pauseAt(new Date(+epoch+1000));
  await page.goto(new URL('../dist/index.html',import.meta.url).href);await page.locator('#new-game').waitFor();return page;
}
async function send(page,raw){await page.locator('#command-input').fill(raw);await page.locator('#command-input').press('Enter');await page.locator('#command-input:enabled').waitFor();}
async function start(page){await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();await send(page,'uicheck');}
async function longLog(page){await send(page,'cat handbook.md handbook.md handbook.md handbook.md');return page.locator('#terminal');}
function ratio(a,b){const luminance=text=>{const c=text.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}

test('R3-UI01: repeated PageUp can read past more than one page of terminal history',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const log=await longLog(page);await log.focus();
  const bottom=await log.evaluate(n=>n.scrollTop);await page.keyboard.press('PageUp');await page.waitForTimeout(250);const first=await log.evaluate(n=>n.scrollTop);
  await page.keyboard.press('PageUp');await page.waitForTimeout(250);const second=await log.evaluate(n=>n.scrollTop);
  assert.ok(first<bottom-100);assert.ok(second<first-100,`bottom=${bottom}, first=${first}, second=${second}`);
});
test('R3-UI02: idle hint does not pull a player away from earlier terminal output',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const log=await longLog(page);
  await log.evaluate(n=>{n.scrollTop=0;});await page.waitForTimeout(100);
  await page.clock.runFor(30100);await page.waitForFunction(()=>document.querySelector('#hint-state').textContent.includes('●'));
  assert.equal(await log.evaluate(n=>n.scrollTop),0,'New output must respect a reader who scrolled back');
  await send(page,'pwd');assert.ok(await log.evaluate(n=>n.scrollTop>100),'Submitting a new command explicitly follows its output');
});
test('R3-UI03: desktop task summary works with both pointer and keyboard',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);const summary=page.locator('#panel-summary'),panel=page.locator('.task-panel');
  const box=await summary.boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  assert.equal(await panel.getAttribute('open'),null);assert.equal(await page.locator('#task-title').isVisible(),false);
  await summary.focus();await page.keyboard.press('Space');assert.notEqual(await panel.getAttribute('open'),null);assert.equal(await page.locator('#task-title').isVisible(),true);
});
test('R3-UI04: required form boundaries have at least 3:1 non-text contrast in both styles/themes',{skip,timeout:30000},async t=>{
  const page=await open(t);
  for(const style of ['islands','server'])for(const theme of ['dark','contrast']){
    await page.locator('#visual-style').selectOption(style);await page.locator('#theme').selectOption(theme);
    const colors=await page.locator('#import-code').evaluate(n=>{const s=getComputedStyle(n);return[s.borderTopColor,s.backgroundColor];});
    assert.ok(ratio(...colors)>=3,`${style}/${theme}: ${colors.join(' / ')} is ${ratio(...colors)}`);
  }
});
test('R3-UI05: mobile settings and shortcuts meet the recommended 44px hit area',{skip,timeout:30000},async t=>{
  const page=await open(t,{width:360,height:740});await start(page);
  for(const style of ['islands','server']){
    await page.locator('#visual-style').selectOption(style);
    const sizes=await page.locator('#visual-style,#theme,#font-size,.chips button').evaluateAll(nodes=>nodes.map(n=>({name:n.getAttribute('aria-label'),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));
    for(const size of sizes){assert.ok(size.w>=44&&size.h>=44,`${style}: ${JSON.stringify(size)}`);}
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
});
test('R3-UI06: changing reduced-motion while text is animating completes it without another key',{skip,timeout:30000},async t=>{
  const page=await open(t,{motion:'no-preference'});await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();
  await page.clock.runFor(24);assert.equal(await page.locator('#terminal').getAttribute('aria-busy'),'true');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('#terminal').getAttribute('aria-busy')==='false');
  assert.match(await page.locator('#terminal').textContent(),/請輸入你的暱稱/);
});
test('R3-UI07: input accessible name follows nickname, shell, password and vote modes',{skip,timeout:30000},async t=>{
  const page=await open(t);await page.locator('#new-game').click();await page.locator('#command-input:enabled').waitFor();
  assert.match(await page.locator('#command-input').getAttribute('aria-label'),/暱稱/);await send(page,'uicheck');
  assert.match(await page.locator('#command-input').getAttribute('aria-label'),/指令/);
  assert.match(await page.locator('#command-input').getAttribute('aria-describedby'),/keyboard-help/);
  await send(page,'systemctl start lamp');assert.match(await page.locator('#command-input').getAttribute('aria-label'),/口令/);
  await send(page,'lamp-before-sudo');await page.clock.fastForward(901000);await page.waitForFunction(()=>document.querySelector('#prompt').textContent.includes('block / pass'));
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
    const hit=await page.locator('#command-input').evaluate(n=>{
      const input=n.getBoundingClientRect(),workspace=n.closest('.workspace').getBoundingClientRect();
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
