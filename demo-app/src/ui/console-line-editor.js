/**
 * ============================================================================
 * 模組：ui/console-line-editor.js — Readline-like 編輯器（xterm onData）
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：ui/xterm-console.js（ConsoleLineEditor）、ui/script-submissions.js（needsContinuation）
 * 職責：
 *   1. graphemeOffsets()：文字 → grapheme 偏移陣列（Intl.Segmenter 或 fallback）。
 *   2. ConsoleLineEditor：Readline-like 編輯（移動/刪除/歷史/搜尋）。
 *   3. needsContinuation()：判斷是否需要續行（未閉合引號/括號/管線）。
 * 設計原則：
 *   - 無 DOM 或 shell 執行；純編輯邏輯。
 *   - 使用 Intl.Segmenter 處理 grapheme cluster（中文/emoji）。
 * ============================================================================
 */
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
const ESC='\x1b';
const noop=()=>{};

export function graphemeOffsets(text) {
  const offsets=segmenter?[...segmenter.segment(text)].map(part=>part.index):[];
  if(!segmenter){let i=0;for(const char of text){offsets.push(i);i+=char.length;}}
  offsets.push(text.length);return offsets;
}
function boundary(text,index) {
  index=Math.max(0,Math.min(text.length,Number.isFinite(index)?index:text.length));
  const points=graphemeOffsets(text);return points.findLast?points.findLast(point=>point<=index):points.filter(point=>point<=index).at(-1);
}
function previous(text,index) {return graphemeOffsets(text).filter(point=>point<index).at(-1)??0;}
function next(text,index) {return graphemeOffsets(text).find(point=>point>index)??text.length;}
const clean=text=>String(text).replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g,'');

/**
 * Shared PS2 / pasted-script boundary probe. This recognizes lexical open state
 * and compound-command terminators; execution and syntax errors belong to Bash.
 * Heredoc bodies are opaque, with quote removal and <<- tab stripping.
 */
