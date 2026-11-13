/** Real VT terminal + a separate readline-like editor. Controller owns command echo/history. */
import {Terminal as Xterm} from '@xterm/xterm';
import {FitAddon} from '@xterm/addon-fit';
import {el} from './dom.js';
import {ConsoleLineEditor,graphemeOffsets} from './console-line-editor.js';

const RESET='\x1b[0m',PASTE='\x1b[?2004h';
const COLORS={stderr:'\x1b[33m',system:'\x1b[90m',hint:'\x1b[90m'};
const THEMES={
  dark:{background:'#080808',foreground:'#e6e6e6',cursor:'#e6e6e6',selectionBackground:'#466536',black:'#080808',red:'#ff8585',green:'#a9df83',yellow:'#ffd787',blue:'#8ab4f8',magenta:'#d7aefb',cyan:'#81d4db',white:'#e6e6e6',brightBlack:'#b8b8b8',brightRed:'#ffb0b0',brightGreen:'#c8f7a9',brightYellow:'#ffe9af',brightBlue:'#b4d0ff',brightMagenta:'#ebcdff',brightCyan:'#b1f2f7',brightWhite:'#ffffff'},
  contrast:{background:'#ffffff',foreground:'#101510',cursor:'#101510',selectionBackground:'#b8c8ee',black:'#101510',red:'#a00000',green:'#235200',yellow:'#704200',blue:'#123ca0',magenta:'#76228f',cyan:'#005567',white:'#dddddd',brightBlack:'#344435',brightRed:'#a00000',brightGreen:'#235200',brightYellow:'#704200',brightBlue:'#123ca0',brightMagenta:'#76228f',brightCyan:'#005567',brightWhite:'#ffffff'}
};
const plain=text=>String(text).replace(/[\x00-\x1f\x7f-\x9f]/g,'');

/**
 * Colorize a bash-style prompt: `user@host:path$ ` gets per-segment colors.
 * Other formats (e.g. `口令: `, `archipelago$ `) are returned with flat green.
 */
