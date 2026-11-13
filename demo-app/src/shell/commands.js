/**
 * 模擬 Shell 的文字/檔案指令層；依賴 ../data.js、bre.js、stream.js，供 exec.js 派送。
 * ctx 提供 VFS、flags、branch、read/error 與 rc/stderr；所有輸出皆為文字塊 iterator。
 * 讀檔需經 ctx.read 記錄；cd/ln/rm 改記憶體世界，外層 Engine 管回復，exec 管串流關閉。
 */
import { DATA } from '../data.js';
import { compileBRE } from './bre.js';
import { lines, withoutNewline } from './stream.js';

const encoder = new TextEncoder();
/** 由 ls/sort 呼叫；兩字串 → UTF-8 位元組排序比較值，避免 locale 排序改變真 bash 對照。 */
function compareBytes(a, b) {
  if (a === b) return 0;
  // ASCII and BMP text share UTF-8/UTF-16 ordering. Encode only rare astrals.
  if (!/[\uD800-\uDFFF]/.test(a + b)) return a < b ? -1 : 1;
  const aa = encoder.encode(a), bb = encoder.encode(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}

/** 由各讀檔指令呼叫；運算元/stdin/ctx → 來源 iterator，登記具名讀取並報錯後繼續下一檔。 */
function* sources(operands, input, ctx, errorRC = 1) {
  if (!operands.length) { yield { name: null, chunks: input }; return; }
  for (const name of operands) {
    if (name === '-') { yield { name: null, chunks: input }; continue; }
    if (!ctx.vfs.isFile(name)) { ctx.error(`${name}: ${ctx.vfs.exists(name) ? 'Is a directory' : 'No such file or directory'}`, errorRC); continue; }
    const path = ctx.vfs.resolve(name);
    ctx.read(path);
    yield { name, path, chunks: ctx.vfs.iterChunks(path) };
  }
}
/** 由 cat/uniq 呼叫；來源參數 → 原樣串接文字塊 iterator，不補各檔案缺少的尾端換行。 */
function* joinedSources(operands, input, ctx) {
  for (const src of sources(operands, input, ctx)) yield* src.chunks;
}
/** 由 sort/cut 呼叫；來源參數 → 分檔逐行 iterator，保留檔案邊界，避免兩檔殘行黏成一行。 */
function* sourceLines(operands, input, ctx) {
  // Text tools terminate an incomplete last line at each file boundary. cat,
  // in contrast, must keep using joinedSources for byte-preserving concatenation.
  for (const src of sources(operands, input, ctx)) yield* lines(src.chunks);
}
/** 由簡單選項指令呼叫；args/允許字母 → {options,operands}，保留 -- 後字面值，非法選項拋錯。 */
function splitOptions(args, allowed) {
  let options = '', operands = [], stop = false;
  for (const arg of args) {
    if (arg === '--' && !stop) { stop = true; continue; }
    if (!stop && arg.startsWith('-') && arg !== '-') {
      for (const ch of arg.slice(1)) { if (!allowed.includes(ch)) throw new Error(`invalid option -- '${ch}'`); options += ch; }
    } else operands.push(arg);
  }
  return { options, operands };
}
/** 由 ls 描述列呼叫；八進位權限/是否目錄 → rwx 字串，無副作用。 */
function modeString(perms, dir) {
  const n = parseInt(perms, 8);
  let out = dir ? 'd' : '-';
  for (const shift of [6, 3, 0]) { const bits = n >> shift; out += (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-'); }
  return out;
}
/** 由 runCommand 呼叫；args/ctx → ls 文字 iterator，唯讀 stat/list，錯誤透過 ctx.error 設 rc。 */
function* ls(args, ctx) {
  const { options, operands } = splitOptions(args, 'alitr');
  const targets = operands.length ? operands : ['.'];
  const long = options.includes('l'), inode = options.includes('i'), all = options.includes('a');
  // describe 接收路徑與顯示名稱，回傳單列；inode/nlink 取同一 VFS，硬連結才能正確顯示。
  const describe = (path, name) => {
    const stat = ctx.vfs.stat(path);
    let line = inode ? `${stat.inode} ` : '';
    if (long) line += `${modeString(stat.perms, stat.type === 'dir')} ${stat.nlink} op op ${stat.size} ${stat.mtime} `;
    return line + name + '\n';
  };
  const files = targets.filter(p => !ctx.vfs.isDirectory(p));
  const dirs = targets.filter(p => ctx.vfs.isDirectory(p));
  files.sort(compareBytes); dirs.sort(compareBytes);
  let printed = false;
  for (const path of files) {
    if (!ctx.vfs.exists(path)) { ctx.error(`cannot access '${path}': No such file or directory`, 2); continue; }
    yield describe(path, path); printed = true;
  }
  for (const path of dirs) {
    if (printed) yield '\n';
    if (targets.length > 1) yield `${path}:\n`;
    let names = ctx.vfs.list(path, { all });
    if (all) names = ['.', '..', ...names];
    if (options.includes('t')) names.sort((a, b) => compareBytes(ctx.vfs.stat(`${path}/${b}`).mtime, ctx.vfs.stat(`${path}/${a}`).mtime) || compareBytes(a, b));
    if (options.includes('r')) names.reverse();
    if (long) yield `total ${names.reduce((n, name) => n + Math.ceil(ctx.vfs.stat(`${path}/${name}`).size / 4096) * 4, 0)}\n`;
    for (const name of names) yield describe(`${path}/${name}`, name);
    printed = true;
  }
}

/**
 * 由 runCommand 呼叫；args/stdin/ctx → grep 結果 iterator，支援模式、遞迴、計數與提早停止。
 * 直接具名檔算讀取；遞迴檔僅在匹配時登記，避免沒看到的隱藏劇情被記作發現；rc 為 0/1/2。
 */
function* grep(args, input, ctx) {
  let recursive = false, count = false, number = false, invert = false, ignoreCase = false;
  let filenames = false, hideName = false, forceName = false, quiet = false, extended = false, fixed = false, limit = Infinity;
  const patterns = [], operands = [];
  let stop = false, patternTaken = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!stop && arg === '--') { stop = true; continue; }
    if (!stop && arg.startsWith('-') && arg !== '-') {
      for (let j = 1; j < arg.length; j++) {
        switch (arg[j]) {
          case 'r': case 'R': recursive = true; break;
          case 'c': count = true; break;
          case 'n': number = true; break;
          case 'v': invert = true; break;
          case 'i': ignoreCase = true; break;
          case 'l': filenames = true; break;
          case 'h': hideName = true; break;
          case 'H': forceName = true; break;
          case 'q': quiet = true; break;
          case 's': break;
          case 'E': extended = true; break;
          case 'F': fixed = true; break;
          case 'e': case 'm': {
            const option = arg[j];
            const value = arg.slice(j + 1) || args[++i];
            if (value === undefined) throw new Error(`option requires an argument -- '${option}'`);
            if (option === 'e') { patterns.push(value); patternTaken = true; }
            else { limit = Number(value); if (!Number.isInteger(limit) || limit < 0) throw new Error('invalid max count'); }
            j = arg.length;
            break;
          }
          default: throw new Error(`invalid option -- '${arg[j]}'`);
        }
      }
    } else if (!patternTaken) { patterns.push(arg); patternTaken = true; }
    else operands.push(arg);
  }
  if (!patternTaken) { ctx.error('missing pattern', 2); return; }
  let regexes;
  try { regexes = patterns.flatMap(p => p.split('\n')).map(p => compileBRE(p, { ignoreCase, extended, fixed })); }
  catch (e) { ctx.error(e.message, 2); return; }
  const targets = [];
  let directoryUsed = false;
  for (const name of operands) {
    if (name === '-') { targets.push({ name: '(standard input)', input: true, direct: false }); continue; }
    if (ctx.vfs.isDirectory(name) && recursive) {
      directoryUsed = true;
      const root = ctx.vfs.resolve(name);
      for (const path of ctx.vfs.walkFiles(name)) {
        const relative = path.slice(root === '/' ? 1 : root.length + 1);
        const label = name === '/' ? '/' + relative : `${name.replace(/\/$/, '')}/${relative}`;
        targets.push({ name: label, path, direct: false });
      }
    } else if (ctx.vfs.isFile(name)) targets.push({ name, path: ctx.vfs.resolve(name), direct: true });
    else ctx.error(`${name}: ${ctx.vfs.exists(name) ? 'Is a directory' : 'No such file or directory'}`, 2);
  }
  if (!operands.length) {
    if (recursive) {
      directoryUsed = true;
      for (const path of ctx.vfs.walkFiles('.')) targets.push({ name: './' + path.slice(ctx.vfs.cwd.length + 1), path, direct: false });
    } else targets.push({ name: '(standard input)', input: true, direct: false });
  }
  const prefixName = !hideName && (forceName || directoryUsed || operands.length > 1);
  let any = false;
  for (const target of targets) {
    if (target.direct) ctx.read(target.path);
    let matches = 0, row = 0;
    if (limit !== 0) for (const original of lines(target.input ? input : ctx.vfs.iterChunks(target.path))) {
      row++;
      const line = withoutNewline(original);
      if (regexes.some(regex => regex.test(line)) === invert) continue;
      any = true; matches++;
      if (!target.direct && target.path) ctx.read(target.path);
      if (quiet) return;
      if (filenames) { yield target.name + '\n'; break; }
      if (!count) yield (prefixName ? target.name + ':' : '') + (number ? row + ':' : '') + line + '\n';
      if (matches >= limit) break;
    }
    if (count && !quiet && !filenames) yield (prefixName ? target.name + ':' : '') + matches + '\n';
  }
  if (ctx.state.rc !== 2) ctx.state.rc = any ? 0 : 1;
}

/** 由 headTail 呼叫；args → 行/位元組數、來源、是否從起點計數；非法數量拋錯，無 VFS 副作用。 */
function countOptions(args) {
  let n = 10, bytes = false, operands = [], fromStart = false;
  let stop = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!stop && arg === '--') { stop = true; continue; }
    if (!stop && /^-\d+$/.test(arg)) { n = Number(arg.slice(1)); continue; }
    if (!stop && /^-[nc]/.test(arg)) {
      bytes = arg[1] === 'c';
      const value = arg.slice(2) || args[++i];
      if (!/^[+-]?\d+$/.test(value || '')) throw new Error('invalid number of lines');
      fromStart = value.startsWith('+');
      n = Number(value);
    } else if (!stop && arg.startsWith('-') && arg !== '-') throw new Error(`invalid option: ${arg}`);
    else operands.push(arg);
  }
  return { n, bytes, operands, fromStart };
}
/** 由 head/tail 派送呼叫；名稱/args/stdin/ctx → iterator，直接 tail 逆尋、管線用有限行環形緩衝。 */
function* headTail(name, args, input, ctx) {
  const { n, bytes, operands, fromStart } = countOptions(args);
  let previous = false;
  for (const source of sources(operands, input, ctx)) {
    if (operands.length > 1) { if (previous) yield '\n'; yield `==> ${source.name || 'standard input'} <==\n`; previous = true; }
    if (name === 'tail' && !bytes && !fromStart && n >= 0 && source.path) {
      yield* ctx.vfs.iterTailLines(source.path, n);
      continue;
    }
    if (bytes) {
      const chunks = [];
      let size = 0;
      for (const chunk of source.chunks) { chunks.push(encoder.encode(chunk)); size += chunks[chunks.length - 1].length; if (name === 'head' && n >= 0 && size >= n) break; }
      const all = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
      const result = name === 'head' ? all.slice(0, n < 0 ? Math.max(0, size + n) : n) : fromStart ? all.slice(Math.max(0, n - 1)) : all.slice(Math.max(0, size - n));
      yield new TextDecoder().decode(result);
      continue;
    }
    if (name === 'head' && n >= 0) {
      if (n === 0) continue;
      let count = 0;
      for (const line of lines(source.chunks)) { yield line; if (++count >= n) break; }
    } else if (name === 'tail' && fromStart) {
      let count = 0;
      for (const line of lines(source.chunks)) if (++count >= n) yield line;
    } else {
      const retain = Math.abs(n);
      const buffer = new Array(retain || 1);
      let count = 0;
      for (const line of lines(source.chunks)) {
        if (name === 'head' && count >= retain) yield buffer[count % retain];
        if (retain) buffer[count % retain] = line;
        count++;
      }
      if (name === 'tail') for (let i = Math.max(0, count - retain); i < count; i++) yield buffer[i % retain];
    }
  }
}

