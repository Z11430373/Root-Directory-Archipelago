/**
 * ============================================================================
 * 模組：save/fold.js — 存檔事件投影層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 無檔案依賴（純本地計算）
 *   - 被：score.js、integrity.js、import.js、card.js、Engine.restore 使用
 * 職責：
 *   1. roundMilliseconds()：將整數毫秒轉換為最接近的秒，半秒採偶數捨入（與 Python 一致）。
 *   2. fold()：將存檔的 durable commits 折疊成新的狀態物件（flags/tasks/finds/items/cards/checkpoints/skipped/vote/hints/branches/seconds/ended）。
 *   3. 不重播對話、不恢復任意 Shell 檔案，也不修改來源存檔。
 * 設計原則：
 *   - 同類獎勵只計一次，保留首次取得順序，避免重複事件灌高分數或改變稱號。
 *   - 不驗證雜湊鏈，必須先由邊界（validate/codec）驗證後再使用。
 *   - Python round() 使用 ties-to-even，Math.round() 不同，故自行實作。
 * ============================================================================
 */

/**
 * 將整數毫秒轉換為最接近的秒，半秒採偶數捨入（與 Python round() 一致）。
 * 由 fold 呼叫，計算存檔總耗時時使用，確保與 Python 參考實作相同的捨入行為。
 *
 * @param {number} ms - 整數毫秒數
 * @returns {number} 最接近的秒數，半秒情況下採偶數捨入
 */
export function roundMilliseconds(ms) {
  const whole = Math.floor(ms / 1000);
  const remainder = ms - whole * 1000;
  return remainder < 500 ? whole : remainder > 500 ? whole + 1 : whole + whole % 2;
}

/**
 * 將存檔的 durable commits 折疊成新的狀態物件。
 * 由存檔各投影讀者（score/integrity/import/card/Engine.restore）呼叫。
 *
 * @param {Object} save - 存檔物件
 * @returns {Object} 新狀態物件，包含：
 *   - flags: Set，所有設定的旗標
 *   - tasks: 陣列，去重後的完成題目 ID（保留首次順序）
 *   - finds: 陣列，去重後的發現物品 ID
 *   - items: 陣列，去重後的獲得物品 ID
 *   - cards: 陣列，去重後的獲得卡片 ID
 *   - checkpoints: 陣列，所有檢查點 ID
 *   - skipped: 陣列，去重後的跳過題目 ID
 *   - vote: 'block' | 'pass' | null，02:00 的訪客選擇
 *   - hints: number，提示次數總和
 *   - branches: 陣列，分支進入/退出/合併記錄
 *   - seconds: number，總耗時（秒）
 *   - ended: boolean，是否已結束
 */
export function fold(save) {
  const st = { flags: new Set(), tasks: [], finds: [], items: [], cards: [], checkpoints: [],
    skipped: [], vote: null, hints: 0, branches: [], seconds: 0, ended: false };
  // 同類獎勵只計一次；保留首次取得順序，避免重複事件灌高分數或改變稱號。
  const unique = (key, id) => { if (!st[key].includes(id)) st[key].push(id); };
  for (const c of save.commits) {
    const d = c.data;
    switch (c.kind) {
      case 'flag': st.flags.add(d.name); break;
      case 'task': unique('tasks', d.id); break;
      case 'skip': unique('skipped', d.id); break;
      case 'find': unique('finds', d.id); break;
      case 'item': unique('items', d.id); break;
      case 'card': unique('cards', d.id); break;
      case 'checkpoint': st.checkpoints.push(d.id); break;
      case 'choice': if (d.id === 'vote') st.vote = d.value; break;
      case 'hint': st.hints += d.n ?? 1;
        if (d.full) st.flags.add('flag.demo.used_full_hint'); break;
      case 'branch.enter': case 'branch.exit': case 'merge': st.branches.push([c.kind, d]); break;
      case 'end': st.ended = true;
        if (d.time_up) st.flags.add('flag.demo.time_up');
        st.flags.add('flag.demo.finished'); break;
    }
  }
  if (save.commits.length) st.seconds = roundMilliseconds(save.commits[save.commits.length - 1].r - save.commits[0].r);
  return st;
}
