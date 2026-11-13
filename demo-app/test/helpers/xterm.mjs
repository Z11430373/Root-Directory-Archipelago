/** Browser-only observations/actions: no app instances, terminal buffers or synthetic input values. */
import assert from 'node:assert/strict';

export const commandInput=page=>page.locator('#command-input');
export const isXterm=async page=>await page.locator('.xterm-helper-textarea').count()>0;
const promptPattern=/(?:archipelago(?::finished)?\$ |暱稱: |口令: |block \/ pass: |op-[^@\s]+@[^\s$]+\$ )/g;

/** Keep exact fixture time while native timeouts/animation frames render xterm normally. */
export async function freezeGameTime(page,time) {
  await page.clock.setFixedTime(time);
  await page.addInitScript(()=>{
    const epoch=Date.now();
    Object.defineProperty(performance,'now',{configurable:true,value:()=>Date.now()-epoch});
  });
}
export async function advanceGameTime(page,ms) {
  await page.clock.setFixedTime(new Date(await page.evaluate(()=>Date.now())+ms));
  // The production 250ms game timer observes the new time; no command is injected.
  await page.waitForTimeout(280);
}
export async function eventually(read,check,message='Expected terminal state',timeout=8000) {
  const until=Date.now()+timeout;let value;
  do {
    value=await read();
    if(check(value))return value;
    await new Promise(resolve=>setTimeout(resolve,20));
  }while(Date.now()<until);
  assert.fail(`${message}\nObserved: ${JSON.stringify(value)}`);
}
export async function screenRows(page) {
  return page.locator('.xterm-rows > div').evaluateAll(rows=>rows.map(row=>row.textContent.replace(/\u00a0/g,' ')));
}
export async function screenText(page) {return (await screenRows(page)).map(row=>row.trimEnd()).join('\n');}
export async function cellBox(locator) {
  return eventually(()=>locator.evaluateAll(nodes=>{
    const node=nodes.find(node=>node.isConnected&&node.getBoundingClientRect().width>0);
    if(!node)return null;
    const {x,y,width,height}=node.getBoundingClientRect();return{x,y,width,height};
  }),box=>!!box,'Expected a visible terminal cell/viewport');
}

/** Read glyphs, including the insertion cell, so completion's trailing space is tested. */
export async function renderedEditor(page) {
  if(!await isXterm(page))return {prompt:await page.locator('#prompt').textContent(),draft:await commandInput(page).inputValue()};
  const rows=await page.locator('.xterm-rows > div').evaluateAll(nodes=>nodes.map(node=>{
    let text=node.textContent.replace(/\u00a0/g,' ');
    const cursor=node.querySelector('.xterm-cursor');
    if(cursor&&cursor===node.lastElementChild&&cursor.textContent===' ')text=text.slice(0,-1);
    return text;
  }));
  while(rows.length&&!rows.at(-1))rows.pop();
  // Hard draft newlines have visible continuation prompts; physical cell wraps do not.
  const joined=rows.map(row=>row.startsWith('> ')?'\n'+row.slice(2):row).join('');
  const prompt=[...joined.matchAll(promptPattern)].at(-1);
  return {prompt:prompt?.[0]??'',draft:prompt?joined.slice(prompt.index+prompt[0].length):null};
}
export async function expectDraft(page,expected) {
  if(!await isXterm(page))return eventually(()=>renderedEditor(page),value=>value.draft===expected,`Expected GUI draft ${JSON.stringify(expected)}`);
  let previous=null,since=0;
  await eventually(async()=>({editor:await renderedEditor(page),screen:await screenText(page),label:await commandInput(page).getAttribute('aria-label')}),value=>{
    const {prompt,draft}=value.editor,label=value.label||'';
    const current=label.includes('輸入暱稱')?prompt==='暱稱: ':label.includes('輸入口令')?prompt==='口令: ':label.includes('選擇 block')?prompt==='block / pass: ':label.includes('Bash')?/^(?:op-|archipelago:finished\$)/.test(prompt):prompt==='archipelago$ ';
    if(!current||draft!==expected){previous=null;return false;}
    if(value.screen!==previous){previous=value.screen;since=Date.now();return false;}
    return Date.now()-since>=80;
  },`Expected settled visible draft ${JSON.stringify(expected)}`);
}
export async function expectPrompt(page,expected) {
  await eventually(()=>renderedEditor(page),value=>expected instanceof RegExp?expected.test(value.prompt):value.prompt===expected,`Expected visible prompt ${expected}`);
}
export async function ready(page) {
  if(await isXterm(page))await page.locator('.console-session[data-state=ready]').waitFor();
  else await page.locator('#command-input:enabled').waitFor();
}
export async function clearDraft(page) {
  await commandInput(page).focus();
  if((await renderedEditor(page)).draft==='')return;
  if(await isXterm(page)){
    // Readline line kills and native Delete/Backspace also clear multiline drafts.
    for(let i=0;i<128;i++){
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Control+K');
      await page.keyboard.press('Delete');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(20);
      if((await renderedEditor(page)).draft==='')break;
    }
  }else await commandInput(page).fill('');
  await expectDraft(page,'');
}
export async function typeDraft(page,text) {
  await clearDraft(page);
  if(!await isXterm(page))await commandInput(page).fill(text);
  else if(text.includes('\n'))await paste(page,text);
  else await page.keyboard.insertText(text);
  if(await isXterm(page)&&(await commandInput(page).getAttribute('aria-label'))?.includes('輸入口令'))await expectDraft(page,'');
  else if(text.length<128)await expectDraft(page,text);
  else await eventually(()=>screenText(page),screen=>screen.replace(/\n> /g,'').replace(/\n/g,'').includes(text.slice(-32).replace(/\n/g,'')),'Long draft tail is rendered in terminal cells');
}
/** A native ClipboardEvent takes xterm's normal paste/bracketed-paste/onData path. */
export async function paste(page,text) {
  await commandInput(page).focus();
  await commandInput(page).evaluate((node,text)=>{
    const data=new DataTransfer();data.setData('text/plain',text);
    node.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
  },text);
}
export async function send(page,text) {
  await typeDraft(page,text);
  await page.keyboard.press('Enter');
  await ready(page);
  await expectDraft(page,'');
  if(await isXterm(page))await cellBox(page.locator('.xterm-cursor'));
}

