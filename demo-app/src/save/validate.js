/**
 * ============================================================================
 * 模組：save/validate.js — 存檔硬規則驗證層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：config.js（demoConfig/integrityConfig/LIMITS）、errors.js（CodeError/codeError/requireThat）、json.js（isRecord/checkJSONTree）
 *   - 被：codec.js（import/export 自檢）、state.js（unpack 段落驗證）、import.js（importFile 準入）、Engine（檢查存檔形狀）
 * 職責：
 *   1. exactKeys()：檢查物件是否僅包含允許的鍵（必要 + 選用）。
 *   2. checkShape()：全面驗證存檔物件的結構、欄位白名單、時間順序、事件種類與 data 欄位。
 *   3. 內部判斷器（flag/ckpt/branch/hash/integer/fullMatch）：各自驗證特定欄位格式。
 * 設計原則：
 *   - 只檢查結構、白名單與時間順序，不驗證雜湊鏈、可玩性或事件預算。
 *   - 失敗拋 CodeError，不修改輸入、不取得外部資源。
 *   - 新增事件種類需同步 demo/integrity.yaml 與 Python 參考工具。
 * ============================================================================
 */

import { demoConfig, integrityConfig, LIMITS } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { isRecord, checkJSONTree } from './json.js';

// 以下純判斷器只供 checkShape 使用；輸入欄位值，輸出是否合法，不改資料。
// fullMatch 額外拒絕換行，避免 JavaScript 的 $ 在最後換行前也算匹配。
/**
 * 嚴格全字匹配：值必須是字串，完全符合正規表示式，且不含換行。
 * 避免 JavaScript 的 $ 在最後換行前也算匹配的問題。
 *
 * @param {string} pattern - 正規表示式模式（不含 ^$）
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否完全匹配且不含換行
 */
const fullMatch = (pattern, value) => typeof value === 'string' && new RegExp('^(?:' + pattern + ')$').test(value)
  && !/[\r\n]/.test(value);
/**
 * 驗證旗標名格式：flag. 開頭，後接 1-40 個小寫字母、數字、底線或點。
 *
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否為合法旗標名
 */
const flag = value => fullMatch('flag\\.[a-z0-9_.]{1,40}', value);
/**
 * 驗證檢查點名稱格式：ckpt/ 開頭，後接 1-24 個小寫字母、數字或連字號。
 *
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否為合法 ckpt/ 名稱
 */
const ckpt = value => fullMatch('ckpt/[a-z0-9-]{1,24}', value);
/**
 * 驗證非 main 分支名稱格式：1-8 個小寫字母，接 /，再接 1-16 個小寫字母、數字或連字號。
 *
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否為合法分支名
 */
const branch = value => fullMatch('[a-z]{1,8}/[a-z0-9-]{1,16}', value);
/**
 * 驗證八碼小寫雜湊格式，僅驗證格式不驗證內容。
 *
 * @param {any} value - 要檢查的值
 * @returns {boolean} 是否為八碼小寫十六進位雜湊
 */
const hash = value => fullMatch('[0-9a-f]{8}', value);
/**
 * 驗證值為範圍內的安全整數，排除布林值。
 *
 * @param {any} value - 要檢查的值
 * @param {number} min - 最小值（含）
 * @param {number} max - 最大值（含）
 * @returns {boolean} 是否為範圍內 safe integer
 */
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

/**
 * 檢查物件是否僅包含允許的鍵（必要 + 選用），少鍵或多鍵皆拋錯。
 * 由 checkShape/unpack 呼叫。
 *
 * @param {Object} object - 要檢查的物件
 * @param {string[]} required - 必要鍵名陣列
 * @param {string[]} [optional=[]] - 選用鍵名陣列
 * @param {string} [message='存檔欄位不符'] - 錯誤訊息
 * @returns {undefined} 檢查通過時回傳 undefined
 */
export function exactKeys(object, required, optional = [], message = '存檔欄位不符') {
  need(isRecord(object), message);
  const allowed = new Set([...required, ...optional]);
  need(required.every(k => Object.hasOwn(object, k)) && Object.keys(object).every(k => allowed.has(k)), message);
}

/**
 * 全面驗證存檔物件的結構與內容合法性。
 * 由存檔入口與本機保存呼叫，非法輸入拋 CodeError。
 * 不保證雜湊鏈或續玩安全（需另外呼叫 verifyChain）。
 *
 * @param {Object} save - 存檔物件
 * @returns {boolean} 驗證通過時回傳 true
 * @throws {CodeError} 當存檔格式、欄位、時間順序或事件內容不合規則時
 */
