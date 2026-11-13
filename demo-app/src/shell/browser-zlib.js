/**
 * ============================================================================
 * 模組：shell/browser-zlib.js — 瀏覽器等效的 zlib 實作
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 依賴：vendor/pako（Inflate/Deflate）
 *   - 被：just-bash 3.6.0 的 rg/gzip Node zlib 匯入（瀏覽器端替換）
 * 職責：
 *   1. constants：Z_BEST_COMPRESSION/Z_BEST_SPEED/Z_DEFAULT_COMPRESSION 常數。
 *   2. gunzipSync()：gzip 解壓（RFC 1952，windowBits=31）。
 *   3. gzipSync()：gzip 壓縮（level 可選，預設 -1）。
 *   4. transform()：共用的 pako inflate/deflate 轉換函式，有輸出大小上限。
 * 設計原則：
 *   - 瀏覽器端等效 Node.js zlib，提供 gzip/gunzip 同步操作。
 *   - maxOutputLength 預設 8MB，防止記憶體爆炸。
 * ============================================================================
 */

import {Inflate,Deflate} from '../../vendor/pako.esm.mjs';

export const constants=Object.freeze({Z_BEST_COMPRESSION:9,Z_BEST_SPEED:1,Z_DEFAULT_COMPRESSION:-1});

export function gunzipSync(input,{maxOutputLength=8*1024*1024}={}) {
  return transform(new Inflate({windowBits:31,chunkSize:4096}),input,maxOutputLength);
}

export function gzipSync(input,{level=-1,maxOutputLength=8*1024*1024}={}) {
  return transform(new Deflate({gzip:true,level,chunkSize:4096}),input,maxOutputLength);
}

function transform(inflater,input,maxOutputLength) {
  if(!Number.isSafeInteger(maxOutputLength)||maxOutputLength<0)throw new RangeError('Invalid gzip output limit');
  const chunks=[];
  let size=0;
  inflater.onData=chunk=>{
    size+=chunk.length;
    if(size>maxOutputLength)throw new RangeError('Gzip output exceeds maxOutputLength');
    chunks.push(chunk);
  };
  if(!inflater.push(input,true)||inflater.err||!inflater.ended)throw new Error(inflater.msg||'Invalid gzip data');
  const output=new Uint8Array(size);
  let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.length;}
  return output;
}