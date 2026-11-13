/**
 * ============================================================================
 * 模組：save/score.js — 活動計分子系統
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（demoConfig 中的 scoring 與 titles 設定）、fold.js（存檔事件投影）
 *   - 被：main.js、card.js、import.js、Engine.summary（顯示分數與稱號）
 * 職責：
 *   1. 根據存檔的折疊狀態（fold）計算總分、稱號、耗時與結束資訊。
 *   2. 計分公式：任務數 × 10 + 發現點 × 5 + (未使用全提示 ? 20 : 0) + 速度獎金。
 *   3. 稱號根據 cfg.title_priority 優先順序匹配條件（breaker/reader/sprinter/watcher/blocker/default）。
 * 設計原則：
 *   - 只讀來源，不寫存檔或本機設定，無資源需清理。
 *   - 稱號採設定的優先順序而非條件物件順序；調整 title_priority 會改既有存檔的顯示稱號。
 * ============================================================================
 */

import { demoConfig } from './config.js';
import { fold } from './fold.js';

/**
 * 根據存檔與可選設定計算分數、稱號、耗時與結束資訊。
 * 由 UI/匯入摘要呼叫，只讀來源，無資源需清理。
 *
 * @param {Object} save - 存檔物件
 * @param {Object} [cfg=demoConfig] - 遊戲設定（含 scoring 與 titles）
 * @returns {Object} 計分結果：{ score, tasks, finds, find_points, seconds, full_hint, vote, title_id, title, finished, time_up }
 */
export function score(save, cfg = demoConfig) {
  const st = fold(save);
  const points = new Map(cfg.finds.map(f => [f.id, f.points]));
  const fp = st.finds.reduce((sum, f) => sum + (points.get(f) ?? 0), 0);
  const full = st.flags.has('flag.demo.used_full_hint');
  const sb = cfg.scoring.speed_bonus;
  const sec = st.seconds;
  const bonus = sec < 600 ? sb.under_seconds_600 : sec < 780 ? sb.under_seconds_780 : sb.otherwise;
  const conditions = {
    breaker: st.finds.includes('rm_branch') && st.cards.includes('K0'),
    reader: st.finds.length >= 6,
    sprinter: sec < 600 && !full,
    watcher: st.vote === 'pass',
    blocker: st.vote === 'block',
    default: true,
  };
  // 稱號採設定的優先順序而非條件物件順序；調整 title_priority 會改既有存檔的顯示稱號。
  const title = cfg.title_priority.find(t => conditions[t]);
  return {
    score: st.tasks.length * 10 + fp * 5 + (full ? 0 : 20) + bonus,
    tasks: st.tasks.length,
    finds: st.finds.length,
    find_points: fp,
    seconds: sec,
    full_hint: full,
    vote: st.vote,
    title_id: title,
    title: cfg.titles.find(t => t.id === title).text,
    finished: st.flags.has('flag.demo.finished'),
    time_up: st.flags.has('flag.demo.time_up')
  };
}
