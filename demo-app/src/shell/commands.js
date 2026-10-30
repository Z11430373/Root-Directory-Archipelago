import { DATA } from '../data.js';
import { compileBRE } from './bre.js';
import { lines, withoutNewline } from './stream.js';

const encoder = new TextEncoder();
function compareBytes(a, b) {
  if (a === b) return 0;
  // ASCII and BMP text share UTF-8/UTF-16 ordering. Encode only rare astrals.
  if (!/[\uD800-\uDFFF]/.test(a + b)) return a < b ? -1 : 1;
  const aa = encoder.encode(a), bb = encoder.encode(b);
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
  return aa.length - bb.length;
}

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
function* joinedSources(operands, input, ctx) {
  for (const src of sources(operands, input, ctx)) yield* src.chunks;
}
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
function modeString(perms, dir) {
  const n = parseInt(perms, 8);
  let out = dir ? 'd' : '-';
  for (const shift of [6, 3, 0]) { const bits = n >> shift; out += (bits & 4 ? 'r' : '-') + (bits & 2 ? 'w' : '-') + (bits & 1 ? 'x' : '-'); }
  return out;
}
function* ls(args, ctx) {
  const { options, operands } = splitOptions(args, 'alitr');
  const targets = operands.length ? operands : ['.'];
  const long = options.includes('l'), inode = options.includes('i'), all = options.includes('a');
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
  const all = [...lines(joinedSources(operands, input, ctx))].map(withoutNewline).sort(compare);
  let previous;
  for (const line of all) { if (!unique || previous === undefined || compare(previous, line)) yield line + '\n'; previous = line; }
}

function* uniq(args, input, ctx) {
  const { options, operands } = splitOptions(args, 'cdui');
  if (operands.length > 1) throw new Error('output file operand is not supported; use >');
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
  const keep = i => ranges.some(([a, b]) => i >= a && i <= b);
  for (const raw of lines(joinedSources(operands, input, ctx))) {
    const line = withoutNewline(raw);
    if (fields !== null && !line.includes(delimiter)) { if (!suppress) yield line + '\n'; continue; }
    const values = fields !== null ? line.split(delimiter) : Array.from(line);
    yield values.filter((_, i) => keep(i + 1)).join(fields !== null ? delimiter : '') + '\n';
  }
}

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
          yield `bash: ${name}: command not found`;
      }
    } catch (e) { ctx.error(e.message, name === 'grep' || name === 'ls' ? 2 : 1); }
  })();
}
