import { commitId, commitBody } from './hash.js';
import { LIMITS, demoConfig } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { exactKeys, checkShape } from './validate.js';
import { isRecord, checkJSONTree } from './json.js';

export function newSave(nick, seed, pack = 'root-archipelago-ch01@0.1.0', event = null) {
  return { schema: 1, game: 'root-archipelago', demo: true, demo_id: 'demo-first-night',
    pack, nick, seed, event, commits: [] };
}

export async function addCommit(save, kind, data, r, t = 0, chapter = 'ch0', branch = 'main') {
  const parent = save.commits.length ? save.commits[save.commits.length - 1].id : null;
  // Snapshot data: later engine mutations must not silently change prior hashes.
  const copy = JSON.parse(JSON.stringify(data));
  const body = { branch, chapter, kind, data: copy, t, r };
  const c = { ...body, parent, id: await commitId(parent, body) };
  save.commits.push(c);
  return c;
}

export function seal(save) {
  save.head = save.commits.length ? save.commits[save.commits.length - 1].id : null;
  return save;
}

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
