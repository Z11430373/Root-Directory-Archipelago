/**
 * ============================================================================
 * 模組：save/state.js — 存檔事件與緊湊表示層
 * 所屬系統：存檔系統 (Save Subsystem)
 * 模組關聯：
 *   - 依賴：hash.js（commitId/commitBody）、config.js（LIMITS/demoConfig）、errors.js（CodeError/codeError/requireThat）、validate.js（exactKeys/checkShape）、json.js（isRecord/checkJSONTree）
 *   - 被：codec.js（pack/unpack 介面）、Engine（newSave/addCommit/seal）、測試
 * 職責：
 *   1. newSave()：建立空存檔物件（schema/game/demo/demo_id/pack/nick/seed/event/commits）。
 *   2. addCommit()：累積事件 commit 到 save.commits，快照 data 避免後續異動影響雜湊。
 *   3. seal()：原地更新 save.head 指向最後一個 commit。
 *   4. pack()：將 save 壓縮為 {m, c} 緊湊格式（m=meta, c=commit 陣列，使用時間差與哨兵值）。
 *   5. unpack()：從不可信的 {m,c} 展開為完整存檔，先驗證所有限制，再非同步重算 id/parent。
 * 設計原則：
 *   - newSave 不驗證資料；addCommit/seal/pack 會修改傳入 save，呼叫端負責交易回復。
 *   - pack 改動欄位順序須同步 Python savelib.py 的 pack/unpack，保持互通性。
 *   - unpack 先驗證所有列與時間上限，再非同步重算雜湊，拒絕所有格式錯誤後才計算。
 * ============================================================================
 */

import { commitId, commitBody } from './hash.js';
import { LIMITS, demoConfig } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { exactKeys, checkShape } from './validate.js';
import { isRecord, checkJSONTree } from './json.js';

/**
 * 建立空存檔物件，不寫入磁碟。
 * 由 Engine 開始值班或測試呼叫，提供身份、種子、版本與活動代號。
 *
 * @param {string} nick - 值班員暱稱
 * @param {number} seed - 隨機種子
 * @param {string} [pack='root-archipelago-ch01@0.1.0'] - 存檔包版本標識
 * @param {string|null} [event=null] - 活動代號
 * @returns {Object} 空存檔物件 { schema, game, demo, demo_id, pack, nick, seed, event, commits }
 */
export function newSave(nick, seed, pack = 'root-archipelago-ch01@0.1.0', event = null) {
  return { schema: 1, game: 'root-archipelago', demo: true, demo_id: 'demo-first-night',
    pack, nick, seed, event, commits: [] };
}

/**
 * 累積事件 commit 到 save.commits，回傳新 commit 物件。
 * 由 Engine.commit 呼叫，會複製 data 避免後續 Engine 異動靜默改變先前雜湊。
 * 不更新 head，不自行檢查形狀或撤銷（交由外層交易負責）。
 *
 * @param {Object} save - 存檔物件
 * @param {string} kind - 事件種類（flag/task/skip/find/item/card/checkpoint/choice/hint/branch.enter/branch.exit/merge/end）
 * @param {Object} data - 事件資料
 * @param {number} r - 相對毫秒時間（從遊戲開始）
 * @param {number} [t=0] - 世界時間（秒）
 * @param {string} [chapter='ch0'] - 章節
 * @param {string} [branch='main'] - 分支
 * @returns {Promise<Object>} 新 commit 物件 { ...body, parent, id }
 */
export async function addCommit(save, kind, data, r, t = 0, chapter = 'ch0', branch = 'main') {
  const parent = save.commits.length ? save.commits[save.commits.length - 1].id : null;
  // Snapshot data: later engine mutations must not silently change prior hashes.
  const copy = JSON.parse(JSON.stringify(data));
  const body = { branch, chapter, kind, data: copy, t, r };
  const c = { ...body, parent, id: await commitId(parent, body) };
  save.commits.push(c);
  return c;
}

