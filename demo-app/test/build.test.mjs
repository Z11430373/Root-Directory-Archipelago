import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
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