export function needsContinuation(text) {
  text=String(text).replace(/\r\n?/g,'\n');
  const tokens=[],groups=[],heredocs=[];
  let quote=null,escape=false,comment=false,word='',started=false,quoted=false,delimiter=null;
  const finish=()=>{
    if(!started)return;
    if(delimiter){heredocs.push({text:word,tabs:delimiter==='<<-'});delimiter=null;}
    else tokens.push({value:word,quoted,type:'word'});
    word='';started=false;quoted=false;
  };
  const openExpansion=(index,enclosingQuote)=>{
    const opener=text[index+1];
    // Shell words outside an expansion must not be flushed by its whitespace,
    // parentheses or separators. Preserve that scope, including queued heredocs.
    groups.push({close:opener==='('?')':'}',quote:enclosingQuote,expansion:true,
      kind:opener==='{'?'parameter':text[index+2]==='('?'arithmetic':'command',
      index,word,quoted,delimiter,tokenStart:tokens.length,heredocs:heredocs.splice(0)});
    word='';started=false;quoted=false;delimiter=null;quote=null;
  };
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(comment&&ch!=='\n')continue;
    if(ch==='\n')comment=false;
    if(escape){escape=false;if(ch!=='\n'){word+=ch;started=true;}continue;}
    if(ch==='\\'&&quote!=="'"){escape=true;quoted=true;continue;}
    if(quote){
      if(ch===quote)quote=null;
      else if(quote==='"'&&ch==='$'&&['(','{'].includes(text[i+1])){openExpansion(i,quote);i++;}
      else word+=ch;
      continue;
    }
    let expansion;
    for(let j=groups.length-1;j>=0;j--)if(groups[j].expansion){expansion=groups[j];break;}
    if(ch==='#'&&!started&&(!expansion||expansion.kind==='command')){comment=true;continue;}
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;quoted=true;started=true;continue;}
    if(ch==='$'&&['(','{'].includes(text[i+1])){openExpansion(i,null);i++;continue;}
    if(groups.length&&ch===groups.at(-1).close){
      const group=groups.pop();
      finish();
      if(group.expansion){
        if(heredocs.length||delimiter)return true;
        tokens.length=group.tokenStart;heredocs.push(...group.heredocs);
        word=group.word+text.slice(group.index,i+1);started=true;quoted=group.quoted;delimiter=group.delimiter;
      }else tokens.push({value:ch,type:'op'});
      quote=group.quote;continue;
    }
    // Arithmetic shift operators and parameter '#' are not shell redirections
    // or comments. Only command-substitution bodies have shell token grammar.
    if(expansion?.kind==='parameter'||expansion?.kind==='arithmetic'&&!['(',')'].includes(ch)){word+=ch;started=true;continue;}
    if(ch===' '||ch==='\t'||ch==='\n') {
      finish();
      if(ch==='\n'){
        tokens.push({value:'\n',type:'op'});
        // Consume each queued here-document before resuming shell lexing.
        while(heredocs.length){
          if(i>=text.length-1)return true;
          const end=text.indexOf('\n',i+1),stop=end<0?text.length:end;
          const line=text.slice(i+1,stop),doc=heredocs[0];
          if((doc.tabs?line.replace(/^\t+/,''):line)===doc.text)heredocs.shift();
          i=stop;
          if(i===text.length&&heredocs.length)return true;
        }
      }
      continue;
    }
    if('();|&<>'.includes(ch)) {
      finish();
      const op=[';;&','<<<','<<-','&&','||',';;',';&','<<','>>','<&','>&','|&'].find(value=>text.startsWith(value,i))||ch;
      if(op==='<<'||op==='<<-')delimiter=op;
      else tokens.push({value:op,type:'op'});
      if(op==='(')groups.push({close:')',quote:null});
      i+=op.length-1;continue;
    }
    word+=ch;started=true;
  }
  finish();
  if(quote||escape||groups.length||heredocs.length||delimiter)return true;
  const blocks=[];let commandStart=true,pendingFunction=false,operatorPending=false;
  for(let i=0;i<tokens.length;i++) {
    const token=tokens[i],value=token.value,top=blocks.at(-1);
    if(token.type==='op') {
      if(['|','|&','&&','||'].includes(value)){operatorPending=true;commandStart=true;}
      else if([';','\n','&'].includes(value))commandStart=true;
      else if([';;',';&',';;&'].includes(value)){if(top?.end==='esac')top.pattern=true;commandStart=true;}
      else if(value===')'){if(top?.end==='esac')top.pattern=false;commandStart=true;}
      else if(value==='('){pendingFunction=false;commandStart=true;}
      continue;
    }
    if(top?.end==='esac'&&top.header&&value==='in'&&!token.quoted){top.header=false;top.pattern=true;commandStart=true;continue;}
    if(top?.end==='esac'&&top.pattern&&value!=='esac')continue;
    if(top?.end===']]'&&value===']]'&&!token.quoted){blocks.pop();commandStart=false;operatorPending=false;continue;}
    if(commandStart&&!token.quoted) {
      if(value===top?.end){blocks.pop();commandStart=false;operatorPending=false;continue;}
      if(value==='if'){blocks.push({end:'fi'});pendingFunction=false;commandStart=true;continue;}
      if(['for','select','while','until'].includes(value)){blocks.push({end:'done'});pendingFunction=false;commandStart=value==='while'||value==='until';continue;}
      if(value==='case'){blocks.push({end:'esac',header:true,pattern:false});pendingFunction=false;commandStart=false;continue;}
      if(['then','else','elif','do'].includes(value)){commandStart=true;continue;}
      if(value==='{'){blocks.push({end:'}'});pendingFunction=false;commandStart=true;continue;}
      if(value==='[['){blocks.push({end:']]'});commandStart=false;continue;}
      if(value==='function'){pendingFunction=true;commandStart=false;continue;}
      if(/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)&&tokens[i+1]?.value==='('&&tokens[i+2]?.value===')'){pendingFunction=true;i+=2;commandStart=true;continue;}
    }
    // `function name { ...; }` has no command separator before its body.
    if(pendingFunction&&value==='{'&&!token.quoted){blocks.push({end:'}'});pendingFunction=false;commandStart=true;continue;}
    if(pendingFunction&&tokens[i+1]?.value==='('&&tokens[i+2]?.value===')'){i+=2;commandStart=true;continue;}
    commandStart=false;operatorPending=false;
  }
  return blocks.length>0||pendingFunction||operatorPending;
}

