/**
 * ============================================================================
 * 模組：main.js — 瀏覽器介面整合入口
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 依賴：data.js（DATA）、engine/index.js（Engine）、save/index.js（存檔）、storage.js（本機儲存）、ui/{dom,terminal,preferences,session-storage,console-view,console-line-editor,script-submissions,xterm-console,shell-job}.js
 *   - 被：index.html（script type=module）、測試
 * 職責：
 *   1. 組裝歡迎/終端機/任務/匯出畫面，協調 Engine 與本機操作紀錄。
 *   2. 輸入與 250ms 時鐘共用 enqueue 序列。
 *   3. 成功操作才加入 journal，之後 persist 保存完整 envelope。
 *   4. 匯出/救援/續玩流程、偏好設定、主題切換。
 * 設計原則：
 *   - 此模組載入即綁定頁面級事件/timer，生命週期為整頁。
 *   - Terminal、dialog、Blob URL 則在各自流程清理。
 *   - 無跨分頁互斥，主檔寫刪走 ui/session-storage.js。
 * ============================================================================
 */
import {DATA} from './data.js';
import {Engine} from './engine/index.js';
import * as S from './save/index.js';
import {readLocal,writeLocal,PREFS_KEY,RECOVERY_KEY,checkJournal,appendAdvance} from './storage.js';
import {el,button,copyText} from './ui/dom.js';
import {Terminal} from './ui/terminal.js';
import {sanitizePreferences,resolvePreferences,styleDescription} from './ui/preferences.js';
import {createSessionStorage} from './ui/session-storage.js';
import {CONSOLE_COMMANDS,completionWord,completedWord,completionEnd} from './ui/console-view.js';
import {scriptSubmissions} from './ui/script-submissions.js';
import {needsContinuation} from './ui/console-line-editor.js';
import {XtermConsoleView as ConsoleView} from './ui/xterm-console.js';
import {ShellJob} from './ui/shell-job.js';
import {execute as executeShell} from './shell/exec.js';

// 網址模式只決定新遊戲/頁面政策；續玩沿用原紀錄的 runMode，不能拿 host 網址改既有流程。
const cfg=DATA.yaml['demo/demo.yaml'];
const runMode=['kiosk','host'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'self';
const app=document.querySelector('#app');
const compact=matchMedia('(max-width: 760px)');
let lastCompact=compact.matches;
/** resize/media change 呼叫；無參數 → undefined，只有跨斷點才切換面板展開並刷新，保留使用者同斷點選擇。 */
function updateCompact() {
  if(lastCompact===compact.matches)return;
  lastCompact=compact.matches;
  const panel=document.querySelector('.task-panel');
  if(panel){panel.open=!lastCompact;if(engine)refresh();}
}
compact.addEventListener('change',updateCompact);
// Mutate the already-authorized stylesheet through CSSOM, not inline style
// attributes, so the hashed CSP remains strict even with the mobile keyboard.
const viewportStyle=Array.from(document.styleSheets[0].cssRules).find(rule=>rule.selectorText===':root')?.style;
/** 視覺視窗/視窗 resize 呼叫；無參數 → undefined，透過既有 CSSOM 更新高度變數，不新增 inline style。 */
function viewportHeight(){viewportStyle?.setProperty('--viewport-height',`${window.visualViewport?.height||window.innerHeight}px`);updateCompact();}
window.visualViewport?.addEventListener('resize',viewportHeight);
window.addEventListener('resize',viewportHeight);
viewportHeight();
// 執行中記憶體、可攜 baseSave 與本機 journal 分離；任意檔案/cwd 需 journal 才能完整重播。
let engine=null, terminal=null, journal=[], baseSave=null, baseBroken=false, restoring=false;
let history=[],historyIndex=0,historyDraft='', serial=Promise.resolve(),tickPending=false;
let lastWall=performance.now(),lastActivity=performance.now(),endedShown=false,clearKiosk=true;
let kioskRecoveryBaseline=false,kioskRecoveryDone=false;
const sessionStore=createSessionStorage(),recoveryStore=createSessionStorage({key:RECOVERY_KEY});
const initialLocal=sessionStore.load(),initialRecovery=recoveryStore.load();
let localWritable=initialLocal.ok,recoveryWritable=initialRecovery.ok;
let saved=initialLocal.ok?initialLocal.value:null,prefs=sanitizePreferences(readLocal(PREFS_KEY));
let input,log,prompt,taskTitle,taskPrompt,hintState,clock,saveStatus,findCount,game,welcome,welcomeError;
let consoleView=null,consoleSubmitting=false,islandSubmitting=false,consoleCancelled=false,lastConsoleTask='',renderedStyle='islands';
let shellMode='bash';
let replayController=null;
let recoveryEnvelope=null;
const shellJob=new ShellJob();
const isConsole=()=>document.documentElement.dataset.style==='server';
function editorDraft() { return consoleView?consoleView.getDraft():{text:input?.value||'',start:input?.selectionStart||0,end:input?.selectionEnd||0}; }
function setEditorDraft(text,start=text.length,end=start) {
  if(consoleView)consoleView.setDraft(text,start,end);
  else if(input){input.value=text;input.setSelectionRange(start,end);}
}
function focusEditor() { if(consoleView)consoleView.focus();else input?.focus({preventScroll:true}); }
function inputStep(raw,shell=shellMode) { return {type:'input',raw,dt:0,shell}; }
function operationBusy() { return consoleSubmitting||islandSubmitting||!!replayController; }
const conflictMessage='另一分頁已更新存檔，已停止本頁自動存檔；可先用 save 匯出本頁進度，再重新載入。';
/** persist/跨分頁事件呼叫；文案 → undefined，僅內容變更時更新 live status，避免每 tick 重複播報。 */
function saveMessage(text) {
  if(saveStatus&&saveStatus.textContent!==text){
    saveStatus.textContent=text;
    if(consoleView&&text!=='● 已自動存檔')terminal.write(`[存檔] ${text}\n`,'system',true);
  }
}
// 頁面級 storage 監聽只失效所有權、不自動認領新版本；卸載頁面即釋放，重開遊戲不重複掛載。
window.addEventListener('storage',event=>{
  try {if(event.storageArea!==globalThis.localStorage)return;}catch{return;}
  sessionStore.observe(event);recoveryStore.observe(event);
  if(sessionStore.conflicted)saveMessage(conflictMessage);
});

/**
 * 表單/快捷/匯入/時鐘呼叫；非同步工作 fn → 原始工作 Promise，內部另接錯誤顯示以維持後續序列。
 * 不吞掉回給呼叫端的失敗；Engine 交易回復後才顯示系統錯誤，不將失敗輸入寫進 journal。
 */
function enqueue(fn) {
  const operation=serial.then(fn);
  serial=operation.catch(error=>{
    if(error?.name==='AbortError'){terminal?.write('^C\n','system',true);return;}
    const message=error instanceof Error?error.message:String(error);
    if(terminal) terminal.write(`[系統] ${message}\n`,'system',true);
    if(welcomeError) welcomeError.textContent=message;
  });
  return operation;
}
/** 頁面輸入事件呼叫；無參數 → undefined，更新 kiosk 的真實活動時間，不推 Engine 世界時間。 */
function activity() { lastActivity=performance.now(); }
for(const event of ['keydown','pointerdown','input']) document.addEventListener(event,activity,{passive:true});
document.addEventListener('keydown',()=>terminal?.finish(),{capture:true});
document.addEventListener('click',()=>terminal?.finish(),{capture:true});
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||consoleView||event.isComposing||event.keyCode===229)return;
  if(event.key==='F2'){event.preventDefault();changeMode('server');}
  else if(event.ctrlKey&&event.key.toLowerCase()==='c'&&(shellJob.pending||replayController)&&!window.getSelection()?.toString()&&
    !(document.activeElement===input&&input.selectionStart!==input.selectionEnd)) {
    event.preventDefault();consoleCancelled=true;replayController?.abort();shellJob.cancel();
  }
});

