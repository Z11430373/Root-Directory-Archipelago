import {DATA} from './data.js';
import {Engine} from './engine/index.js';
import * as S from './save/index.js';
import {readLocal,writeLocal,PREFS_KEY,RECOVERY_KEY,checkJournal,appendAdvance} from './storage.js';
import {el,button,copyText} from './ui/dom.js';
import {Terminal} from './ui/terminal.js';
import {sanitizePreferences,resolvePreferences,styleDescription} from './ui/preferences.js';
import {createSessionStorage} from './ui/session-storage.js';

const cfg=DATA.yaml['demo/demo.yaml'];
const runMode=['kiosk','host'].includes(new URLSearchParams(location.search).get('mode'))?new URLSearchParams(location.search).get('mode'):'self';
const app=document.querySelector('#app');
const compact=matchMedia('(max-width: 760px)');
let lastCompact=compact.matches;
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
function viewportHeight(){viewportStyle?.setProperty('--viewport-height',`${window.visualViewport?.height||window.innerHeight}px`);updateCompact();}
window.visualViewport?.addEventListener('resize',viewportHeight);
window.addEventListener('resize',viewportHeight);
viewportHeight();
let engine=null, terminal=null, journal=[], baseSave=null, baseBroken=false, restoring=false;
let history=[],historyIndex=0,historyDraft='', serial=Promise.resolve(),tickPending=false;
let lastWall=performance.now(),lastActivity=performance.now(),endedShown=false,clearKiosk=true;
let kioskRecoveryBaseline=false,kioskRecoveryDone=false;
const sessionStore=createSessionStorage(),recoveryStore=createSessionStorage({key:RECOVERY_KEY});
const initialLocal=sessionStore.load(),initialRecovery=recoveryStore.load();
let localWritable=initialLocal.ok,recoveryWritable=initialRecovery.ok;
let saved=initialLocal.ok?initialLocal.value:null,prefs=sanitizePreferences(readLocal(PREFS_KEY));
let input,log,prompt,taskTitle,taskPrompt,hintState,clock,saveStatus,findCount,game,welcome,welcomeError;
const conflictMessage='另一分頁已更新存檔，已停止本頁自動存檔；可先用 save 匯出本頁進度，再重新載入。';
function saveMessage(text) {if(saveStatus&&saveStatus.textContent!==text)saveStatus.textContent=text;}
window.addEventListener('storage',event=>{
  try {if(event.storageArea!==globalThis.localStorage)return;}catch{return;}
  sessionStore.observe(event);recoveryStore.observe(event);
  if(sessionStore.conflicted)saveMessage(conflictMessage);
});

function enqueue(fn) {
  const operation=serial.then(fn);
  serial=operation.catch(error=>{
    const message=error instanceof Error?error.message:String(error);
    if(terminal) terminal.write(`[系統] ${message}\n`,'system',true);
    if(welcomeError) welcomeError.textContent=message;
  });
  return operation;
}
function activity() { lastActivity=performance.now(); }
for(const event of ['keydown','pointerdown','input']) document.addEventListener(event,activity,{passive:true});
document.addEventListener('keydown',()=>terminal?.finish(),{capture:true});
document.addEventListener('click',()=>terminal?.finish(),{capture:true});