export class ConsoleLineEditor {
  constructor({submit=noop,cancel=noop,complete=()=>null,history=()=>[],change=noop,clear=noop,leave=noop,bell=noop,scroll=noop}={}) {
    Object.assign(this,{submit,cancel,complete,history,change,clear,leave,bell,scroll});
    this.text='';this.start=0;this.end=0;this.busy=false;this.secret=false;this.search=null;
    this.kill='';this.pending='';this.pasting=false;this.pasteText='';this.revision=0;
    this.resetHistory();
  }
  getDraft(){return {text:this.text,start:this.start,end:this.end};}
  setDraft(text,start=String(text).length,end=start) {
    this.text=clean(text);this.start=boundary(this.text,start);this.end=boundary(this.text,end);
    if(this.start>this.end)[this.start,this.end]=[this.end,this.start];
    this.search=null;this.edited();
  }
  edited(history=true) {
    this.revision++;
    if(history){this.index=this.history().length;this.draft=this.getDraft();}
    this.change();
  }
  setBusy(value){this.busy=!!value;if(!value)this.index=this.history().length;}
  setSecret(value){this.secret=!!value;this.search=null;this.kill='';this.resetHistory();this.change();}
  resetHistory(){this.index=this.history().length;this.draft=this.getDraft();this.search=null;}
  replace(value,start=this.start,end=this.end) {
    const insert=clean(value);this.text=this.text.slice(0,start)+insert+this.text.slice(end);
    this.start=this.end=start+insert.length;this.edited();
  }
  move(position){this.start=this.end=boundary(this.text,position);this.edited(false);}
  lineStart(){return this.text.lastIndexOf('\n',this.start-1)+1;}
  lineEnd(){const end=this.text.indexOf('\n',this.end);return end<0?this.text.length:end;}
  wordLeft(){return this.text.slice(0,this.start).replace(/\S+\s*$/u,'').length;}
  wordRight(){const match=this.text.slice(this.end).match(/^\s*\S+/u);return this.end+(match?.[0].length||0);}
  remove(start,end){if(start===end)return;this.kill=this.text.slice(start,end);this.replace('',start,end);}
  vertical(direction) {
    const start=this.lineStart(),end=this.lineEnd();
    if(direction<0&&start>0){const prevStart=this.text.lastIndexOf('\n',start-2)+1;this.move(Math.min(start-1,prevStart+this.start-start));return;}
    if(direction>0&&end<this.text.length){const nextEnd=this.text.indexOf('\n',end+1);this.move(Math.min(nextEnd<0?this.text.length:nextEnd,end+1+this.start-start));return;}
    this.navigateHistory(direction);
  }
  navigateHistory(direction) {
    if(this.secret)return;
    const history=this.history();
    if(this.index>=history.length)this.draft=this.getDraft();
    this.index=Math.max(0,Math.min(history.length,this.index+direction));
    const value=this.index===history.length?this.draft:{text:history[this.index]||'',start:(history[this.index]||'').length,end:(history[this.index]||'').length};
    Object.assign(this,value);this.edited(false);
  }
  reverseSearch() {
    if(this.secret)return;
    if(!this.search)this.search={draft:this.getDraft(),query:'',index:this.history().length,match:null};
    this.findHistory(false);
  }
  findHistory(reset=true) {
    const s=this.search,history=this.history();if(reset)s.index=history.length;
    let index=s.index-1;while(index>=0&&!history[index].includes(s.query))index--;
    if(index>=0){s.index=index;s.match=history[index];}else this.bell();
    this.change();
  }
  endSearch(accept) {
    const value=accept&&this.search.match!==null?{text:this.search.match,start:this.search.match.length,end:this.search.match.length}:this.search.draft;
    this.search=null;Object.assign(this,value);this.edited();
  }
  requestCompletion() {
    if(this.secret)return;
    const result=this.complete({text:this.text,cursor:this.end});
    if(!result)return;
    if(typeof result.text==='string')this.setDraft(result.text,result.cursor??result.text.length);
    return result.candidates;
  }
  enter() {
    if(this.search){this.endSearch(true);return;}
    if(!this.secret&&needsContinuation(this.text)){this.replace('\n');return;}
    const raw=this.text;
    this.text='';this.start=this.end=0;this.search=null;this.resetHistory();
    // Submit first: the view can remove the old editor before controller output.
    this.submit(raw);this.edited();
  }
  cancelInput() {
    if(this.busy){this.cancel();return;}
    if(this.search){this.endSearch(false);return;}
    // Controller sees the original draft, and owns ^C / secret-mode semantics.
    this.cancel();this.text='';this.start=this.end=0;this.kill='';this.resetHistory();this.edited();
  }
  paste(text) {
    if(this.busy)return;
    if(this.search){this.search.query+=clean(text);this.findHistory();return;}
    this.replace(text);
  }
  handle(sequence) {
    if(sequence==='\x03'){this.cancelInput();return;}
    if(sequence==='\x1bOQ'||sequence==='\x1b[12~'){this.leave();return;}
    if(this.busy)return;
    if(sequence==='\x0c'){this.clear();return;}
    if(sequence==='\x12'){this.reverseSearch();return;}
    if(this.search){
      if(sequence===ESC||sequence==='\x07'){this.endSearch(false);return;}
      if(sequence==='\r'||sequence==='\n'){this.endSearch(true);return;}
      if(sequence==='\x7f'||sequence==='\b'){this.search.query=this.search.query.slice(0,previous(this.search.query,this.search.query.length));this.search.match=null;this.findHistory();return;}
      if(sequence.charCodeAt(0)>=32&&!sequence.startsWith(ESC)){this.search.query+=sequence;this.search.match=null;this.findHistory();return;}
      this.endSearch(true);
    }
    switch(sequence) {
      case '\r':case '\n':this.enter();break;
      case '\t':return this.requestCompletion();
      case '\x1b[A':case '\x1bOA':this.vertical(-1);break;
      case '\x1b[B':case '\x1bOB':this.vertical(1);break;
      case '\x10':this.navigateHistory(-1);break;
      case '\x0e':this.navigateHistory(1);break;
      case '\x1b[D':case '\x1bOD':case '\x02':this.move(this.start!==this.end?this.start:previous(this.text,this.start));break;
      case '\x1b[C':case '\x1bOC':case '\x06':this.move(this.start!==this.end?this.end:next(this.text,this.end));break;
      case '\x1b[H':case '\x1bOH':case '\x1b[1~':case '\x1b[7~':case '\x01':this.move(this.lineStart());break;
      case '\x1b[F':case '\x1bOF':case '\x1b[4~':case '\x1b[8~':case '\x05':this.move(this.lineEnd());break;
      case '\x1bb':case '\x1b[1;5D':this.move(this.wordLeft());break;
      case '\x1bf':case '\x1b[1;5C':this.move(this.wordRight());break;
      case '\x1b<':this.move(0);break;
      case '\x1b>':this.move(this.text.length);break;
      case '\b':case '\x7f':this.replace('',this.start===this.end?previous(this.text,this.start):this.start,this.end);break;
      case '\x1b[3~':case '\x04':this.replace('',this.start,this.start===this.end?next(this.text,this.end):this.end);break;
      case '\x15':this.remove(this.start!==this.end?this.start:this.lineStart(),this.end);break;
      case '\x0b':this.remove(this.start,this.start!==this.end?this.end:this.lineEnd());break;
      case '\x17':case '\x1b\x7f':this.remove(this.start!==this.end?this.start:this.wordLeft(),this.end);break;
      case '\x1bd':this.remove(this.start,this.start!==this.end?this.end:this.wordRight());break;
      case '\x19':this.replace(this.kill);break;
      case '\x14': {
        if(this.start!==this.end||!this.start)break;
        const right=this.start===this.text.length?this.start:next(this.text,this.start),middle=previous(this.text,right),left=previous(this.text,middle);
        this.replace(this.text.slice(middle,right)+this.text.slice(left,middle),left,right);break;
      }
      case '\x1b[5~':this.scroll(-1);break;
      case '\x1b[6~':this.scroll(1);break;
      default:if(sequence.charCodeAt(0)>=32&&!sequence.startsWith(ESC))this.replace(sequence);
    }
  }
  /** Handles split CSI/bracketed-paste frames; pasted CR/LF never means Enter. */
  input(data) {
    // xterm emits each browser paste as one complete frame. Use its OUTER end
    // marker so a literal pasted ESC[201~ cannot turn later newlines into Enter.
    if(!this.pending&&!this.pasting&&data.startsWith('\x1b[200~')&&data.endsWith('\x1b[201~')){this.paste(data.slice(6,-6));return [];}
    // A multi-line plain onData packet is a paste even if mode 2004 has not
    // reached the terminal parser yet (e.g. immediately after mounting).
    if(!this.pending&&!this.pasting&&data.length>1&&/[\r\n]/.test(data)&&!data.includes(ESC)){this.paste(data);return [];}
    this.pending+=data;const candidates=[];
    while(this.pending) {
      if(this.pasting) {
        const end=this.pending.indexOf('\x1b[201~');
        if(end<0){const keep=Math.min(5,this.pending.length);this.pasteText+=this.pending.slice(0,-keep);this.pending=this.pending.slice(-keep);break;}
        this.pasteText+=this.pending.slice(0,end);this.pending=this.pending.slice(end+6);this.pasting=false;this.paste(this.pasteText);this.pasteText='';continue;
      }
      if(this.pending.startsWith('\x1b[200~')){this.pending=this.pending.slice(6);this.pasting=true;continue;}
      let sequence;
      if(this.pending[0]===ESC) {
        if(this.pending.length===1)break;
        if(this.pending[1]==='[') {const match=this.pending.match(/^\x1b\[[0-?]*[ -/]*[@-~]/);if(!match)break;sequence=match[0];}
        else if(this.pending[1]==='O'){if(this.pending.length<3)break;sequence=this.pending.slice(0,3);}
        else sequence=this.pending.slice(0,2);
      } else {
        // Batch ordinary text, including composition results, into one edit.
        sequence=this.pending.match(/^[^\x00-\x1f\x7f]+/u)?.[0]||this.pending[0];
      }
      this.pending=this.pending.slice(sequence.length);const list=this.handle(sequence);
      if(Array.isArray(list)&&list.length)candidates.push(...list);
    }
    return candidates;
  }
  escape(){if(this.pending===ESC)this.pending='';this.handle(ESC);}
  destroy(){this.pending='';this.pasteText='';this.text='';this.kill='';this.search=null;this.change=noop;}
}
