/**
 * UI 的安全 DOM/剪貼簿原語，無檔案依賴；供 main.js 與 terminal.js 使用。
 * 字串只建立文字節點；呼叫端提供可信 tag/屬性，持有回傳節點並在重建畫面時移除。
 */
/** main/Terminal 呼叫；tag/屬性/子節點 → 新 DOM 元素，綁本元素事件但不自動掛入頁面。 */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== false && value !== undefined && value !== null) node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  return node;
}
/** main.js 呼叫；文案/點擊函式/屬性 → type=button 元素，handler 隨節點移除釋放；不自行提交表單。 */
export const button = (text, fn, attrs = {}) => el('button', { type:'button', onClick:fn, ...attrs }, text);

/** 匯出/救援按鈕呼叫；文字/備用 textarea/status → Promise<boolean>，寫剪貼簿；失敗聚焦選取全文並更新狀態。 */
export async function copyText(text, textarea, status) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = '已複製。';
    return true;
  } catch {
    if (textarea) { textarea.focus(); textarea.select(); }
    status.textContent = '無法自動複製；已選取全文，請手動複製。';
    return false;
  }
}
