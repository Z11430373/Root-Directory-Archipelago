/**
 * 存檔雜湊鏈子系統；依賴 canonical.js、errors.js 與宿主 Web Crypto。
 * 供 state.js 建鏈、codec/integrity/import 驗鏈；只驗資料一致性，不證明真實遊玩。
 * 函式不修改存檔，不持有需清理的資源；非同步呼叫必須 await。
 */
import { canonical } from './canonical.js';
import { CodeError } from './errors.js';

/** 由 addCommit/unpack/verifyChain 呼叫；parent 與事件本文 → Promise<八碼 SHA-256 前綴>。 */
export async function commitId(parent, body) {
  if (!globalThis.crypto?.subtle) throw new CodeError('此環境無法計算存檔雜湊');
  const bytes = new TextEncoder().encode((parent ?? '') + canonical(body));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 4), b => b.toString(16).padStart(2, '0')).join('');
}

/** 由驗鏈與重建鏈呼叫；commit → 排除 id/parent 的本文物件；data 維持原參照，供唯讀雜湊。 */
export function commitBody(c) {
  return { branch: c.branch, chapter: c.chapter, kind: c.kind, data: c.data, t: c.t, r: c.r };
}

/** 由分級與匯出呼叫；save → Promise<[是否一致, 首個錯誤索引|null]>，包含已宣告 head 的核對。 */
export async function verifyChain(save) {
  let parent = null;
  for (const [i, c] of save.commits.entries()) {
    if (c.parent !== parent || c.id !== await commitId(parent, commitBody(c))) return [false, i];
    parent = c.id;
  }
  if (Object.hasOwn(save, 'head') && save.head !== parent) {
    return [false, Math.max(0, save.commits.length - 1)];
  }
  return [true, null];
}
