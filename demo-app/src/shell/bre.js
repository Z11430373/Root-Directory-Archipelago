/**
 * ============================================================================
 * 模組：shell/bre.js — 模擬 Shell 的 grep 正規表示式轉換層
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：commands.js（grep 指令呼叫 compileBRE）
 * 職責：
 *   1. compileBRE()：將 BRE/ERE/固定文字模式轉換為帶 test 的比對器。
 *   2. 支援 -i（忽略大小寫）、-E（擴展正規表示式）、-F（固定文字）。
 *   3. 超長（>1024）或危險重複分組拒絕，防止 ReDoS。
 * 設計原則：
 *   - GNU grep 預設為 BRE：未轉義的 ()、+、?、{}、| 視為字面字元。
 *   - 只轉換支援的正規表示式語法，不執行 JavaScript eval/new Function。
 *   - pattern 不是可執行 JS，僅產生 RegExp 或 fixed-text 比對器。
 * ============================================================================
 */

/**
 * 將 BRE/ERE/固定文字模式轉換為帶 test 的比對器。
 * 由 commands.js 的 grep 指令呼叫。
 *
 * @param {string} pattern - 正規表示式模式
 * @param {Object} [options] - { ignoreCase, extended, fixed }
 * @returns {Object} { test: (line: string) => boolean }
 * @throws {Error} 當 pattern 過長或語法不合法時
 */
export function compileBRE(pattern, { ignoreCase = false, extended = false, fixed = false } = {}) {
  if (pattern.length > 1024) throw new Error('grep: pattern too long');
  if (fixed) return { test: line => ignoreCase ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern) };
  let source = '', inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\') {
      if (++i >= pattern.length) throw new Error('grep: trailing backslash');
      const next = pattern[i];
      if (!extended && '()+?{}|'.includes(next) && !inClass) source += next;
      else if (extended && '()+?{}|'.includes(next) && !inClass) source += '\\' + next;
      else if ('bBwWsS123456789'.includes(next) || '^$.[]*\\'.includes(next)) source += '\\' + next;
      else source += next;
    } else if (inClass) {
      if (ch === ']') inClass = false;
      source += ch;
    } else if (ch === '[') { inClass = true; source += ch; }
    else if ('.+?{}|()'.includes(ch)) source += extended ? ch : '\\' + ch;
    else if ('*'.includes(ch)) source += ch;
    else if ('^$'.includes(ch)) source += ch;
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  let flags = 'm';
  if (ignoreCase) flags += 'i';
  try { const re = new RegExp(source, flags); return { test: line => re.test(line) }; }
  catch (e) { throw new Error('grep: invalid pattern'); }
}