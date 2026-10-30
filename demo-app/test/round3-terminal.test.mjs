import test from 'node:test';
import assert from 'node:assert/strict';
import {Terminal} from '../src/ui/terminal.js';

// Minimal DOM instrument: counts text rewrites and scrolls without shipping a
// test-only DOM dependency in the app. Real geometry is covered by R3-UI01/02.
function fixture(t) {
  const original=new Map(['document','matchMedia'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const media=new EventTarget();media.matches=false;
  const textNodes=[];
  class Node extends EventTarget {
    constructor(){super();this.children=[];this.attrs={};this._top=0;this.scrollWrites=0;this.rewrites=0;}
    append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);}}
    setAttribute(k,v){this.attrs[k]=v;}
    getAttribute(k){return this.attrs[k]??null;}
    get firstElementChild(){return this.children[0];}
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
    get textContent(){return this.children.map(n=>n.data??n.textContent).join('');}
    set textContent(text){this.rewrites++;this.children=[{data:text}];}
    get clientHeight(){return 100;}
    get scrollHeight(){return this.children.length*20;}
    get scrollTop(){return this._top;}
    set scrollTop(n){this.scrollWrites++;this._top=Math.max(0,Math.min(n,this.scrollHeight-this.clientHeight));}
  }
  Object.defineProperty(globalThis,'document',{configurable:true,value:{
    createElement:()=>new Node(),
    createTextNode:data=>{const n={data,appends:0,appendData(text){this.appends++;this.data+=text;}};textNodes.push(n);return n;},
  }});
  Object.defineProperty(globalThis,'matchMedia',{configurable:true,value:()=>media});
  const node=new Node(),terminal=new Terminal(node);
  t.after(()=>{terminal.destroy();for(const [key,descriptor] of original){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  return {node,terminal,media,textNodes};
}

test('R3 Terminal: finishing an idle log never scrolls it',t=>{
  const {node,terminal}=fixture(t);terminal.write('ready','system',true);
  const writes=node.scrollWrites;terminal.finish();terminal.finish();
  assert.equal(node.scrollWrites,writes);
});
test('R3 Terminal: animation appends Unicode to one text node rather than rewriting each prefix',t=>{
  const {node,terminal,textNodes}=fixture(t),content='燈🌊e\u0301'.repeat(2000);
  terminal.write(content);const line=node.firstElementChild,text=textNodes.at(-1);
  for(let i=0;i<25;i++){terminal.last=performance.now()-120;terminal.tick();}
  assert.ok(text.data.length>0&&text.data.length<content.length);assert.equal(line.rewrites,0);
  terminal.finish();assert.equal(line.textContent,content);assert.equal(line.children[0],text);
  assert.equal(node.getAttribute('aria-busy'),'false');assert.equal(terminal.timer,null);
});
test('R3 Terminal: reduced-motion changes finish queued text; destroy detaches media and pointer listeners',t=>{
  const {node,terminal,media}=fixture(t);terminal.write('first🌊');
  media.matches=true;media.dispatchEvent(new Event('change'));assert.equal(node.textContent,'first🌊');
  assert.equal(terminal.pending.length,0);terminal.destroy();
  let calls=0;terminal.finish=()=>{calls++;};media.dispatchEvent(new Event('change'));node.dispatchEvent(new Event('click'));
  assert.equal(calls,0);
});
test('R3 Terminal: bounded DOM also drops detached animation queue entries',t=>{
  const {node,terminal}=fixture(t);
  for(let i=0;i<1210;i++)terminal.write(`line ${i}\n`);
  assert.equal(node.children.length,1200);assert.equal(terminal.pending.length,1200);
  terminal.finish();assert.match(node.firstElementChild.textContent,/line 10/);assert.equal(terminal.timer,null);
});
test('R3 Terminal: consecutive queued lines keep following, but an explicit history scroll stays put',t=>{
  const {node,terminal}=fixture(t);
  for(let i=0;i<20;i++)terminal.write(`line ${i}\n`);
  assert.equal(terminal.followOutput,true);assert.equal(node.scrollTop,node.scrollHeight-node.clientHeight);
  node.scrollTop=0;node.dispatchEvent(new Event('scroll'));terminal.write('new idle line\n');terminal.finish();
  assert.equal(node.scrollTop,0);assert.equal(terminal.followOutput,false);
  terminal.follow();assert.equal(node.scrollTop,node.scrollHeight-node.clientHeight);
});
