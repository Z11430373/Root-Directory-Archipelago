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
export const button = (text, fn, attrs = {}) => el('button', { type:'button', onClick:fn, ...attrs }, text);

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
