/** Browser equivalents for just-bash 3.6.0's rg/gzip Node zlib imports. */
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
