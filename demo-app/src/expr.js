/**
 * 流程系統的受限運算式解析器，對應 demo/tools/flowexpr.py；不依賴其他檔案。
 * Engine.ev 傳入 flags/vars/funcs，輸出布林供規則、對話與引導條件使用。
 * 只允許環境明示函式；本模組不改環境，但呼叫端提供的 funcs 必須自行保證無副作用。
 */
/** The side-effect-free expression language from demo/tools/flowexpr.py. */
export class ExprError extends Error {
  /** 由剖析錯誤分支建立；訊息 → 可辨識的 ExprError，無資源需清理。 */
  constructor(message) { super(message); this.name = 'ExprError'; }
}

/** 由 evaluate 呼叫；來源文字 → [種類,值] token 陣列，非法位置拋 ExprError；不求值。 */
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

/** 由 Engine.ev/測試呼叫；運算式與環境 → 布林，完整解析後才回傳，未知函式/殘餘 token 拋錯。 */
export function evaluate(source, env = {}) {
  const tokens = tokenize(source);
  let index = 0;
  // 遞迴下降共用 index 游標；at 只查看，eat/expect 消費 token，優先序由 pOr 一路往下。
  const at = (kind, value) => tokens[index]?.[0] === kind && tokens[index]?.[1] === value;
  /** 由各文法層呼叫；無參數 → 下一 token 並推進 index，耗盡即拋錯。 */
  function eat() {
    if (index >= tokens.length) throw new ExprError('運算式提早結束');
    return tokens[index++];
  }
  /** 由括號解析呼叫；預期種類/值 → undefined，消費一個 token，不符即拋錯。 */
  function expect(kind, value) {
    const token = eat();
    if (token[0] !== kind || token[1] !== value) throw new ExprError(`缺少 ${value}`);
  }
  /** 根層/括號/參數呼叫；消費 or 串並回傳值，左右都解析，不依布林結果跳過右側。 */
  function pOr() {
    let value = pAnd();
    while (at('name', 'or')) { eat(); const right = pAnd(); value = Boolean(value) || Boolean(right); }
    return value;
  }
  /** 由 pOr 呼叫；消費 and 串並回傳值，同樣不保證短路，環境函式必須唯讀。 */
  function pAnd() {
    let value = pNot();
    while (at('name', 'and')) { eat(); const right = pNot(); value = Boolean(value) && Boolean(right); }
    return value;
  }
  /** 由 pAnd/自身呼叫；消費前綴 not 或轉交比較層，回傳否定布林或下層值。 */
  function pNot() {
    if (at('name', 'not')) { eat(); return !pNot(); }
    return pCompare();
  }
  /** 由 pNot 呼叫；解析至多一組比較，回傳布林或單獨原子值；跨型別排序不做強制轉型。 */
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
  /** 由比較層呼叫；消費常值/括號/環境名稱/函式參數，回傳其值，只有明示 env.funcs 可被呼叫。 */
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