/**
 * 原地更新 save.head 指向最後一個 commit，回傳同一 save。
 * 由匯出/本機保存/摘要呼叫，不修復既有事件雜湊。
 *
 * @param {Object} save - 存檔物件
 * @returns {Object} 同一 save 物件（head 已更新）
 */
export function seal(save) {
  save.head = save.commits.length ? save.commits[save.commits.length - 1].id : null;
  return save;
}

/**
 * 將 save 壓縮為 {m, c} 緊湊格式，原地 seal 後以時間差與零值哨兵縮短事件。
 * 由 codec.exportCode 呼叫，不移除原始 commits。
 *
 * @param {Object} save - 存檔物件
 * @returns {Object} { m: meta 物件（不含 commits）, c: commit 陣列，每筆為 [kind, data, dt, dr, branch, chapter] }
 */
export function pack(save) {
  seal(save);
  const m = {};
  for (const [k, v] of Object.entries(save)) if (k !== 'commits') m[k] = v;
  let prevT = 0;
  let prevR = 0;
  const c = save.commits.map(commit => {
    const d = commit.kind === 'flag' ? commit.data.name.replace(/^flag\./, '') : commit.data;
    const row = [commit.kind, d, commit.t - prevT, commit.r - prevR,
      commit.branch === 'main' ? 0 : commit.branch, commit.chapter === 'ch0' ? 0 : commit.chapter];
    prevT = commit.t; prevR = commit.r;
    return row;
  });
  return { m, c };
}

/**
 * 從不可信的 {m,c} 展開為完整存檔物件，錯誤統一為 CodeError。
 * 由 codec.importCode 呼叫，先驗證所有列與時間上限，再非同步重算 id/parent。
 * 只改新物件，保留來源 head 供後續驗鏈。
 *
 * @param {Object} object - 不可信的 {m, c} 物件
 * @returns {Promise<Object>} 展開後的完整存檔物件
 * @throws {CodeError} 當格式、鍵、限制、時間欄位或事件種類不合規則時
 */
export async function unpack(object) {
  try {
    checkJSONTree(object);
    exactKeys(object, ['m', 'c'], [], '代碼內容格式錯誤（需要 m/c）');
    need(isRecord(object.m), '代碼 meta 不是物件');
    need(!Object.hasOwn(object.m, 'commits') && Object.hasOwn(object.m, 'head'), '代碼 meta 欄位不符');
    need(Array.isArray(object.c) && object.c.length <= LIMITS.max_commits, 'commit 數量不合規則（上限 ' + LIMITS.max_commits + '）');
    const save = { ...object.m, commits: [] };
    let t = 0;
    let r = 0;
    for (const row of object.c) {
      need(Array.isArray(row) && row.length === 6, '代碼 commit 陣列格式錯誤');
      let [kind, data, dt, dr, br, ch] = row;
      need(Number.isSafeInteger(dt) && Number.isSafeInteger(dr) && dt >= 0 && dr >= 0
        && dt <= LIMITS.max_t && dr <= LIMITS.max_r_ms, 'commit 的時間欄位不合規則或時間倒退');
      need(br === 0 || typeof br === 'string', 'commit 的分支名不合規則');
      need(ch === 0 || typeof ch === 'string', 'commit 的章節不合規則');
      need(typeof kind === 'string' && demoConfig.save.commit_kinds.includes(kind), 'commit 的種類不認得');
      if (kind === 'flag' && !isRecord(data)) {
        need(typeof data === 'string', 'commit 的旗標名不合規則');
        data = { name: data.startsWith('flag.') ? data : 'flag.' + data };
      }
      t += dt; r += dr;
      save.commits.push({ kind, data, t, r, branch: br === 0 ? 'main' : br, chapter: ch === 0 ? 'ch0' : ch,
        id: '00000000', parent: null });
    }
    // Reject all malformed rows, keys and limits before doing any asynchronous hashes.
    checkShape(save);
    let parent = null;
    for (const c of save.commits) {
      c.parent = parent;
      c.id = await commitId(parent, commitBody(c));
      parent = c.id;
    }
    return save;
  } catch (error) { throw codeError(error, '代碼內容格式錯誤'); }
}