function applyPreferences() {
  const {theme,font,style}=resolvePreferences(prefs,{prefersLight:matchMedia('(prefers-color-scheme: light)').matches,hostMode:runMode==='host'});
  document.documentElement.dataset.theme=theme;
  document.documentElement.dataset.font=font;
  document.documentElement.dataset.style=style;
  const description=document.querySelector('#style-description');
  if(description)description.textContent=styleDescription(style);
  return {theme,font,style};
}
function settings() {
  const current=applyPreferences();
  const style=el('select',{id:'visual-style','aria-label':'介面風格','aria-describedby':'style-description'},el('option',{value:'islands'},'群島介面'),el('option',{value:'server'},'Server 終端'));
  const theme=el('select',{id:'theme','aria-label':'顯示主題'},el('option',{value:'dark'},'深色'),el('option',{value:'contrast'},'高對比'));
  const font=el('select',{id:'font-size','aria-label':'終端機字級'},...['small','medium','large'].map((size,i)=>el('option',{value:size},['小','中','大'][i])));
  style.value=current.style; theme.value=current.theme; font.value=current.font;
  style.addEventListener('change',()=>{prefs.style=style.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  theme.addEventListener('change',()=>{prefs.theme=theme.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  font.addEventListener('change',()=>{prefs.font=font.value;applyPreferences();writeLocal(prefs,PREFS_KEY);});
  return el('div',{class:'settings'},el('label',{},'風格 ',style),el('label',{},'主題 ',theme),el('label',{},'字級 ',font));
}
function shell() {
  app.replaceChildren();
  const header=el('header',{class:'masthead'},el('a',{href:'#',class:'wordmark',onClick:event=>event.preventDefault()},'ROOT / ARCHIPELAGO'),el('span',{class:'edition'},'試玩版〈第一夜〉'),el('span',{class:'offline'},'● 離線・不收集資料'),settings());
  welcomeError=el('p',{id:'welcome-error',role:'status',class:'error-message'});
  const code=el('textarea',{id:'import-code',rows:3,spellcheck:'false','aria-label':'貼上存檔代碼或 JSON','aria-describedby':'welcome-error',placeholder:'RA1-…',maxlength:1_048_576});
  const file=el('input',{type:'file',accept:'.json,.rasave.json,text/plain',id:'import-file','aria-label':'匯入自己的存檔檔案','aria-describedby':'welcome-error'});
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
  welcome=el('main',{id:'welcome',class:'welcome'},
    el('section',{class:'welcome-story'},el('p',{class:'eyebrow'},'ROOT ARCHIPELAGO / DEMO 01'),el('h1',{},'根目錄群島',el('span',{},'第一夜')),el('p',{class:'pitch'},cfg.pitch),el('div',{class:'start-actions'},button('開始值班 →',()=>enqueue(()=>startNew()).catch(()=>{}),{id:'new-game',class:'primary'}),saved?button('繼續上次的存檔',()=>enqueue(()=>resumeLocal()).catch(()=>{}),{id:'continue-game'}):null),el('p',{class:'quiet'},'約 15 分鐘　／　原生 JavaScript　／　所有指令都在模擬世界執行'),el('p',{id:'style-description',class:'quiet'},styleDescription(document.documentElement.dataset.style))),
    el('section',{class:'welcome-import'},el('p',{class:'eyebrow'},'CONTINUE YOUR SHIFT'),el('h2',{},'帶著存檔回來'),el('label',{for:'import-code'},'貼上自己的存檔代碼'),code,button('匯入並繼續',()=>enqueue(()=>importSave(code.value)).catch(()=>{}),{id:'import-submit'}),el('details',{},el('summary',{},'或選擇 .rasave.json 檔案'),file),el('p',{class:'quiet'},'代碼只含暱稱、種子、事件與時間；不含真實姓名、IP 或裝置資訊。'),welcomeError),
    el('footer',{class:'welcome-footer'},el('span',{},'29 個指令。一座燈塔。'),el('span',{},runMode==='self'?'SELF-SERVE':runMode.toUpperCase())));
  game=el('main',{id:'game',class:'game',hidden:true});
  app.append(header,welcome,game);
}

function createGame() {
  terminal?.destroy();
  game.replaceChildren();
  welcome.hidden=true; game.hidden=false;
  endedShown=false; clearKiosk=true;kioskRecoveryBaseline=false;kioskRecoveryDone=false;
  clock=el('span',{id:'clock',class:'clock','aria-label':'值班經過時間'},'00:00');
  const bar=el('div',{class:'terminal-bar'},el('span',{class:'window-dots','aria-hidden':'true'},'● ● ●'),el('span',{id:'host-label'},'lighthouse / main'),clock);
  log=el('div',{id:'terminal',class:'terminal',role:'log','aria-live':'polite','aria-relevant':'additions text','aria-label':'終端機輸出',tabindex:'0'});
  terminal=new Terminal(log);
  prompt=el('label',{id:'prompt',for:'command-input',class:'prompt'},'暱稱 > ');
  input=el('input',{id:'command-input',type:'text',autocomplete:'off',autocapitalize:'off',autocorrect:'off',spellcheck:'false',maxlength:4096,'aria-label':'輸入暱稱','aria-describedby':'keyboard-help',disabled:true});
  const form=el('form',{class:'command-form'},prompt,input,el('button',{type:'submit','aria-label':'執行指令',class:'execute'},'↵'));
  form.addEventListener('submit',event=>{
    event.preventDefault();
    if(input.disabled) return;
    const raw=input.value; input.value=''; input.disabled=true;
    enqueue(async()=>{await syncClock();await feedInput(raw);}).catch(()=>{}).finally(()=>{input.disabled=false;if(!document.querySelector('dialog[open]'))input.focus();});
  });
  input.addEventListener('keydown',inputKey);
  taskTitle=el('h2',{id:'task-title'},'目前任務');
  taskPrompt=el('p',{id:'task-prompt'});
  hintState=el('p',{id:'hint-state',class:'hint-state'},'提示 ○ ○ ○');
  findCount=el('strong',{id:'discoveries'},'0 / 12');
  saveStatus=el('p',{id:'save-status',class:'save-status',role:'status','data-head':''},'尚未開始');
  const panel=el('details',{class:'task-panel',open:!compact.matches},el('summary',{id:'panel-summary'},'值班面板'),el('div',{class:'panel-content'},el('p',{class:'eyebrow'},'CURRENT TASK'),taskTitle,taskPrompt,hintState,button('下一階提示',()=>quickCommand('hint'),{class:'hint-button'}),el('div',{class:'panel-stats'},el('span',{},'發現'),findCount),el('div',{class:'panel-save'},el('span',{},'本機存檔'),saveStatus),el('p',{class:'quiet'},'Tab 補全 · ↑↓ 歷史',el('br'), 'hint 提示 · skip 兩次跳題'),el('p',{id:'session-mode-notice',class:'mode-notice',hidden:true})));
  const chips=el('nav',{class:'chips','aria-label':'指令快捷按鈕'},...cfg.ui.command_chips.map(command=>button(command,()=>{
    if(command==='hint'||command==='save')quickCommand(command);
    else {input.value=command+' ';input.focus();}
  },{'aria-label':command==='hint'?'執行 hint':command==='save'?'執行 save':`填入 ${command}`})));
  const keyboardHelp=el('p',{id:'keyboard-help',class:'keyboard-help'},'Tab 補全 · ↑↓ 歷史 · Shift+Tab 離開輸入欄 · 終端機輸出可用 PageUp／PageDown 捲動');
  game.append(el('section',{class:'workspace'},el('section',{class:'terminal-window'},bar,log,form),panel),chips,keyboardHelp,el('div',{class:'game-footer'},el('span',{},'模擬 Shell，不會更動你的電腦。'),el('span',{},runMode.toUpperCase())));
  history=[];historyIndex=0;historyDraft='';
}
function output(text,kind) { terminal?.write(text,kind,restoring); }
function options() {return {seed:5,event:runMode==='host'?'host-led':'demo-event-1',mode:runMode,onOutput:output};}
async function startNew() {
  document.querySelector('dialog')?.remove();
  createGame(); journal=[];baseSave=null;baseBroken=false;
  engine=new Engine(options());
  await engine.start();lastWall=performance.now();activity();
  refresh();input.disabled=false;input.focus();
}
async function importSave(text,field=document.querySelector('#import-code')) {
  try {await importCandidate(text);}
  catch(error) {
    if(field){field.setAttribute('aria-invalid','true');field.focus();}
    throw error;
  }
}
async function importCandidate(text) {
  const save=text.trimStart().startsWith('{')?await S.importFile(text):await S.importCode(text);
  const [level]=await S.level(save);
  // Admission can reject a shape-valid older save that has no continuation
  // budget. Do not replace the visible session/journal before this succeeds.
  const candidate=await Engine.fromSave(save,{...options(),mode:save.event==='host-led'?'host':'self',seed:save.seed,event:save.event,onOutput:()=>{}});
  createGame();journal=[];baseSave=JSON.parse(JSON.stringify(save));baseBroken=level==='broken';
  engine=candidate;engine.onOutput=output;
  output(`[系統] 存檔完整性：${{intact:'完整',suspicious:'可疑',broken:'損毀'}[level]}。\n`,'system');
  output('[系統] 代碼保留事件進度，不包含任意 Shell 檔案修改、工作目錄與未記錄的輸入。\n','system');
  lastWall=performance.now();activity();await persist();refresh();input.disabled=false;
  if(engine.ended)await showExport(true);else input.focus();
}
async function resumeLocal() {
  const read=sessionStore.load();localWritable=read.ok;
  if(!read.ok)throw new Error('本機存檔無法安全讀取；原始資料未覆寫，請保留備份或使用代碼。');
  const envelope=read.value;
  if(!envelope)throw new Error('找不到可繼續的本機存檔。請貼上存檔代碼。');
  if(!envelope.save) {await importSave(JSON.stringify(envelope));return;}
  try {
    S.checkShape(envelope.save);
    if(envelope.version!==1||!checkJournal(envelope.journal))throw new Error('本機操作紀錄格式錯誤，請保留原始紀錄後還原事件進度。');
    if(envelope.baseSave)S.checkShape(envelope.baseSave);
    createGame();restoring=true;
    journal=JSON.parse(JSON.stringify(envelope.journal));baseSave=envelope.baseSave||null;
    baseBroken=baseSave?(await S.level(baseSave))[0]==='broken':false;
    const mode=['self','kiosk','host','host_led'].includes(envelope.runMode)?envelope.runMode:envelope.save.event==='host-led'?'host':'self';
    const replayOptions={...options(),mode,seed:envelope.save.seed,event:envelope.save.event};
    engine=baseSave?await Engine.fromSave(baseSave,replayOptions):new Engine(replayOptions);
    if(!baseSave)await engine.start();
    for(const step of journal) {
      if(step.type==='advance')await engine.advance(step.dt);
      else {echoInput(step.raw);await engine.feed(step.raw,step.dt);}
    }
    if(!baseBroken)S.seal(engine.save);
    if((engine.save.head||null)!==(envelope.save.head||null))throw new Error('本機重播的鏈尾不同。請改用存檔代碼或 JSON。');
    output('[系統] 已從本機操作紀錄還原。\n','system');
  } catch(error) {
    await resetWelcome(false);
    showRecovery(envelope);
    throw error;
  } finally {restoring=false;lastWall=performance.now();activity();if(engine){input.disabled=false;refresh();}}
  if(engine.ended)await showExport(true);else input.focus();
}
function promptText() {
  if(!engine)return '';
  if(engine.inputMode==='input')return engine.mode[2].expect_input.store?'暱稱 > ':'口令 > ';
  if(engine.inputMode==='choice')return 'block / pass > ';
  const host=engine.world==='ch1'?'logport':'lighthouse';
  const home=engine.vfs.home,cwd=engine.vfs.cwd;
  const path=cwd===home?'~':cwd.startsWith(home+'/')?'~'+cwd.slice(home.length):cwd;
  return `op-${engine.nick||'guest'}@${host}${engine.branch==='main'?'':`(${engine.branch})`}:${path}$ `;
}
function echoInput(raw) {
  if(!raw.trim())return;
  terminal.write(promptText()+raw+'\n','command',true);
  if(engine.inputMode!=='input'){history.push(raw);historyIndex=history.length;}
}
async function feedInput(raw) {
  terminal.follow();terminal.finish();echoInput(raw);
  await engine.feed(raw,0);
  journal.push({type:'input',raw,dt:0});
  await persist();refresh();
  if(engine.ended&&!endedShown)await showExport(true);
  else if(/^save(?:\s|$)/.test(raw.trim())&&engine.save)await showExport(false);
}
function quickCommand(raw) {
  if(!input||input.disabled)return;
  if(engine?.inputMode==='input'&&engine.mode[2].expect_input.store==='player.nick')return;
  input.value=raw;
  input.form.requestSubmit();
}
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
  const result=await sessionStore.write({version:1,runMode:engine.runMode,save:engine.save,baseSave,journal});
  saved=result.ok?readLocal():saved;
  saveMessage(result.ok?'● 已自動存檔':result.reason==='conflict'?conflictMessage:'未能自動存檔，請保留代碼');
}
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
function refresh() {
  if(!engine||!input)return;
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
function inputKey(event) {
  if(event.isComposing)return;
  if(event.key==='ArrowUp'||event.key==='ArrowDown'){
    event.preventDefault();
    if(historyIndex===history.length)historyDraft=input.value;
    historyIndex=Math.max(0,Math.min(history.length,historyIndex+(event.key==='ArrowUp'?-1:1)));
    input.value=historyIndex===history.length?historyDraft:history[historyIndex];
  } else if(event.key==='Tab'){
    if(event.shiftKey)return;
    event.preventDefault();
    const before=input.value.slice(0,input.selectionStart),match=before.match(/(?:^|\s)([^\s]*)$/);
    if(!match)return;
    const token=match[1],start=before.length-token.length;
    let candidates=[];
    if(start===0)candidates=cfg.command_whitelist.filter(command=>command.startsWith(token));
    else {
      const slash=token.lastIndexOf('/'),dir=slash>=0?token.slice(0,slash+1):'',part=token.slice(slash+1);
      try {candidates=engine.vfs.list(dir||'.',{all:true}).filter(name=>name.startsWith(part)).map(name=>dir+name+(engine.vfs.isDirectory(dir+name)?'/':''));}catch{/* No completion for a nonexistent directory. */}
    }
    if(candidates.length===1){const value=candidates[0]+(candidates[0].endsWith('/')?'':' ');input.setRangeText(value,start,input.selectionStart,'end');}
    else if(candidates.length>1){let prefix=candidates[0];while(prefix&&!candidates.every(candidate=>candidate.startsWith(prefix)))prefix=prefix.slice(0,-1);if(prefix.length>token.length)input.setRangeText(prefix,start,input.selectionStart,'end');else terminal.write(candidates.join('  ')+'\n','system',true);}
  } else if(event.key==='c'&&event.ctrlKey&&engine.inputMode==='input'&&engine.mode[2].expect_input.secret){event.preventDefault();input.value='';input.form.requestSubmit();}
}
function downloadSave() {
  downloadJSON(engine.save,`${engine.nick}.rasave.json`);
}
function downloadJSON(value,name) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  const anchor=el('a',{href:url,download:name});
  document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function showRecovery(envelope) {
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
    button('只還原已保存事件（不含檔案改動）',()=>enqueue(async()=>{
      const backup=recoveryWritable&&sessionStore.check().ok?await recoveryStore.write(envelope):{ok:false};
      if(!backup.ok)throw new Error('無法保留救援備份，或另一分頁已更新；請先下載或複製原始紀錄，再從 JSON 匯入。');
      await importSave(JSON.stringify(envelope.save),null);
    }).catch(()=>{}),{id:'restore-events',disabled:!valid}));
  document.querySelector('.welcome-import').append(panel);
}
async function showExport(ended) {
  if(!engine?.save)return;
  document.querySelector('dialog')?.remove();terminal.finish();
  endedShown=ended;
  let code='',warning='';
  if(!baseBroken)S.seal(engine.save);
  try {code=await S.exportCode(engine.save);}catch(error){warning=error.message+'。請下載原始 JSON。';}
  const score=S.score(engine.save),[level]=await S.level(engine.save);
  const state=score.time_up?'值班時間到（進度已保存）':score.finished?'完成':'進行中';
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
async function resetWelcome(clear=true) {
  document.querySelector('dialog')?.remove();terminal?.destroy();terminal=null;engine=null;
  if(clear&&localWritable){
    const removed=await sessionStore.clear();
    if(removed.ok&&runMode==='kiosk')await clearKioskRecovery();
  }
  saved=readLocal();journal=[];baseSave=null;history=[];
  shell();lastWall=performance.now();activity();document.querySelector('#new-game').focus();
}

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
