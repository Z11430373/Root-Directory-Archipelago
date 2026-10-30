import { el } from './dom.js';

export class Terminal {
  constructor(node) {
    this.node = node;
    this.pending = [];
    this.timer = null;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.last = performance.now();
    this.node.addEventListener('click', () => this.finish());
  }
  write(text, kind='dialogue', instant=false) {
    if (!text) return;
    const line = el('div', {class:`terminal-line ${['dialogue','stdout','stderr','system','hint','command'].includes(kind)?kind:'dialogue'}`});
    this.node.append(line);
    if (instant || this.reduced.matches || kind==='command') {
      this.finish();
      line.textContent = kind==='stderr' ? `[錯誤] ${text}` : text;
      this.scroll();
    } else {
      const content = kind==='stderr' ? `[錯誤] ${text}` : text;
      this.pending.push({line,chars:Array.from(content),index:0});
      this.node.setAttribute('aria-busy','true');
      if (!this.timer) { this.last=performance.now(); this.timer=setInterval(()=>this.tick(),12); }
    }
    // Bound DOM growth without truncating the engine's portable save.
    while (this.node.children.length > 1200) this.node.firstElementChild.remove();
  }
  tick() {
    let budget=Math.max(1,Math.floor((performance.now()-this.last)/12));
    this.last=performance.now();
    while(budget>0 && this.pending.length) {
      const item=this.pending[0], take=Math.min(budget,item.chars.length-item.index);
      item.index+=take;
      item.line.textContent=item.chars.slice(0,item.index).join('');
      budget-=take;
      if(item.index>=item.chars.length) this.pending.shift();
    }
    if(!this.pending.length) this.stop();
    this.scroll();
  }
  stop() { clearInterval(this.timer); this.timer=null; this.node.setAttribute('aria-busy','false'); }
  finish() {
    for(const item of this.pending) item.line.textContent=item.chars.join('');
    this.pending=[];
    this.stop();
    this.scroll();
  }
  scroll() { this.node.scrollTop=this.node.scrollHeight; }
  destroy() { this.finish(); }
}
