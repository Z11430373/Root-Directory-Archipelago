/**
 * ============================================================================
 * 模組：save/hash.js — 存檔雜湊鏈子系統
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：canonical.js（規範化序列化）、errors.js（CodeError）、宿主 Web Crypto
 *   - 被：state.js（addCommit 建鏈）、codec.js（驗鏈）、integrity.js（完整性分級）、import.js（驗鏈）
 * 職責：
 *   1. commitId()：計算 commit 的八碼 SHA-256 前綴雜湊 ID（作為存檔事件鏈的節點識別）。
 *   2. commitBody()：提取 commit 的本文物件（排除 id/parent，供唯讀雜湊計算）。
 *   3. verifyChain()：驗證存檔的整個雜湊鏈一致性，包括已宣告的 head 是否與計算結果一致。
 * 設計原則：
 *   - 只驗證資料一致性，不證明真實遊玩。
 *   - 函式不修改存檔，不持有需清理的資源。
 *   - 非同步呼叫必須 await（使用 Web Crypto API）。
 * ============================================================================
 */

import { canonical } from './canonical.js';
import { CodeError } from './errors.js';

/**
 * 計算 commit 的八碼 SHA-256 前綴雜湊 ID。
 * 由 addCommit、unpack、verifyChain 呼叫，作為存檔事件鏈的節點識別。
 * 雜湊輸入為 parent ID 與規範化後的事件本文字串，取前 4 位元組的十六進位表示。
 *
 * @param {string|null} parent - 父 commit ID（首個 commit 為 null）
 * @param {Object} body - 事件本文物件 { branch, chapter, kind, data, t, r }
 * @returns {Promise<string>} 八碼小寫十六進位 SHA-256 前綴
 * @throws {CodeError} 當環境不支援 Web Crypto 時
 */
export async function commitId(parent, body) {
  if (!globalThis.crypto?.subtle) throw new CodeError('此環境無法計算存檔雜湊');
  const bytes = new TextEncoder().encode((parent ?? '') + canonical(body));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 4), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 提取 commit 的本文物件，排除 id/parent 欄位。
 * 由驗鏈與重建鏈呼叫，data 維持原參照以供唯讀雜湊計算。
 *
 * @param {Object} c - commit 物件
 * @returns {Object} 本文物件 { branch, chapter, kind, data, t, r }
 */
export function commitBody(c) {
  return { branch: c.branch, chapter: c.chapter, kind: c.kind, data: c.data, t: c.t, r: c.r };
}

/**
 * 驗證存檔的整個雜湊鏈一致性。
 * 由分級與匯出呼叫，檢查每個 commit 的 parent 與 id 是否正確，
 * 並核對已宣告的 head 是否與最後一個 commit 的 id 一致。
 *
 * @param {Object} save - 存檔物件
 * @returns {Promise<[boolean, number|null]>} [是否一致, 首個錯誤索引或 null]
 */
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
