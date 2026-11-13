/**
 * ============================================================================
 * 模組：shell/parse.js — 模擬 Shell 的詞法/文法與變數展開層
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：exec.js（execute 呼叫 parse/expandWord）、測試
 * 職責：
 *   1. tokenize()：原始字串 → word/op tokens，拒絕不支援的運算子與命令替換。
 *   2. parse()：token 陣列 → 帶 connector 的 pipeline 陣列，保留重導向順序。
 *   3. expandWord()：word、VFS、前一 rc、是否供 glob → 展開後字串（HOME/?/~）。
 * 設計原則：
 *   - 保留每個字片段的引號/展開/glob 資訊，只產生資料，不接宿主 Shell，不改 VFS。
 *   - 改引號規則會連動 glob、安全刪除與重導向，須跑 round3-shell* 與 T7 測試。
 *   - Bash 空白為 ASCII，不使用 JavaScript 的 Unicode 空白類別。
 * ============================================================================
 */

// This is a parser for the game's shell language, never a host-shell bridge.
/**
 * 將原始字串分解為 word/op tokens。
 * 拒絕不支援的運算子（||、;;、()、<、&）與命令替換（`、$()）。
 * 語法錯誤拋 SyntaxError。
 *
 * @param {string} raw - 原始指令字串
 * @returns {Array} token 陣列（{ type: 'word', parts, tilde, glob } 或 { type: 'op', value }）
 * @throws {SyntaxError} 當遇到不支援的運算子、命令替換或未終止引號時
 */
export function tokenize(raw) {
  const tokens = [];
  let parts = [], text = '', started = false, quote = null;
  let expand = true, tilde = false, glob = false;
  // flushPart 封存當前片段；mode 切換可展開狀態前先封存；finish 完成一個 word 並重設局部狀態。
  const flushPart = () => { if (text) parts.push({ text, expand, glob: quote === null && expand }); text = ''; };
  /** tokenize 內部呼叫；可否展開 → undefined，必要時先封存舊片段再切換局部 expand。 */
  const mode = value => { if (expand !== value) { flushPart(); expand = value; } };
  /** 空白/運算子/結尾呼叫；無參數 → undefined，完成 word 後重設局部累積狀態，不改原字串。 */
  const finish = () => {
    flushPart();
    if (started) tokens.push({ type: 'word', parts, tilde, glob });
    parts = []; text = ''; started = false; tilde = false; glob = false; expand = true;
  };
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (quote === "'") {
      if (ch === "'") { flushPart(); quote = null; mode(true); }
      else text += ch;
      continue;
    }
    if (ch === '`' || (ch === '$' && raw[i + 1] === '(')) throw new SyntaxError('Command substitution is not supported');
    if (quote === '"') {
      if (ch === '"') { flushPart(); quote = null; continue; }
      if (ch === '\\' && ['$', '`', '"', '\\', '\n'].includes(raw[i + 1])) {
        const next = raw[++i];
        flushPart();
        if (next !== '\n') parts.push({ text: next, expand: false, glob: false });
      } else text += ch;
      continue;
    }
    // Bash blanks are ASCII, not JavaScript's Unicode whitespace class.
    // Keep the line-oriented parser's existing treatment of pasted newlines.
    if (ch === ' ' || ch === '\t' || ch === '\n') { finish(); continue; }
    if (ch === '#' && !started) break;
    if (ch === "'" || ch === '"') {
      flushPart(); quote = ch; started = true; mode(ch !== "'"); continue;
    }
    if (ch === '\\') {
      if (i + 1 >= raw.length) throw new SyntaxError('Trailing escape');
      flushPart(); started = true;
      const next = raw[++i];
      if (next !== '\n') parts.push({ text: next, expand: false, glob: false });
      continue;
    }
    if ('()<&'.includes(ch)) {
      if (ch !== '&' || raw[i + 1] !== '&') throw new SyntaxError(`Unsupported operator: ${ch}`);
    }
    if ('|>;&'.includes(ch)) {
      finish();
      let op = ch;
      if ((ch === '>' && raw[i + 1] === '>') || (ch === '&' && raw[i + 1] === '&')) op += raw[++i];
      if ((ch === '|' && raw[i + 1] === '|') || (ch === ';' && raw[i + 1] === ';')) throw new SyntaxError('Unsupported operator');
      tokens.push({ type: 'op', value: op });
      continue;
    }
    if (!started && ch === '~') tilde = true;
    if ('*?['.includes(ch)) glob = true;
    started = true;
    mode(true);
    text += ch;
  }
  if (quote) throw new SyntaxError('Unterminated quote');
  finish();
  return tokens;
}

/**
 * 將 token 陣列解析為帶 connector 的 pipeline 陣列。
 * 由 execute 呼叫，重導向保留順序，不執行指令。
 *
 * @param {string} raw - 原始指令字串
 * @returns {Array} pipeline 陣列，每筆 { connector, commands: [{ words, redirects }] }
 * @throws {SyntaxError} 當語法錯誤時
 */
export function parse(raw) {
  const tokens = tokenize(String(raw));
  if (!tokens.length) return [];
  const result = [];
  let pipeline = { connector: null, commands: [] };
  let command = { words: [], redirects: [] };
  /** 由管線/連接符與結尾呼叫；無參數 → undefined，將非空 command 收進 pipeline 並換新容器。 */
  const finishCommand = () => {
    if (!command.words.length) throw new SyntaxError('Expected command');
    pipeline.commands.push(command);
    command = { words: [], redirects: [] };
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'word') { command.words.push(token); continue; }
    if (token.value === '>' || token.value === '>>') {
      const target = tokens[++i];
      if (!target || target.type !== 'word') throw new SyntaxError('Expected redirection target');
      command.redirects.push({ append: token.value === '>>', target });
      continue;
    }
    finishCommand();
    if (token.value === '|') {
      if (i === tokens.length - 1) throw new SyntaxError('Expected pipeline command');
    } else {
      result.push(pipeline);
      pipeline = { connector: token.value, commands: [] };
      if (i === tokens.length - 1 && token.value !== ';') throw new SyntaxError('Expected command');
    }
  }
  if (command.words.length || command.redirects.length) finishCommand();
  if (pipeline.commands.length) result.push(pipeline);
  return result;
}

/**
 * 展開 word 為字串。
 * 由 exec 展開參數/重導向呼叫，僅展開允許的 HOME/?/~，不改 VFS。
 *
 * @param {Object} word - token 中的 word 物件（parts/tilde/glob）
 * @param {Object} vfs - 虛擬檔案系統
 * @param {number} [rc=0] - 前一管線的 rc（用於 $?）
 * @param {boolean} [globPattern=false] - 是否為 glob 模式（會轉義非 glob 字元）
 * @returns {string} 展開後的字串
 */
export function expandWord(word, vfs, rc = 0, globPattern = false) {
  let value = word.parts.map(part => {
    const expanded = part.expand ? part.text.replace(/\$(\?|HOME\b|\{HOME\})/g, (_, name) => name === '?' ? String(rc) : vfs.home) : part.text;
    return globPattern && !part.glob ? expanded.replace(/[?*[\]\\]/g, '\\$&') : expanded;
  }).join('');
  if (word.tilde && (value === '~' || value.startsWith('~/'))) value = vfs.home + value.slice(1);
  return value;
}