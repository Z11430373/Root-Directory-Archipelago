/**
 * ============================================================================
 * 模組：save/config.js — 存檔設定橋接層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：../data.js（demo.yaml、integrity.yaml、import_rules.yaml）
   - 被：validate.js、codec.js、state.js、integrity.js、import.js 等所有存檔相關模組
 * 職責：
 *   1. 從 data.js 匯出 demoConfig（遊戲主要設定）、integrityConfig（完整性規則）、importRules（匯入白名單）。
 *   2. 匯出 LIMITS（安全限制，來自 integrity.yaml 的 limits 欄位）。
 *   3. 匯出 PREFIX（'RA1-'，存檔代碼前綴）。
 * 設計原則：
 *   - 匯出的是來源物件參照，呼叫端應視為唯讀。
 *   - 變更規則須同步檢查 Python 參考工具與測資，保持互通性。
 * ============================================================================
 */

import { DATA } from '../data.js';

/**
 * 遊戲主要設定，來自 demo/demo.yaml。
 * 包含 command_whitelist、content、scoring、titles、saves.commit_kinds 等。
 * @type {Object}
 */
export const demoConfig = DATA.yaml['demo/demo.yaml'];

/**
 * 完整性規則設定，來自 demo/integrity.yaml。
 * 包含 limits（安全上限）、plausibility（可疑性規則）、chapters 等。
 * @type {Object}
 */
export const integrityConfig = DATA.yaml['demo/integrity.yaml'];

/**
 * 匯入白名單設定，來自 demo/import_rules.yaml。
 * 定義 to_fullgame 時可攜帶的 flags、quests、items、cards、checkpoints 等。
 * @type {Object}
 */
export const importRules = DATA.yaml['demo/import_rules.yaml'];

/**
 * 安全限制，來自 integrityConfig.limits。
 * 包含 max_commits、max_code_chars、max_inflated_bytes、max_t、max_r_ms 等。
 * @type {Object}
 */
export const LIMITS = integrityConfig.limits;

/**
 * 存檔代碼前綴，固定為 'RA1-'。
 * 用於識別存檔代碼格式，與 CRC 驗證一起使用。
 * @type {string}
 */
export const PREFIX = 'RA1-';