/** 設定建立/變更呼叫；無參數 → 已解析偏好，寫 html data 屬性，不改進度、輸入或 RA1。 */
function applyPreferences() {
  const {theme,font,style}=resolvePreferences(prefs,{prefersLight:matchMedia('(prefers-color-scheme: light)').matches,hostMode:runMode==='host'});
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.font=font;
  document.documentElement.dataset.style=style;
  const description=document.querySelector('#style-description');
  if(description)description.textContent=styleDescription(style);
  if(game?.isConnected&&renderedStyle!==style)switchSurface(style);
  consoleView?.setPreferences({theme,font});
  return {theme,font,style};
}
/** shell 呼叫；無參數 → 設定 DOM，change handler 僅改顯示偏好/獨立 PREFS_KEY；舊 DOM 隨 replaceChildren 釋放。 */
function settings() {
  const current=applyPreferences();
  const style=el('select',{id:'visual-style','aria-label':'操作模式','aria-describedby':'style-description'},el('option',{value:'islands'},'群島模式'),el('option',{value:'server'},'Bash 終端'));
  const theme=el('select',{id:'theme','aria-label':'顯示主題'},el('option',{value:'dark'},'深色'),el('option',{value:'contrast'},'高對比'));
  const font=el('select',{id:'font-size','aria-label':'終端機字級'},...['small','medium','large'].map((size,i)=>el('option',{value:size},['小','中','大'][i])));
  style.value=current.style; theme.value=current.theme; font.value=current.font;
  style.addEventListener('change',()=>{prefs.style=style.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  theme.addEventListener('change',()=>{prefs.theme=theme.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  font.addEventListener('change',()=>{prefs.font=font.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  return el('div',{class:'settings'},el('label',{},'模式 ',style),el('label',{},'主題 ',theme),el('label',{},'字級 ',font));
}
/** 啟動/resetWelcome 呼叫；無參數 → undefined，重建頁首/歡迎/遊戲容器，移除舊 DOM；遊戲清理由呼叫端負責。 */
function shell() {
  app.replaceChildren();
  const header=el('header',{class:'masthead'},el('a',{href:'#',class:'wordmark',onClick:event=>event.preventDefault()},'ROOT / ARCHIPELAGO'),el('span',{class:'edition'},'試玩版〈第一夜〉'),el('span',{class:'offline'},'● 離線・不收集資料'),settings());
  welcomeError=el('p',{id:'welcome-error',role:'status',class:'error-message'});
  // 匯入區：先限制檔案大小，錯誤標在真正來源欄位；候選存檔准入成功前不替換現有進度。
  const code=el('textarea',{id:'import-code',rows:3,spellcheck:'false','aria-label':'貼上存檔代碼或 JSON','aria-describedby':'welcome-error',placeholder:'RA1-…',maxlength:1_048_576});
  const file=el('input',{type:'file',accept:'.json,.rasave.json,text/plain',id:'import-file','aria-label':'匯入自己的存檔檔案','aria-describedby':'welcome-error'});
  // 編輯代碼僅清過期錯誤/aria-invalid；不主動匯入、不寫本機存檔。
  const clearImportError=event=>{event.target.removeAttribute('aria-invalid');welcomeError.textContent='';};
  code.addEventListener('input',clearImportError);
  file.addEventListener('change',()=>enqueue(async()=>{
    const selected=file.files[0]; if(!selected) return;
    file.removeAttribute('aria-invalid');
    try {
      if(selected.size>262144) throw new Error('存檔檔案過大');
      await importSave(await selected.text(),file);
    } catch(error) {file.setAttribute('aria-invalid','true');file.focus();throw error;}
  }).catch(()=>{}));
  // 歡迎頁版面：故事/開始操作與匯入區並列，手機由 theme.css 堆疊；文字全部經 DOM text 節點。
  welcome=el('main',{id:'welcome',class:'welcome'},
    el('section',{class:'welcome-story'},el('p',{class:'eyebrow'},'ROOT ARCHIPELAGO / DEMO 01'),el('h1',{},'根目錄群島',el('span',{},'第一夜')),el('p',{class:'pitch'},cfg.pitch),el('div',{class:'start-actions'},button('開始值班 →',()=>enqueue(()=>startNew()).catch(()=>{}),{id:'new-game',class:'primary'}),saved?button('繼續上次的存檔',()=>enqueue(()=>resumeLocal()).catch(()=>{}),{id:'continue-game'}):null),el('p',{class:'quiet'},'約 15 分鐘　／　原生 JavaScript　／　所有指令都在模擬世界執行'),el('p',{id:'style-description',class:'quiet'},styleDescription(document.documentElement.dataset.style))),
    el('section',{class:'welcome-import'},el('p',{class:'eyebrow'},'CONTINUE YOUR SHIFT'),el('h2',{},'帶著存檔回來'),el('label',{for:'import-code'},'貼上自己的存檔代碼'),code,button('匯入並繼續',()=>enqueue(()=>importSave(code.value)).catch(()=>{}),{id:'import-submit'}),el('details',{},el('summary',{},'或選擇 .rasave.json 檔案'),file),el('p',{class:'quiet'},'代碼只含暱稱、種子、事件與時間；不含真實姓名、IP 或裝置資訊。'),welcomeError),
    el('footer',{class:'welcome-footer'},el('span',{},'29 個指令。一座燈塔。'),el('span',{},runMode==='self'?'SELF-SERVE':runMode.toUpperCase())));
  game=el('main',{id:'game',class:'game',hidden:true});
  app.append(header,welcome,game);
  renderedStyle=document.documentElement.dataset.style;
  if(isConsole())createConsoleWelcome();
}

/** Switch operating surfaces, keeping the live Engine, scrollback, history and editor draft. */
function switchSurface(style) {
  renderedStyle=style;
  if(engine||replayController) {
    const draft=engine?.mode?.[2]?.expect_input?.secret?{text:'',start:0,end:0}:editorDraft(),lines=terminal?.snapshot()||[];
    createGame({preserve:true});
    terminal.restore(lines);setEditorDraft(draft.text,draft.start,draft.end);
    if(consoleView&&engine)lastConsoleTask=`${engine.active}:${engine.inputMode}:${engine.ended}`;
    configureRunner();if(engine)refresh();consoleView?.resize();terminal.follow();
    if(consoleView)consoleView.setBusy(operationBusy());
    input.disabled=!consoleView&&operationBusy();focusEditor();
  } else if(style==='server')createConsoleWelcome();
  else {
    consoleView?.destroy();consoleView=null;terminal=null;input=null;
    game.replaceChildren();game.hidden=true;welcome.hidden=false;
  }
}

function configureRunner(mode=shellMode) {
  if(engine){
    engine.shellDialect=mode;
    engine.shellExecutor=isConsole()||mode==='bash'?(raw,vfs,options)=>shellJob.run(raw,vfs,{...options,shell:mode}):executeShell;
  }
}

function mountConsole() {
  consoleView=new ConsoleView({submit:submitConsole,cancel:cancelConsole,complete:completeDraft,history:()=>history,leave:()=>changeMode('islands')});
  terminal=consoleView.terminal;log=null;prompt=null;
  saveStatus=el('span',{id:'save-status',hidden:true,'data-head':''});
  game.append(consoleView.node,saveStatus);
  consoleView.mount();input=consoleView.input;
  consoleView.setPreferences(resolvePreferences(prefs,{prefersLight:matchMedia('(prefers-color-scheme: light)').matches,hostMode:runMode==='host'}));
  if(operationBusy())consoleView.setBusy(true);
}

function createConsoleWelcome() {
  consoleView?.destroy();terminal?.destroy();game.replaceChildren();
  welcome.hidden=true;game.hidden=false;history=[];historyIndex=0;lastConsoleTask='';
  mountConsole();consoleView.setPrompt(promptText(),'輸入工作階段指令');
  terminal.write(`根目錄群島 / 第一夜\nBash 終端（模擬）· 離線工作階段\n\n遊戲啟動器\n  game start          開始值班\n${saved?'  game resume         繼續本機紀錄\n':''}  game import <RA1-…> 匯入存檔代碼（也接受 JSON）\n  game help           Bash 操作與遊戲命令說明\n  game mode islands   返回群島模式（或按 F2）\n\n`,'system',true);
  consoleView.focus();
}

/** startNew/importCandidate/resumeLocal 呼叫；無參數 → undefined，銷毀舊 Terminal 並重建遊戲 DOM/歷史。 */
function createGame({preserve=false}={}) {
  consoleView?.destroy();consoleView=null;
  terminal?.destroy();
  game.replaceChildren();
  welcome.hidden=true; game.hidden=false;
  if(!preserve){endedShown=false;clearKiosk=true;kioskRecoveryBaseline=false;kioskRecoveryDone=false;history=[];historyIndex=0;historyDraft='';lastConsoleTask='';}
  if(isConsole()){mountConsole();return;}
  clock=el('span',{id:'clock',class:'clock','aria-label':'值班經過時間'},'00:00');
  // 終端視窗區：role=log 與可聚焦捲動區獨立於表單；刷新任務時不重建輸出，避免丟歷史與焦點。
  const bar=el('div',{class:'terminal-bar'},el('span',{class:'window-dots','aria-hidden':'true'},'● ● ●'),el('span',{id:'host-label'},'lighthouse / main'),clock);
  log=el('div',{id:'terminal',class:'terminal',role:'log','aria-live':'polite','aria-relevant':'additions text','aria-label':'終端機輸出',tabindex:'0'});
  terminal=new Terminal(log);
  prompt=el('label',{id:'prompt',for:'command-input',class:'prompt'},'暱稱: ');
  input=el('textarea',{id:'command-input',rows:1,autocomplete:'off',autocapitalize:'off',autocorrect:'off',spellcheck:'false',maxlength:4096,'aria-label':'輸入暱稱','aria-describedby':'keyboard-help',disabled:true});
  const form=el('form',{class:'command-form'},prompt,input,el('button',{type:'submit','aria-label':'執行指令',class:'execute'},'↵'));
  // 提交時先停用輸入、排隊同步時鐘再 feed；finally 解鎖，dialog 開啟時不強搶焦點。
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(input.disabled||operationBusy()) return;
    islandSubmitting=true;consoleCancelled=false;
    const raw=input.value; input.value=''; input.disabled=true;
    const lines=scriptSubmissions(raw,shellMode==='bash');let next=0;
    enqueue(async()=>{
      await syncClock();
      if(!lines.length)await feedInput('');
      for(;next<lines.length;next++){
        if(consoleCancelled)throw new DOMException('指令已中斷','AbortError');
        await feedInput(lines[next]);
        if(engine.inputMode||engine.ended){next++;break;}
      }
    }).catch(()=>{}).finally(()=>{
      islandSubmitting=false;
      if(next<lines.length&&!consoleCancelled)setEditorDraft(lines.slice(next).join('\n'));
      consoleView?.setBusy(false);input.disabled=false;
      if(!document.querySelector('dialog[open]'))focusEditor();
    });
  });
  input.addEventListener('keydown',inputKey);
  taskTitle=el('h2',{id:'task-title'},'目前任務');
  taskPrompt=el('p',{id:'task-prompt'});
  hintState=el('p',{id:'hint-state',class:'hint-state'},'提示 ○ ○ ○');
  findCount=el('strong',{id:'discoveries'},'0 / 12');
  saveStatus=el('p',{id:'save-status',class:'save-status',role:'status','data-head':''},'尚未開始');
  // 任務面板與快捷列：只呈現 Engine 投影；hint/save 才直接送出，其餘按鈕只填文字避免誤執行。
  const panel=el('details',{class:'task-panel',open:!compact.matches},el('summary',{id:'panel-summary'},'值班面板'),el('div',{class:'panel-content'},el('p',{class:'eyebrow'},'CURRENT TASK'),taskTitle,taskPrompt,hintState,button('下一階提示',()=>quickCommand('hint'),{class:'hint-button'}),el('div',{class:'panel-stats'},el('span',{},'發現'),findCount),el('div',{class:'panel-save'},el('span',{},'本機存檔'),saveStatus),el('p',{class:'quiet'},'Tab 補全 · ↑↓ 歷史',el('br'), 'hint 提示 · skip 兩次跳題'),el('p',{id:'session-mode-notice',class:'mode-notice',hidden:true})));
  const chips=el('nav',{class:'chips','aria-label':'指令快捷按鈕'},...cfg.ui.command_chips.map(command=>button(command,()=>{
    if(command==='hint'||command==='save')quickCommand(command);
    else {input.value=command+' ';input.focus();}
  },{'aria-label':command==='hint'?'執行 hint':command==='save'?'執行 save':`填入 ${command}`})));
  const keyboardHelp=el('p',{id:'keyboard-help',class:'keyboard-help'},'Tab 補全 · ↑↓ 歷史 · 未完成語法按 Enter 續行 · Shift+Enter 換行 · Ctrl+C 中斷 · Shift+Tab 離開輸入欄 · 終端機輸出可用 PageUp／PageDown 捲動');
  game.append(el('section',{class:'workspace'},el('section',{class:'terminal-window'},bar,log,form),panel),chips,keyboardHelp,el('div',{class:'game-footer'},el('span',{},'模擬 Shell，不會更動你的電腦。'),el('span',{},runMode.toUpperCase())));
}
/** Engine 的 onOutput 呼叫；文字/種類 → undefined，重播時立即顯示，不自行操作存檔。 */
function output(text,kind) { terminal?.write(text,kind,restoring); }
/** 建立引擎流程呼叫；無參數 → 新遊戲選項物件，綁頁面 output；無副作用。 */
function options() {return {seed:5,event:runMode==='host'?'host-led':'demo-event-1',mode:runMode,onOutput:output};}
/** 新遊戲按鈕經 enqueue 呼叫；無參數 → Promise<void>，替換執行中狀態/清 journal，暱稱確認前不覆寫舊存檔。 */
async function startNew() {
  document.querySelector('dialog')?.remove();
  const previous=consoleView?terminal.snapshot():[];
  shellMode='bash';
  createGame(); journal=[];baseSave=null;baseBroken=false;
  if(consoleView)terminal.restore(previous);
  engine=new Engine(options());
  configureRunner();
  await engine.start();lastWall=performance.now();activity();
  refresh();input.disabled=false;focusEditor();
}
/** 歡迎頁代碼/檔案事件呼叫；文字/來源欄位 → Promise<void>，失敗標 invalid 並聚焦該欄位後重新拋錯。 */
async function importSave(text,field=document.querySelector('#import-code')) {
  try {await importCandidate(text);}
  catch(error) {
    if(field){field.setAttribute('aria-invalid','true');field.focus();}
    throw error;
  }
}
/** importSave 呼叫；文字 → Promise<void>，驗碼/分級/准入後才發布候選 Engine，重置 journal 並保存基底。 */
async function importCandidate(text) {
  const save=text.trimStart().startsWith('{')?await S.importFile(text):await S.importCode(text);
  const [level]=await S.level(save);
  // Admission can reject a shape-valid older save that has no continuation
  // budget. Do not replace the visible session/journal before this succeeds.
  const candidate=await Engine.fromSave(save,{...options(),mode:save.event==='host-led'?'host':'self',seed:save.seed,event:save.event,onOutput:()=>{}});
  shellMode='bash';
  createGame();journal=[];baseSave=JSON.parse(JSON.stringify(save));baseBroken=level==='broken';
  engine=candidate;engine.onOutput=output;
  configureRunner();
  output(`[系統] 存檔完整性：${{intact:'完整',suspicious:'可疑',broken:'損毀'}[level]}。\n`,'system');
  output('[系統] 代碼保留事件進度，不包含任意 Shell 檔案修改、工作目錄與未記錄的輸入。\n','system');
  lastWall=performance.now();activity();await persist();refresh();input.disabled=false;
  if(engine.ended)await showExport(true);else focusEditor();
}
/**
 * 繼續按鈕經 enqueue 呼叫；無參數 → Promise<void>，固定同份 storage baseline 後重播 journal。
 * 鏈尾不符不覆寫原始 envelope，回歡迎頁顯示救援；finally 恢復非重播模式與 UI 時鐘基準。
 */
async function resumeLocal() {
  const read=sessionStore.load();localWritable=read.ok;
  if(!read.ok)throw new Error('本機存檔無法安全讀取；原始資料未覆寫，請保留備份或使用代碼。');
  const envelope=read.value;
  if(!envelope)throw new Error('找不到可繼續的本機存檔。請貼上存檔代碼。');
  if(!envelope.save) {await importSave(JSON.stringify(envelope));return;}
  const replay=new AbortController();replayController=replay;
  consoleView?.setBusy(true);
  try {
    S.checkShape(envelope.save);
    if(envelope.version!==1||!checkJournal(envelope.journal))throw new Error('本機操作紀錄格式錯誤，請保留原始紀錄後還原事件進度。');
    if(envelope.shell!==undefined&&!['legacy','bash'].includes(envelope.shell))throw new Error('本機 Shell 版本不受支援。');
    if(envelope.baseSave)S.checkShape(envelope.baseSave);
    // Historical steps keep their own dialect below; every new input uses Bash,
    // independent of the renderer or the historical envelope's current backend.
    shellMode='bash';
    createGame();restoring=true;
    journal=JSON.parse(JSON.stringify(envelope.journal));baseSave=envelope.baseSave||null;
    baseBroken=baseSave?(await S.level(baseSave))[0]==='broken':false;
    const mode=['self','kiosk','host','host_led'].includes(envelope.runMode)?envelope.runMode:envelope.save.event==='host-led'?'host':'self';
    const replayOptions={...options(),mode,seed:envelope.save.seed,event:envelope.save.event};
    engine=baseSave?await Engine.fromSave(baseSave,replayOptions):new Engine(replayOptions);
    replay.signal.throwIfAborted();
    configureRunner();
    if(!baseSave)await engine.start();
    for(const step of journal) {
      replay.signal.throwIfAborted();
      if(step.type==='advance')await engine.advance(step.dt);
      else {configureRunner(step.shell||'legacy');echoInput(step.raw);await engine.feed(step.raw,step.dt,{signal:replay.signal});}
    }
    replay.signal.throwIfAborted();
    if(!baseBroken)S.seal(engine.save);
    if((engine.save.head||null)!==(envelope.save.head||null))throw new Error('本機重播的鏈尾不同。請改用存檔代碼或 JSON。');
    output('[系統] 已從本機操作紀錄還原。\n','system');
  } catch(error) {
    await resetWelcome(false);
    if(error?.name!=='AbortError')showRecovery(envelope);
    throw error;
  } finally {
    if(replayController===replay)replayController=null;
    restoring=false;lastWall=performance.now();activity();
    if(engine){configureRunner();input.disabled=false;refresh();}
    consoleView?.setBusy(consoleSubmitting||islandSubmitting);
  }
  if(engine.ended)await showExport(true);else focusEditor();
}
/** refresh/echoInput 呼叫；無參數 → 依暱稱/口令/投票/主機/分支/cwd 產生提示符，唯讀。 */
function promptText() {
  if(!engine)return 'guest@archipelago:~$ ';
  if(isConsole()&&engine.ended)return 'archipelago:finished$ ';
  if(engine.inputMode==='input')return engine.mode[2].expect_input.store?'暱稱: ':'口令: ';
  if(engine.inputMode==='choice')return 'block / pass: ';
  const host=engine.world==='ch1'?'logport':'lighthouse';
  const home=engine.vfs.home,cwd=engine.vfs.cwd;
  const path=cwd===home?'~':cwd.startsWith(home+'/')?'~'+cwd.slice(home.length):cwd;
  return `op-${engine.nick||'guest'}@${host}${engine.branch==='main'?'':`(${engine.branch})`}:${path}$ `;
}
/** feedInput/本機重播呼叫；raw → undefined，立即回顯並收非 input 模式歷史；暱稱/口令不入歷史，choice 仍會收錄。 */
function echoInput(raw) {
  if(!raw.trim())return;
  terminal.write(promptText()+(engine?.mode?.[2]?.expect_input?.secret?'':raw)+'\n','command',true);
  if(engine?.inputMode!=='input'){history.push(raw);historyIndex=history.length;}
}
/** 表單已序列化工作呼叫；raw → Promise<void>，成功 feed 後才 append journal/persist，必要時開匯出 dialog。 */
async function feedInput(raw,engineRaw=raw) {
  const mode=shellMode;
  configureRunner(mode);
  terminal.follow();terminal.finish();echoInput(raw);
  await engine.feed(engineRaw,0);
  journal.push(inputStep(engineRaw,mode));
  await persist();refresh();
  if(engine.ended&&!endedShown)await showExport(true);
  else if(/^save(?:\s|$)/.test(engineRaw.trim())&&engine.save)await showExport(false);
}
/** 快捷列/提示按鈕呼叫；指令字串 → undefined，以既有表單流程提交；暱稱模式阻擋避免註冊成 hint。 */
function quickCommand(raw) {
  if(!input||input.disabled)return;
  if(engine?.inputMode==='input'&&engine.mode[2].expect_input.store==='player.nick')return;
  input.value=raw;
  input.form.requestSubmit();
}
/**
 * 表單/250ms tick 經 enqueue 呼叫；無參數 → Promise<void>，將 wall-clock 差額送給 Engine。
 * 先在 journal 候選副本合併，advance 成功才替換；不能讓失敗時鐘留下不可重播的本機紀錄。
 */
async function syncClock() {
  const now=performance.now(),dt=Math.max(0,(now-lastWall)/1000);lastWall=now;
  if(engine&&!engine.ended){
    const next=journal.slice();
    if(next.length)next[next.length-1]={...next[next.length-1]};
    appendAdvance(next,dt);
    await engine.advance(dt);
    journal=next;
  }
}
/**
 * 成功輸入/匯入/tick/匯出呼叫；無參數 → Promise<void>，驗形狀/journal 後透過所有權 guard 保存 envelope。
 * 存取失敗只提示，不中斷遊玩；跨分頁衝突不重試認領；kiosk 結束依使用者選擇清理主檔與救援副本。
 */
async function persist() {
  if(!engine?.save)return;
  if(!baseBroken)S.seal(engine.save);
  try {
    S.checkShape(engine.save);
    if(!checkJournal(journal))throw new Error('操作紀錄超出本機儲存範圍');
  } catch {
    saveMessage('目前紀錄未自動存入；請使用 save 保留進度');
    return;
  }
  if(!localWritable){saveMessage('未能安全讀取原始存檔，未覆寫；請使用 save 保留進度');return;}
  if(runMode==='kiosk'&&engine.ended&&clearKiosk){
    const removed=await sessionStore.clear();
    if(removed.ok){
      const recovery=await clearKioskRecovery();
      saveMessage(recovery.ok?'已清除本機存檔':'已清除本機存檔；救援備份未清除，請檢查儲存權限或其他分頁');
    }else saveMessage(removed.reason==='conflict'?conflictMessage:'未能清除本機存檔，請檢查儲存權限');
    return;
  }
  const result=await sessionStore.write({version:1,runMode:engine.runMode,shell:shellMode,save:engine.save,baseSave,journal});
  saved=result.ok?readLocal():saved;
  saveMessage(result.ok?'● 已自動存檔':result.reason==='conflict'?conflictMessage:'未能自動存檔，請保留代碼');
}
/** kiosk 完成/重設呼叫；無參數 → Promise<{ok}>，主檔仍持有時才一次認領救援 baseline，鎖內重查後刪除。 */
async function clearKioskRecovery() {
  // This explicit privacy cleanup adopts its recovery baseline once, only after
  // primary cleanup succeeded. Never reacquire a baseline invalidated by an
  // external storage event, nor adopt it afresh on every idle autosave tick.
  if(!sessionStore.check().ok||recoveryStore.conflicted)return {ok:false};
  if(kioskRecoveryDone)return {ok:true};
  if(!kioskRecoveryBaseline){
    kioskRecoveryBaseline=true;
    const read=recoveryStore.load();
    recoveryWritable=read.ok||read.reason==='invalid'||read.reason==='too_large';
  }
  const result=recoveryWritable?await recoveryStore.clear({precondition:()=>sessionStore.check().ok}):{ok:false};
  if(result.ok)kioskRecoveryDone=true;
  return result;
}
/** 成功操作/resize 呼叫；無參數 → undefined，更新任務/時鐘/提示符/可及名稱，不重建終端或寫入進度。 */
function refresh() {
  if(!engine||!input)return;
  if(consoleView){refreshConsole();return;}
  prompt.textContent=promptText();
  const duration=engine.t0===null?0:engine.ended?(engine.save?.commits.at(-1)?.r||0)/1000:engine.now-engine.t0;
  const seconds=Math.floor(duration);
  clock.textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}${seconds>=840?' · 即將收尾':''}`;
  clock.classList.toggle('warning',seconds>=840);
  document.querySelector('#host-label').textContent=`${engine.world==='ch1'?'logport':'lighthouse'} / ${engine.branch}`;
  const modeNotice=document.querySelector('#session-mode-notice');
  modeNotice.hidden=!engine.hostMode&&runMode!=='host';
  modeNotice.textContent=engine.hostMode?'主持人共享模式：點燈後直接投票。此紀錄不供正式版個人匯入。':'已沿用原存檔的自助流程；網址的主持人模式只適用於新遊戲。';
  const guide=engine.currentLadder();
  const quest=engine.quests[engine.active];
  const enteringNick=engine.inputMode==='input'&&engine.mode[2].expect_input.store==='player.nick';
  input.setAttribute('aria-label',enteringNick?'輸入暱稱':engine.inputMode==='input'?'輸入口令或 Shell 指令':engine.inputMode==='choice'?'選擇 block 或 pass':'輸入 Shell 指令');
  for(const control of game.querySelectorAll('.hint-button,[aria-label="執行 hint"],[aria-label="執行 save"]'))control.disabled=enteringNick;
  const guideKey=guide?.ladder==='quest_ladder'?`q.${engine.active}`:guide?.id;
  const n=engine.ladders[guideKey]||0;
  hintState.textContent='提示 '+Array.from({length:3},(_,i)=>i<n?'●':'○').join(' ');
  taskTitle.textContent=engine.ended?'值班登記完成':engine.inputMode==='choice'?'02:00 的訪客':quest?`${quest.id} ${quest.title}`:'下一步';
  document.querySelector('#panel-summary').textContent=compact.matches?`值班面板 · ${taskTitle.textContent}`:'值班面板';
  taskPrompt.textContent=engine.inputMode==='input'?(engine.mode[2].expect_input.store?'輸入暱稱，開始第一夜。':'輸入口令；也可以輸入指令查閱檔案。'):engine.inputMode==='choice'?'輸入 block 或 pass。':quest?.prompt||'輸入 hint，查看下一步。';
  findCount.textContent=`${engine.finds.size} / ${cfg.finds.length}`;
  saveStatus.dataset.head=engine.save?.head||'';
}
/** 群島輸入框 keydown；與終端共用 Bash 完整性判斷，問答／口令仍是文字輸入。 */
function inputKey(event) {
  if(event.isComposing||event.keyCode===229)return;
  if(event.key==='Enter'&&!event.shiftKey){
    event.preventDefault();
    if(!engine.inputMode&&needsContinuation(input.value))input.setRangeText('\n',input.selectionStart,input.selectionEnd,'end');
    else input.form.requestSubmit();
    return;
  }
  if(event.key.toLowerCase()==='c'&&event.ctrlKey&&input.selectionStart===input.selectionEnd&&!window.getSelection()?.toString()){
    event.preventDefault();
    terminal.write(promptText()+(engine.mode?.[2]?.expect_input?.secret?'':input.value)+'^C\n','command',true);
    input.value='';historyIndex=history.length;historyDraft='';
    if(engine.mode?.[2]?.expect_input?.secret)input.form.requestSubmit();
    return;
  }
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
    if(event.key==='ArrowUp'&&input.value.slice(0,input.selectionStart).includes('\n')||event.key==='ArrowDown'&&input.value.slice(input.selectionEnd).includes('\n'))return;
    event.preventDefault();
    if(historyIndex===history.length)historyDraft=input.value;
    historyIndex=Math.max(0,Math.min(history.length,historyIndex+(event.key==='ArrowUp'?-1:1)));
    input.value=historyIndex===history.length?historyDraft:history[historyIndex];
  } else if(event.key==='Tab'){
    if(event.shiftKey)return;
    event.preventDefault();
    completeInput();
  }
}
/** Completion changes only the editable token; candidates are printed into scrollback. */
function completeInput() {
    const draft=editorDraft(),result=completeDraft({text:draft.text,cursor:draft.start});
    setEditorDraft(result.text,result.cursor);
    if(result.candidates?.length)terminal.write(result.candidates.join('  ')+'\n','system',true);
}
function completeDraft({text,cursor}) {
    const before=text.slice(0,cursor),word=completionWord(before);
    const {token,start,quote}=word;
    const end=completionEnd(text,start);
    let candidates=[];
    if(word.command)candidates=[...new Set([...cfg.command_whitelist,...(shellMode==='bash'?['printf','export','unset','alias','unalias','type','command','true','false','test','read','env','find','sed','awk','mkdir','touch','cp','mv','basename','dirname','seq','tee','tr','sleep']:[]),...(consoleView?['game','history','clear']:[])])].filter(command=>command.startsWith(token));
    else if(consoleView&&/^game\s+\S*$/.test(before))candidates=CONSOLE_COMMANDS.filter(command=>command.startsWith(token));
    else if(consoleView&&/^(?:game\s+)?(?:mode|theme|font)\s+\S*$/.test(before)){
      const values={mode:['islands','terminal'],theme:['dark','contrast'],font:['small','medium','large']};
      candidates=values[before.replace(/^game\s+/,'').split(/\s/)[0]].filter(value=>value.startsWith(token));
    } else if(engine) {
      const slash=token.lastIndexOf('/'),dir=slash>=0?token.slice(0,slash+1):'',part=token.slice(slash+1);
      try {candidates=engine.vfs.list(dir||'.',{all:true}).filter(name=>name.startsWith(part)).map(name=>dir+name+(engine.vfs.isDirectory(dir+name)?'/':''));}catch{/* No completion for a nonexistent directory. */}
    }
    let replacement;
    if(candidates.length===1)replacement=completedWord(candidates[0],quote,true);
    else if(candidates.length>1){let prefix=candidates[0];while(prefix&&!candidates.every(candidate=>candidate.startsWith(prefix)))prefix=prefix.slice(0,-1);if(prefix.length>token.length)replacement=completedWord(prefix,quote,false);else return {text,cursor,candidates};}
    return replacement===undefined?{text,cursor}:{text:text.slice(0,start)+replacement+text.slice(end),cursor:start+replacement.length};
}

function refreshConsole() {
  const mode=engine.inputMode,quest=engine.quests[engine.active];
  const nick=mode==='input'&&engine.mode[2].expect_input.store==='player.nick';
  consoleView.setPrompt(promptText(),nick?'輸入暱稱（game help 查看操作）':mode==='input'?'輸入口令（Ctrl+C 取消）':mode==='choice'?'選擇 block 或 pass':'輸入 Bash 或遊戲指令');
  consoleView.setSecret(!!engine.mode?.[2]?.expect_input?.secret);
  saveStatus.dataset.head=engine.save?.head||'';
  const key=`${engine.active}:${mode}:${engine.ended}`;
  if(lastConsoleTask!==key&&!restoring) {
    lastConsoleTask=key;
    if(nick)terminal.write('輸入暱稱以開始。game help、game save、game exit 可隨時使用。\n','system',true);
    else if(!mode&&!engine.ended&&quest)terminal.write(`\n[任務] ${quest.id} ${quest.title}\n${quest.prompt}\n`,'system',true);
  }
}

function consoleHelp() {
  terminal.write(`
Bash 相容終端（just-bash / xterm.js）
  ls / ls -a / pwd / cd / cat / grep …
  變數 / 函式 / alias · $(命令) · $((算式)) · if / for / while
  管線 | · 重導向 < / > / >> / 2> · 串接 ; / && / ||
  工作階段保留 Shell 狀態；這是離線 Bash 相容模擬。
  history / clear       命令歷史／清畫面

遊戲命令
  game start            開始新值班
  game resume           還原本機操作紀錄
  game import <RA1-…>   匯入事件存檔（也接受 JSON）
  game task / status    查詢任務／工作階段狀態
  hint / skip           劇本提供的提示／連續兩次跳題
  game save             印出值班證與存檔代碼
  game download         下載 JSON 存檔
  game mode islands     切換群島模式（F2 可保留草稿切換）
  game theme dark|contrast
  game font small|medium|large
  game exit             保存本機紀錄，返回遊戲啟動器
  game help             顯示本說明
  亦保留 save、task、status 等遊戲快捷命令；它們不是 Bash 內建。

Bash / Readline 風格鍵盤
  Enter 執行 · Shift+Enter 換行 · Tab 補全 · ↑↓ 歷史
  Ctrl+A/E 行首／行尾 · Ctrl+U/K 刪前／後段 · Ctrl+W 刪前一字
  Ctrl+R 搜尋歷史（Enter 採用，Esc 返回）
  Ctrl+C 取消輸入／中斷指令 · Ctrl+L 清畫面
  PageUp/PageDown 回捲 · Shift+Tab 離開輸入欄
  貼上不會直接執行；未完成語法顯示 > 續行，完整腳本才提交。
  多段指令遇到遊戲互動提示時暫停，餘下內容留在草稿。
  暱稱、口令與投票提示期間，可使用 game help 等遊戲命令。

`,'system',true);
}

/** UI session commands never masquerade as simulated filesystem programs. */
async function consoleCommand(raw) {
  const text=raw.trim(),gamePrefix=/^game(?:\s|$)/.test(text)&&!(engine?.inputMode&&text==='game');
  const prefixed=gamePrefix||text.startsWith(':'),body=gamePrefix?text.replace(/^game\s*/,'')||'help':prefixed?text.slice(1):text;
  const [command,...args]=body.split(/\s+/);
  if(engine?.inputMode&&!prefixed){await feedInput(raw);return;}
  const standalone=command==='import'||!/[;&|<>()\n`$\\]/.test(body);
  const known=standalone&&(CONSOLE_COMMANDS.includes(command)||command==='recover'||prefixed&&['hint','skip'].includes(command));
  if(!known){
    if(engine&&!engine.ended){await feedInput(raw);return;}
    echoInput(raw);terminal.write(`${command}: 找不到工作階段指令。輸入 help 查看說明。\n`,'stderr',true);return;
  }
  if(command==='save'&&engine?.save){
    if(engine.inputMode){echoInput(raw);await consoleExport(false);}
    else await feedInput(raw,'save');
    return;
  }
  if(command==='help'&&engine&&!engine.ended&&!engine.inputMode)await feedInput(raw,'help');
  else echoInput(raw);
  switch(command) {
    case 'help':consoleHelp();break;
    case 'hint':case 'skip':
      if(!engine)throw new Error('尚未開始值班。輸入 game start。');
      if(engine.mode?.[2]?.expect_input?.store==='player.nick')throw new Error('請先輸入暱稱。');
      await engine.feed(command,0);journal.push(inputStep(command));await persist();refresh();
      if(engine.ended&&!endedShown)await showExport(true);
      break;
    case 'start':
      if(engine&&!engine.ended)throw new Error('已有值班進行中；可用 exit 保存並返回入口。');
      await startNew();break;
    case 'resume':
      if(engine)throw new Error('先用 exit 返回工作階段入口，再續玩。');
      await resumeLocal();break;
    case 'import':
      if(engine)throw new Error('先用 exit 保存目前值班，再匯入其他存檔。');
      await importSave(body.slice(command.length).trim(),null);break;
    case 'task': {
      if(!engine)throw new Error('尚未開始值班。輸入 start 或 resume。');
      const quest=engine.quests[engine.active];
      terminal.write(engine.ended?'值班已結束。輸入 save 保留這一夜。\n':engine.inputMode==='choice'?'02:00 的訪客：輸入 block 或 pass。\n':quest?`${quest.id} ${quest.title}\n${quest.prompt}\n`:'輸入 hint 查看下一步。\n','system',true);break;
    }
    case 'status': {
      if(!engine){terminal.write(`尚未開始值班。${saved?'有本機紀錄，可用 resume。':''}\n`,'system',true);break;}
      const seconds=engine.t0===null?0:Math.floor(engine.now-engine.t0);
      terminal.write(`狀態  ${engine.ended?'已結束':engine.inputMode||'等待命令'}\n位置  ${engine.world==='ch1'?'logport':'lighthouse'}:${engine.vfs.cwd}\n分支  ${engine.branch}\n耗時  ${S.fmtTime(seconds)}\n任務  ${engine.done.length} 完成 / ${engine.skipped.length} 跳過\n發現  ${engine.finds.size} / ${cfg.finds.length}\n存檔  ${saveStatus.textContent||'尚未開始'}\n流程  ${engine.hostMode?'主持人共享紀錄，不供個人正式版匯入':engine.runMode}\n`,'system',true);break;
    }
    case 'history':terminal.write(history.map((line,i)=>`${String(i+1).padStart(4)}  ${line}`).join('\n')+'\n','stdout',true);break;
    case 'clear':terminal.clear();break;
    case 'save':throw new Error('確認暱稱後才能建立存檔。');
    case 'download':
      if(!engine?.save)throw new Error('尚無存檔可下載。');
      if(runMode==='kiosk')throw new Error('攤位模式請使用 save 複製代碼。');
      downloadSave();terminal.write(`已送出下載：${engine.nick}.rasave.json\n`,'system',true);break;
    case 'mode':
      if(!['islands','terminal','server'].includes(args[0])||args.length!==1)throw new Error('用法：mode islands|terminal');
      changeMode(args[0]==='islands'?'islands':'server');break;
    case 'theme':case 'font': {
      const values=command==='theme'?['dark','contrast']:['small','medium','large'];
      if(!values.includes(args[0])||args.length!==1)throw new Error(`用法：${command} ${values.join('|')}`);
      prefs[command]=args[0];applyPreferences();writeLocal(prefs,PREFS_KEY);
      document.querySelector(command==='theme'?'#theme':'#font-size').value=args[0];break;
    }
    case 'exit':await persist();await resetWelcome(false);break;
    case 'recover':
      if(!recoveryEnvelope)throw new Error('目前沒有待救援紀錄。');
      if(args[0]==='events')await restoreRecoveryEvents(recoveryEnvelope);
      else if(args[0]==='journal'&&runMode!=='kiosk')downloadJSON(recoveryEnvelope,'root-archipelago.rajournal.json');
      else throw new Error('用法：recover journal（備份原紀錄）或 recover events（只還原事件）');
      break;
  }
}

function changeMode(style) {
  prefs.style=style;applyPreferences();writeLocal(prefs,PREFS_KEY);
  document.querySelector('#visual-style').value=style;
}

function submitConsole(raw) {
  if(operationBusy())return;
  consoleSubmitting=true;consoleCancelled=false;terminal.follow();consoleView.setBusy(true);
  const lines=scriptSubmissions(raw);
  let next=0;
  enqueue(async()=>{
    if(engine)await syncClock();
    if(!lines.length){
      if(engine?.inputMode)await feedInput('');
      else terminal.write(promptText()+'\n','command',true);
    }
    for(;next<lines.length;next++) {
      if(consoleCancelled)throw new DOMException('指令已中斷','AbortError');
      const line=lines[next];
      if(line.length>4096&&!/^(?:game\s+|:)?import\s/.test(line.trimStart()))throw new Error('單一指令上限為 4096 字元。');
      await consoleCommand(line);
      if(!consoleView||engine?.inputMode||engine?.ended){next++;break;}
      consoleView.setBusy(true);
    }
  }).catch(()=>{}).finally(()=>{
    consoleSubmitting=false;
    if(input)input.disabled=false;
    if(input&&next<lines.length&&!consoleCancelled)setEditorDraft(lines.slice(next).join('\n'));
    if(consoleView){
      consoleView.setBusy(false);refresh();consoleView.focus();terminal.scroll();
    }
  });
}

function cancelConsole() {
  if(operationBusy()||shellJob.pending){consoleCancelled=true;replayController?.abort();shellJob.cancel();return;}
  terminal.write(promptText()+(engine?.mode?.[2]?.expect_input?.secret?'':editorDraft().text)+'^C\n','command',true);setEditorDraft('');consoleView.resetHistory();consoleView.resize();
  if(engine?.mode?.[2]?.expect_input?.secret) {
    enqueue(async()=>{await engine.feed('',0);journal.push(inputStep(''));await persist();refresh();}).catch(()=>{});
  }
}

async function consoleExport(ended) {
  endedShown=ended||engine.ended;
  if(!baseBroken)S.seal(engine.save);
  const card=await S.card(engine.save);
  terminal.write(`\n${card}\n`,'system',true);
  if(!ended) {
    try {
      const code=await S.exportCode(engine.save);
      terminal.write(code+'\n','stdout',true);
      terminal.write('代碼保留事件進度；檔案、cwd 與 Shell 狀態由本機操作紀錄保存。\n可選取代碼複製；download 下載 JSON。\n','system',true);
    }catch(error){terminal.write(`${error.message}\n使用 download 保留原始 JSON。\n`,'stderr',true);}
  } else terminal.write('值班已結束。save 印出存檔代碼 · download 下載 JSON · start 開始新值班\n','system',true);
  await persist();refresh();
}
/** 匯出 dialog 下載按鈕呼叫；無參數 → undefined，將目前 save 交給 downloadJSON，僅產生使用者下載。 */
function downloadSave() {
  downloadJSON(engine.save,`${engine.nick}.rasave.json`);
}
/** 下載/救援按鈕呼叫；JSON 值/檔名 → undefined，建立 Blob URL 與暫時 anchor；點擊後移除並延遲撤銷 URL。 */
function downloadJSON(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=el('a',{href:url,download:name});
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
/**
 * resumeLocal 失敗呼叫；原 envelope → undefined，顯示原始紀錄備份與事件還原入口。
 * 不自動刪原檔；選還原先保存 RECOVERY_KEY 成功才匯入事件，避免失去任意檔案/cwd 的唯一紀錄。
 */
function showRecovery(envelope) {
  recoveryEnvelope=envelope;
  if(consoleView){terminal.write('本機紀錄無法完整重播。recover journal 下載原始紀錄；recover events 備份後只還原事件（不含任意檔案修改與 cwd）。\n','system',true);return;}
  document.querySelector('#local-recovery')?.remove();
  let valid=true;
  try{S.checkShape(envelope.save);}catch{valid=false;}
  const original=el('textarea',{id:'recovery-journal',readonly:true,rows:5,'aria-label':'本機原始操作紀錄'});original.value=JSON.stringify(envelope);
  const status=el('p',{role:'status',class:'quiet'});
  const panel=el('section',{id:'local-recovery',class:'recovery-panel'},el('h3',{},'保留本機紀錄'),
    el('p',{class:'quiet'},'原始紀錄尚未覆寫或刪除。備份包含當時輸入的指令與文字，不會上傳。「只還原事件」不會還原未記錄的任意檔案修改與工作目錄。'),
    runMode==='kiosk'?null:button('下載原始操作紀錄',()=>downloadJSON(envelope,'root-archipelago.rajournal.json'),{id:'download-journal'}),
    runMode==='kiosk'||!valid?null:button('下載已保存的 JSON',()=>downloadJSON(envelope.save,`${envelope.save.nick}.rasave.json`),{id:'download-recovery-save'}),
    el('details',{},el('summary',{},'或複製原始操作紀錄'),original,button('複製原始紀錄',()=>copyText(original.value,original,status)),status),
    button('只還原已保存事件（不含檔案改動）',()=>enqueue(()=>restoreRecoveryEvents(envelope)).catch(()=>{}),{id:'restore-events',disabled:!valid}));
  document.querySelector('.welcome-import').append(panel);
}
async function restoreRecoveryEvents(envelope) {
  const backup=recoveryWritable&&sessionStore.check().ok?await recoveryStore.write(envelope):{ok:false};
  if(!backup.ok)throw new Error('無法保留救援備份，或另一分頁已更新；請先下載或複製原始紀錄，再從 JSON 匯入。');
  await importSave(JSON.stringify(envelope.save),null);
}
/**
 * save 指令/結束/續玩已結束時呼叫；ended → Promise<void>，建立值班證、代碼與備份 dialog。
 * seal 可能更新 head；壞鏈保留原 JSON，clipboard/下載由明示按鈕觸發；返回時移除 dialog 並還焦點。
 */
async function showExport(ended) {
  if(!engine?.save)return;
  if(consoleView){await consoleExport(ended);return;}
  document.querySelector('dialog')?.remove();terminal.finish();
  endedShown=ended;
  let code='',warning='';
  if(!baseBroken)S.seal(engine.save);
  try {code=await S.exportCode(engine.save);}catch(error){warning=error.message+'。請下載原始 JSON。';}
  const score=S.score(engine.save),[level]=await S.level(engine.save);
  const state=score.time_up?'值班時間到（進度已保存）':score.finished?'完成':'進行中';
  // 匯出版面：DOM 值班證與代碼工具分區；純文字卡/原始 JSON 是備援，不將使用者字串插成 HTML。
  const card=el('article',{class:'duty-card','aria-label':'值班證'},el('p',{class:'eyebrow'},'ROOT ARCHIPELAGO'),el('h2',{},'值 班 證'),el('p',{class:'card-edition'},'試玩版〈第一夜〉'),
    el('dl',{},...Object.entries({'值班員':`op-${engine.nick}`,'稱號':score.title,'燈塔':`—（${state}）`,'耗時':S.fmtTime(score.seconds),'快題':`${score.tasks}/7`,'發現':`${score.finds}/${cfg.finds.length}`,'02:00 的訪客':score.vote==='block'?'擋':score.vote==='pass'?'放行':'—','存檔完整性':{intact:'完整',suspicious:'可疑',broken:'損毀'}[level]}).flatMap(([key,value])=>[el('dt',{},key),el('dd',{},value)])),el('p',{class:'card-signoff'},'燈我幫你留著。'));
  const textarea=el('textarea',{id:'save-code',readonly:true,rows:5,spellcheck:'false','aria-label':'存檔代碼'});textarea.value=code;
  const status=el('p',{id:'copy-status',role:'status',class:'quiet'});
  const cardText=await S.card(engine.save);
  const cardArea=el('textarea',{readonly:true,rows:8,class:'card-text','aria-label':'值班證純文字',hidden:true});cardArea.value=cardText;
  const rawArea=el('textarea',{id:'raw-save',readonly:true,rows:6,'aria-label':'原始 JSON 存檔'});rawArea.value=JSON.stringify(engine.save,null,2);
  const dialog=el('dialog',{'aria-label':ended?'值班結束與存檔':'儲存值班紀錄'});
  const tools=el('div',{class:'export-tools'},el('p',{class:'eyebrow'},ended?'SHIFT COMPLETE':'SAVE YOUR SHIFT'),el('h2',{},ended?'把這一夜留著。':'保存你的進度'),el('details',{open:true},el('summary',{},'這份代碼包含什麼'),el('p',{class:'quiet'},cfg.save.privacy+'不含裝置資訊；不會上傳。')),warning?el('p',{role:'alert',class:'error-message'},warning):null,engine.hostMode||engine.event==='host-led'?el('p',{class:'mode-notice'},'主持人共享紀錄，不供正式版個人匯入。'):null,el('label',{for:'save-code'},'存檔代碼'),textarea,
    el('div',{class:'export-actions'},button('複製代碼',()=>copyText(code,textarea,status),{id:'copy-code',disabled:!code}),button('複製值班證',async()=>{cardArea.hidden=false;await copyText(cardText,cardArea,status);},{id:'copy-card'}),runMode==='kiosk'?null:button('下載 JSON',downloadSave,{id:'download-save'})),cardArea,status,
    warning?el('details',{open:true},el('summary',{},'保留原始 JSON（代碼無法匯出）'),rawArea,button('複製原始 JSON',()=>copyText(rawArea.value,rawArea,status))):null,
    el('p',{class:'quiet'},'「完整」僅表示資料未損毀，不代表真實遊玩的證明。'),
    runMode==='kiosk'?el('label',{class:'clear-choice'},el('input',{id:'clear-local',type:'checkbox',checked:true,onChange:event=>{clearKiosk=event.target.checked;if(clearKiosk){kioskRecoveryBaseline=false;kioskRecoveryDone=false;}enqueue(()=>persist()).catch(()=>{});}}),' 清除本機存檔（預設清除）'):null,
    ended?button('重新開始',()=>enqueue(()=>resetWelcome(runMode==='kiosk'?clearKiosk:true)).catch(()=>{}),{id:'restart',class:'primary'}):button('回到終端機',()=>{dialog.close();dialog.remove();input.focus();},{id:'close-save'}));
  dialog.append(el('section',{id:ended?'end-screen':'export-content',class:'export-layout'},card,tools));
  dialog.addEventListener('cancel',event=>{if(ended)event.preventDefault();else{dialog.remove();input.focus();}});
  document.body.append(dialog);dialog.showModal();
  await persist();refresh();document.querySelector('#copy-code').focus();
}
/** 重開/kiosk idle/重播失敗呼叫；是否清主檔 → Promise<void>，銷毀 Terminal/dialog，守所有權刪除後重建歡迎頁。 */
async function resetWelcome(clear=true) {
  consoleView?.destroy();consoleView=null;
  document.querySelector('dialog')?.remove();terminal?.destroy();terminal=null;engine=null;
  if(clear&&localWritable){
    const removed=await sessionStore.clear();
    if(removed.ok&&runMode==='kiosk')await clearKioskRecovery();
  }
  saved=readLocal();journal=[];baseSave=null;history=[];shellMode='bash';
  shell();lastWall=performance.now();activity();if(consoleView)consoleView.focus();else document.querySelector('#new-game').focus();
}

// 頁面級排程：僅保留一個待執行 tick，和輸入共用 serial；kiosk 看真實活動，故事時間由 Engine 控制。
// timer 與全頁監聽在頁面卸載釋放；createGame/resetWelcome 僅重建局部 UI，不再註冊另一個 interval。
shell();
setInterval(()=>{
  if(tickPending||!engine)return;
  tickPending=true;
  enqueue(async()=>{
    if(runMode==='kiosk'&&performance.now()-lastActivity>=120000){await resetWelcome(true);return;}
    await syncClock();await persist();refresh();
    if(engine?.ended&&!endedShown)await showExport(true);
  }).catch(()=>{}).finally(()=>{tickPending=false;});
},250);
