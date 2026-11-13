/** Terminal-mode interaction contracts, worker cancellation, and full golden gameplay through the UI. */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {commandLines,completionWord,completedWord} from '../src/ui/console-view.js';
import {importCode} from '../src/save/index.js';
import {send,commandInput,typeDraft,clearDraft,paste,expectDraft,expectPrompt,renderedEditor,screenText,screenRows,terminalText,transcriptOutput,saveCode,scrollPosition,scrollTerminal,scrollToEdge,freezeGameTime,advanceGameTime,eventually,ready,cellBox} from './helpers/xterm.mjs';

// Finish top-level async loading before registering tests, so root teardown cannot
// run while the browser's async before hook is still launching Chrome.
let chromium,browser;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
const html=new URL('../dist/index.html',import.meta.url).href;
const walks=JSON.parse(await readFile(new URL('../../demo/testvectors/walkthrough.json',import.meta.url),'utf8')).walkthroughs;
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});
async function open(t,{width=1280,height=800,mode='self',init}={}) {
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'no-preference'});
  await context.addInitScript(()=>localStorage.setItem('ra.demo.preferences.v1',JSON.stringify({style:'server'})));
  if(init)await context.addInitScript(init);
  const page=await context.newPage(),errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  page.on('request',request=>{if(request.resourceType()!=='document'&&!request.url().startsWith('blob:'))requests.push(request.url());});
  const time=new Date('2026-11-02T12:00:00Z');
  await freezeGameTime(page,time);
  await page.goto(html+`?mode=${mode}`);await page.locator('.console-session[data-state=ready]').waitFor();
  t.after(async()=>{await context.close();assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
  return page;
}
async function start(page) {await send(page,'game start');await send(page,'consoleqa');}
const text=terminalText;
const head=page=>page.locator('#save-status').getAttribute('data-head');

test('Console: pasted newlines separate commands only outside quotes and continuations',()=>{
  assert.deepEqual(commandLines('pwd\ncat "a\nb"\necho one\\\ntwo\n'),['pwd','cat "a\nb"','echo one\\\ntwo']);
  assert.deepEqual(commandLines("echo 'a\\'\npwd"),["echo 'a\\'",'pwd']);
  assert.deepEqual(commandLines('\n \n'),[]);
});
test('Bash completion: quoted filenames, escapes, directory continuations and pipeline positions',()=>{
  assert.deepEqual(completionWord('cat "two w'),{start:4,token:'two w',command:false,quote:'"'});
  assert.deepEqual(completionWord('cat two\\ w'),{start:4,token:'two w',command:false,quote:null});
  assert.equal(completionWord('cat handbook.md | gr').command,true);
  assert.equal(completedWord('two words.txt','"',true),'"two words.txt" ');
  assert.equal(completedWord('two words.txt',null,true),'two\\ words.txt ');
  assert.equal(completedWord('a dir/','"',true),'"a dir/');
});

test('Console browser: keyboard-only start, task, status, save, download, exit, resume and import',{skip,timeout:45000},async t=>{
  const page=await open(t);
  assert.equal(await page.locator('.task-panel,.chips,.execute').count(),0);
  assert.equal(await page.locator('.masthead').isVisible(),false);
  await start(page);assert.match(await text(page),/archipelago\$ game start/);
  await send(page,'ls');await send(page,'cd notes');
  await send(page,'echo preserved > journal.txt');
  await send(page,'game task');assert.match(await text(page),/Q0-2/);
  await send(page,'game status');assert.match(await text(page),/\/home\/op\/notes/);
  await send(page,'game save');assert.equal(await page.locator('dialog').count(),0);
  const code=await saveCode(page);
  const saved=await importCode(code);assert.equal(saved.head,await head(page));
  const download=page.waitForEvent('download');await send(page,'game download');
  const file=await download;assert.equal(file.suggestedFilename(),'consoleqa.rasave.json');
  assert.equal(JSON.parse(await readFile(await file.path(),'utf8')).head,saved.head);
  await send(page,'game exit');await expectPrompt(page,'archipelago$ ');
  await send(page,'game resume');await expectPrompt(page,/~\/notes/);
  await send(page,'cat journal.txt');assert.match(await text(page),/preserved/);
  await send(page,'game exit');await send(page,`game import ${code}`);
  assert.equal(await head(page),saved.head);assert.match(await text(page),/不包含任意 Shell 檔案修改/);
});

test('Console browser: line editing, completion, reverse search, draft history, IME guard and multiline paste',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'pwd');await send(page,'ls');
  const input=commandInput(page);
  await typeDraft(page,'echo draft');await input.press('ArrowUp');await expectDraft(page,'ls');
  await input.press('ArrowDown');await expectDraft(page,'echo draft');
  await input.press('Control+A');await input.press('Control+K');await expectDraft(page,'');
  await typeDraft(page,'echo one two');await input.press('Control+E');await input.press('Control+W');await expectDraft(page,'echo one ');
  await input.press('Control+U');await expectDraft(page,'');
  await typeDraft(page,'cat han');await input.press('Tab');await expectDraft(page,'cat handbook.md ');
  await typeDraft(page,'cat handbook.md | gr');await input.press('Tab');await expectDraft(page,'cat handbook.md | grep ');
  await send(page,'echo quoted > "two words.txt"');
  await typeDraft(page,'cat "two w');await input.press('Tab');await expectDraft(page,'cat "two words.txt" ');
  await typeDraft(page,'draft');await input.press('Control+R');await page.keyboard.insertText('pw');
  await eventually(()=>screenText(page),value=>/reverse-i-search.*pw.*pwd/.test(value),'Reverse search is visible');
  await input.press('Enter');await expectDraft(page,'pwd');
  await input.press('Enter');await ready(page);await expectDraft(page,'');
  const before=await transcriptOutput(page),stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal);
  await typeDraft(page,'echo 中文');
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
  await expectDraft(page,'echo 中文');assert.equal(await transcriptOutput(page),before);
  await clearDraft(page);await paste(page,'echo 第一行\necho 第二行');await expectDraft(page,'echo 第一行\necho 第二行');
  assert.equal(await transcriptOutput(page),before);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal),stored,'Pasting must not submit');
  await input.press('Enter');await ready(page);await expectDraft(page,'');
  const pastedOutput=await text(page);
  assert.match(pastedOutput,/第一行\n/);assert.match(pastedOutput,/第二行\n/);
  await typeDraft(page,'never executed');await input.press('Control+C');await expectDraft(page,'');
  assert.match(await text(page),/never executed\^C/);
  const savedHead=await head(page);await input.press('Control+L');
  // Ctrl+L queues xterm writes. Observe the actual clear before starting a
  // multi-page history read; the previous buffer cannot be restored after clear.
  await eventually(async()=>({screen:await screenText(page),editor:await renderedEditor(page)}),value=>value.editor.draft===''&&value.screen.trim()===value.editor.prompt.trim(),'Ctrl+L leaves only the real current prompt');
  assert.equal(await transcriptOutput(page),'','Ctrl+L clears scrollback but retains the prompt');
  assert.equal(await head(page),savedHead);
  await input.press('ArrowUp');await expectDraft(page,'echo 第二行');
  await input.press('Shift+Tab');assert.notEqual(await page.evaluate(()=>document.activeElement.id),'command-input');
});

