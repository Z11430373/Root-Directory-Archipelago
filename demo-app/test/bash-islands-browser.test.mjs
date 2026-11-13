/** Normal/islands keeps its existing UI but uses the same Bash runtime as terminal mode. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY} from '../src/storage.js';
import {send,typeDraft,ready,expectDraft,expectPrompt,screenText,screenRows,freezeGameTime} from './helpers/xterm.mjs';

let chromium,browser;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional external tools. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
const html=new URL('../dist/index.html',import.meta.url).href;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});

async function open(t,width=1280) {
  const context=await browser.newContext({viewport:{width,height:800},reducedMotion:'reduce'}),errors=[],external=[];
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.resourceType()!=='document'&&!request.url().startsWith('blob:'))external.push(request.url());});
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(external,[]);});
  await freezeGameTime(page,new Date('2026-11-03T12:00:00Z'));
  await page.goto(html);
  return page;
}
async function start(page) {
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  await page.locator('#new-game').click();await ready(page);
  await expectPrompt(page,'暱稱: ');
  await send(page,'normalqa');
  await expectPrompt(page,'op-normalqa@lighthouse:~$ ');
  assert.equal(await page.locator('.workspace,.task-panel,.chips').count(),3,'Keep the original normal UI');
  assert.equal(await page.locator('.xterm-screen').count(),0,'No forced terminal-mode switch');
}
const saved=page=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),SAVE_KEY);
const lastOutput=page=>page.locator('#terminal .stdout').last().textContent();

test('Bash islands: a fresh normal game retains variables, functions, aliases and redirects through reload',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  await send(page,`shopt -s expand_aliases; answer=41; report() { printf 'normal:%s\n' "$((answer + 1))"; }; alias show=report`);
  await send(page,'show > normal.txt; cat < normal.txt');
  assert.equal(await lastOutput(page),'normal:42\n');
  const before=await saved(page);
  assert.equal(before.shell,'bash');
  assert.ok(before.journal.filter(step=>step.type==='input').every(step=>step.shell==='bash'));
  await page.reload();await page.locator('#continue-game').click();await ready(page);
  await send(page,'report; printf "%s\n" "$answer"; cat normal.txt');
  assert.equal(await lastOutput(page),'normal:42\n41\nnormal:42\n');
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  assert.equal(await page.locator('#local-recovery').count(),0);
});

for(const width of [320,768,1280])test(`Bash islands: keyboard continuation, heredoc, completion and Ctrl+C at ${width}px`,{skip,timeout:30000},async t=>{
  const page=await open(t,width);await start(page);
  const baseline=(await saved(page)).journal.filter(step=>step.type==='input');
  await typeDraft(page,'for word in one two; do');await page.keyboard.press('Enter');
  await expectDraft(page,'for word in one two; do\n');
  assert.deepEqual((await saved(page)).journal.filter(step=>step.type==='input'),baseline,'An unfinished loop is not submitted');
  await page.keyboard.insertText('printf "loop:%s\\n" "$word"');await page.keyboard.press('Enter');
  await expectDraft(page,'for word in one two; do\nprintf "loop:%s\\n" "$word"\n');
  await page.keyboard.insertText('done');await page.keyboard.press('Enter');await ready(page);await expectDraft(page,'');
  assert.equal(await lastOutput(page),'loop:one\nloop:two\n');
  await send(page,"cat <<'END_NORMAL'\n$literal\nEND_NORMAL");
  assert.equal(await lastOutput(page),'$literal\n');
  await typeDraft(page,'pri');await page.keyboard.press('Tab');await expectDraft(page,'printf ');
  await page.keyboard.press('Control+C');await expectDraft(page,'');
  const completed=(await saved(page)).journal.filter(step=>step.type==='input');
  await typeDraft(page,"printf 'unfinished");await page.keyboard.press('Enter');
  await expectDraft(page,"printf 'unfinished\n");
  await page.keyboard.press('Control+C');await expectDraft(page,'');
  assert.deepEqual((await saved(page)).journal.filter(step=>step.type==='input'),completed,'Cancelling a draft must not journal or execute it');
  await expectPrompt(page,'op-normalqa@lighthouse:~$ ');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

test('Bash islands: surface changes preserve the same session; greater-than is only PS2',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  await send(page,'shared=kept; report() { printf "shared:%s\\n" "$shared"; }');
  await page.keyboard.press('F2');await ready(page);await expectPrompt(page,'op-normalqa@lighthouse:~$ ');
  await send(page,'report');assert.match(await screenText(page),/^shared:kept$/m);
  await typeDraft(page,'if true; then');await page.keyboard.press('Enter');await expectDraft(page,'if true; then\n');
  assert.ok((await screenRows(page)).some(row=>row.startsWith('> ')),'A genuine Bash continuation still uses the conventional PS2');
  await page.keyboard.press('Control+C');await expectDraft(page,'');
  await page.keyboard.press('F2');await ready(page);
  await send(page,'report');assert.equal(await lastOutput(page),'shared:kept\n');
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
});

test('Bash islands: imported event saves also accept Bash without visiting terminal mode',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'save');
  const code=await page.locator('#save-code').inputValue();await page.reload();
  await page.locator('#import-code').fill(code);await page.locator('#import-submit').click();await ready(page);
  await send(page,'imported=yes; printf "import:%s\\n" "$imported"');
  assert.equal(await lastOutput(page),'import:yes\n');
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  const envelope=await saved(page);assert.equal(envelope.shell,'bash');
  assert.equal(envelope.journal.filter(step=>step.type==='input').at(-1).shell,'bash');
});
