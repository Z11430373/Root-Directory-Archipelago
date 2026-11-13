/** 建置時嵌入 HTML 的 Worker；以 structured clone 的隔離 VFS 執行既有 Bash 模擬器。 */
import {VFS} from '../vfs.js';
import {execute} from './exec.js';
import {executeBash} from './bash-runtime.js';

self.onmessage=async({data:{raw,state,options}})=>{
  try {
    const vfs=Object.assign(new VFS(),state);
    const result=await (options?.shell==='bash'?executeBash:execute)(raw,vfs,options);
    self.postMessage({result,state:vfs});
  } catch(error) {self.postMessage({error:error.message});}
};