export async function visibleHistory(page) {
  // xterm intentionally debounces its public accessibility tree by one second.
  // Wait for it to describe the actual rendered cells, not empty/stale listitems.
  await page.waitForFunction(()=>{
    const visual=[...document.querySelectorAll('.xterm-rows > div')];
    const accessible=[...document.querySelectorAll('.xterm-accessibility-tree > [aria-posinset]')];
    const normalize=text=>text.replace(/\u00a0/g,' ').trimEnd();
    return visual.length>0&&visual.length===accessible.length&&visual.every((node,i)=>normalize(node.textContent)===normalize(accessible[i].textContent));
  });
  return page.locator('.xterm-accessibility-tree > [aria-posinset]').evaluateAll(nodes=>nodes.map(node=>({
    row:Number(node.getAttribute('aria-posinset')),total:Number(node.getAttribute('aria-setsize')),
    text:node.textContent.replace(/\u00a0/g,' ').trimEnd()
  })));
}
export async function scrollPosition(page) {
  return (await visibleHistory(page))[0]?.row;
}
export async function scrollTerminal(page,direction) {
  await commandInput(page).focus();
  const before=await scrollPosition(page);
  await page.keyboard.press(direction<0?'Shift+PageUp':'Shift+PageDown');
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return {before,after:await scrollPosition(page)};
}
export async function scrollToEdge(page,direction) {
  for(let i=0;i<1300;i++){
    const moved=await scrollTerminal(page,direction);
    if(moved.before===moved.after)return moved.after;
  }
  assert.fail('Terminal scrollback did not reach its edge');
}
/** Navigate through the real history keyboard handler, never an app/buffer API. */
async function historyKey(page,key) {
  await page.locator('#terminal').press(key);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
}
async function restoreHistory(page,initial) {
  const first=initial[0],last=initial.at(-1);
  if(first.row===1)await historyKey(page,'Home');
  else if(last.row===last.total)await historyKey(page,'End');
  else {
    let current=await scrollPosition(page);
    while(current<first.row){
      const moved=await scrollTerminal(page,1);
      if(moved.after===moved.before)break;
      current=moved.after;
    }
    // PageDown can cross the original position by less than one screenful.
    // Use actual history keys to restore that last partial page exactly.
    for(let n=current-first.row;n>0;n--)await page.locator('#terminal').press('ArrowUp');
  }
  await commandInput(page).focus();
  assert.equal(await scrollPosition(page),first.row,'Reading scrollback must restore the reader\'s exact position');
}
/** Visit actual scrollback pages and restore the reader's original position. */
export async function terminalText(page) {
  if(!await isXterm(page))return page.locator('#terminal').textContent();
  const initial=await visibleHistory(page),lines=new Map();
  for(let i=0;i<1300;i++){
    for(const row of await visibleHistory(page))lines.set(row.row,row.text);
    const {before,after}=await scrollTerminal(page,-1);
    if(before===after)break;
  }
  await restoreHistory(page,initial);
  return [...lines].sort(([a],[b])=>a-b).map(([,text])=>text).join('\n');
}
export async function saveCode(page) {
  const initial=await visibleHistory(page),lines=new Map();
  try {
    // Only the most recent printed code is needed. Walking all prior story
    // output costs one accessibility debounce per page without adding evidence.
    if(initial.at(-1).row!==initial.at(-1).total)await historyKey(page,'End');
    for(let n=0;n<1300;n++) {
      const rows=await visibleHistory(page);
      for(const row of rows)lines.set(row.row,row.text);
      const ordered=[...lines].sort(([a],[b])=>a-b).map(([,text])=>text);
      const start=ordered.findLastIndex(line=>line.startsWith('RA1-'));
      if(start>=0) {
        let code='';
        for(const line of ordered.slice(start)) {
          if(!/^[A-Za-z0-9_-]+$/.test(line))break;
          code+=line;
        }
        assert.match(code,/^RA1-[A-Za-z0-9_-]+-[a-fA-F0-9]{8}$/);
        return code;
      }
      const {before,after}=await scrollTerminal(page,-1);
      if(before===after)break;
    }
    assert.fail('The save code must be printed in real terminal scrollback');
  } finally {
    await restoreHistory(page,initial);
  }
}
export async function transcriptOutput(page) {
  const text=await terminalText(page);
  if(!await isXterm(page))return text;
  const {prompt}=await renderedEditor(page),index=text.lastIndexOf(prompt.trimEnd());
  assert.ok(prompt&&index>=0,'The current prompt must be rendered independently of output');
  return text.slice(0,index).trimEnd();
}
