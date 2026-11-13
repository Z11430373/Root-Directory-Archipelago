/**
 * 存檔事件與緊湊表示層；依賴 hash/config/errors/validate/json.js。
 * Engine 透過 addCommit 累積事件；codec 透過 pack/unpack 轉換 RA1 的 m/c 陣列。
 * newSave 不驗證資料；addCommit、seal、pack 會修改傳入 save，呼叫端負責交易回復。
 */
import { commitId, commitBody } from './hash.js';
import { LIMITS, demoConfig } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { exactKeys, checkShape } from './validate.js';
import { isRecord, checkJSONTree } from './json.js';

/** 由 Engine 開始值班或測試呼叫；身份/種子/版本/活動 → 空存檔物件，不寫入磁碟。 */
export function newSave(nick, seed, pack = 'root-archipelago-ch01@0.1.0', event = null) {
  return { schema: 1, game: 'root-archipelago', demo: true, demo_id: 'demo-first-night',
    pack, nick, seed, event, commits: [] };
}

/**
 * 由 Engine.commit 呼叫；save、事件與兩種時鐘 → Promise<新 commit>。
 * 複製 data 並在雜湊完成後附加到 save.commits；不更新 head，不自行檢查形狀或撤銷。
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

/** 由匯出/本機保存/摘要呼叫；原地更新 save.head 並回傳同一 save，不修復既有事件雜湊。 */
export function seal(save) {
  save.head = save.commits.length ? save.commits[save.commits.length - 1].id : null;
  return save;
}

/**
 * 由 codec.exportCode 呼叫；save → {m,c}，原地 seal 後以時間差與零值哨兵縮短事件。
 * 不移除原始 commits；改動欄位順序須同步 Python savelib.py 的 pack/unpack。
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
 * 由 codec.importCode 呼叫；不可信 {m,c} → Promise<展開存檔>，錯誤統一為 CodeError。
 * 先驗所有列與時間上限，再非同步重算 id/parent；只改新物件，保留來源 head 供後續驗鏈。
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
