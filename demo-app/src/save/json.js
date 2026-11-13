/**
 * ============================================================================
 * 模組：save/json.js — 不可信存檔 JSON 的詞法與物件樹安全層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（LIMITS）、errors.js（CodeError/codeError）
 *   - 被：codec.js（importCode 解壓後解析）、import.js（importFile 準入）、validate.js（checkShape）、state.js（unpack 檢查物件樹）
 * 職責：
 *   1. isRecord()：判斷值是否為普通物件或 null-prototype 非陣列物件。
 *   2. parseSaveJSON()：Token 感知的 JSON 解析器，保留數字精度、拒絕浮點詞法、重複鍵與污染鍵。
 *   3. checkJSONTree()：遞迴檢查記憶體 JSON 值，拒絕循環引用、getter、symbol 與污染鍵。
 * 設計原則：
 *   - 不執行輸入內容（不使用 eval/new Function），不修改來源。
 *   - 錯誤皆轉為 CodeError，暫存集合隨呼叫釋放。
 *   - JSON.parse 單獨使用會丟失 1.0、1e0、重複鍵與精度，故自行實作解析器。
 * ============================================================================
 */

import { LIMITS } from './config.js';
import { CodeError, codeError } from './errors.js';

/**
 * 污染鍵集合，拒絕原型污染攻擊（__proto__、constructor、prototype）。
 * @type {Set<string>}
 */
const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * 判斷值是否為普通物件或 null-prototype 非陣列物件。
 * 供 validate/state 呼叫，用於確認物件安全性。
 *
 * @param {any} o - 要檢查的值
 * @returns {boolean} 是否為普通或 null-prototype 非陣列物件
 */
export const isRecord = o => o !== null && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);

/**
 * Token 感知的受限 JSON 解析器。
 * 由代碼/JSON 檔匯入呼叫，將受限 ASCII/整數 JSON 文字轉換為新值。
 * 拒絕浮點詞法、重複鍵與污染鍵，不將輸入評估為程式碼。
 *
 * @param {string} text - JSON 文字
 * @returns {any} 解析後的新值
 * @throws {CodeError} 當文字不是合法 JSON、過大、含浮點數、重複鍵或污染鍵時
 */
export function parseSaveJSON(text) {
  try {
    if (typeof text !== 'string' || text.length > LIMITS.max_inflated_bytes
      || new TextEncoder().encode(text).length > LIMITS.max_inflated_bytes) {
      throw new CodeError('存檔檔案過大');
    }
    let pos = 0;
    let nodes = 0;
    // fail/whitespace 只操作本次剖析游標；前者統一拒絕，後者僅跳過 JSON 定義的四種空白（空格、Tab、換行、回車）。
    const fail = () => { throw new CodeError('存檔檔案不是合法的 JSON'); };
    const whitespace = () => { while (pos < text.length && /[\x20\x09\x0a\x0d]/.test(text[pos])) pos++; };
    /**
     * 由 value 及物件鍵解析呼叫；從引號處前進 pos，回傳解碼後的受限字串或拋錯。
     * 字串長度不得超過 max_string_len，且只接受 ASCII 字元（U+0000-U+007F）。
     */
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
        // 最多六個來源字元對應一個解碼後的 ASCII 字元。
        if (pos - start > LIMITS.max_string_len * 6 + 2) throw new CodeError('存檔字串過長');
      }
      fail();
    }
    /**
     * 遞迴讀取指定深度的值；回傳新物件/陣列/純量，累計節點數並拒絕深度與數值越界。
     *
     * @param {number} depth - 目前巢狀深度
     * @returns {any} 解析後的值
     */
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

/**
 * 遞迴檢查記憶體 JSON 值，拒絕循環引用、getter、symbol 與污染鍵。
 * 由 checkShape/unpack 呼叫，用於確認記憶體中的 JSON 物件安全。
 *
 * @param {any} value - 要檢查的 JSON 值
 * @returns {undefined} 檢查通過時回傳 undefined
 * @throws {CodeError} 當檢測到循環引用、巢狀過深、非安全整數、污染鍵或 symbol 時
 */
export function checkJSONTree(value) {
  const ancestors = new Set();
  let nodes = 0;
  /**
   * 遞迴檢查值與深度；以 property descriptor 讀取子值而不執行 getter，離開時清除祖先標記。
   *
   * @param {any} o - 目前要檢查的值
   * @param {number} depth - 目前巢狀深度
   * @returns {void}
   */
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
