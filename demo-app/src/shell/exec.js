import { DATA } from '../data.js';
import { parse, expandWord } from './parse.js';
import { runCommand } from './commands.js';
import { fromText, collect } from './stream.js';

function expandGlob(value, vfs, globPattern = value) {
  if (!/[*?[]/.test(globPattern)) return [value];
  const absolute = vfs.resolve(globPattern);
  const parts = absolute.split('/').slice(1);
  let candidates = ['/'];
  for (const part of parts) {
    let pattern = '^';
    for (let i = 0; i < part.length; i++) {
      const ch = part[i];
      if (ch === '\\' && i + 1 < part.length) pattern += part[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      else if (ch === '*') pattern += '.*';
      else if (ch === '?') pattern += '.';
      else if (ch === '[') {
        const end = part.indexOf(']', i + 1);
        if (end >= 0) { pattern += part.slice(i, end + 1).replace(/^\[!/, '[^'); i = end; }
        else pattern += '\\[';
      } else pattern += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    const regex = new RegExp(pattern + '$');
    const next = [];
    for (const dir of candidates) {
      if (!vfs.isDirectory(dir)) continue;
      for (const name of vfs.list(dir, { all: part.startsWith('.') })) if (regex.test(name)) next.push(vfs.resolve(`${dir}/${name}`));
    }
    candidates = next;
  }
  if (!candidates.length) return [value];
  return candidates.sort().map(path => value.startsWith('/') ? path : path.startsWith(vfs.cwd + '/') ? path.slice(vfs.cwd.length + 1) : path);
}

export function execute(raw, vfs, options = {}) {
  // VFS's public API deliberately accepts ~/$HOME for flow expressions. The
  // shell has already expanded those tokens with quote awareness: a remaining
  // quoted '~' or '$HOME' is a literal filename, not a second expansion.
  vfs = new Proxy(vfs, {
    get(target, key, receiver) {
      if (key === 'resolve') return (path = '.') => {
        path = String(path);
        if (/^(?:~|\$HOME)(?:\/|$)/.test(path)) path = `${target.cwd}/${path}`;
        return target.resolve(path);
      };
      return Reflect.get(target, key, receiver);
    }
  });
  const reads = [], readSet = new Set(), readEvents = [];
  const result = { stdout: '', stderr: '', rc: 0, reads, readEvents };
  let script;
  try { script = parse(raw); }
  catch (error) { return { ...result, rc: 2, stderr: `bash: ${error.message}\n` }; }
  const flags = options.flags || vfs.flags || new Set();
  const branch = options.branch || 'main';
  const whitelist = new Set(DATA.yaml['demo/demo.yaml'].command_whitelist);
  const read = path => {
    path = vfs.resolve(path);
    if (!readSet.has(path)) {
      readSet.add(path); reads.push(path);
      readEvents.push({ path, same_inode: vfs.sameInodePaths(path) });
    }
  };
  for (const pipeline of script) {
    if (pipeline.connector === '&&' && result.rc !== 0) continue;
    const states = [];
    let input = fromText('');
    const previousRC = result.rc;
    for (const command of pipeline.commands) {
      const state = { rc: 0, stderr: '' };
      states.push(state);
      const error = (message, rc = 1) => { state.rc = rc; state.stderr += `${message}\n`; };
      const words = command.words.map(word => ({ word, value: expandWord(word, vfs, previousRC), pattern: expandWord(word, vfs, previousRC, true) }));
      const name = words[0]?.value || '';
      const args = words.slice(1).flatMap(({ word, value, pattern }) => word.glob ? expandGlob(value, vfs, pattern) : [value]);
      const protectedGlob = name === 'rm' && words.slice(1).some(({ word, value }) => {
        if (!word.glob) return false;
        const first = value.search(/[*?[]/);
        const prefix = vfs.resolve(value.slice(0, first));
        return prefix === '/' || prefix === vfs.home;
      });
      const allowed = whitelist.has(name) && name !== 'block' && name !== 'pass' || (name === 'merge' && args[0] === '--knowledge');
      let output;
      const ctx = { vfs, flags, branch, state, read, error, protectedGlob };
      if (!allowed) {
        state.rc = 127;
        output = fromText(`bash: ${name}: command not found`);
      } else output = runCommand(name, args, input, ctx);
      if (command.redirects.length) {
        try {
          // Shell opens every redirect left-to-right before running the command.
          let destination;
          for (const redirect of command.redirects) {
            const value = expandWord(redirect.target, vfs, previousRC);
            const targets = redirect.target.glob ? expandGlob(value, vfs, expandWord(redirect.target, vfs, previousRC, true)) : [value];
            if (targets.length !== 1) throw new Error('ambiguous redirect');
            destination = targets[0];
            vfs.writeFile(destination, '', { append: redirect.append, parents: false });
          }
          const chunks = output;
          output = (function* () {
            for (const chunk of chunks) vfs.writeFile(destination, chunk, { append: true, parents: false });
          })();
        } catch (e) { error(e.message); output = fromText(''); }
      }
      input = output;
    }
    try { result.stdout += collect(input); }
    catch (error) { const last = states[states.length - 1]; last.rc = 1; last.stderr += error.message + '\n'; }
    for (const state of states) result.stderr += state.stderr;
    result.rc = states[states.length - 1].rc;
  }
  return result;
}
