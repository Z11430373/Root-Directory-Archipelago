/**
 * ============================================================================
 * 模組：ui/console-view.js — Bash 終端操作介面
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 依賴：ui/dom.js（el）、ui/terminal.js（Terminal）
 *   - 被：main.js（CONSOLE_COMMANDS/completionWord/completedWord/completionEnd）、ui/script-submissions.js
 * 職責：
 *   1. Bash 終端操作介面：輸出紀錄與目前提示符共用一個可捲動視窗。
 *   2. 管理行編輯、歷史搜尋、焦點監聽。
 *   3. completionWord/completedWord/completionEnd：Bash 風格字詞補全。
 *   4. commandLines：將多行文字拆分為命令行。
 * 設計原則：
 *   - 使用原生 textarea 保留中文組字、選取、剪貼簿與軟鍵盤。
 *   - destroy 解除觀察器和全頁監聽。
 *   - main.js 負責派送遊戲與工作階段命令。
 * ============================================================================
 */
import {el} from './dom.js';
import {Terminal} from './terminal.js';

export const CONSOLE_COMMANDS=['help','start','resume','import','task','status','history','clear','save','download','mode','theme','font','exit'];

/** Bash-style word boundaries for completion (quotes, escapes and pipeline command positions). */
export function completionWord(text) {
  let start=text.length,token='',quote=null,inWord=false,words=0;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(!quote&&'|;&'.includes(ch)){words=0;token='';inWord=false;start=i+1;continue;}
    if(!quote&&/\s/.test(ch)){if(inWord)words++;inWord=false;token='';start=i+1;continue;}
    if(!inWord){start=i;inWord=true;}
    if(ch==='\\'&&quote!=="'"&&i+1<text.length&&(quote!=='"'||['$','`','"','\\','\n'].includes(text[i+1]))){token+=text[++i];continue;}
    if(quote){if(ch===quote)quote=null;else token+=ch;}
    else if(ch==='"'||ch==="'")quote=ch;
    else token+=ch;
  }
  return {start,token,command:words===0,quote:['"',"'"].includes(text[start])?text[start]:null};
}

