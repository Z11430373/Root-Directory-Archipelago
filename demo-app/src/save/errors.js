/**
 * ============================================================================
 * 模組：save/errors.js — 存檔系統錯誤邊界層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：被 codec.js、state.js、validate.js、import.js、hash.js 等所有存檔相關模組 import；不依賴任何其他檔案。
 * 職責：
 *   1. 定義 CodeError 類別，為所有存檔錯誤提供統一的 name/code 欄位。
 *   2. 提供 codeError() 將任意錯誤轉換為 CodeError，避免洩漏內部細節給使用者。
 *   3. 提供 requireThat() 執行斷言檢查，條件不成立即拋出 CodeError。
 * 設計原則：
 *   - 不修改輸入資料，不持有外部資源，不負責 UI 顯示。
 *   - 所有存檔相關的安全檢查應使用本模組的錯誤類型，確保錯誤處理一致。
 * ============================================================================
 */

/**
 * 儲存系統專用錯誤類別。
 * 由所有存檔安全檢查（解析、解壓、驗證、鏈核對）建立。
 * 提供 name='CodeError' 與 code 欄位，讓呼叫端可透過 instanceof 或 code 判斷錯誤種類。
 *
 * @param {string} message - 使用者可讀的錯誤訊息
 * @param {string} [code='invalid_save'] - 錯誤代號，供前端/測試分類處理
 * @returns {void} 無外部副作用
 */
export class CodeError extends Error {
  constructor(message, code = 'invalid_save') {
    super(message);
    this.name = 'CodeError';
    this.code = code;
  }
}

/**
 * 將任意錯誤轉換為 CodeError。
 * 若輸入已是 CodeError，原樣回傳（保留既有安全錯誤的細節）；否則建立新 CodeError，
 * 使用備用訊息隱藏內部實作細節，避免將系統錯誤洩漏給使用者。
 *
 * @param {Error} error - 原始錯誤物件
 * @param {string} [message='存檔內容格式錯誤'] - 備用訊息，當非 CodeError 時使用
 * @returns {CodeError} 轉換後的錯誤物件
 */
export function codeError(error, message = '存檔內容格式錯誤') {
  return error instanceof CodeError ? error : new CodeError(message);
}

/**
 * 執行斷言檢查，條件不成立即拋出 CodeError。
 * 由 codec/state/validate 等模組呼叫，用於驗證輸入參數與中間狀態。
 * 檢查成立時回傳 undefined，不改動任何資料。
 *
 * @param {any} condition - 要檢查的條件值
 * @param {string} message - 檢查失敗時的錯誤訊息
 * @returns {undefined} 檢查通過時回傳 undefined
 */
export function requireThat(condition, message) {
  if (!condition) throw new CodeError(message);
}