test('Console browser: F2 and switching back preserve multiline drafts exactly without execution',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  const input=commandInput(page),draft='echo 第一行\n\necho "two words"\necho 尾行\n';
  const before={head:await head(page),output:(await transcriptOutput(page)).trim()};
  await paste(page,draft);await expectDraft(page,draft);await input.press('F2');await page.locator('.workspace').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  assert.equal(await input.inputValue(),draft);
  assert.equal(await head(page),before.head);assert.equal((await transcriptOutput(page)).trim(),before.output);
  // A real GUI selection must transfer to the cell editor, not its helper textarea.
  await input.press('ArrowUp');await input.press('Home');await input.press('Shift+End');
  assert.equal(await input.evaluate(node=>node.value.slice(node.selectionStart,node.selectionEnd)),'echo 尾行');
  await page.locator('#visual-style').selectOption('server');
  await page.locator('.console-session[data-state=ready]').waitFor();
  await expectDraft(page,draft);
  assert.equal(await head(page),before.head);assert.equal((await transcriptOutput(page)).trim(),before.output);
  await page.keyboard.insertText('echo 選取已保留');await expectDraft(page,draft.replace('echo 尾行','echo 選取已保留'));
  await input.press('F2');assert.equal(await input.inputValue(),draft.replace('echo 尾行','echo 選取已保留'));
  assert.equal(await head(page),before.head);assert.equal((await transcriptOutput(page)).trim(),before.output);
});

