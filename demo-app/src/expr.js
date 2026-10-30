/** The side-effect-free expression language from demo/tools/flowexpr.py. */
export class ExprError extends Error {
  constructor(message) { super(message); this.name = 'ExprError'; }
}

export function tokenize(source) {
  const text = String(source).trimEnd();
  const pattern = /\s*(?:(\d+)|('[^']*'|"[^"]*")|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_-]+)*)|(==|!=|<=|>=|<|>|\(|\)|,))/y;
  const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    pattern.lastIndex = pos;
    const match = pattern.exec(text);
    if (!match) throw new ExprError(`無法解析（位置 ${pos}）：${text.slice(pos, pos + 10)}`);
    pos = pattern.lastIndex;
    if (match[1] !== undefined) tokens.push(['int', Number(match[1])]);
    else if (match[2] !== undefined) tokens.push(['str', match[2].slice(1, -1)]);
    else if (match[3] !== undefined) tokens.push(['name', match[3]]);
    else tokens.push(['op', match[4]]);
  }
  return tokens;
}

export function evaluate(source, env = {}) {
  const tokens = tokenize(source);
  let index = 0;
  const at = (kind, value) => tokens[index]?.[0] === kind && tokens[index]?.[1] === value;
  function eat() {
    if (index >= tokens.length) throw new ExprError('運算式提早結束');
    return tokens[index++];
  }
  function expect(kind, value) {
    const token = eat();
    if (token[0] !== kind || token[1] !== value) throw new ExprError(`缺少 ${value}`);
  }
  function pOr() {
    let value = pAnd();
    while (at('name', 'or')) { eat(); const right = pAnd(); value = Boolean(value) || Boolean(right); }
    return value;
  }
  function pAnd() {
    let value = pNot();
    while (at('name', 'and')) { eat(); const right = pNot(); value = Boolean(value) && Boolean(right); }
    return value;
  }
  function pNot() {
    if (at('name', 'not')) { eat(); return !pNot(); }
    return pCompare();
  }
  function pCompare() {
    const left = pAtom();
    const [kind, op] = tokens[index] || [];
    if (kind !== 'op' || !['==', '!=', '<=', '>=', '<', '>'].includes(op)) return left;
    eat();
    const right = pAtom();
    const same = typeof left === typeof right;
    if (op === '==') return same && left === right;
    if (op === '!=') return !same || left !== right;
    if (!same) return false;
    if (op === '<=') return left <= right;
    if (op === '>=') return left >= right;
    if (op === '<') return left < right;
    return left > right;
  }
  function pAtom() {
    const [kind, value] = eat();
    if (kind === 'int' || kind === 'str') return value;
    if (kind === 'op' && value === '(') { const result = pOr(); expect('op', ')'); return result; }
    if (kind === 'name') {
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (at('op', '(')) {
        eat();
        const args = [];
        if (!at('op', ')')) {
          args.push(pOr());
          while (at('op', ',')) { eat(); args.push(pOr()); }
        }
        expect('op', ')');
        const fn = Object.hasOwn(env.funcs || {}, value) ? env.funcs[value] : null;
        if (typeof fn !== 'function') throw new ExprError(`不認得的函式：${value}`);
        return fn(...args);
      }
      if (value.startsWith('flag.')) return env.flags instanceof Set ? env.flags.has(value) : (env.flags || []).includes(value);
      return Object.hasOwn(env.vars || {}, value) ? env.vars[value] : false;
    }
    throw new ExprError(`意外的符號：${value}`);
  }
  const result = pOr();
  if (index !== tokens.length) throw new ExprError(`多餘的符號：${tokens[index][1]}`);
  return Boolean(result);
}
