import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync,gunzipSync as nativeGunzip} from 'node:zlib';
import {gunzipSync,gzipSync as browserGzip,constants} from '../src/shell/browser-zlib.js';

test('Browser gzip shim preserves bytes, concatenated streams and output bounds',()=>{
  const first=Buffer.from('群島\n'),second=Buffer.from('second\n');
  const compressed=Buffer.concat([gzipSync(first),gzipSync(second)]);
  assert.deepEqual(Buffer.from(gunzipSync(compressed,{maxOutputLength:first.length+second.length})),Buffer.concat([first,second]));
  assert.throws(()=>gunzipSync(compressed,{maxOutputLength:first.length+second.length-1}),/maxOutputLength/);
  assert.throws(()=>gunzipSync(gzipSync('x'.repeat(50000)),{maxOutputLength:4096}),/maxOutputLength/);
  const corrupt=gzipSync(first);corrupt[corrupt.length-8]^=1;
  assert.throws(()=>gunzipSync(corrupt),/check|gzip/i);
  assert.throws(()=>gunzipSync(gzipSync(first).subarray(0,12)),/gzip/i);
  for(const level of [constants.Z_BEST_SPEED,constants.Z_BEST_COMPRESSION,constants.Z_DEFAULT_COMPRESSION]) {
    assert.deepEqual(nativeGunzip(browserGzip(first,{level})),first);
  }
  assert.throws(()=>browserGzip(first,{maxOutputLength:2}),/maxOutputLength/);
});
