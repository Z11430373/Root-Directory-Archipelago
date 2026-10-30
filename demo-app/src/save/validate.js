import { demoConfig, integrityConfig, LIMITS } from './config.js';
import { CodeError, codeError, requireThat as need } from './errors.js';
import { isRecord, checkJSONTree } from './json.js';

const fullMatch = (pattern, value) => typeof value === 'string' && new RegExp('^(?:' + pattern + ')$').test(value)
  && !/[\r\n]/.test(value);
const flag = value => fullMatch('flag\\.[a-z0-9_.]{1,40}', value);
const ckpt = value => fullMatch('ckpt/[a-z0-9-]{1,24}', value);
const branch = value => fullMatch('[a-z]{1,8}/[a-z0-9-]{1,16}', value);
const hash = value => fullMatch('[0-9a-f]{8}', value);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function exactKeys(object, required, optional = [], message = '存檔欄位不符') {
  need(isRecord(object), message);
  const allowed = new Set([...required, ...optional]);
  need(required.every(k => Object.hasOwn(object, k)) && Object.keys(object).every(k => allowed.has(k)), message);
}

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