test('Console browser: a pasted mode change retains later commands as an unexecuted draft',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  const input=commandInput(page);
  await paste(page,'game mode islands\necho queued');await expectDraft(page,'game mode islands\necho queued');await input.press('Enter');
  await page.locator('.workspace').waitFor();
  assert.equal(await page.locator('html').getAttribute('data-style'),'islands');
  await expectDraft(page,'echo queued');
  assert.doesNotMatch(await transcriptOutput(page),/echo queued|\nqueued\n/);
  await page.locator('#visual-style').selectOption('server');
  await page.locator('.console-session[data-state=ready]').waitFor();
  await expectDraft(page,'echo queued');
  assert.doesNotMatch(await transcriptOutput(page),/echo queued|\nqueued\n/);
  await input.press('Enter');await ready(page);await expectDraft(page,'');
  assert.match(await text(page),/\$ echo queued\nqueued\n/);
});

test('Console browser: Ctrl+C resets recalled history to the latest command and an empty draft',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'pwd');await send(page,'ls');
  const input=commandInput(page);
  await input.press('ArrowUp');await expectDraft(page,'ls');
  await input.press('Control+C');await expectDraft(page,'');
  assert.match(await text(page),/\$ ls\^C\n/);
  await input.press('ArrowUp');await expectDraft(page,'ls');
  await input.press('ArrowDown');await expectDraft(page,'');
});

test('Console browser: completion before a closing quote keeps one quoted filename with spaces',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'echo quoted > "two words.txt"');
  const input=commandInput(page);
  await typeDraft(page,'cat "two w"');await input.press('ArrowLeft');await input.press('Tab');
  await expectDraft(page,'cat "two words.txt" ');
  await input.press('Enter');await ready(page);await expectDraft(page,'');
  assert.match(await text(page),/\nquoted\n/);
});

test('Console browser: real worker cancellation rolls back writes, keeps journal replayable and accepts the next command',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);
  await send(page,`echo ${'a'.repeat(1500)} > source.txt`);
  const previous=await head(page);
  await typeDraft(page,"echo should-not-commit > aborted.txt; grep 'a*a*a*a*a*a*a*a*a*a*b' source.txt");
  const worker=page.waitForEvent('worker');
  await page.locator('#command-input').press('Enter');await worker;
  await page.locator('.console-session[data-state=running]').waitFor();
  assert.match(await page.locator('.xterm-console-status').textContent(),/執行中.*Ctrl\+C/);
  await page.keyboard.press('Control+C');await ready(page);await expectDraft(page,'');
  assert.equal(await head(page),previous);assert.match(await text(page),/\^C/);
  await send(page,'cat aborted.txt');assert.match(await text(page),/No such file/);
  const journal=await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal);
  assert.ok(!journal.some(step=>step.raw?.includes('should-not-commit')));
  await send(page,'pwd');assert.match(await text(page),/\/home\/op\n/);
  await send(page,'exit');await send(page,'resume');assert.match(await text(page),/已從本機操作紀錄還原/);
});