/**
 * 由 runCommand 呼叫；args/stdin/ctx → 排序後行 iterator，唯讀來源並登記讀取。
 * 本試玩版會收集全部行再排序，不是大型外部排序；改比較/平手規則會影響 T7 與快題。
 */
function* sort(args, input, ctx) {
  let numeric = false, reverse = false, stable = false, unique = false, delimiter = null, key = null;
  const operands = [];
  let stop = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!stop && arg === '--') { stop = true; continue; }
    if (!stop && arg.startsWith('-') && arg !== '-') {
      for (let j = 1; j < arg.length; j++) switch (arg[j]) {
        case 'n': numeric = true; break;
        case 'r': reverse = true; break;
        case 's': stable = true; break;
        case 'u': unique = true; break;
        case 'k': case 't': {
          const opt = arg[j], value = arg.slice(j + 1) || args[++i];
          if (!value) throw new Error(`option requires an argument -- '${opt}'`);
          if (opt === 'k') key = value; else delimiter = value;
          j = arg.length;
          break;
        }
        default: throw new Error(`invalid option -- '${arg[j]}'`);
      }
    } else operands.push(arg);
  }
  // getKey 取欄位/字元範圍，num 取數字前綴；compare 結合方向與穩定排序，均只操作局部值。
  const getKey = line => {
    if (!key) return line;
    const fields = delimiter === null ? line.trimStart().split(/\s+/) : line.split(delimiter);
    const match = /^(\d+)(?:\.(\d+))?([nr]*)(?:,(\d+)(?:\.(\d+))?([nr]*))?$/.exec(key);
    if (!match) throw new Error('invalid field specification');
    const start = Number(match[1]) - 1, end = match[4] ? Number(match[4]) : fields.length;
    let value = fields.slice(start, end).join(delimiter || ' ');
    if (match[2]) value = value.slice(Number(match[2]) - 1);
    if (match[5] && end === start + 1) value = value.slice(0, Number(match[5]));
    return value;
  };
  const num = value => Number(/^[\t ]*([+-]?(?:\d+(?:\.\d*)?|\.\d+))/.exec(value)?.[1] || 0);
  const useNumeric = numeric || /n/.test(key || '');
  const useReverse = reverse || /r/.test(key || '');
  const compare = (a, b) => {
    const ka = getKey(a), kb = getKey(b);
    const compared = (useNumeric ? num(ka) - num(kb) : compareBytes(ka, kb)) || (stable ? 0 : compareBytes(a, b));
    return useReverse ? -compared : compared;
  };
  const all = [...sourceLines(operands, input, ctx)].map(withoutNewline).sort(compare);
  let previous;
  for (const line of all) { if (!unique || previous === undefined || compare(previous, line)) yield line + '\n'; previous = line; }
}

