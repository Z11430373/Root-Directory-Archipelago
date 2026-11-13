/**
 * UI 偏好正規化層，無檔案依賴；main.js 從 storage 讀值再交此模組解析。
 * 與 RA1 進度完全分離，只回傳新值/說明文字，不寫 localStorage 或 DOM；可任意重算。
 */
const choices={style:['islands','server'],theme:['dark','contrast'],font:['small','medium','large']};

// Preferences are untrusted local JSON, independent from the portable game save.
/** main.js/resolvePreferences 呼叫；不可信 JSON 值 → 僅含白名單偏好的新物件，不修改來源。 */
export function sanitizePreferences(value) {
  const clean={};
  if(!value||typeof value!=='object'||Array.isArray(value))return clean;
  for(const [key,allowed] of Object.entries(choices)) {
    if(Object.hasOwn(value,key)&&allowed.includes(value[key]))clean[key]=value[key];
  }
  return clean;
}
/** main.js 呼叫；偏好/系統明暗/主持模式 → 完整 style/theme/font，預設不覆蓋使用者合法選擇。 */
export function resolvePreferences(value,{prefersLight=false,hostMode=false}={}) {
  const prefs=sanitizePreferences(value);
  return {style:prefs.style||'islands',theme:prefs.theme||(prefersLight?'contrast':'dark'),font:prefs.font||(hostMode?'large':'medium')};
}
/** main.js 說明區呼叫；style → 對應介面說明字串，不新增遊戲規則或改存檔。 */
export const styleDescription=style=>style==='server'
  ?'Bash 終端（模擬）：連續輸出、Bash 指令與行編輯。game help 查看遊戲命令；F2 返回群島模式。'
  :'群島模式：任務面板與指令按鈕，使用相同的 Bash 相容引擎。切換只改介面，保留進度、Shell 狀態、歷史與草稿。';
