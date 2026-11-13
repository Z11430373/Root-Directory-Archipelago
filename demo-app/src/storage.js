/**
 * ============================================================================
 * 模組：storage.js — 本機儲存/重播資料層
 * 所屬系統：UI/本機儲存 (UI / Local Storage Subsystem)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算 + localStorage）
 *   - 被：main.js（readLocal/writeLocal/clearLocal/checkJournal/appendAdvance）、ui/session-storage.js（SAVE_KEY 共用）
 * 職責：
 *   1. SAVE_KEY/PREFS_KEY/RECOVERY_KEY：本機儲存鍵名。
 *   2. readLocal()：key → JSON 值|null（容錯讀取，失敗回 null）。
 *   3. writeLocal()：值/key → 是否寫入成功（先序列化/限大小）。
 *   4. clearLocal()：key → 是否刪除成功（無所有權保護）。
 *   5. checkJournal()：journal → boolean，檢查步數、有限時間與輸入長度（唯讀）。
 *   6. appendAdvance()：journal/dt → undefined，安全時原地合併最後 advance 或追加新項。
 * 設計原則：
 *   - portable RA1 不含任意指令/cwd；journal 額外保留輸入與時間。
 *   - 本機 envelope 才能完整重播。
 *   - read/write/clear 是低階容錯工具，不提供所有權；遊戲主檔寫刪必須走 ui/session-storage.js。
 *   - 無跨分頁互斥，勿用於主檔所有權。
 * ============================================================================
 */

// Local replay metadata is deliberately separate from the portable RA1 schema.
export const SAVE_KEY = 'ra.demo.save.v1';
export const PREFS_KEY = 'ra.demo.preferences.v1';
export const RECOVERY_KEY = 'ra.demo.recovery.v1';
const MAX_LOCAL_CHARS = 2_000_000;
// Journal wall time can include a suspended tab. It is not commit.r, which is
// independently bounded by the save format and stops when the game ends.
const MAX_JOURNAL_SECONDS = Number.MAX_SAFE_INTEGER / 1000;

/** main.js 偏好/輔助讀取呼叫；key → JSON 值|null，存取/解析/大小失敗均 null，不改儲存內容。 */
export function readLocal(key = SAVE_KEY) {
  try {
    const text = globalThis.localStorage.getItem(key);
    if (!text || text.length > MAX_LOCAL_CHARS) return null;
    return JSON.parse(text);
  } catch { return null; }
}
/** 偏好與測試呼叫；值/key → 是否寫入成功，先序列化/限大小再寫；無跨分頁互斥，勿用於主檔所有權。 */
export function writeLocal(value, key = SAVE_KEY) {
  try {
    const text = JSON.stringify(value);
    if (text.length > MAX_LOCAL_CHARS) return false;
    globalThis.localStorage.setItem(key, text);
    return true;
  } catch { return false; }
}
/** 低階工具/測試呼叫；key → 是否刪除成功；無所有權保護，main.js 的重開/kiosk 不可藉此繞過 guard。 */
export function clearLocal(key = SAVE_KEY) {
  try { globalThis.localStorage.removeItem(key); return true; }
  catch { return false; }
}

/** 本機續玩/persist 呼叫；journal → boolean，檢查步數、有限時間與輸入長度；唯讀且不重播內容。 */
export function checkJournal(journal) {
  if (!Array.isArray(journal) || journal.length > 20_000) return false;
  let elapsed=0;
  return journal.every(step => {
    if(!step||typeof step!=='object'||!['input','advance'].includes(step.type)||
      typeof step.dt!=='number'||!Number.isFinite(step.dt)||step.dt<0)return false;
    elapsed+=step.dt;
    return Number.isFinite(elapsed)&&elapsed<=MAX_JOURNAL_SECONDS&&
      (step.type!=='input'||(step.dt<=2700&&typeof step.raw==='string'&&step.raw.length<=4096&&
        (step.shell===undefined||['legacy','bash'].includes(step.shell))));
  });
}

/**
 * main.js syncClock 呼叫；可變 journal/dt → undefined，安全時原地合併最後 advance 或追加新項。
 * 維持與即時時鐘相同浮點加總終點，避免半毫秒改變 commit ID；參數超限先拋錯，不截斷時間。
 */
export function appendAdvance(journal, dt) {
  if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)throw new RangeError('時鐘間隔必須是非負有限秒數');
  if(dt===0)return;
  let start=0;
  for(let i=0;i<journal.length-1;i++)start+=journal[i].dt;
  const last = journal[journal.length - 1];
  const now=start+(last?.dt||0),end=now+dt;
  if(!Number.isFinite(end)||end>MAX_JOURNAL_SECONDS)throw new RangeError('本機操作紀錄的時間超出安全範圍');
  // Keep the same floating-point endpoint as live Engine.advance. Summing only
  // the deltas changes addition grouping and can move r across a 0.5ms boundary.
  const merged=end-start;
  if(last?.type==='advance'&&merged>0&&start+merged===end)last.dt=merged;
  else journal.push({type:'advance',dt});
}