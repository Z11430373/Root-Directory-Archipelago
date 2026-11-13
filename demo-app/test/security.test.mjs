/**
 * 原始碼安全護欄：依賴 src 下所有 .js（排除生成 data.js）與 Node fs/path/url，由 npm test 掃描。
 * 案例只讀文字、assert 禁用動態程式碼/HTML 注入/網路 API，不執行來源，也不是完整安全稽核。
 * 註解亦被 regex 掃到，因此不要在 app 註解中放看似實際禁用 API 呼叫的範例；無清理需求。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

test('Security: application JavaScript contains no dynamic code, HTML injection or network APIs', async () => {
  const base=new URL('../src/',import.meta.url);
  /** 案例/自身呼叫；目錄 → Promise<void>，遞迴讀 JS 文字並斷言，無檔案寫入或狀態修改。 */
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
