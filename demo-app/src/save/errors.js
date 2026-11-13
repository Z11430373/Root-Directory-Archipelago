/**
 * 存檔錯誤邊界：不依賴其他檔案，供解析、解壓、驗證與 Engine 安全限制共用。
 * 將內部例外轉為可顯示的 CodeError；不持有外部資源，也不負責 UI 顯示。
 */
export class CodeError extends Error {
  /** 由各安全檢查建立；輸入文案與錯誤代號，產生具 name/code 的錯誤，無外部副作用。 */
  constructor(message, code = 'invalid_save') {
    super(message);
    this.name = 'CodeError';
    this.code = code;
  }
}

/** 由匯入邊界呼叫；輸入任意錯誤與備用文案，回傳 CodeError，保留既有安全錯誤而隱藏其他細節。 */
export function codeError(error, message = '存檔內容格式錯誤') {
  return error instanceof CodeError ? error : new CodeError(message);
}

/** 由 codec/state/validate 呼叫；條件不成立即拋 CodeError，成立回傳 undefined；不改動資料。 */
export function requireThat(condition, message) {
  if (!condition) throw new CodeError(message);
}
