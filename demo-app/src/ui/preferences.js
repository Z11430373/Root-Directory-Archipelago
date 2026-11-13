/**
 * ============================================================================
 * 模組：ui/preferences.js — UI 偏好正規化層
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：main.js（sanitizePreferences/resolvePreferences/styleDescription）
 * 職責：
 *   1. choices：偏好白名單（style/theme/font 各自允許值）。
 *   2. sanitizePreferences()：不可信 JSON 值 → 僅含白名單偏好的新物件。
 *   3. resolvePreferences()：偏好/系統明暗/主持模式 → 完整 style/theme/font。
 *   4. styleDescription()：style → 對應介面說明字串。
 * 設計原則：
 *   - 與 RA1 進度完全分離，只回傳新值/說明文字。
 *   - 不寫 localStorage 或 DOM；可任意重算。
 * ============================================================================
 */

const choices={style:['islands','server'],theme:['dark','contrast'],font:['small','medium','large']};

// Preferences are untrusted local JSON, independent from the portable game save.
/**
 * 正規化不可信偏好 JSON 值。
 * main.js/resolvePreferences 呼叫，回傳僅含白名單偏好的新物件，不修改來源。
 *
 * @param {any} value - 不可信的偏好值
 * @returns {Object} 僅含白名單偏好的新物件
 */
export function sanitizePreferences(value) {
  const clean={};
  if(!value||typeof value!=='object'||Array.isArray(value))return clean;
  for(const [key,allowed] of Object.entries(choices)) {
    if(Object.hasOwn(value,key)&&allowed.includes(value[key]))clean[key]=value[key];
  }
  return clean;
}
/**
 * 解析完整偏好設定。
 * main.js 呼叫，偏好/系統明暗/主持模式 → 完整 style/theme/font。
 * 預設不覆蓋使用者合法選擇。
 *
 * @param {any} value - 偏好值
 * @param {Object} [options] - { prefersLight, hostMode }
 * @returns {Object} { style, theme, font }
 */
export function resolvePreferences(value,{prefersLight=false,hostMode=false}={}) {
  const prefs=sanitizePreferences(value);
  return {style:prefs.style||'islands',theme:prefs.theme||(prefersLight?'contrast':'dark'),font:prefs.font||(hostMode?'large':'medium')};
}
/**
 * 回傳 style 對應的介面說明字串。
 * main.js 說明區呼叫，不新增遊戲規則或改存檔。
 *
 * @param {string} style - 介面風格（'islands' 或 'server'）
 * @returns {string} 說明字串
 */
export const styleDescription=style=>style==='server'
  ? '伺服器終端：全螢幕、等寬字型、無頁首。'
  : '群島介面：有頁首、比例字型、保存與設定按鈕。';