export function checkShape(save) {
  try {
    need(isRecord(save), '存檔格式錯誤（不是物件）');
    const extra = Object.keys(save).filter(k => !LIMITS.meta_keys.includes(k)).sort();
    if (extra.length) throw new CodeError('存檔含有不認得的欄位：' + extra[0].slice(0, 20));
    need(save.schema === 1 && save.game === 'root-archipelago', '不是根目錄群島的存檔（schema/game 不符）');
    checkJSONTree(save);
    need(fullMatch(LIMITS.nick_regex, save.nick), '暱稱不合規則（英文、數字、底線、連字號，最多 12 字）');
    need(integer(save.seed, ...LIMITS.seed_range), '種子不合規則');
    need(save.event == null || fullMatch(LIMITS.event_regex, save.event), '活動代號不合規則');
    need(!Object.hasOwn(save, 'pack') || fullMatch(LIMITS.pack_regex, save.pack), 'pack 欄位不合規則');
    need(!Object.hasOwn(save, 'demo') || save.demo === true, 'demo 欄位不合規則');
    need(!Object.hasOwn(save, 'demo_id') || save.demo_id === demoConfig.id, 'demo_id 欄位不合規則');
    need(!Object.hasOwn(save, 'head') || save.head === null || hash(save.head), 'head 欄位不合規則');
    need(Array.isArray(save.commits) && save.commits.length <= LIMITS.max_commits, 'commit 數量不合規則（上限 ' + LIMITS.max_commits + '）');
    const ids = { task: demoConfig.content.quick_tasks, skip: demoConfig.content.quick_tasks,
      find: demoConfig.finds.map(f => f.id), item: ['F1', 'R0'], card: ['K0'] };
    let lastT = 0;
    let lastR = 0;
    for (const [i, c] of save.commits.entries()) {
      const where = 'commit #' + i;
      exactKeys(c, ['id', 'parent', 'branch', 'chapter', 'kind', 'data', 't', 'r'], [], where + ' 的欄位不符');
      need(hash(c.id) && (c.parent === null || hash(c.parent)), where + ' 的雜湊欄位不合規則');
      need(integer(c.t, 0, LIMITS.max_t) && integer(c.r, 0, LIMITS.max_r_ms), where + ' 的時間欄位不合規則');
      need(c.t >= lastT && c.r >= lastR, where + ' 的時間倒退');
      lastT = c.t; lastR = c.r;
      need(integrityConfig.chapters.includes(c.chapter), where + ' 的章節不合規則');
      need(c.branch === 'main' || branch(c.branch), where + ' 的分支名不合規則');
      need(demoConfig.save.commit_kinds.includes(c.kind), where + ' 的種類不認得');
      const d = c.data;
      need(isRecord(d), where + ' 的 data 不是物件');
      // 每種事件各有封閉的 data 欄位集合；不能只驗外層，否則會攜入不受控的任意資料。
      const keys = (required, optional) => exactKeys(d, required, optional, where + '（' + c.kind + '）的欄位不符');
      let valid = false;
      switch (c.kind) {
        case 'flag': keys(['name']); valid = flag(d.name); break;
        case 'task': case 'skip': case 'find': case 'item': case 'card':
          keys(['id']); valid = ids[c.kind].includes(d.id); break;
        case 'checkpoint': keys(['id']); valid = ckpt(d.id); break;
        case 'choice': keys(['id', 'value']); valid = d.id === 'vote' && ['block', 'pass'].includes(d.value); break;
        case 'hint': keys(['n'], ['full']); valid = integer(d.n, 1, 3) && (!Object.hasOwn(d, 'full') || typeof d.full === 'boolean'); break;
        case 'branch.enter': keys(['name', 'from']); valid = branch(d.name) && ckpt(d.from); break;
        case 'branch.exit': keys(['mode']); valid = ['merge', 'abandon'].includes(d.mode); break;
        case 'merge': keys(['mode', 'card']); valid = d.mode === 'knowledge' && d.card === 'K0'; break;
        case 'end': keys(['time_up']); valid = typeof d.time_up === 'boolean';
          need(i === save.commits.length - 1, 'end 必須是最後一個 commit'); break;
      }
      need(valid, where + ' 的 ' + c.kind + ' 欄位不合規則');
    }
    return true;
  } catch (error) { throw codeError(error); }
}
