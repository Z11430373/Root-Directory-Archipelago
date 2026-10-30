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
