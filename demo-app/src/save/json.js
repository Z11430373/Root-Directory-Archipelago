import { LIMITS } from './config.js';
import { CodeError, codeError } from './errors.js';

const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
export const isRecord = o => o !== null && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);

// A token-aware parser: JSON.parse alone loses 1.0, 1e0, duplicate keys and
// precision before a reviver can check them. Never evaluates input as code.
export function parseSaveJSON(text) {
  try {
    if (typeof text !== 'string' || text.length > LIMITS.max_inflated_bytes
      || new TextEncoder().encode(text).length > LIMITS.max_inflated_bytes) {
      throw new CodeError('存檔檔案過大');
    }
    let pos = 0;
    let nodes = 0;
    const fail = () => { throw new CodeError('存檔檔案不是合法的 JSON'); };
    const whitespace = () => { while (pos < text.length && /[\x20\x09\x0a\x0d]/.test(text[pos])) pos++; };
    function string() {
      const start = pos++;
      while (pos < text.length) {
        const c = text[pos++];
        if (c === '"') {
          const result = JSON.parse(text.slice(start, pos));
          if (result.length > LIMITS.max_string_len || /[^\x00-\x7f]/.test(result)) {
            throw new CodeError('存檔字串不合規則');
          }
          return result;
        }
        if (c < ' ') fail();
        if (c === '\\') {
          const escape = text[pos++];
          if (escape === 'u') {
            if (!/^[0-9a-fA-F]{4}$/.test(text.slice(pos, pos + 4))) fail();
            pos += 4;
          } else if (!escape || !'"\\/bfnrt'.includes(escape)) fail();
        }
        // At most six source characters per decoded ASCII character.
        if (pos - start > LIMITS.max_string_len * 6 + 2) throw new CodeError('存檔字串過長');
      }
      fail();
    }
    function value(depth) {
      if (++nodes > 16000 || depth > LIMITS.max_depth) throw new CodeError('存檔巢狀過深或內容過多');
      whitespace();
      const c = text[pos];
      if (c === '"') return string();
      if (c === '{' || c === '[') {
        if (depth + 1 > LIMITS.max_depth) throw new CodeError('存檔巢狀過深');
        pos++;
        const object = c === '{';
        const result = object ? {} : [];
        const close = object ? '}' : ']';
        const keys = new Set();
        whitespace();
        if (text[pos] === close) { pos++; return result; }
        for (;;) {
          whitespace();
          if (object) {
            if (text[pos] !== '"') fail();
            const key = string();
            if (keys.has(key) || dangerousKeys.has(key)) throw new CodeError('存檔含重複或不安全的欄位');
            keys.add(key);
            whitespace();
            if (text[pos++] !== ':') fail();
            result[key] = value(depth + 1);
          } else {
            result.push(value(depth + 1));
          }
          whitespace();
          const delimiter = text[pos++];
          if (delimiter === close) return result;
          if (delimiter !== ',') fail();
        }
      }
      for (const [token, result] of [['true', true], ['false', false], ['null', null]]) {
        if (text.startsWith(token, pos)) { pos += token.length; return result; }
      }
      if (c === '-' || (c >= '0' && c <= '9')) {
        const match = /^-?(?:0|[1-9][0-9]*)/.exec(text.slice(pos));
        if (!match) fail();
        pos += match[0].length;
        if (/[.eE]/.test(text[pos] ?? '')) throw new CodeError('存檔不接受浮點數或特殊數值');
        const number = Number(match[0]);
        if (!Number.isSafeInteger(number)) throw new CodeError('存檔整數超出安全範圍');
        return number === 0 ? 0 : number;
      }
      fail();
    }
    const result = value(0);
    whitespace();
    if (pos !== text.length) fail();
    return result;
  } catch (error) { throw codeError(error, '存檔檔案不是合法的 JSON'); }
}

export function checkJSONTree(value) {
  const ancestors = new Set();
  let nodes = 0;
  function visit(o, depth) {
    if (++nodes > 16000 || depth > LIMITS.max_depth) throw new CodeError('存檔巢狀過深或內容過多');
    if (typeof o === 'string') {
      if (o.length > LIMITS.max_string_len || /[^\x00-\x7f]/.test(o)) throw new CodeError('存檔字串不合規則');
    } else if (typeof o === 'number') {
      if (!Number.isSafeInteger(o)) throw new CodeError('存檔不接受浮點數或特殊數值');
    } else if (o !== null && typeof o !== 'boolean') {
      if (!Array.isArray(o) && !isRecord(o)) throw new CodeError('存檔物件格式錯誤');
      if (ancestors.has(o) || depth + 1 > LIMITS.max_depth) throw new CodeError('存檔巢狀過深');
      ancestors.add(o);
      const descriptors = Object.getOwnPropertyDescriptors(o);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (Array.isArray(o) && key === 'length') continue;
        if (!Object.hasOwn(descriptor, 'value') || dangerousKeys.has(key)) throw new CodeError('存檔含不安全的欄位');
        visit(key, depth + 1);
        visit(descriptor.value, depth + 1);
      }
      if (Object.getOwnPropertySymbols(o).length) throw new CodeError('存檔含不安全的欄位');
      ancestors.delete(o);
    }
  }
  visit(value, 0);
}
