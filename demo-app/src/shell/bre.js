/**
 * 模擬 Shell 的 grep 正規表示式轉換層，無檔案依賴；由 commands.js 呼叫。
 * 將支援的 BRE/ERE/固定文字轉成帶 test 的比對器，不執行文字；超長或危險重複分組拒絕。
 */
// GNU grep defaults to BRE: unescaped (), +, ?, {}, | are literal.
// Translate only the supported regular-expression syntax, never executable JS.
/** pattern 與模式選項 → RegExp 或固定文字比對器；不改來源、不保留資源，語法不符拋錯交 grep 處理。 */
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
      else source += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      continue;
    }
    if (ch === '[' && !inClass) {
      inClass = true;
      source += ch;
      if (pattern[i + 1] === '^') source += pattern[++i];
      if (pattern[i + 1] === ']') { source += '\\]'; i++; }
      continue;
    }
    if (ch === ']' && inClass) inClass = false;
    if (!extended && !inClass && '()+?{}|'.includes(ch)) source += '\\' + ch;
    else source += ch;
  }
  source = source.replace(/\[:digit:\]/g, '0-9').replace(/\[:alpha:\]/g, 'A-Za-z').replace(/\[:alnum:\]/g, 'A-Za-z0-9').replace(/\[:space:\]/g, '\\s').replace(/\[:lower:\]/g, 'a-z').replace(/\[:upper:\]/g, 'A-Z');
  if (inClass) throw new Error('grep: unmatched [');
  // Reject quantified groups to keep user-supplied nested repetition bounded.
  if (/\)[*+?{]/.test(source)) throw new Error('grep: repeated groups are not supported');
  return new RegExp(source, ignoreCase ? 'i' : '');
}
