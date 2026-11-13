/**
 * 建置 QA：依賴 build.mjs、來源 YAML/text、dist/index.html 與 theme.css；由 npm test 執行。
 * 案例 callback 接收測試環境、回傳 void/Promise；以 assert 驗引用/CSP/文字對比，不更改來源。
 * 唯一破壞性案例只改自己 mkdtemp 的資料副本，finally rm；其餘皆唯讀，無常駐程序。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, cp, rename, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { compileData } from '../build.mjs';

test('M0: all content_ref/text_ref exist, B0 fixed text matches, data <1.5MB', async () => {
  const {data,bytes,refs} = await compileData();
  assert.ok(bytes < 1_500_000);
  assert.ok(refs >= 31);
  assert.equal(data.yaml['demo/demo.yaml'].id, 'demo-first-night');
  assert.ok(data.text['text/ch0/handbook.md']);
});
test('M0: single HTML has matching CSP hashes and no external resource tags', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  for (const tag of ['script','style']) {
    const content = html.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))[1];
    assert.ok(html.includes(`'sha256-${createHash('sha256').update(content).digest('base64')}'`));
  }
  assert.ok(html.includes("connect-src 'none'"));
  assert.match(html,/style-src[^;]+ 'nonce-[A-Za-z0-9+/=]+'/);
  assert.doesNotMatch(html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1],/unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]*(?:src|href)\s*=/i);
});
test('M0: compiler refuses missing content and changed B0 fixed text (isolated copies)', async () => {
  const scratch=await mkdtemp(path.join(os.tmpdir(),'opencode','ra-build-'));
  const root=fileURLToPath(new URL('../../',import.meta.url));
  try {
    for(const dir of ['chapters','quests','dialogue','branches','cards','world','text','demo']) await cp(path.join(root,dir),path.join(scratch,dir),{recursive:true});
    const handbook=path.join(scratch,'text/ch0/handbook.md');
    await rename(handbook,handbook+'.missing');
    await assert.rejects(compileData(scratch),/Missing reference/);
    await rename(handbook+'.missing',handbook);
    const flow=path.join(scratch,'demo/flow.yaml');
    await writeFile(flow,(await readFile(flow,'utf8')).replace('[init@alt/sandbox] 還好這是分支。','[init@alt/sandbox] TEST_CHANGED_TEXT'));
    await assert.rejects(compileData(scratch),/B0 fixed text mismatch/);
  } finally { await rm(scratch,{recursive:true,force:true}); }
});
test('T12 accessibility: both themes have at least 4.5:1 text contrast', async () => {
  const css=await readFile(new URL('../src/ui/theme.css',import.meta.url),'utf8');
  /** 本案例呼叫；hex 色碼 → 相對亮度，純計算供對比公式，不驗實際瀏覽器幾何或讀屏。 */
  function luminance(hex) {
    let text=hex.slice(1);if(text.length===3)text=[...text].map(c=>c+c).join('');
    const channels=[0,2,4].map(i=>parseInt(text.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  }
  for(const selector of [':root',':root[data-theme=contrast]']) {
    const block=css.slice(css.indexOf(selector+'{')+selector.length+1).split('}')[0];
    const colors=Object.fromEntries([...block.matchAll(/--([a-z]+):(#[0-9a-f]+)/g)].map(m=>[m[1],m[2]]));
    for(const fg of ['ink','muted','accent','amber'])for(const bg of ['bg','surface','raised']){
      const a=luminance(colors[fg]),b=luminance(colors[bg]);
      assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${selector}: ${fg} on ${bg}`);
    }
  }
});
