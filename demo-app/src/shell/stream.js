/**
 * 模擬 Shell 的同步惰性文字串流原語，無檔案依賴；供 exec.js 與 commands.js 組合管線。
 * chunks 為可迭代文字塊；不讀宿主檔案，消費者必須在提早結束時關閉 iterator。
 */
/** 由 exec 建立 stdin/錯誤輸出；字串 → 零或一塊 iterator，不修改來源。 */
export function* fromText(text) { if (text) yield text; }
/** 由文字指令呼叫；chunks → 保留換行的行 iterator，只暫存跨塊未完成行；return 會結束上游。 */
export function* lines(chunks) {
  let pending = '';
  for (const chunk of chunks) {
    pending += chunk;
    let start = 0, end;
    while ((end = pending.indexOf('\n', start)) >= 0) {
      yield pending.slice(start, end + 1);
      start = end + 1;
    }
    pending = pending.slice(start);
  }
  if (pending) yield pending;
}
/** 由逐行指令呼叫；行文字 → 最多移除一個尾端換行的新字串，不做 trim。 */
export const withoutNewline = line => line.endsWith('\n') ? line.slice(0, -1) : line;
/** 由 exec 收集最後一站；chunks → 完整 stdout 字串，會消費全部剩餘串流。 */
export function collect(chunks) { let text = ''; for (const chunk of chunks) text += chunk; return text; }

// Start a command even if its consumer ignores stdin, buffering at most its
// first output chunk. Closing this wrapper must also close an unconsumed but
// already-started producer; a generator wrapper's return-before-next would not.
/** 由 exec 每站建立；chunks → 可顯式啟動的 iterator，最多預讀一塊；exec 的 finally 必須 return 清理。 */
export function startable(chunks) {
  const iterator = chunks[Symbol.iterator]();
  let started = false, closed = false, pending = null;
  return {
    /** 由 exec/next 呼叫；無參數/回傳值，首次拉取一塊以執行被下游忽略的副作用。 */
    start() {
      if (!started && !closed) { started = true; pending = iterator.next(); }
    },
    /** 由下游/collect 呼叫；無參數 → iterator result，先交出預讀塊再拉上游，完成時標記 closed。 */
    next() {
      if (closed) return { done: true };
      this.start();
      const next = pending || iterator.next();
      pending = null;
      if (next.done) closed = true;
      return next;
    },
    /** 由 exec finally 呼叫；無參數 → 結束 result，丟棄預讀塊並轉發上游 return，避免漏掉清理。 */
    return() {
      if (closed) return { done: true };
      closed = true; pending = null;
      return iterator.return ? iterator.return() : { done: true };
    },
    /** 由 for-of 呼叫；回傳本 iterator，不建立第二份消費游標。 */
    [Symbol.iterator]() { return this; },
  };
}
