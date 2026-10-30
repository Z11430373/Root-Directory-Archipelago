import test from 'node:test';
import assert from 'node:assert/strict';
import {readLocal,writeLocal,clearLocal,checkJournal,appendAdvance} from '../src/storage.js';

test('M1 adapter: unavailable, corrupted or oversized localStorage never interrupts play', () => {
  const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  try {
    Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
    assert.equal(readLocal(),null);
    assert.equal(writeLocal({save:1}),false);
    assert.equal(clearLocal(),false);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>'{bad json'}});
    assert.equal(readLocal(),null);
    Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> ' '.repeat(2_000_001)}});
    assert.equal(readLocal(),null);
  } finally {
    if(original) Object.defineProperty(globalThis,'localStorage',original);
    else delete globalThis.localStorage;
  }
});
test('M1 adapter: journal keeps raw input and safely coalesces clock ticks', () => {
  const journal=[];
  appendAdvance(journal,0.25);
  appendAdvance(journal,0.75);
  journal.push({type:'input',raw:'echo hello > note.txt',dt:0});
  appendAdvance(journal,1);
  assert.deepEqual(journal,[{type:'advance',dt:1},{type:'input',raw:'echo hello > note.txt',dt:0},{type:'advance',dt:1}]);
  assert.ok(checkJournal(journal));
  for(const invalid of [null,[{type:'input',raw:'x',dt:NaN}],[{type:'advance',dt:-1}],[{type:'script',dt:0}],[{type:'input',raw:'x'.repeat(4097),dt:0}]]) assert.equal(checkJournal(invalid),false);
});
