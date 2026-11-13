/**
 * ============================================================================
 * 模組：save/card.js — 值班證純文字呈現層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（demoConfig）、score.js（分數計算）、integrity.js（完整性分級）
 *   - 被：main.js（匯出畫面複製）、互通測試
 * 職責：
 *   1. fmtTime()：將整數秒轉換為「分:兩位秒」格式。
 *   2. card()：產生框線風格的純文字值班證（40 字寬），包含值班員、稱號、燈塔狀態、耗時、快題、發現、訪客選擇、存檔完整性。
 *   3. 與 DOM 值班證分離：此模組只回傳字串，不碰剪貼簿、DOM 或存檔，不需外部清理。
 * 設計原則：
 *   - 以簡化的東亞字寬補空白（代碼點 > 0x2e80 算寬 2），保持與 Python 參考實作相同的對齊。
 *   - 不是一般 Unicode 排版引擎，僅用於固定寬度終端顯示。
 * ============================================================================
 */

import { demoConfig } from './config.js';
import { score } from './score.js';
import { level } from './integrity.js';

/**
 * 將整數秒轉換為「分:兩位秒」格式（如 125 → "2:05"）。
 * 由 main.js 與 card 模組呼叫，僅作格式化，不更改時間值。
 *
 * @param {number} sec - 整數秒數
 * @returns {string} "M:SS" 格式的時間字串
 */
export const fmtTime = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

/**
 * 產生框線風格的純文字值班證。
 * 由匯出畫面與互通測試呼叫，不寫回分數，不修改存檔。
 *
 * @param {Object} save - 存檔物件
 * @param {number|null} [rank=null] - 可選名次，顯示為「第 N 位」
 * @param {Object} [cfg=demoConfig] - 遊戲設定，用於查找找尋點分數與稱號
 * @returns {Promise<string>} 框線值班證文字（40 字寬）
 */
export async function card(save, rank = null, cfg = demoConfig) {
  const sc = score(save, cfg);
  const [lv] = await level(save);
  const rk = rank ? '第 ' + rank + ' 位' : '—';
  const state = sc.finished && !sc.time_up ? '完成' : sc.time_up ? '值班時間到（進度已保存）' : '進行中';
  const vote = { block: '擋', pass: '放行' }[sc.vote] ?? '—';
  // 以簡化的東亞字寬補空白，保持與 Python card 相同；不是一般 Unicode 排版引擎。
  // 代碼點 > 0x2e80 視為寬字元（佔 2 格），其餘佔 1 格。
  const ln = s => {
    const width = Array.from(s).reduce((n, c) => n + (c.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
    return '│ ' + s + ' '.repeat(Math.max(0, 40 - width - 1)) + '│';
  };
  return ['┌' + '─'.repeat(40) + '┐', ln('值 班 證   ROOT ARCHIPELAGO'), ln('試玩版〈第一夜〉'),
    '├' + '─'.repeat(40) + '┤', ln('值班員　op-' + save.nick), ln('稱號　　' + sc.title),
    ln('燈塔　　' + rk + '（' + state + '）'), ln('耗時　　' + fmtTime(sc.seconds)),
    ln('快題　　' + sc.tasks + '/7　發現 ' + sc.finds + '/' + cfg.finds.length),
    ln('02:00 的訪客　' + vote), ln('存檔完整性　' + { intact: '完整', suspicious: '可疑', broken: '損毀' }[lv]),
    '├' + '─'.repeat(40) + '┤', ln('燈我幫你留著。'), '└' + '─'.repeat(40) + '┘'].join('\n');
}
