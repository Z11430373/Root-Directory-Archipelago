/**
 * ============================================================================
 * 模組：ui/session-storage.js — 本機工作階段所有權子系統
 * 所屬系統：UI / 本機儲存 (UI / Local Storage Subsystem)
 * 模組關聯：
 *   - 依賴：../storage.js（SAVE_KEY）
 *   - 被：main.js（主檔/救援副本各建一個 guard）
 * 職責：
 *   1. createSessionStorage()：鍵/可注入 storage/locks/上限 → guard API。
 *   2. load()：同步採納基準字串，回傳 {ok,value,text}。
 *   3. check()/observe()/write()/clear()：所有權保護的讀寫操作。
 * 設計原則：
 *   - 比對完整原始字串而非 head，保護沒有 commit 的檔案變更。
 *   - Web Lock 只涵蓋同鍵且合作的寫入者；無鎖時僅 best-effort。
 *   - 跨鍵刪除不是原子交易，precondition 僅在鎖內再檢查。
 *   - 不更改 RA1 schema。
 * ============================================================================
 */
import {SAVE_KEY} from '../storage.js';

/**
 * Per-session whole-envelope ownership guard; no RA1/schema changes.
 * load() fixes a synchronous raw-string baseline before replay starts.
 * write()/clear() use one exclusive Web Lock when available. The fallback is
 * synchronous compare+mutation in one JS task, NOT cross-process atomic CAS.
 * All cooperating writers must use this helper (and the same lock name).
 */
/** main.js/測試呼叫；鍵/可注入 storage/locks/上限 → guard API；不立即讀寫，需明示 load 建立基準。 */
export function createSessionStorage({key=SAVE_KEY, storage, locks, maxChars=2_000_000}={}) {
  let expected, loaded=false, conflicted=false;
  // 延遲取得宿主 API，讓 SecurityError 在各操作邊界轉 failure；測試可注入記憶體替身。
  const getStorage = () => storage ?? globalThis.localStorage;
  const getLocks = () => {
    try { return locks === undefined ? globalThis.navigator?.locks : locks; }
    catch { return null; }
  };
  const failure = reason => ({ok:false,reason});
  /** check/write/clear 呼叫；storage → {ok,reason?}，內容不同即鎖定 conflicted，直到使用者明示 load。 */
  function compare(target) {
    if (!loaded) return failure('unloaded');
    if (conflicted) return failure('conflict');
    if (target.getItem(key) !== expected) {
      conflicted=true;
      return failure('conflict');
    }
    return {ok:true};
  }
  /** write/clear 呼叫；同步比較+修改閉包 → Promise<結果與保護級別>；Web Lock 由 request 結束自動釋放。 */
  async function exclusive(operation) {
    // No storage read is performed before acquiring the lock. In particular,
    // a queued writer compares against the latest bytes inside its lock task.
    const manager = getLocks();
    const protection = manager?.request ? 'web-lock' : 'best-effort';
    try {
      const run = () => {
        try { return {...operation(),protection}; }
        catch { return {...failure('unavailable'),protection}; }
      };
      return manager?.request
        ? await manager.request(`root-archipelago:storage:${key}`,{mode:'exclusive'},run)
        : run();
    } catch { return {...failure('unavailable'),protection}; }
  }
  return {
    /** main/測試讀取 → 已偵測衝突，唯讀且不重認領。 */
    get conflicted() { return conflicted; },
    /** main/測試讀取 → 是否曾成功取得原始字串，非內容格式驗證結果。 */
    get loaded() { return loaded; },
    /** main 啟動/明示繼續呼叫；無參數 → 含 value/text 的結果，同步採納基準；失敗不覆寫原始內容。 */
    load() {
      // This is an explicit read/adopt operation, never called by autosave or
      // observe(). The caller must replay THIS returned value, not a prior read.
      try {
        const text = getStorage().getItem(key);
        expected=text; loaded=true; conflicted=false;
        if (text === null) return {ok:true,value:null,text};
        if (typeof text !== 'string' || text.length > maxChars) return {...failure('too_large'),text};
        try { return {ok:true,value:JSON.parse(text),text}; }
        catch { return {...failure('invalid'),text}; }
      } catch {
        loaded=false;
        return failure('unavailable');
      }
    },
    /** persist/清理前置條件呼叫；無參數 → 所有權結果，讀目前字串並可能鎖定衝突，不寫內容。 */
    check() {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      try { return compare(getStorage()); }
      catch { return failure('unavailable'); }
    },
    /** 頁面 storage listener 呼叫；StorageEvent → 所有權結果，偵測介入寫入/ABA；不採納外來版本。 */
    observe(event) {
      // A storage event can expose an intervening write even if the current
      // bytes have already returned to the old value (ABA). Never auto-adopt.
      if (loaded && (event.key === key || event.key === null) && event.newValue !== expected) conflicted=true;
      return conflicted ? failure('conflict') : {ok:true};
    },
    /** persist/救援呼叫；JSON envelope → Promise<結果>，鎖內最後比較後 setItem，成功才更新基準。 */
    async write(value) {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      let text;
      try { text=JSON.stringify(value); }
      catch { return failure('invalid'); }
      if (typeof text !== 'string') return failure('invalid');
      if (text.length > maxChars) return failure('too_large');
      return exclusive(() => {
        const target=getStorage(), checked=compare(target);
        if (!checked.ok) return checked;
        // No await/callback between this final comparison and the write.
        target.setItem(key,text);
        expected=text;
        return {ok:true};
      });
    },
    /** 重開/kiosk 呼叫；可選同步 precondition → Promise<結果>，鎖內再檢查並刪除，成功設基準 null。 */
    async clear({precondition}={}) {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      return exclusive(() => {
        const target=getStorage(), checked=compare(target);
        if (!checked.ok) return checked;
        // Cross-key callers can recheck their primary ownership AFTER waiting
        // for this key's lock. This is still not a multi-key atomic transaction.
        if (precondition && !precondition()) return failure('conflict');
        // Restart/kiosk must call this, not bypass ownership via clearLocal().
        target.removeItem(key);
        expected=null;
        return {ok:true};
      });
    },
  };
}