/** 由 runCommand 呼叫；args/stdin/ctx → 相鄰重複群組 iterator，不會替輸入排序，也不修改來源。 */
function* uniq(args, input, ctx) {
  const { options, operands } = splitOptions(args, 'cdui');
  if (operands.length > 1) throw new Error('output file operand is not supported; use >');
  // output 只格式化目前群組（文字/次數），依 -d/-u 決定省略，-c 的欄寬須符合參考輸出。
  const output = function* (line, count) {
    if ((options.includes('d') && count < 2) || (options.includes('u') && count !== 1)) return;
    yield (options.includes('c') ? String(count).padStart(7, ' ') + ' ' : '') + line + '\n';
  };
  let previous, count = 0;
  for (const raw of lines(joinedSources(operands, input, ctx))) {
    const line = withoutNewline(raw);
    const equal = previous !== undefined && (options.includes('i') ? previous.toLowerCase() === line.toLowerCase() : previous === line);
    if (equal) count++;
    else { if (previous !== undefined) yield* output(previous, count); previous = line; count = 1; }
  }
  if (previous !== undefined) yield* output(previous, count);
}

/** 由 runCommand 呼叫；args/stdin/ctx → 選定欄位或字元的行 iterator，依各檔案邊界讀取；無寫入。 */
function* cut(args, input, ctx) {
  let delimiter = '\t', fields = null, chars = null, suppress = false, stop = false;
  const operands = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!stop && arg === '--') { stop = true; continue; }
    if (!stop && /^-[dfcb]/.test(arg)) {
      const opt = arg[1], value = arg.slice(2) || args[++i];
      if (value === undefined) throw new Error(`option requires an argument -- '${opt}'`);
      if (opt === 'd') { delimiter = value; if (encoder.encode(value).length > 1) throw new Error('delimiter must be a single character'); }
      else if (opt === 'f') fields = value;
      else chars = value;
    } else if (!stop && arg === '-s') suppress = true;
    else if (!stop && arg.startsWith('-') && arg !== '-') throw new Error(`invalid option: ${arg}`);
    else operands.push(arg);
  }
  const selection = fields ?? chars;
  if (!selection) throw new Error('you must specify a list of bytes, characters, or fields');
  const ranges = selection.split(',').map(part => {
    const match = /^(\d+)?(?:-(\d+)?)?$/.exec(part);
    if (!match || (!match[1] && !match[2]) || Number(match[1] || 1) < 1) throw new Error('invalid field list');
    return [Number(match[1] || 1), part.includes('-') ? Number(match[2] || Infinity) : Number(match[1])];
  });
  // ranges 為 1-based 閉區間；keep 接收欄號回傳布林，選取順序沿原始行，不依範圍書寫順序重排。
  const keep = i => ranges.some(([a, b]) => i >= a && i <= b);
  for (const raw of sourceLines(operands, input, ctx)) {
    const line = withoutNewline(raw);
    if (fields !== null && !line.includes(delimiter)) { if (!suppress) yield line + '\n'; continue; }
    const values = fields !== null ? line.split(delimiter) : Array.from(line);
    yield values.filter((_, i) => keep(i + 1)).join(fields !== null ? delimiter : '') + '\n';
  }
}