for(const width of [320,1280])test(`Console browser: continuous prompt, wrapped input, raw output and stable scrollback at ${width}px`,{skip,timeout:30000},async t=>{
  const page=await open(t,{width,height:640});await start(page);
  await send(page,'clear');
  const short=await cellBox(page.locator('.xterm-cursor'));
  assert.ok(short.y<80,'prompt follows empty transcript near the top');
  await send(page,'echo immediate');assert.match(await text(page),/immediate\n/);
  assert.equal(await page.locator('.console-session').getAttribute('data-state'),'ready');
  const next=await cellBox(page.locator('.xterm-cursor'));assert.ok(next.y>short.y);
  await typeDraft(page,'echo '+ '中文 abc '.repeat(40));
  assert.ok((await screenRows(page)).filter(row=>row.includes('中文')).length>1,'Long Unicode input wraps across real terminal rows');
  const caret=await cellBox(page.locator('.xterm-cursor')),screen=await cellBox(page.locator('.xterm-screen'));
  assert.ok(caret.x>=screen.x&&caret.x+caret.width<=screen.x+screen.width+1);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await send(page,'help');await send(page,'help');
  await typeDraft(page,'echo keep draft');
  await scrollToEdge(page,-1);assert.equal(await scrollPosition(page),1);
  const earlier=await screenText(page);await advanceGameTime(page,31000);
  assert.equal(await scrollPosition(page),1);assert.equal(await screenText(page),earlier);
  await scrollToEdge(page,1);await expectDraft(page,'echo keep draft');
  await page.setViewportSize({width,height:320});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

const multilineCases=[
  {
    name:'for preserves quoted loop words',
    script:'for word in alpha "two words"; do\n  printf "<%s>\\n" "$word"\ndone',
    output:/\n<alpha>\n<two words>\n/,
  },
  {
    name:'if executes only the selected branch',
    script:'if [ "$(printf yes)" = yes ]; then\n  printf "branch:%s\\n" selected\nelse\n  printf "branch:%s\\n" wrong\nfi',
    output:/\nbranch:selected\n/,
    absent:/\nbranch:wrong\n/,
  },
  {
    name:'quoted heredoc preserves literal dollars and newlines',
    setup:'name=expanded',
    script:"cat <<'END_XTERM' > literal.txt\n$name\nfirst line\nEND_XTERM\n",
    read:'cat literal.txt',
    output:/\n\$name\nfirst line\n/,
    absent:/\nexpanded\n/,
  },
];
for(const scenario of multilineCases)test(`Bash browser: multiline ${scenario.name}`,{skip,timeout:45000},async t=>{
  const page=await open(t);await start(page);if(scenario.setup)await send(page,scenario.setup);
  const journal=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal.filter(step=>step.type!=='advance'));
  const before={head:await head(page),journal:await journal(),output:await transcriptOutput(page)};
  await paste(page,scenario.script);await expectDraft(page,scenario.script);
  assert.equal(await head(page),before.head);assert.deepEqual(await journal(),before.journal);
  assert.equal(await transcriptOutput(page),before.output,'A pasted compound statement remains an unexecuted draft');
  await page.keyboard.press('Enter');await ready(page);await expectDraft(page,'');
  assert.ok((await journal()).some(step=>step.raw?.trimEnd()===scenario.script.trimEnd()),'The complete compound statement is journaled as one input');
  if(scenario.read){await send(page,'clear');await send(page,scenario.read);}
  const output=await terminalText(page);assert.match(output,scenario.output);
  if(scenario.absent)assert.doesNotMatch(output,scenario.absent);
});

test('Bash browser: keyboard Enter continues an unfinished for until done',{skip,timeout:45000},async t=>{
  const page=await open(t);await start(page);
  const journal=await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal);
  await typeDraft(page,'for word in one two; do');await page.keyboard.press('Enter');
  await expectDraft(page,'for word in one two; do\n');
  await page.keyboard.insertText('printf "word:%s\\n" "$word"');await page.keyboard.press('Enter');
  await expectDraft(page,'for word in one two; do\nprintf "word:%s\\n" "$word"\n');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ra.demo.save.v1')).journal),journal,'Continuation Enter must not run an incomplete loop');
  await page.keyboard.insertText('done');await page.keyboard.press('Enter');await ready(page);await expectDraft(page,'');
  assert.match(await terminalText(page),/\nword:one\nword:two\n/);
});

