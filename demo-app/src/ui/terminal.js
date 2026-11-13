/**
 * UI 終端輸出呈現器；依賴 dom.js，main.js 將 Engine 成功提交的文字交給 write。
 * 管文字動畫、aria-busy、歷史捲動與 1200 列上限，不修改引擎/存檔。
 * 建構會綁元素/媒體事件，動畫期間有 interval；替換畫面前必須 destroy。
 */
import { el } from './dom.js';

export class Terminal {
  /** main.createGame 呼叫；log DOM → 新實例，綁 scroll/click/reduced-motion 監聽，由 destroy 對稱解除。 */
  constructor(node, {viewport=node, instant=false, rawErrors=false}={}) {
    this.node = node;
    this.viewport = viewport;
    this.instant = instant;
    this.rawErrors = rawErrors;
    this.pending = [];
    this.timer = null;
    this.node.setAttribute('aria-busy','false');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.last = performance.now();
    this.followOutput = true;
    // 三個閉包各處理使用者捲動/點擊/媒體變更；保存函式身份才能在 destroy 移除同一監聽。
    this.onScroll = () => { this.followOutput = this.atBottom(); };
    this.onClick = () => this.finish();
    this.onMotion = () => { if (this.reduced.matches) this.finish(); };
    this.viewport.addEventListener('scroll', this.onScroll, {passive:true});
    this.node.addEventListener('click', this.onClick);
    this.reduced.addEventListener('change', this.onMotion);
  }
  /** main.output/回顯呼叫；文字/種類/立即顯示 → undefined，新增安全文字列或排動畫，必要時裁掉最舊 DOM。 */
  write(text, kind='dialogue', instant=false) {
    if (!text) return;
    instant ||= this.instant;
    // Check before changing the height: a scroll event may not have arrived yet.
    this.followOutput = this.atBottom();
    if (instant || this.reduced.matches || kind==='command') this.finish();
    const line = el('div', {class:`terminal-line ${['dialogue','stdout','stderr','system','hint','command'].includes(kind)?kind:'dialogue'}`});
    this.node.append(line);
    if (instant || this.reduced.matches || kind==='command') {
      line.textContent = kind==='stderr' && !this.rawErrors ? `[錯誤] ${text}` : text;
    } else {
       const content = kind==='stderr' && !this.rawErrors ? `[錯誤] ${text}` : text;
      const textNode = document.createTextNode('');
      line.append(textNode);
      this.pending.push({line,textNode,chars:Array.from(content),index:0});
      this.node.setAttribute('aria-busy','true');
      if (!this.timer) { this.last=performance.now(); this.timer=setInterval(()=>this.tick(),12); }
    }
    // Bound DOM growth without truncating the engine's portable save.
    while (this.node.children.length > 1200) {
      const first=this.node.firstElementChild, top=this.viewport.scrollTop, height=this.viewport.scrollHeight;
      first.remove();
      this.pending=this.pending.filter(item=>item.line!==first);
      if (!this.followOutput) this.viewport.scrollTop=Math.max(0,top-(height-this.viewport.scrollHeight));
    }
    this.scroll();
  }
  /** 12ms interval 呼叫；無參數 → undefined，依實際經過時間追加 Unicode 碼點，佇列空即 stop。 */
  tick() {
    let budget=Math.max(1,Math.floor((performance.now()-this.last)/12));
    this.last=performance.now();
    while(budget>0 && this.pending.length) {
      const item=this.pending[0], take=Math.min(budget,item.chars.length-item.index);
      item.textNode.appendData(item.chars.slice(item.index,item.index+take).join(''));
      item.index+=take;
      budget-=take;
      if(item.index>=item.chars.length) this.pending.shift();
    }
    if(!this.pending.length) this.stop();
    this.scroll();
  }
  /** tick/finish/destroy 呼叫；無參數 → undefined，清 interval 並取消 aria-busy，不移除既有文字。 */
  stop() { clearInterval(this.timer); this.timer=null; this.node.setAttribute('aria-busy','false'); }
  /** 使用者互動/減少動態/回顯前呼叫；無參數 → undefined，補完所有排隊字元並停 timer，不新增遊戲事件。 */
  finish() {
    if(!this.pending.length)return;
    for(const item of this.pending) item.textNode.appendData(item.chars.slice(item.index).join(''));
    this.pending=[];
    this.stop();
    this.scroll();
  }
  /** write/scroll handler 呼叫；無參數 → 是否距底部兩像素內，唯讀幾何值。 */
  atBottom() { return this.viewport.scrollHeight-this.viewport.clientHeight-this.viewport.scrollTop<=2; }
  /** write/tick/finish 呼叫；無參數 → undefined，只有追隨輸出時移動 scrollTop，尊重回捲讀者。 */
  scroll() { if(this.followOutput)this.viewport.scrollTop=this.viewport.scrollHeight; }
  /** Clear only the visible transcript; command history and game state belong to the controller. */
  clear() { this.finish();this.node.replaceChildren();this.follow(); }
  /** Operating-mode handoff uses text records rather than renderer-specific DOM nodes. */
  snapshot() {
    this.finish();
    return [...this.node.children].map(line=>({text:line.textContent,kind:[...line.classList].find(name=>name!=='terminal-line')||'dialogue'}));
  }
  restore(entries) {
    this.clear();
    for(const {text,kind} of entries)this.write(text,kind,true);
  }
  /** main.feedInput 呼叫；無參數 → undefined，使用者送新指令時明示回到底部並恢復追隨。 */
  follow() { this.followOutput=true;this.scroll(); }
  /** main.createGame/resetWelcome 呼叫；無參數 → undefined，丟動畫、停 timer、卸除三種監聽；DOM 由 main 移除。 */
  destroy() {
    this.pending=[];this.stop();
    this.viewport.removeEventListener('scroll',this.onScroll);
    this.node.removeEventListener('click',this.onClick);
    this.reduced.removeEventListener('change',this.onMotion);
  }
}