/** 由 runCommand 呼叫；args/stdin/ctx → 行/字/字元/UTF-8 位元組計數 iterator；跨塊維持 inWord。 */
function* wc(args, input, ctx) {
  const { options, operands } = splitOptions(args, 'lwmc');
  const modes = options || 'lwc';
  const rows = [];
  let totalLines = 0, totalWords = 0, totalBytes = 0, totalChars = 0, fileSize = 0;
  for (const name of operands) if (name !== '-' && ctx.vfs.isFile(name)) fileSize += ctx.vfs.stat(name).size;
  for (const src of sources(operands, input, ctx)) {
    let nlines = 0, nwords = 0, nbytes = 0, nchars = 0, inWord = false;
    for (const chunk of src.chunks) {
      nbytes += encoder.encode(chunk).length;
      for (const ch of chunk) {
        nchars++;
        if (ch === '\n') nlines++;
        if (/\s/.test(ch)) inWord = false;
        else if (!inWord) { nwords++; inWord = true; }
      }
    }
    totalLines += nlines; totalWords += nwords; totalBytes += nbytes; totalChars += nchars;
    rows.push({ name: src.name, l: nlines, w: nwords, c: nbytes, m: nchars });
  }
  if (operands.length > 1) rows.push({ name: 'total', l: totalLines, w: totalWords, c: totalBytes, m: totalChars });
  const width = operands.length > 1 ? String(fileSize).length : modes.length > 1 ? 7 : 1;
  for (const row of rows) {
    const values = ['l', 'w', 'm', 'c'].filter(m => modes.includes(m)).map(m => String(row[m]).padStart(width, ' '));
    yield values.join(' ') + (row.name ? ' ' + row.name : '') + '\n';
  }
}

