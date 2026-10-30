import { CodeError } from './errors.js';

// Python sorts Unicode code points, not UTF-16 code units or locale collation.
function unicodeCompare(a, b) {
  const aa = Array.from(a, c => c.codePointAt(0));
  const bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return aa.length - bb.length;
}

export function canonical(value) {
  const ancestors = new Set();
  function visit(v, depth) {
    if (depth > 64) throw new CodeError('JSON 巢狀過深');
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) throw new CodeError('存檔不接受浮點數或特殊數值');
      return String(v === 0 ? 0 : v);
    }
    if (!v || typeof v !== 'object' || ancestors.has(v)) throw new CodeError('不是合法的 JSON 值');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null) {
      throw new CodeError('JSON 物件格式錯誤');
    }
    ancestors.add(v);
    let result;
    if (Array.isArray(v)) {
      result = '[' + Array.from(v, child => visit(child, depth + 1)).join(',') + ']';
    } else {
      result = '{' + Object.keys(v).sort(unicodeCompare)
        .map(key => JSON.stringify(key) + ':' + visit(v[key], depth + 1)).join(',') + '}';
    }
    ancestors.delete(v);
    return result;
  }
  return visit(value, 0);
}
