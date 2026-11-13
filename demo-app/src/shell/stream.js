/**
 * ============================================================================
 * 模組：shell/stream.js — 模擬 Shell 的同步惰性文字串流原語
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：exec.js（fromText/collect/startable）、commands.js（lines/withoutNewline）
 * 職責：
 *   1. fromText()：字串 → 零或一塊 iterator，不修改來源。
 *   2. lines()：chunks → 保留換行的行 iterator，只暫存跨塊未完成行。
 *   3. withoutNewline()：行文字 → 最多移除一個尾端換行。
 *   4. collect()：chunks → 完整 stdout 字串（消費全部剩餘串流）。
 *   5. startable()：包裝 iterator，支援 start()/return() 控制執行時機。
 * 設計原則：
 *   - chunks 為可迭代文字塊；不讀宿主檔案。
 *   - 消費者必須在提早結束時關閉 iterator（避免資源洩漏）。
 * ============================================================================
 */

/**
 * 將字串轉為零或一塊的 iterator。
 * 由 exec 建立 stdin/錯誤輸出，不修改來源。
 *
 * @param {string} text - 輸入字串
 * @returns {Generator} 零或一塊的 iterator
 */
export function* fromText(text) { if (text) yield text; }
/**
 * 將文字塊串流轉為行 iterator，保留換行符。
 * 由文字指令呼叫，只暫存跨塊未完成行。
 *
 * @param {Iterable<string>} chunks - 文字塊串流
 * @returns {Generator<string>} 行 iterator
 */
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
/**
 * 移除行尾最多一個換行符，不做 trim。
 *
 * @param {string} line - 行文字
 * @returns {string} 移除尾端換行後的字串
 */
export const withoutNewline = line => line.endsWith('\n') ? line.slice(0, -1) : line;
/**
 * 收集文字塊串流為完整字串，消費全部剩餘串流。
 *
 * @param {Iterable<string>} chunks - 文字塊串流
 * @returns {string} 完整 stdout 字串
 */
export function collect(chunks) { let text = ''; for (const chunk of chunks) text += chunk; return text; }

// Start a command even if its consumer ignores stdin, buffering at most its
// first output chunk. Closing this wrapper must also close an unconsumed
// underlying iterator.
/**
 * 包裝 iterator，支援 start()/return() 控制執行時機。
 * 由 exec 收集最後一站，緩衝第一個輸出塊。
 *
 * @param {Iterable} iterator - 底層 iterator
 * @returns {Object} { start, return, [Symbol.iterator] }
 */
export function startable(iterator) {
  let started = false, finished = false, buffer = null, done = false;
  const next = () => {
    if (finished) return { value: undefined, done: true };
    if (!started) { started = true; const result = iterator.next(); if (result.done) { done = true; return result; } buffer = result.value; }
    const value = buffer; buffer = null; const result = iterator.next(); if (result.done) done = true; else buffer = result.value; return { value, done: false };
  };
  return {
    start() { if (!started) next(); },
    return(value) { finished = true; try { iterator.return?.(value); } catch {} return { value, done: true }; },
    [Symbol.iterator]() { return { next, return: this.return }; }
  };
}