/** 由 runCommand 呼叫；args/ctx → 無 stdout 的 iterator，先整批保護 main，再逐項刪 VFS 並收集錯誤。 */
function* rm(args, ctx) {
  const { options, operands } = splitOptions(args, 'rfR');
  const recursive = options.includes('r') || options.includes('R');
  if (!operands.length && !options.includes('f')) throw new Error('missing operand');
  if (recursive && ctx.branch === 'main') {
    // Protect root/home, their ancestors, and expansions like $HOME/* as one
    // atomic operation. Dot aliases cannot bypass the guard.
    const danger = operands.some(path => {
      const p = ctx.vfs.resolve(path);
      return p === '/' || p === ctx.vfs.home || ctx.vfs.home.startsWith(p + '/');
    });
    if (danger || ctx.protectedGlob) { ctx.error('main: recursive removal of root/home is blocked', 1); return; }
  }
  for (const path of operands) {
    const absolute = ctx.vfs.resolve(path);
    if (absolute === '/' || absolute === '.' || absolute === '..') { ctx.error('refusing to remove root', 1); continue; }
    try { ctx.vfs.remove(path, { recursive, force: options.includes('f'), preserveHome: true }); }
    catch (e) { ctx.error(e.message, 1); }
  }
}

/**
 * 由 exec 呼叫；名稱/args/stdin/ctx → 惰性指令 iterator，消費時才執行並將例外轉為 ctx.error。
 * 故事指令多留空交 Engine 規則；真正的 cd/ln/rm 只改 VFS，無宿主磁碟或程序副作用。
 */
