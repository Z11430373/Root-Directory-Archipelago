import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('Security: application JavaScript contains no dynamic code, HTML injection or network APIs', async () => {
  const base=new URL('../src/',import.meta.url);
  async function scan(dir) {
    for(const item of await readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,item.name);
      if(item.isDirectory()) await scan(file);
      else if(item.name.endsWith('.js') && item.name!=='data.js') {
        const source=await readFile(file,'utf8');
        assert.doesNotMatch(source,/\beval\s*\(|\bnew\s+Function\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(/,file);
        assert.doesNotMatch(source,/\bfetch\s*\(|\bnew\s+(?:XMLHttpRequest|WebSocket|EventSource)\s*\(|\bsendBeacon\s*\(/,file);
      }
    }
  }
  await scan(fileURLToPath(base));
});
