/**
 * 存檔規範化子系統：將 JSON 值轉為跨 Python/JavaScript 一致的字串。
 * 依賴 errors.js；hash.js 與 codec.js 使用其輸出計算鏈 ID、壓縮代碼。
 * 不改寫輸入；排序、整數或跳脫規則的變更會影響所有既有 commit ID。
 */
import { CodeError } from './errors.js';

// Python sorts Unicode code points, not UTF-16 code units or locale collation.
/** 由 canonical 的物件鍵排序呼叫；兩字串 → Unicode 碼點比較值，無副作用或資源。 */
function unicodeCompare(a, b) {
  const aa = Array.from(a, c => c.codePointAt(0));
  const bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return aa.length - bb.length;
}

/** 由 hash/codec 與測試呼叫；JSON 值 → 無空白且鍵排序的 JSON 字串，非法值拋 CodeError。 */
export function canonical(value) {
  const ancestors = new Set();
  /** 遞迴編碼目前值與深度；回傳片段，暫存祖先以拒絕循環，離開節點即移除祖先。 */
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