export function runCommand(name, args, input, ctx) {
  return (function* () {
    try {
      switch (name) {
        case 'ls': yield* ls(args, ctx); break;
        case 'pwd': yield ctx.vfs.cwd + '\n'; break;
        case 'cd': {
          if (args.length > 1) throw new Error('too many arguments');
          const dest = args[0] || ctx.vfs.home;
          if (!ctx.vfs.isDirectory(dest)) throw new Error(`${dest}: ${ctx.vfs.exists(dest) ? 'Not a directory' : 'No such file or directory'}`);
          ctx.vfs.cwd = ctx.vfs.resolve(dest);
          break;
        }
        case 'echo': {
          let newline = true;
          if (args[0] === '-n') { newline = false; args = args.slice(1); }
          yield args.join(' ') + (newline ? '\n' : '');
          break;
        }
        case 'cat': {
          const { operands } = splitOptions(args, 'u');
          yield* joinedSources(operands, input, ctx);
          break;
        }
        case 'grep': yield* grep(args, input, ctx); break;
        case 'head': case 'tail': yield* headTail(name, args, input, ctx); break;
        case 'sort': yield* sort(args, input, ctx); break;
        case 'uniq': yield* uniq(args, input, ctx); break;
        case 'cut': yield* cut(args, input, ctx); break;
        case 'wc': yield* wc(args, input, ctx); break;
        case 'ln': {
          const { options, operands } = splitOptions(args, 'f');
          if (operands.length !== 2) throw new Error('expected source and destination');
          if (options.includes('f') && ctx.vfs.isFile(operands[1])) ctx.vfs.remove(operands[1]);
          ctx.vfs.link(operands[0], operands[1]);
          break;
        }
        case 'rm': yield* rm(args, ctx); break;
        case 'mail': {
          if (!ctx.vfs.isFile('/var/mail/op')) throw new Error('No mail for op');
          ctx.read('/var/mail/op'); yield ctx.vfs.readFile('/var/mail/op'); break;
        }
        case 'systemctl':
          if (args[0] === 'status') yield ctx.flags.has('flag.lamp_lit') ? 'active (running)' : 'inactive (dead)';
          break;
        case 'man': {
          // Story/manual dialogue, including ticket-0001, is Engine-owned.
          if (args[0] === 'fsck' && DATA.text['text/ch1/man_fsck.txt']) yield DATA.text['text/ch1/man_fsck.txt'];
          break;
        }
        case 'git': case 'ssh': case 'ask': case 'finger': case 'close': case 'sudo':
        case 'hint': case 'skip': case 'save': case 'help': case 'merge': break;
        default:
          ctx.state.rc = 127;
          yield `bash: ${name}: command not found\n`;
      }
    } catch (e) { ctx.error(e.message, name === 'grep' || name === 'ls' ? 2 : 1); }
  })();
}
