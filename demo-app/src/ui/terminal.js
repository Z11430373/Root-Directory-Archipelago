import { el } from './dom.js';

export class Terminal {
  constructor(node) {
    this.node = node;
    this.pending = [];
    this.timer = null;
    this.node.setAttribute('aria-busy','false');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.last = performance.now();
    this.followOutput = true;
    this.onScroll = () => { this.followOutput = this.atBottom(); };
    this.onClick = () => this.finish();
    this.onMotion = () => { if (this.reduced.matches) this.finish(); };
    this.node.addEventListener('scroll', this.onScroll, {passive:true});
    this.node.addEventListener('click', this.onClick);
    this.reduced.addEventListener('change', this.onMotion);
  }
  write(text, kind='dialogue', instant=false) {
    if (!text) return;
    // Check before changing the height: a scroll event may not have arrived yet.
    this.followOutput = this.atBottom();
    if (instant || this.reduced.matches || kind==='command') this.finish();
    const line = el('div', {class:`terminal-line ${['dialogue','stdout','stderr','system','hint','command'].includes(kind)?kind:'dialogue'}`});
    this.node.append(line);
    if (instant || this.reduced.matches || kind==='command') {
      line.textContent = kind==='stderr' ? `[錯誤] ${text}` : text;
    } else {
      const content = kind==='stderr' ? `[錯誤] ${text}` : text;
      const textNode = document.createTextNode('');
      line.append(textNode);
      this.pending.push({line,textNode,chars:Array.from(content),index:0});
      this.node.setAttribute('aria-busy','true');
      if (!this.timer) { this.last=performance.now(); this.timer=setInterval(()=>this.tick(),12); }
    }
    // Bound DOM growth without truncating the engine's portable save.
    while (this.node.children.length > 1200) {
      const first=this.node.firstElementChild, top=this.node.scrollTop, height=this.node.scrollHeight;
      first.remove();
      this.pending=this.pending.filter(item=>item.line!==first);
      if (!this.followOutput) this.node.scrollTop=Math.max(0,top-(height-this.node.scrollHeight));
    }
    this.scroll();
  }
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
  stop() { clearInterval(this.timer); this.timer=null; this.node.setAttribute('aria-busy','false'); }
  finish() {
    if(!this.pending.length)return;
    for(const item of this.pending) item.textNode.appendData(item.chars.slice(item.index).join(''));
    this.pending=[];
    this.stop();
    this.scroll();
  }
  atBottom() { return this.node.scrollHeight-this.node.clientHeight-this.node.scrollTop<=2; }
  scroll() { if(this.followOutput)this.node.scrollTop=this.node.scrollHeight; }
  follow() { this.followOutput=true;this.scroll(); }
  destroy() {
    this.pending=[];this.stop();
    this.node.removeEventListener('scroll',this.onScroll);
    this.node.removeEventListener('click',this.onClick);
    this.reduced.removeEventListener('change',this.onMotion);
  }
}
