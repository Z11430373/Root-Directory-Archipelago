/** 可取消的 Shell 工作：Worker 成功完成後才提交 VFS；完成／失敗／取消均終止 Worker 並釋放 URL。 */
export class ShellJob {
  constructor() {this.pending=null;}
  run(raw,vfs,options) {
    if(this.pending)throw new Error('已有指令正在執行');
    const url=URL.createObjectURL(new Blob([__SHELL_WORKER_SOURCE__],{type:'text/javascript'}));
    let worker;
    try {worker=new Worker(url);}catch(error){URL.revokeObjectURL(url);throw error;}
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(error,data)=>{
        if(settled)return;
        settled=true;worker.onmessage=null;worker.onerror=null;
        worker.terminate();URL.revokeObjectURL(url);this.pending=null;
        if(error){reject(error);return;}
        const flags=vfs.flags;
        Object.assign(vfs,data.state,{flags});
        resolve(data.result);
      };
      this.pending={cancel:()=>finish(new DOMException('指令已中斷','AbortError'))};
      worker.onmessage=({data})=>finish(data.error?new Error(data.error):null,data);
      worker.onerror=event=>{event.preventDefault();finish(new Error(event.message||'無法執行指令'));};
      try {worker.postMessage({raw,state:vfs,options});}catch(error){finish(error);}
    });
  }
  cancel() {if(!this.pending)return false;this.pending.cancel();return true;}
}