function colorizePrompt(promptText) {
  // Match `user@host:path$ ` or `user@host(branch):path$ ` patterns
  const match=/^([^@\s]+@[^:\s]+)(:[^\$#\n]+)([\$#] )$/.exec(promptText);
  if(!match) return '\x1b[32m'+plain(promptText)+RESET;
  const [,userhost,colonPath,dollar]=match;
  return '\x1b[1;32m'+plain(userhost)+RESET+plain(colonPath[0])+'\x1b[1;34m'+plain(colonPath.slice(1))+RESET+plain(dollar);
}

/**
 * xterm 6 creates three dynamic style nodes during open(). A nonce belongs only
 * to those styles. The temporary factory also covers Viewport's mainDocument,
 * which 6.0.0 does not reliably obtain from documentOverride. Never left patched.
 */
function openWithNonce(term,node) {
  const doc=node.ownerDocument,nonce=typeof __XTERM_STYLE_NONCE__!=='undefined'?__XTERM_STYLE_NONCE__:doc.querySelector('style[nonce]')?.nonce;
  if(!nonce){term.open(node);return;}
  const own=Object.getOwnPropertyDescriptor(doc,'createElement'),original=doc.createElement;
  Object.defineProperty(doc,'createElement',{configurable:true,writable:true,value:function(tag,...args){
    const element=original.call(doc,tag,...args);if(String(tag).toLowerCase()==='style')element.nonce=nonce;return element;
  }});
  try{term.open(node);}finally{if(own)Object.defineProperty(doc,'createElement',own);else delete doc.createElement;}
}

// Only a conservative viewport bound, NOT cursor-width calculation. Actual
// cursor coordinates below come from xterm's parsed cells (CJK/combining/emoji).
function clipAroundCursor(before,after,cols,rows) {
  const budget=Math.max(cols,Math.floor((rows-3)/2)*cols);
  const clip=(text,reverse)=>{
    const offsets=graphemeOffsets(text),points=offsets.slice(0,-1).map((offset,index)=>text.slice(offset,offsets[index+1]));if(reverse)points.reverse();let used=0,result=[];
    for(const ch of points){used+=ch==='\n'?cols+2:Array.from(ch).length*2;if(used>budget)break;result.push(ch);}
    if(reverse)result.reverse();return result.join('');
  };
  const left=clip(before,true),right=clip(after,false);
  return {before:left,after:right,leftClipped:left.length<before.length,rightClipped:right.length<after.length};
}

export class XtermConsoleView {
  constructor({submit,cancel,complete,history,leave}) {
    this.promptText='';this.label='輸入 Bash 或遊戲指令';this.busy=false;this.secret=false;
    this.entries=[];this.followOutput=true;this.destroyed=false;this.mounted=false;this.chain=Promise.resolve();this.anchor=null;
    this.mountNode=el('div',{id:'terminal',class:'xterm-console-mount',role:'region',tabindex:0,'aria-label':'終端機捲動紀錄'});
    this.status=el('p',{class:'xterm-console-status',role:'status',hidden:true});
    const keys=el('p',{id:'console-keys',class:'console-keys'},'game help 說明 · Tab 補全 · ↑↓ 歷史 · Ctrl+R 搜尋 · Ctrl+C 複製／中斷 · Ctrl+L 清畫面 · F2 群島模式 · Shift+Tab 離開輸入');
    this.node=el('section',{class:'console-session xterm-console','aria-label':'Bash 終端（模擬）','data-state':'ready'},this.mountNode,this.status,keys);
    this.xterm=new Xterm({cols:80,rows:24,scrollback:1200,convertEol:true,cursorBlink:true,cursorStyle:'block',fontFamily:'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", "Noto Sans Mono CJK TC", "Microsoft JhengHei", monospace',fontSize:15,lineHeight:1.25,theme:THEMES.dark,allowProposedApi:true,screenReaderMode:true,scrollOnUserInput:true});
    this.fit=new FitAddon();this.xterm.loadAddon(this.fit);
    this.editor=new ConsoleLineEditor({
      submit:raw=>{this.setBusy(true);submit(raw);},cancel,complete,history,leave,
      change:()=>this.requestRender(),clear:()=>this.terminal.clear(),
      bell:()=>{this.status.textContent='找不到符合的命令';},scroll:direction=>{this.xterm.scrollPages(direction);this.followOutput=false;}
    });
    this.terminal={
      write:(text,kind='dialogue',instant=false)=>this.write(text,kind,instant),
      finish:()=>this.chain,follow:()=>{this.followOutput=true;this.scroll();},scroll:()=>this.scroll(),
      clear:()=>this.clear(),destroy:()=>this.destroy(),
      snapshot:()=>this.entries.map(entry=>({...entry})),restore:entries=>this.restore(entries)
    };
    this.subscriptions=[this.xterm.onData(data=>{
      if((this.inKeyPress||this.inKeyDown)&&data.charCodeAt(0)>=32&&!data.startsWith('\x1b'))this.keyPressEmitted=true;
      const candidates=this.editor.input(data);
      if(candidates.length>1){
        // bash-like columnar display
        const maxLen=Math.max(...candidates.map(c=>c.length));
        const colW=maxLen+2;
        const cols=Math.max(1,Math.floor(this.xterm.cols/colW));
        const lines=[];
        for(let i=0;i<candidates.length;i+=cols){
          lines.push(candidates.slice(i,i+cols).map(c=>c.padEnd(colW)).join('').trimEnd());
        }
        this.write(lines.join('\n')+'\n','dialogue',true);
      }
    }),this.xterm.onScroll(()=>{
      if(!this.writing)this.followOutput=this.xterm.buffer.active.viewportY>=this.xterm.buffer.active.baseY;
    })];
    // xterm 6 suppresses insertText input events in screenReaderMode. Preserve
    // its real accessibility tree while forwarding only unhandled DOM text
    // input through the PUBLIC Terminal.input -> onData path. Keypress echo and
    // composition remain xterm-owned, preventing duplicate Latin/IME input.
    this.onInputKeyDown=()=>{this.keyPressEmitted=false;this.inKeyDown=true;};
    this.onInputKeyDownBubble=()=>{this.inKeyDown=false;};
    this.onInputKeyUp=()=>{this.inKeyDown=false;this.inKeyPress=false;this.keyPressEmitted=false;};
    this.onKeyPressCapture=()=>{this.inKeyPress=true;};
    this.onKeyPressBubble=()=>{this.inKeyPress=false;};
    this.onCompositionStart=()=>{clearTimeout(this.compositionTimer);this.composing=true;};
    this.onCompositionEnd=()=>{this.compositionTimer=setTimeout(()=>{this.composing=false;},0);};
    this.onTextInput=event=>{
      if(event.target===this.input&&event.inputType==='insertText'&&event.data&&!event.isComposing&&!this.composing&&!this.keyPressEmitted)this.xterm.input(event.data,true);
      this.keyPressEmitted=false;
    };
    this.onHistoryKey=event=>{
      if(event.target!==this.mountNode)return;
      const key=event.key;
      if(!['PageUp','PageDown','Home','End','ArrowUp','ArrowDown','Enter'].includes(key))return;
      event.preventDefault();
      if(key==='Enter'){this.focus();return;}
      if(key==='Home')this.xterm.scrollToTop();
      else if(key==='End')this.xterm.scrollToBottom();
      else if(key==='ArrowUp'||key==='ArrowDown')this.xterm.scrollLines(key==='ArrowUp'?-1:1);
      else this.xterm.scrollPages(key==='PageUp'?-1:1);
      this.followOutput=key==='End';
    };
    this.mountNode.addEventListener('keydown',this.onInputKeyDown,true);
    this.mountNode.addEventListener('keydown',this.onInputKeyDownBubble);
    this.mountNode.addEventListener('keyup',this.onInputKeyUp,true);
    this.mountNode.addEventListener('keypress',this.onKeyPressCapture,true);
    this.mountNode.addEventListener('keypress',this.onKeyPressBubble);
    this.mountNode.addEventListener('compositionstart',this.onCompositionStart,true);
    this.mountNode.addEventListener('compositionend',this.onCompositionEnd,true);
    this.mountNode.addEventListener('input',this.onTextInput);
    this.mountNode.addEventListener('keydown',this.onHistoryKey);
    this.xterm.attachCustomKeyEventHandler(event=>{
      if(event.isComposing||event.keyCode===229)return true;
      if(event.type!=='keydown')return true;
      if(event.key==='Tab'&&event.shiftKey)return false;
      // Plain PageUp/Down normally emit CSI through onData. CoreService first
      // applies scrollOnUserInput, so successive PageUps otherwise all start
      // from the bottom. Paging is viewport navigation, never editor input.
      if(['PageUp','PageDown'].includes(event.key)&&!event.ctrlKey&&!event.altKey&&!event.metaKey){
        event.preventDefault();this.xterm.scrollPages(event.key==='PageUp'?-1:1);
        this.followOutput=this.xterm.buffer.active.viewportY>=this.xterm.buffer.active.baseY;
        return false;
      }
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='c'&&this.hasSelection())return false;
      if(event.key==='F2'){event.preventDefault();leave();return false;}
      if(event.key==='Escape'){event.preventDefault();this.editor.escape();return false;}
      if(event.key==='Enter'&&event.shiftKey){event.preventDefault();this.editor.paste('\n');return false;}
      return true;
    });
    this.onBusyCancel=event=>{
      if(this.busy&&event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='c'&&!this.node.contains(event.target)&&!this.hasSelection()&&!document.getSelection()?.toString()){
        event.preventDefault();cancel();
      }
    };
    document.addEventListener('keydown',this.onBusyCancel);
    this.observer=new ResizeObserver(()=>this.resize());
    this.observer.observe(this.mountNode);
  }
  /** Call after appending .node. .input is the real xterm helper textarea. */
  mount() {
    if(this.mounted||this.destroyed||!this.node.isConnected)return;
    this.mounted=true;openWithNonce(this.xterm,this.mountNode);
    this.input=this.xterm.textarea;this.input.id='command-input';
    this.input.setAttribute('aria-label',this.label);this.input.setAttribute('aria-describedby','console-keys');
    this.input.setAttribute('enterkeyhint','send');
    this.xterm.write(PASTE);this.resize();
  }
  enqueue(operation) {
    this.chain=this.chain.then(async()=>{if(!this.destroyed&&this.mounted)await operation();}).catch(error=>{
      if(!this.destroyed){this.status.hidden=false;this.status.textContent=`終端顯示錯誤：${error.message}`;}
    });return this.chain;
  }
  bytes(text) {
    if(this.destroyed||!text)return Promise.resolve();
    return new Promise(resolve=>this.xterm.write(text,resolve));
  }
  async eraseEditor() {
    if(!this.anchor)return;
    const {marker,column}=this.anchor,buffer=this.xterm.buffer.active;
    const row=marker.isDisposed?-1:marker.line-buffer.baseY;
    if(row<0){
      // Prompt scrolled out of view; just reset and let renderEditor write a fresh prompt
      marker.dispose();this.anchor=null;
      await this.bytes(RESET);
      return;
    }
    await this.bytes(RESET+`\x1b[${row+1};${Math.min(column,this.xterm.cols-1)+1}H\x1b[J`);
    marker.dispose();this.anchor=null;
  }
  async renderEditor() {
    if(this.busy||this.destroyed)return;
    const buffer=this.xterm.buffer.active;
    this.anchor={marker:this.xterm.registerMarker(0),column:buffer.cursorX};
    const leading=buffer.cursorX?'\r\n':'';
    const search=this.editor.search;
    const text=this.secret?'':search?(search.match??''):this.editor.text;
    const cursor=this.secret?0:search?text.length:this.editor.end;
    const prefix=search?`(reverse-i-search) '${plain(search.query)}': `:this.promptText;
    const clipped=clipAroundCursor(text.slice(0,cursor),text.slice(cursor),this.xterm.cols,this.xterm.rows);
    const continuation=value=>value.replace(/\t/g,'    ').replace(/\n/g,'\r\n\x1b[90m> '+RESET);
    await this.bytes(leading+(clipped.leftClipped?'\x1b[32m… '+RESET:colorizePrompt(prefix))+continuation(clipped.before));
    // Resolve deferred right-margin wrapping before capturing the insertion cell.
    if(buffer.cursorX>=this.xterm.cols)await this.bytes(' \b');
    const cursorMarker=this.xterm.registerMarker(0),column=buffer.cursorX;
    await this.bytes(continuation(clipped.after)+(clipped.rightClipped?'…':'')+RESET);
    const row=Math.max(0,cursorMarker.line-buffer.baseY);
    await this.bytes(`\x1b[${row+1};${Math.min(column,this.xterm.cols-1)+1}H`);
    cursorMarker.dispose();
    this.status.hidden=!search&&!this.busy;
    if(search)this.status.textContent=`歷史搜尋：${search.query} · ${search.match??'找不到符合的命令'} · Enter 採用 / Esc 返回`;
    // Ensure the prompt line is always visible after render
    if(this.followOutput) this.xterm.scrollToBottom();
  }
  requestRender() {
    if(this.renderPending||this.destroyed)return;
    this.renderPending=true;
    this.enqueue(async()=>{this.renderPending=false;this.writing=true;try{await this.eraseEditor();await this.renderEditor();}finally{this.writing=false;}this.scroll();});
    // Before mount there is no queued render; mount/resize will redraw the draft.
    if(!this.mounted)this.renderPending=false;
  }
  write(text,kind='dialogue',instant=false) {
    if(text===undefined||text===null||text==='')return;
    text=String(text);this.entries.push({text,kind});if(this.entries.length>1200)this.entries.splice(0,this.entries.length-1200);
    this.enqueue(async()=>{
      this.writing=true;
      try{await this.eraseEditor();await this.bytes((COLORS[kind]||RESET)+text+RESET);await this.renderEditor();}
      finally{this.writing=false;}this.scroll();
    });
  }
  scroll(){if(this.mounted&&!this.destroyed&&this.followOutput)this.xterm.scrollToBottom();}
  clear() {
    this.entries=[];this.followOutput=true;
    this.enqueue(async()=>{await this.eraseEditor();await this.bytes('\x1b[2J\x1b[3J\x1b[H'+RESET+PASTE);await this.renderEditor();this.scroll();});
  }
  restore(entries) {
    this.entries=(Array.isArray(entries)?entries:[]).filter(entry=>entry&&typeof entry.text==='string').slice(-1200).map(({text,kind})=>({text,kind:typeof kind==='string'?kind:'dialogue'}));
    const snapshot=this.entries.map(entry=>({...entry}));
    this.enqueue(async()=>{
      await this.eraseEditor();await this.bytes('\x1b[2J\x1b[3J\x1b[H'+RESET+PASTE);
      for(const {text,kind} of snapshot)await this.bytes((COLORS[kind]||RESET)+text+RESET);
      await this.renderEditor();this.scroll();
    });
  }
  setPrompt(text,label=this.label){this.promptText=String(text);this.label=label;this.input?.setAttribute('aria-label',label);this.requestRender();}
  setBusy(value){this.busy=!!value;this.editor.setBusy(value);this.node.dataset.state=value?'running':'ready';this.status.hidden=!value;this.status.textContent=value?'執行中 · Ctrl+C 中斷':'';this.requestRender();}
  setSecret(value){if(this.secret===!!value)return;this.secret=!!value;this.editor.setSecret(value);}
  setPreferences({theme,font}={}) {
    this.xterm.options.theme=THEMES[theme]||THEMES.dark;
    this.xterm.options.fontSize={small:13,medium:15,large:18}[font]||15;this.resize();
  }
  focus(){if(!this.mounted)this.mount();if(!this.destroyed)this.xterm.focus();}
  resize() {
    if(!this.mounted||this.destroyed||this.resizePending)return;
    this.resizePending=true;
    this.enqueue(async()=>{
      this.resizePending=false;
      if(!this.mountNode.clientWidth||!this.mountNode.clientHeight)return;
      this.writing=true;
      try{await this.eraseEditor();this.fit.fit();await this.renderEditor();}finally{this.writing=false;}
      this.scroll();
    });
  }
  resetHistory(){this.editor.resetHistory();}
  getDraft(){return this.editor.getDraft();}
  setDraft(text,start,end){this.editor.setDraft(text,start,end);}
  hasSelection(){return !this.destroyed&&this.xterm.hasSelection();}
  getSelection(){return this.destroyed?'':this.xterm.getSelection();}
  destroy() {
    if(this.destroyed)return;this.destroyed=true;
    this.observer.disconnect();document.removeEventListener('keydown',this.onBusyCancel);
    clearTimeout(this.compositionTimer);
    this.mountNode.removeEventListener('keydown',this.onInputKeyDown,true);
    this.mountNode.removeEventListener('keydown',this.onInputKeyDownBubble);
    this.mountNode.removeEventListener('keyup',this.onInputKeyUp,true);
    this.mountNode.removeEventListener('keypress',this.onKeyPressCapture,true);
    this.mountNode.removeEventListener('keypress',this.onKeyPressBubble);
    this.mountNode.removeEventListener('compositionstart',this.onCompositionStart,true);
    this.mountNode.removeEventListener('compositionend',this.onCompositionEnd,true);
    this.mountNode.removeEventListener('input',this.onTextInput);
    this.mountNode.removeEventListener('keydown',this.onHistoryKey);
    for(const subscription of this.subscriptions)subscription.dispose();
    this.anchor?.marker.dispose();this.anchor=null;this.editor.destroy();this.entries=[];this.xterm.dispose();
  }
}
