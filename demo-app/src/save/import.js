/**
 * ============================================================================
 * 模組：save/import.js — 存檔檔案匯入與正式版投影
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（importRules）、fold.js（fold）、score.js（score）、hash.js（verifyChain）、integrity.js（level）、validate.js（checkShape）、json.js（parseSaveJSON）、errors.js（codeError）
 *   - 被：main.js（匯入 JSON 檔續玩）、測試
 * 職責：
 *   1. importFile()：文字 → 形狀合法的 save 物件（鏈壞仍接受，交 level 標示）。
 *   2. toFullgame()：save → 正式版起始資料（只對完整結束紀錄給紀念獎勵）。
 * 設計原則：
 *   - 所有輸出為新物件，來源保持不變。
 *   - 可信度不能取代安全形狀檢查，必須先 checkShape。
 *   - toFullgame 只產生攜帶資料，不會連到正式版或覆寫存檔。
 * ============================================================================
 */

import { importRules } from './config.js';
import { fold } from './fold.js';
import { score } from './score.js';
import { verifyChain } from './hash.js';
import { level } from './integrity.js';
import { checkShape } from './validate.js';
import { parseSaveJSON } from './json.js';
import { codeError } from './errors.js';

/**
 * 將 JSON 文字匯入為存檔物件。
 * 由 main.js 匯入 JSON 時呼叫，回傳形狀合法的 save。
 * 鏈壞仍接受，交 level() 標示（不拒絕遊玩）。
 *
 * @param {string} jsonText - JSON 文字
 * @returns {Promise<Object>} 形狀合法的存檔物件
 * @throws {CodeError} 當 JSON 解析或形狀檢查失敗時
 */
export async function importFile(jsonText) {
  try {
    const save = parseSaveJSON(jsonText);
    checkShape(save);
    // Corrupt but well-shaped files remain playable; level() reports broken.
    return save;
  } catch (error) { throw codeError(error, '存檔檔案格式錯誤'); }
}

/**
 * 將存檔轉換為正式版起始資料。
 * 由摘要/互通測試呼叫，只對完整結束紀錄給紀念獎勵。
 * 輸出為新物件，來源保持不變。
 *
 * @param {Object} save - 存檔物件
 * @param {Object} [ru=importRules] - 匯入規則白名單
 * @returns {Promise<Object>} 正式版起始資料
 * @throws {Error} 當存檔形狀不合規則或未完成時
 */
export async function toFullgame(save, ru = importRules) {
  checkShape(save);
  const st = fold(save);
  const [ok] = await verifyChain(save);
  const [lv] = await level(save);
  const sc = score(save);
  if (!st.ended) throw new Error('只有完成值班的紀錄才能轉移');
  if (lv !== 'intact') throw new Error('只有完整紀錄才能轉移（' + lv + '）');
  const allowedFlags = new Set(ru.to_fullgame.flags);
  const carriedFlags = st.flags.filter(f => allowedFlags.has(f));
  const carriedQuests = st.tasks.filter(id => ru.to_fullgame.quests.includes(id));
  const carriedItems = st.items.filter(id => ru.to_fullgame.items.includes(id));
  const carriedCards = st.cards.filter(id => ru.to_fullgame.cards.includes(id));
  const carriedCheckpoints = st.checkpoints.filter(id => ru.to_fullgame.checkpoints.includes(id));
  const reward = st.flags.has('flag.demo.finished') ? ru.to_fullgame.reward : null;
  return {
    version: 1,
    source: { nick: save.nick, seed: save.seed, seconds: sc.seconds, title: sc.title_id },
    integrity: { level: lv, chain_ok: ok },
    carried: {
      flags: carriedFlags,
      quests: carriedQuests,
      items: carriedItems,
      cards: carriedCards,
      checkpoints: carriedCheckpoints,
      reward
    }
  };
}