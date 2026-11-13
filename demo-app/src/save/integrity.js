/**
 * ============================================================================
 * 模組：save/integrity.js — 存檔完整性分級層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（integrityConfig）、fold.js（事件投影）、hash.js（verifyChain 驗鏈）
 *   - 被：main.js、card.js、import.js、UI 摘要、測試
 * 職責：
 *   1. plausibility()：檢查存檔的可疑原因（速度過快、題目順序錯誤、投票時間異常）。
 *   2. level()：綜合驗鏈結果與可疑性檢查，回傳完整性分級（intact/suspicious/broken）。
 *   3. 硬性安全拒絕屬於 validate/json/codec；這裡只標示分級，不拒絕遊玩。
 * 設計原則：
 *   - 不修復或修改輸入，不持有外部資源。
 *   - 鏈不符優先標為 broken，僅檢查速度、題序與投票時機。
 * ============================================================================
 */

import { integrityConfig } from './config.js';
import { fold } from './fold.js';
import { verifyChain } from './hash.js';

/**
 * 檢查存檔的可疑原因字串陣列。
 * 僅檢查速度、題序與投票時機，不拒絕遊玩；結果供 level() 使用。
 *
 * @param {Object} save - 存檔物件
 * @returns {string[]} 可疑原因陣列（可能為空），可能包含 'too_fast'、'task_order'、'vote_before_night'
 */
export function plausibility(save) {
  const st = fold(save);
  const timeUp = st.flags.has('flag.demo.time_up');
  const reasons = [];
  // 結束但未到時間上限，且總耗時小於設定的最低秒數，標記為 too_fast
  if (st.ended && !timeUp && st.seconds < integrityConfig.plausibility.min_total_seconds_if_finished) reasons.push('too_fast');
  // 檢查題目完成順序是否符合預期順序
  const order = ['Q0-1', 'Q0-2', 'Q0-3', 'Q0-4', 'Q0-5', 'Q1-1', 'Q1-3'];
  const indices = st.tasks.filter(t => order.includes(t)).map(t => order.indexOf(t));
  if (indices.some((n, i) => i > 0 && n < indices[i - 1])) reasons.push('task_order');
  // 檢查投票是否在得知夜晚訊息之前就發生
  if (st.vote && !timeUp) {
    let seenNight = false;
    let voteBefore = false;
    for (const c of save.commits) {
      if (c.kind === 'flag' && c.data.name === 'flag.gc_name_heard') seenNight = true;
      if (c.kind === 'choice' && !seenNight) voteBefore = true;
    }
    if (voteBefore) reasons.push('vote_before_night');
  }
  return reasons;
}

/**
 * 綜合驗鏈結果與可疑性檢查，回傳完整性分級。
 * 由 UI/匯入/摘要呼叫，鏈不符優先標為 broken。
 *
 * @param {Object} save - 存檔物件
 * @returns {Promise<[string, string[]]>} [分級, 原因陣列]，分級為 'intact' / 'suspicious' / 'broken'
 */
export async function level(save) {
  const [ok] = await verifyChain(save);
  if (!ok) return ['broken', ['chain']];
  const reasons = plausibility(save);
  return [reasons.length ? 'suspicious' : 'intact', reasons];
}
