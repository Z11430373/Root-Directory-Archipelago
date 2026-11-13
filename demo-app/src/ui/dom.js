/**
 * ============================================================================
 * 模組：ui/dom.js — UI 的安全 DOM/剪貼簿原語
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 無檔案依賴（純 DOM 操作）
 *   - 被：main.js、terminal.js、console-view.js、xterm-console.js
 * 職責：
 *   1. el()：tag/屬性/子節點 → 新 DOM 元素，字串只建立文字節點（安全）。
 *   2. button()：文案/點擊函式/屬性 → type=button 元素。
 *   3. copyText()：文字/備用 textarea/status → Promise<boolean>，寫剪貼簿。
 * 設計原則：
 *   - 字串只建立文字節點，防止 XSS。
 *   - 呼叫端提供可信 tag/屬性，持有回傳節點並在重建畫面時移除。
 *   - 綁本元素事件但不自動掛入頁面。
 * ============================================================================
 */

/**
 * 建立 DOM 元素。
 * tag/屬性/子節點 → 新 DOM 元素，字串只建立文字節點，防止 XSS。
 * 綁本元素事件但不自動掛入頁面。
 *
 * @param {string} tag - 元素標籤名
 * @param {Object} [attrs={}] - 屬性物件（class/text/on* 特殊處理）
 * @param {...any} children - 子節點或字串
 * @returns {HTMLElement} 新建立的 DOM 元素
 */
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
/**
 * 建立 type=button 元素。
 * 文案/點擊函式/屬性 → type=button 元素，handler 隨節點移除釋放；不自行提交表單。
 *
 * @param {string} text - 按鈕文案
 * @param {Function} fn - 點擊函式
 * @param {Object} [attrs={}] - 額外屬性
 * @returns {HTMLButtonElement} 新建立的按鈕元素
 */
export const button = (text, fn, attrs = {}) => el('button', { type:'button', onClick:fn, ...attrs }, text);

/**
 * 複製文字到剪貼簿。
 * 文字/備用 textarea/status → Promise<boolean>，寫剪貼簿，失敗時降級到 textarea 選取。
 *
 * @param {string} text - 要複製的文字
 * @param {HTMLTextAreaElement} fallback - 備用 textarea 元素
 * @param {HTMLElement} status - 狀態顯示元素
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyText(text, fallback, status) {
  try {
    await navigator.clipboard.writeText(text);
    if (status) status.textContent = '已複製';
    return true;
  } catch {
    fallback.value = text;
    fallback.select();
    try { document.execCommand('copy'); if (status) status.textContent = '已複製'; return true; }
    catch { if (status) status.textContent = '複製失敗，請手動選取'; return false; }
  }
}