export function completedWord(value,quote,finished) {
  const suffix=finished&&!value.endsWith('/')?' ':'';
  if(quote==="'")return "'"+value.replace(/'/g,"'\\''")+(suffix?"' ":'');
  if(quote==='"')return '"'+value.replace(/[\\"$`]/g,'\\$&')+(suffix?'" ':'');
  return value.replace(/[\s\\'"$`*?\[\]()<>|;&]/g,'\\$&')+suffix;
}

/** 補全替換整個目前字詞，包含游標後原有的閉引號／尾字，避免重複插入。 */
export function completionEnd(text,start) {
  let quote=null;
  for(let i=start;i<text.length;i++) {
    const ch=text[i];
    if(ch==='\\'&&quote!=="'"){i++;continue;}
    if(quote){if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(/[\s|;&]/.test(ch))return i;
  }
  return text.length;
}

/** Split pasted commands at unquoted newlines, preserving quoted text and backslash continuations. */
export function commandLines(text) {
  const lines=[];
  let quote=null,start=0;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='\\'&&quote!=="'"){i++;continue;}
    if(quote){if(ch===quote)quote=null;continue;}
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='\n'){if(text.slice(start,i).trim())lines.push(text.slice(start,i));start=i+1;}
  }
  if(text.slice(start).trim())lines.push(text.slice(start));
  return lines;
}

export class ConsoleView {
  constructor({submit,cancel,complete,history,leave}) {
    this.history=history;this.cancel=cancel;this.complete=complete;this.leave=leave;
    this.index=history().length;this.draft='';this.search=null;this.busy=false;
    this.log=el('div',{id:'terminal',class:'console-log',role:'log','aria-label':'終端機輸出','aria-live':'polite','aria-relevant':'additions text'});
    this.prompt=el('label',{id:'prompt',for:'command-input',class:'console-prompt'});
    this.input=el('textarea',{id:'command-input',class:'console-input',rows:1,maxlength:1048576,autocomplete:'off',autocapitalize:'off',autocorrect:'off',spellcheck:'false','aria-label':'輸入工作階段指令','aria-describedby':'console-keys',enterkeyhint:'send'});
    this.searchLine=el('p',{class:'console-search',role:'status',hidden:true});
    this.form=el('form',{class:'console-command'},this.prompt,this.input);
    this.runState=el('p',{class:'console-run-state',role:'status',hidden:true},'執行中 · Ctrl+C 中斷');
    this.viewport=el('section',{class:'console-viewport',tabindex:0,'aria-label':'終端機捲動紀錄'},this.log,this.runState,this.searchLine,this.form);
    const keys=el('p',{id:'console-keys',class:'console-keys'},'game help 說明 · Tab 補全 · ↑↓ 歷史 · Ctrl+C 中斷 · Ctrl+L 清畫面 · F2 群島模式 · Shift+Tab 離開輸入');
    this.node=el('section',{class:'console-session','aria-label':'Bash 終端（模擬）','data-state':'ready'},this.viewport,keys);
    this.terminal=new Terminal(this.log,{viewport:this.viewport,instant:true,rawErrors:true});
    this.form.addEventListener('submit',event=>{
      event.preventDefault();
      if(this.busy)return;
      if(this.search){this.acceptSearch();return;}
      const raw=this.input.value;
      this.input.value='';this.resize();this.index=this.history().length+1;this.draft='';
      submit(raw);
    });
    this.input.addEventListener('keydown',event=>this.key(event));
    this.input.addEventListener('input',()=>{
      if(this.search){this.search.query=this.input.value;this.findHistory(true);}
      else {this.index=this.history().length;this.draft=this.input.value;}
      this.resize();
    });
    this.viewport.addEventListener('click',event=>{
      if(!getSelection()?.toString()&&!this.busy&&!event.target.closest('a,button,textarea'))this.input.focus({preventScroll:true});
    });
    this.onKey=event=>{
      if(this.busy&&event.ctrlKey&&event.key.toLowerCase()==='c'&&!getSelection()?.toString()) {
        event.preventDefault();this.cancel();
      }
    };
    document.addEventListener('keydown',this.onKey);
    this.observer=new ResizeObserver(()=>this.resize());
    this.observer.observe(this.input);
  }
  setPrompt(text,label) { this.prompt.textContent=text;this.input.setAttribute('aria-label',label); }
  setBusy(value) {
    this.busy=value;this.input.readOnly=value;
    this.node.dataset.state=value?'running':'ready';
    this.form.hidden=value;this.runState.hidden=!value;
    if(value)this.viewport.focus({preventScroll:true});
    else {this.index=this.history().length;this.resize();}
    this.terminal.scroll();
  }
  focus() { if(!this.busy)this.input.focus({preventScroll:true}); }
  resize() {
    // rows is a native attribute, so no inline styles or CSP exception is needed.
    if(!this.input.isConnected)return;
    const size=parseFloat(getComputedStyle(this.input).fontSize)||15;
    const columns=Math.max(1,Math.floor(this.input.clientWidth/(size*.62)));
    const rows=this.input.value.split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil([...line].reduce((n,c)=>n+(c.codePointAt(0)>255?2:1),0)/columns)),0);
    this.input.rows=Math.max(1,Math.min(12,rows));
  }
  replace(text,start=0,end=this.input.value.length) {
    this.input.setRangeText(text,start,end,'end');this.resize();
  }
  resetHistory() { this.index=this.history().length;this.draft=''; }
  acceptSearch() {
    const value=this.search.match??this.search.draft;
    this.search=null;this.searchLine.hidden=true;this.replace(value);
  }
  findHistory(reset=false) {
    const s=this.search,history=this.history();
    if(reset)s.index=history.length;
    let found=s.index-1;
    while(found>=0&&!history[found].includes(s.query))found--;
    s.match=found<0?null:history[found];s.index=found<0?0:found;
    this.searchLine.textContent=`(reverse-i-search) ${s.match??'找不到符合的命令'} · Enter 採用 / Esc 返回`;
  }
  key(event) {
    if(event.isComposing||event.keyCode===229)return;
    const key=event.key.toLowerCase(),ctrl=event.ctrlKey&&!event.altKey;
    if(this.busy)return;
    if(key==='f2'){event.preventDefault();this.leave();return;}
    if(ctrl&&key==='r') {
      event.preventDefault();
      if(!this.search){this.search={draft:this.input.value,query:'',index:this.history().length,match:null};this.input.value='';this.searchLine.hidden=false;}
      this.findHistory();this.resize();return;
    }
    if(this.search) {
      if(key==='escape'||(ctrl&&key==='c')){event.preventDefault();const draft=this.search.draft;this.search=null;this.searchLine.hidden=true;this.replace(draft);}
      else if(key==='enter'){event.preventDefault();this.acceptSearch();}
      return;
    }
    const {selectionStart:start,selectionEnd:end,value}=this.input;
    if(key==='enter'&&!event.shiftKey){event.preventDefault();this.form.requestSubmit();return;}
    if(ctrl&&key==='c') {
      if(start!==end||getSelection()?.toString())return;
      event.preventDefault();this.cancel();return;
    }
    if(ctrl&&key==='l'){event.preventDefault();this.terminal.clear();return;}
    if((ctrl&&['a','e','u','k','w'].includes(key))||['home','end'].includes(key)) {
      event.preventDefault();
      if(key==='a'||key==='home')this.input.setSelectionRange(0,event.shiftKey?end:0);
      else if(key==='e'||key==='end')this.input.setSelectionRange(event.shiftKey?start:value.length,value.length);
      else if(start!==end)this.replace('',start,end);
      else if(key==='u')this.replace('',0,start);
      else if(key==='k')this.replace('',start,value.length);
      else this.replace('',value.slice(0,start).replace(/\S+\s*$/,'').length,start);
      return;
    }
    if(key==='tab'&&!event.shiftKey){event.preventDefault();this.complete();this.resize();return;}
    if(key==='arrowup'||key==='arrowdown') {
      // Multiline editing keeps native vertical cursor motion inside the draft.
      if(key==='arrowup'&&value.slice(0,start).includes('\n')||key==='arrowdown'&&value.slice(end).includes('\n'))return;
      event.preventDefault();const history=this.history();
      if(this.index>=history.length)this.draft=value;
      this.index=Math.max(0,Math.min(history.length,this.index+(key==='arrowup'?-1:1)));
      this.replace(this.index===history.length?this.draft:history[this.index]||'');return;
    }
    if(key==='pageup'||key==='pagedown'){
      event.preventDefault();this.viewport.scrollTop+=(key==='pageup'?-1:1)*this.viewport.clientHeight*.85;
    }
  }
  destroy() { this.observer.disconnect();document.removeEventListener('keydown',this.onKey);this.terminal.destroy(); }
}
