/**
 * ============================================================================
 * 模組：shell/worker.js — 建置時嵌入 HTML 的 Worker
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 依賴：../vfs.js（VFS）、./exec.js（execute）、./bash-runtime.js（executeBash）
 *   - 被：ui/shell-job.js（__SHELL_WORKER_SOURCE__ 嵌入）、建置系統
 * 職責：
 *   1. 以 structured clone 的隔離 VFS 執行既有 Bash 模擬器。
 *   2. 根據 options.shell 決定使用 execute（模擬）或 executeBash（just-bash）。
 *   3. 將結果與 VFS 狀態回傳主執行緒，錯誤時回傳 error 訊息。
 * 設計原則：
 *   - Worker 內部無 DOM/宿主資源，純計算。
 *   - VFS 透過 structured clone 傳入/传出，保持隔離。
 * ============================================================================
 */

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