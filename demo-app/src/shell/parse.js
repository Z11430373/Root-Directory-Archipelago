// This is a parser for the game's shell language, never a host-shell bridge.
export function tokenize(raw) {
  const tokens = [];
  let parts = [], text = '', started = false, quote = null;
  let expand = true, tilde = false, glob = false;
  const flushPart = () => { if (text) parts.push({ text, expand, glob: quote === null && expand }); text = ''; };
  const mode = value => { if (expand !== value) { flushPart(); expand = value; } };
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

export function parse(raw) {
  const tokens = tokenize(String(raw));
  if (!tokens.length) return [];
  const result = [];
  let pipeline = { connector: null, commands: [] };
  let command = { words: [], redirects: [] };
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

export function expandWord(word, vfs, rc = 0, globPattern = false) {
  let value = word.parts.map(part => {
    const expanded = part.expand ? part.text.replace(/\$(\?|HOME\b|\{HOME\})/g, (_, name) => name === '?' ? String(rc) : vfs.home) : part.text;
    return globPattern && !part.glob ? expanded.replace(/[?*[\]\\]/g, '\\$&') : expanded;
  }).join('');
  if (word.tilde && (value === '~' || value.startsWith('~/'))) value = vfs.home + value.slice(1);
  return value;
}
