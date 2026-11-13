/**
 * ============================================================================
 * 模組：save/canonical.js — 存檔規範化子系統
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：errors.js（CodeError）
 *   - 被：hash.js（計算 commit ID）、codec.js（壓縮代碼）、驗證與測試模組
 * 職責：
 *   1. 將 JSON 值轉換為無空白且鍵已排序的 JSON 字串。
 *   2. 確保跨 Python/JavaScript 的序列化結果一致，作為雜湊鏈的輸入。
 *   3. 拒絕浮點數、循環引用、非安全物件原型等不安全值。
 * 設計原則：
 *   - 不改寫輸入資料。
 *   - 排序、整數或跳脫規則的任何變更都會影響所有既有 commit ID（破壞性變更）。
 *   - 採用 Unicode 碼點排序（與 Python 一致，而非 UTF-16 代碼單元或 locale 排序）。
 * ============================================================================
 */

import { CodeError } from './errors.js';

/**
 * Python 排序依據 Unicode 碼點，而非 UTF-16 代碼單元或 locale 定序。
 * 本比較器用於物件鍵排序，確保與 Python 參考實作相同的字串序列。
 *
 * @param {string} a - 第一個字串
 * @param {string} b - 第二個字串
 * @returns {number} Unicode 碼點比較值（負數/零/正數），無副作用或資源
 */
function unicodeCompare(a, b) {
  const aa = Array.from(a, c => c.codePointAt(0));
  const bb = Array.from(b, c => c.codePointAt(0));
  for (let i = 0; i < Math.min(aa.length, bb.length); i++) {
    if (aa[i] !== bb[i]) return aa[i] - bb[i];
  }
  return aa.length - bb.length;
}

/**
 * 將 JSON 值編碼為無空白且鍵已排序的 JSON 字串。
 * 由 hash.js、codec.js 與測試呼叫，作為雜湊鏈與代碼壓縮的確定性輸入。
 *
 * @param {any} value - 要編碼的 JSON 值
 * @returns {string} 無空白、鍵排序的 JSON 字串
 * @throws {CodeError} 當值為非安全整數、非法物件、巢狀過深 (>64) 或循環引用時
 */
export function canonical(value) {
  const ancestors = new Set();

  /**
   * 遞迴編碼目前值與深度；回傳編碼後的字串片段。
   * 維護 ancestors 集合以偵測循環引用，離開節點時移除祖先標記。
   *
   * @param {any} v - 目前要編碼的值
   * @param {number} depth - 目前巢狀深度
   * @returns {string} 編碼後的 JSON 片段
   */
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
