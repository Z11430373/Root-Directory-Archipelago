/** Runs in Node's isolated loader thread; application imports receive the reviewed source hook. */
import {patchBashBrowserSource} from '../../src/shell/bash-runtime.js';

export async function resolve(specifier,context,nextResolve) {
  if(specifier==='node:zlib'&&/\/just-bash\/dist\/bundle\/browser\.js$/.test(context.parentURL||'')) {
    return {url:new URL('../../src/shell/browser-zlib.js',import.meta.url).href,shortCircuit:true};
  }
  return nextResolve(specifier,context);
}

export async function load(url,context,nextLoad) {
  const result=await nextLoad(url,context);
  if(/\/just-bash\/dist\/bundle\/browser\.js$/.test(url)) {
    return {...result,source:patchBashBrowserSource(Buffer.from(result.source).toString('utf8'))};
  }
  return result;
}