test('Bash browser: variables and functions survive commands, F2 round trips and reload/resume',{skip,timeout:60000},async t=>{
  const page=await open(t);await start(page);
  await page.emulateMedia({reducedMotion:'reduce'});
  await send(page,'shared=$(printf "once\\n" >> ~/effects.txt; printf persistent); count=7');
  await send(page,'report() { printf "state:%s:%s\\n" "$shared" "$((count + $1))"; }');
  await send(page,'report 2');assert.match(await terminalText(page),/\nstate:persistent:9\n/);
  const initialHead=await head(page);await commandInput(page).press('F2');await page.locator('.workspace').waitFor();
  assert.equal(await head(page),initialHead);
  await send(page,'count=$((count + 1)); cd notes; printf "kept\\n" > state.txt');
  await send(page,'report 2');assert.match(await terminalText(page),/state:persistent:10/);
  const beforeSwitch=await head(page);await page.locator('#visual-style').selectOption('server');await ready(page);await expectDraft(page,'');
  assert.equal(await head(page),beforeSwitch);await expectPrompt(page,/~\/notes/);
  await send(page,'report 3');assert.match(await terminalText(page),/\nstate:persistent:11\n/);
  await send(page,'clear');await send(page,'cat ~/effects.txt state.txt');
  assert.match(await terminalText(page),/\nonce\nkept\n/);
  const savedHead=await head(page);
  await page.reload();await ready(page);await expectPrompt(page,'archipelago$ ');
  await send(page,'game resume');await expectPrompt(page,/~\/notes/);assert.equal(await head(page),savedHead);
  await send(page,'report 3');assert.match(await terminalText(page),/\nstate:persistent:11\n/);
  await send(page,'clear');await send(page,'cat ~/effects.txt state.txt');
  const restored=await terminalText(page);assert.match(restored,/\nonce\nkept\n/);
  assert.equal(restored.split('\n').filter(line=>line==='once').length,1,'Session restoration must not duplicate command-substitution side effects');
});

test('Console browser: reading the latest printed save restores bottom and mid-scrollback positions',{skip,timeout:30000},async t=>{
  const page=await open(t);await start(page);await send(page,'clear');
  await send(page,'seq 1 180');await send(page,'game save');
  const bottom=await scrollPosition(page),code=await saveCode(page);
  assert.equal(await scrollPosition(page),bottom);
  assert.equal((await importCode(code)).head,await head(page),'Read the full real printed code, not a truncated screen fragment');
  await scrollToEdge(page,-1);await scrollTerminal(page,1);
  const middle=await scrollPosition(page);
  assert.ok(middle>1&&middle<bottom,'The control starts on a genuine intermediate history page');
  assert.equal(await saveCode(page),code,'Reading the newest code must also work when the reader was not at the bottom');
  assert.equal(await scrollPosition(page),middle);
  assert.match(await screenText(page),/^\d+$/m,'Restore visible old command output, not merely its scrollbar metadata');
});

for(const walk of walks)test(`Console browser: golden ${walk.name} path preserves every commit ID through worker execution`,{skip,timeout:90000},async t=>{
  const page=await open(t);await send(page,'start');
  for(const step of walk.steps){await advanceGameTime(page,step.dt*1000);if(step.in!=='wait')await send(page,step.in);}
  await send(page,'save');
  const save=await importCode(await saveCode(page));
  assert.deepEqual(save.commits.map(c=>[c.kind,c.data,c.branch,c.chapter,c.t,c.r,c.id]),walk.commits);
  assert.equal(await page.locator('dialog').count(),0);
  await expectPrompt(page,/finished/);
});
