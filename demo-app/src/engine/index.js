/**
 * 流程系統主控：依 demo/flow.yaml 將輸入、虛擬時鐘、讀檔事件轉為對話、進度與存檔事件。
 * 依賴 data.js、expr.js、save/index.js、vfs.js、shell/exec.js、loggen.js、quests.js。
 * main.js 與 headless 測試須依序 await start/feed/advance；內部方法不是可並行的公開操作。
 * 記憶體狀態由 transaction 回復，輸出成功提交後才通知 UI；無瀏覽器 timer/磁碟資源需清理。
 */
import { DATA } from '../data.js';
import { evaluate } from '../expr.js';
import * as S from '../save/index.js';
import { createWorld } from '../vfs.js';
import { execute as executeShell } from '../shell/exec.js';
import { generateLogs } from '../loggen.js';
import { checkQuest } from '../quests.js';

/** 由 typo 呼叫；兩字串 → 編輯距離（相鄰對調算一次），只建局部矩陣、不自動執行建議。 */
function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) d[i][0] = i;
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** 由建構/commit/restore 呼叫；事件種類/data → 一次性預算鍵或 null，task/skip 刻意共用題號槽。 */
function eventKey(kind, data) {
  if (kind === 'task' || kind === 'skip') return `quest:${data.id}`;
  if (kind === 'flag') return `flag:${data.name}`;
  if (['item', 'card', 'find', 'checkpoint', 'choice'].includes(kind)) return `${kind}:${data.id}`;
  if (kind === 'end') return 'end';
  return null;
}

/** Data-driven, virtual-clock runtime. Callers must await operations in order. */
export class Engine {
  /**
   * 由 main.js、fromSave 與測試建立；種子/活動/模式/輸出 observer → 未開始的 Engine。
   * 載入唯讀規則、建立 VFS/事件預算，不啟動實體時鐘；observer 由 UI 持有，重開時替換整個實例。
   */
  constructor({ seed = 5, event = 'demo-event-1', mode = 'self', onOutput, shellExecutor = executeShell, shell = null } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('種子不合規則');
    if (event !== null && (typeof event !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(event))) throw new TypeError('活動代號不合規則');
    this.seed = seed;
    this.runMode = mode;
    this.event = mode === 'host' || mode === 'host_led' ? 'host-led' : event;
    this.onOutput = typeof onOutput === 'function' ? onOutput : () => {};
    // UI may inject a cancellable worker; headless/replay uses the same synchronous shell.
    this.shellExecutor = shellExecutor;
    this.shellDialect = shell;
    this.cfg = DATA.yaml['demo/demo.yaml'];
    this.flow = DATA.yaml['demo/flow.yaml'];
    this.nodes = new Map();
    for (const [path, doc] of Object.entries(DATA.yaml)) {
      if (!path.startsWith('dialogue/') && path !== 'demo/dialogue/init_demo.yaml') continue;
      for (const node of doc.nodes || []) {
        this.nodes.set(`${doc.npc}.${node.node}`, node);
        if (doc.alias) this.nodes.set(`${doc.alias}.${node.node}`, node);
      }
    }
    this.quests = {};
    for (const path of ['quests/ch0.yaml', 'quests/ch1.yaml']) for (const quest of DATA.yaml[path].quests) {
      if (this.cfg.content.quick_tasks.includes(quest.id)) this.quests[quest.id] = quest;
    }
    this.whitelist = new Set(this.cfg.command_whitelist);
    // durable 投影（flags/獎勵）與 transient 狀態（mode/queue/history/時鐘）分開；RA1 只保留事件。
    this.flags = new Set();
    this.done = [];
    this.skipped = [];
    this.items = new Set();
    this.cards = new Set();
    this.finds = new Set();
    this.history = [];
    this.ladders = {};
    this.once = new Set();
    this.quest_idx = { ch0: 0, ch1: 0 };
    this.active = null;
    this.mode = null; // null | ['input'|'choice', reference, node]
    this.tries = 0;
    this.skip_pending = null;
    this.delayed = [];
    this.nick = null;
    this.t0 = null;
    this.now = 0;
    this.last_input = 0;
    this.idle_fired = new Set();
    this.timers_fired = new Set();
    this.world_t = 0;
    this.save = null;
    this.trace = [];
    this.outputs = [];
    this.ended = false;
    this.started = false;
    this.queue = [];
    this.world = 'ch0';
    this.branch = 'main';
    this.main_snapshot = null;
    this.vfs = createWorld('ch0', seed, this.flags);
    const override = this.cfg.content.chapters.ch1_teaser.generate_override;
    this.manifest = generateLogs({ seed, linesPerDay: override.lines_per_day, days: override.days, npc: true }).manifest;
    this.man = this.manifest;
    this.commandCount = 0;
    this.commitLimit = DATA.yaml['demo/integrity.yaml'].limits.max_commits;
    this.pendingEvents = new Set(['choice:vote', 'end']);
    // reserve 接收事件、加入保留鍵；effects 遞迴掃節點的所有狀態效果，避免重複提示耗盡結尾空間。
    const reserve = (kind, data) => this.pendingEvents.add(eventKey(kind, data));
    const effects = node => {
      for (const name of node.sets || []) reserve('flag', { name });
      if (node.checkpoint) reserve('checkpoint', { id: node.checkpoint });
      for (const id of node.gives || []) reserve('item', { id });
      for (const id of node.triggers || []) if (id.startsWith('ckpt/')) reserve('checkpoint', { id });
      for (const child of [...(node.variants || []), ...(node.choices || [])]) effects(child);
    };
    // Conservative: even mounted dialogue nodes not reached in this demo retain
    // their one-off slots. task/skip share a slot; both vote flags are reserved.
    for (const node of new Set(this.nodes.values())) effects(node);
    for (const quest of Object.values(this.quests)) {
      reserve('task', { id: quest.id });
      effects(quest.on_done || {});
    }
    for (const rule of this.flow.rules) for (const action of rule.do || []) {
      for (const [kind, value] of Object.entries(action)) {
        if (kind === 'set') reserve('flag', { name: value });
        else if (['give', 'card', 'find', 'checkpoint'].includes(kind)) reserve(kind === 'give' ? 'item' : kind, { id: value });
      }
    }
    this.ladderIds = this.flow.guidance.flatMap(guide => guide.ladder === 'quest_ladder'
      ? Object.keys(this.quests).map(id => `q.${id}`) : [guide.id]);
    this.budgetNotices = new Set();
    this._transaction = null;
    this.outputError = null;
  }

  // 以下 getter 均無輸入且唯讀：供規則環境、main.js 提示符與顯示分辨分支/輸入/主持模式及路徑。
  /** env/預算讀取 → 是否不在 main；不修改狀態。 */
  get inBranch() { return this.branch !== 'main'; }
  /** main.js 讀取 → 'input'/'choice'/null；不修改對話模式。 */
  get inputMode() { return this.mode?.[0] || null; }
  /** 流程/UI 讀取 → 是否主持人模式；同時接受舊 host_led 名稱。 */
  get hostMode() { return this.runMode === 'host' || this.runMode === 'host_led'; }
  /** 呼叫端讀取 → 目前 VFS.cwd；只讀轉送。 */
  get cwd() { return this.vfs.cwd; }
  /** 呼叫端讀取 → 目前 VFS.home；只讀轉送。 */
  get home() { return this.vfs.home; }
  /** commit/時鐘檢查呼叫；無參數 → 自開始起的整數毫秒，開始前為 0；無副作用。 */
  rMs() { return this.t0 === null ? 0 : Math.round((this.now - this.t0) * 1000); }
  /** 內部除錯點呼叫；任意軌跡欄位 → undefined，附加 trace，失敗由 transaction 截回原長度。 */
  T(...entry) { this.trace.push(entry); }
  /** 對話/Shell/提示呼叫；文字與種類 → undefined，加入 outputs 與交易待發布佇列，忽略空文字。 */
  output(text, kind = 'dialogue') {
    if (!text) return;
    text = String(text);
    const entry = { text, kind };
    this.outputs.push(entry);
    if (this._transaction) this._transaction.push(entry);
    else this.publishOutput(entry);
  }
  /** output 或交易提交呼叫；輸出 entry → undefined，通知 observer；其例外記在 outputError，不回滾。 */
  publishOutput({ text, kind }) {
    // Publication happens after commit. A UI observer cannot roll back text
    // already seen by another observer, nor make a committed feed reject.
    try { this.onOutput(text, kind); }
    catch (error) { this.outputError = error; }
  }
  /**
   * transaction 呼叫；無參數 → rollback 閉包，快照目前可變容器與兩個 VFS。
   * 回復保持原物件/Set 身份，舊 history/output/trace 視為不可變只存長度；新增可變欄位須檢查此契約。
   */
  snapshotTransaction() {
    const before = { ...this }, undo = [];
    const immutable = new Set(['cfg', 'flow', 'nodes', 'quests', 'whitelist', 'ladderIds', 'manifest', 'man']);
    for (const [key, value] of Object.entries(before)) {
      if (!value || typeof value !== 'object' || immutable.has(key) || key === '_transaction') continue;
      if (key === 'vfs' || key === 'main_snapshot') continue;
      if (value instanceof Set) {
        const entries = [...value];
        undo.push(() => { value.clear(); for (const entry of entries) value.add(entry); });
      } else if (Array.isArray(value)) {
        // Existing history/output/trace entries are immutable. Never serialize
        // old multi-megabyte stdout or copy a growing transcript every tick.
        const length = value.length;
        if (['history', 'outputs', 'trace'].includes(key)) undo.push(() => { value.length = length; });
        else {
          const entries = value.slice();
          undo.push(() => { value.length = 0; for (const entry of entries) value.push(entry); });
        }
      } else {
        // Runtime records are shallow immutable values (mode nodes, delayed
        // payloads and existing commits are never edited by feed/advance).
        const properties = { ...value };
        if (key === 'save') {
          const commits = value.commits, entries = commits.slice();
          undo.push(() => { commits.length = 0; for (const entry of entries) commits.push(entry); });
        }
        undo.push(() => {
          for (const name of Object.keys(value)) if (!Object.hasOwn(properties, name)) delete value[name];
          Object.assign(value, properties);
        });
      }
    }
    for (const world of new Set([before.vfs, before.main_snapshot])) {
      if (!world) continue;
      const snapshot = world.clone();
      // Restore the original VFS identity, hard-link inode graph and flags
      // reference, including worlds temporarily replaced by a branch/ferry.
      undo.push(() => { Object.assign(world, snapshot); });
    }
    return () => {
      for (const restore of undo) restore();
      for (const key of Object.keys(this)) if (!Object.hasOwn(before, key)) delete this[key];
      Object.assign(this, before);
    };
  }
  /**
   * start/feed/advance 呼叫；async operation → Promise<operation 結果>。
   * 巢狀操作共用快照，失敗先回復再拋錯；成功檢查時鐘後發布輸出。呼叫端仍須序列化，非互斥鎖。
   */
  async transaction(operation) {
    if (this._transaction) return operation(); // feed -> advance uses one snapshot.
    const rollback = this.snapshotTransaction(), pending = [];
    this._transaction = pending;
    let result;
    try {
      result = await operation();
      this.checkClocks();
    } catch (error) {
      rollback();
      throw error;
    }
    this._transaction = null;
    for (const entry of pending) this.publishOutput(entry);
    return result;
  }
  /** 由 transaction/commit 呼叫；無參數 → undefined，世界秒/活動中毫秒超限拋 CodeError，不修剪時鐘。 */
  checkClocks() {
    const limits = DATA.yaml['demo/integrity.yaml'].limits;
    if (!Number.isSafeInteger(this.world_t) || this.world_t < 0 || this.world_t > limits.max_t ||
      (!this.ended && this.t0 !== null && (!Number.isSafeInteger(this.rMs()) || this.rMs() < 0 || this.rMs() > limits.max_r_ms))) {
      throw new S.CodeError('時間已達存檔安全上限；本次操作未套用，請保留目前存檔。');
    }
  }
  /** 指令/渡海呼叫；增加秒數 → undefined，檢查後原地推進 world_t；失敗交外層交易回復。 */
  advanceWorld(seconds) {
    const next = this.world_t + seconds;
    if (!Number.isSafeInteger(next) || next > DATA.yaml['demo/integrity.yaml'].limits.max_t) {
      throw new S.CodeError('世界時間已達存檔安全上限；本次操作未套用，請保留目前存檔。');
    }
    this.world_t = next;
  }
  /** format 呼叫；額外變數 → 新模板值物件，含目前分支事件數；不改呼叫者或引擎狀態。 */
  vars(extra = {}) {
    return { nick: this.nick || '', branch: this.branch, tries: this.tries, n: this.branchCommits(), name: '', suggest: '', ...extra };
  }
  /** say/print/延遲輸出呼叫；文字與額外值 → 替換已知佔位符的文字，未知鍵保留；無副作用。 */
  format(text, extra = {}) {
    const vars = this.vars(extra);
    return String(text).replace(/\{([^{}]+)\}/g, (whole, key) => Object.hasOwn(vars, key) ? String(vars[key]) : whole);
  }
  /** ev 呼叫；無參數 → 唯讀求值環境，done/exists/empty 閉包只查當下進度/VFS，不寫狀態。 */
  env() {
    return {
      flags: this.flags,
      vars: { tries: this.tries, in_branch: this.inBranch, branch: this.branch, quest_active: this.active || '' },
      funcs: {
        done: id => this.done.includes(id) || this.skipped.includes(id),
        exists: path => this.vfs.exists(path), empty: path => this.vfs.empty(path),
      },
    };
  }
  /** 規則/對話/引導呼叫；運算式 → 布林，解析錯誤向上拋出觸發交易回復。 */
  ev(source) { return evaluate(source, this.env()); }

  /** main.js/測試的交易入口；無參數 → Promise<this>，原子執行開場並成功後才發布文字。 */
  async start() {
    return this.transaction(() => this.startSession());
  }
  /** 僅由 start 交易呼叫；無參數 → Promise<this>，只首次發 session.start，drain 處理其連鎖。 */
  async startSession() {
    if (this.started) return this;
    this.started = true;
    this.queue.push(['session.start', {}]);
    await this.drain();
    return this;
  }
  /**
   * 狀態效果呼叫；kind/data → Promise<void>，檢查時鐘後附加雜湊 commit 並釋放對應預算。
   * 未開始/已結束不記；重複 checkpoint 可在預算不足時略過，首次必要事件不丟棄；回復由交易負責。
   */
  async commit(kind, data) {
    if (!this.save || this.ended) return;
    this.checkClocks();
    const last = this.save.commits.at(-1);
    if (last && (this.rMs() < last.r || this.world_t < last.t)) throw new S.CodeError('存檔時間不可倒退；本次操作未套用。');
    // Repeated checkpoints carry no new state. All first occurrences, including
    // flags/tasks/end, have a reserved slot and are never discarded here.
    const key = eventKey(kind, data);
    if (kind === 'checkpoint' && !this.pendingEvents.has(key) && !this.canSpendCommits(1)) {
      this.budgetNotice('checkpoint');
      return;
    }
    const chapter = this.world === 'ch1' ? 'ch1' : 'ch0';
    await S.addCommit(this.save, kind, data, this.rMs(), this.world_t, chapter, this.branch);
    this.pendingEvents.delete(key);
    this.T('commit', kind, data, this.branch, chapter, this.rMs());
  }
  /** canSpendCommits/測試呼叫；無參數 → 後續一次性事件、未看提示與分支退出的必要預留數，唯讀。 */
  reservedCommits() {
    if (this.ended) return 0;
    const hints = this.ladderIds.reduce((sum, id) => sum + Math.max(0, 3 - (this.ladders[id] || 0)), 0);
    // Keep the first story branch available even after unlimited repeated hints.
    // Every admitted branch also owns its worst-case merge + exit slots.
    const branch = this.inBranch ? 2 : this.flags.has('flag.b0.done') ? 0 : 3;
    return this.pendingEvents.size + hints + branch;
  }
  /** 可選提示/重複分支/restore 呼叫；擬新增數量 → 是否仍可保留必要進度，無狀態修改。 */
  canSpendCommits(count) {
    return !!this.save && this.save.commits.length + this.reservedCommits() + count <= this.commitLimit;
  }
  /** 預算耗盡分支呼叫；種類 → undefined，記 trace 且每類只輸出一次警示，容器隨交易回復。 */
  budgetNotice(kind) {
    this.T('budget', kind);
    if (this.budgetNotices.has(kind)) return;
    this.budgetNotices.add(kind);
    this.output('[init] 已保留任務、投票與結尾的存檔空間。提示仍可查看，但不再新增重複紀錄。\n', 'system');
  }
  /** action/say/完成效果呼叫；旗標名 → Promise<void>，首次設定才 commit/排 flag.set；開始旗標建立存檔。 */
  async setFlag(name) {
    if (this.flags.has(name)) return;
    this.flags.add(name);
    if (name === 'flag.demo.started') {
      this.t0 = this.now;
      this.save = S.newSave(this.nick, this.seed, undefined, this.event);
    }
    await this.commit('flag', { name });
    this.queue.push(['flag.set', { name }]);
  }
  /**
   * fire/say/任務效果呼叫；單個 flow 動作與事件 payload → Promise<void|false>。
   * 可改 flags/獎勵/VFS/分支/結尾；分支准入失敗回 false 供 fire 中斷動作串，所有變更依外層交易清理。
   */
  async action(action, payload = {}) {
    const [kind, value] = Object.entries(action)[0];
    if (kind === 'say') return this.say(value, action.vars || {});
    if (kind === 'set') return this.setFlag(value);
    if (kind === 'checkpoint') return this.commit('checkpoint', { id: value });
    if (kind === 'give' || kind === 'card' || kind === 'find') {
      const collection = kind === 'give' ? this.items : kind === 'card' ? this.cards : this.finds;
      if (!collection.has(value)) {
        collection.add(value);
        await this.commit(kind === 'give' ? 'item' : kind, { id: value });
      }
    } else if (kind === 'world') {
      this.advanceWorld(600);
      this.world = value;
      const shellState = this.vfs.shellState;
      this.vfs = createWorld(value, this.seed, this.flags);
      this.vfs.shellState = shellState === null ? null : structuredClone(shellState);
      this.T('world', value);
    } else if (kind === 'print') {
      const name = /^git\s+tag\s+(\S+)/.exec(payload.raw || '')?.[1] || '';
      const text = this.format(value, { name });
      this.T('print', text);
      this.output(`${text}\n`, 'system');
    } else if (kind === 'create_file') {
      const content = DATA.text[value.content_ref];
      if (content === undefined) throw new Error(`找不到文字：${value.content_ref}`);
      this.vfs.writeFile(value.path, content);
      this.T('create_file', value.path);
    } else if (kind === 'branch_enter') {
      // Admission happens before cloning or changing branch state. Once admitted,
      // neither hints nor another optional event can consume the exit liability.
      const extra = this.flags.has('flag.b0.done') ? 3 : 0;
      if (!this.canSpendCommits(extra)) {
        this.T('budget', 'branch.enter');
        this.output('[init] 存檔空間已保留給任務、投票與結尾，不能再開重複分支。\n', 'system');
        return false;
      }
      this.main_snapshot = this.vfs;
      this.vfs = this.vfs.clone();
      this.branch = value.name;
      await this.commit('branch.enter', { name: value.name, from: value.from });
    } else if (kind === 'branch_exit') {
      if (value.mode === 'merge') await this.commit('merge', { mode: 'knowledge', card: value.card });
      await this.commit('branch.exit', { mode: value.mode });
      this.vfs = this.main_snapshot;
      this.main_snapshot = null;
      this.branch = 'main';
      // Reference restores the pre-branch cwd (normally ~), not branch mutations.
      await this.say('init.branch_welcome_back');
    } else if (kind === 'end') {
      await this.commit('end', { time_up: this.flags.has('flag.demo.time_up') });
      this.ended = true;
      this.mode = null;
      this.T('end');
    } else if (!['give', 'card', 'find'].includes(kind)) throw new Error(`未知動作：${kind}`);
  }

  /** say/引導/restore 呼叫；npc.node 參照 → 唯讀節點物件，缺少即拋錯；不得改來源規則。 */
  node(ref) {
    const node = this.nodes.get(ref);
    if (!node) throw new Error(`找不到對話節點：${ref}`);
    return node;
  }
  /**
   * 規則/輸入/引導呼叫；節點參照、模板變數、本輪 seen → Promise<void>。
   * 先輸出再依順序套旗標/獎勵/觸發/延遲/下一節點，可改 mode；seen 只防本次鏈重播，不是永久去重。
   */
  async say(ref, vars = {}, seen = new Set()) {
    const split = ref.indexOf('.');
    const npc = ref.slice(0, split), name = ref.slice(split + 1);
    const key = `${npc === 'harbor' ? 'harbor-master' : npc}.${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const original = this.node(ref);
    const variant = (original.variants || []).find(v => !v.if || this.ev(v.if));
    const node = variant ? { ...original, ...variant } : original;
    this.T('say', ref);
    for (const line of node.lines || []) {
      if (line.if && !this.ev(line.if)) continue;
      if (line.text_ref) {
        const text = DATA.text[line.text_ref];
        if (text === undefined) throw new Error(`找不到文字：${line.text_ref}`);
        this.output(this.format(text, vars));
      } else if (line.text !== undefined) this.output(`${this.format(line.text, vars)}\n`);
    }
    if (node.expect_input) { this.mode = ['input', ref, node]; this.tries = 0; }
    for (const flag of node.sets || []) await this.setFlag(flag);
    if (node.checkpoint) await this.commit('checkpoint', { id: node.checkpoint });
    for (const item of node.gives || []) await this.action({ give: item });
    for (const trigger of node.triggers || []) {
      if (trigger.startsWith('ckpt/')) await this.commit('checkpoint', { id: trigger });
      else if (this.nodes.has(`${npc}.${trigger}`) && !(this.hostMode && trigger === 'branch_offer')) await this.say(`${npc}.${trigger}`, vars, seen);
    }
    if (node.delayed) this.delayed.push({
      due: this.commandCount + node.delayed.after_commands,
      text: node.delayed.text, vars: { ...vars },
    });
    if (node.choices) this.mode = ['choice', ref, node];
    let next = node.goto || (!node.choices ? node.then : null) || node.next;
    if (name === 'intro' && npc.startsWith('harbor')) next = null;
    if (next && !node.expect_input) await this.say(next.includes('.') ? next : `${npc}.${next}`, vars, seen);
  }

  /** fire 呼叫；規則/事件/payload → 是否匹配，讀 VFS/運算式但不執行規則或修改旗標。 */
  matches(rule, event, payload) {
    if (rule.event !== event) return false;
    const match = rule.match || {};
    if (event === 'flag.set' && match.name !== payload.name) return false;
    if (event === 'timer' && match.t !== payload.t) return false;
    if (event === 'file.read' && match.path !== payload.path) return false;
    if (event === 'cmd') {
      if (match.regex && !new RegExp(match.regex).test(payload.raw)) return false;
      if (match.output_contains && !payload.output.includes(match.output_contains)) return false;
      if (match.rc !== undefined && match.rc !== payload.rc) return false;
      if (match.ln_source) {
        const tokens = payload.raw.split(/\s+/);
        const operands = tokens.slice(1).filter(t => !t.startsWith('-'));
        if (tokens[0] !== 'ln' || operands.length < 2 || this.vfs.resolve(operands[0]) !== this.vfs.resolve(match.ln_source)) return false;
      }
    }
    return !rule.when || this.ev(rule.when);
  }
  /** drain/狀態迴圈呼叫；事件/payload → Promise<void>，按來源順序執行非 state 規則並維護 once。 */
  async fire(event, payload) {
    for (const rule of this.flow.rules) {
      if (rule.event === 'state' || !this.matches(rule, event, payload)) continue;
      if (rule.once) {
        if (this.once.has(rule.id)) continue;
        this.once.add(rule.id);
      }
      this.T('rule', rule.id);
      for (const action of rule.do || []) if (await this.action(action, payload) === false) break;
      if (rule.stop && event === 'cmd') break;
    }
    if (this.hostMode && event === 'flag.set' && payload.name === 'flag.lamp_lit' && !this.flags.has('flag.demo.in_vote')) {
      await this.say('init.demo_vote');
    }
  }
  /** start/輸入/效果呼叫；無參數 → Promise<void>，耗盡事件再求 state 固定點，防止無限連鎖。 */
  async drain() {
    let guard = 0;
    while (this.queue.length) {
      if (++guard >= 500) throw new Error('事件迴圈');
      const [event, payload] = this.queue.shift();
      await this.fire(event, payload);
    }
    await this.runStateRules();
    if (this.queue.length) await this.drain();
  }
  /** drain 呼叫；無參數 → Promise<void>，重跑 state 規則直到不再改變，途中事件先處理再更新快題。 */
  async runStateRules() {
    let changed = true, guard = 0;
    while (changed) {
      if (++guard >= 500) throw new Error('狀態規則迴圈');
      changed = false;
      for (const rule of this.flow.rules) {
        if (rule.event !== 'state' || this.once.has(rule.id) || !this.ev(rule.when)) continue;
        if (rule.once) this.once.add(rule.id);
        this.T('rule', rule.id);
        for (const action of rule.do || []) await this.action(action);
        changed = true;
        while (this.queue.length) {
          const [event, payload] = this.queue.shift();
          await this.fire(event, payload);
        }
      }
    }
    await this.updateQuest();
  }
  /** vars/分支提示呼叫；無參數 → 目前同名分支所有非 enter commit 數，唯讀，不按最新 enter 切片。 */
  branchCommits() {
    return (this.save?.commits || []).filter(c => c.branch === this.branch && c.kind !== 'branch.enter').length;
  }

  /** updateQuest/restore 呼叫；無參數 → [目前章節題序, 分組鍵]，依抵港/完成旗標選擇；不改索引。 */
  questSequence() {
    if (this.flags.has('flag.ch0_done') && this.flags.has('flag.met_harbor')) return [this.flow.quests.after.order, 'ch1'];
    return [this.flow.quests.order, 'ch0'];
  }
  /** 狀態穩定後呼叫；無參數 → Promise<void>，啟用下一題並用最近 20 筆歷史補登，換題清 skip 確認。 */
  async updateQuest() {
    while (!this.active) {
      const [sequence, group] = this.questSequence();
      const id = sequence[this.quest_idx[group]];
      if (!id || this.ended || (this.hostMode && this.flags.has('flag.lamp_lit'))) return;
      this.active = id;
      this.skip_pending = null;
      this.T('quest.active', id);
      const prior = this.history.slice(-20).find(h => this.questCheck(this.quests[id], h));
      if (!prior) return;
      await this.finishQuest(id);
    }
  }
  /** updateQuest/feedCommand 呼叫；題目/歷史 → boolean，轉交 quests.js，唯讀目前 VFS 與 manifest。 */
  questCheck(quest, history) {
    return checkQuest(quest.check, history.raw, history.output, this.manifest, this.vfs);
  }
  /**
   * 快題檢查/skip 呼叫；題號、是否跳過 → Promise<void>，移動索引、寫 task 或 skip 並套完成效果。
   * 跳題不計分但仍給旗標/物品避免卡關；清除確認後 drain，出錯由外層交易還原全部連鎖。
   */
  async finishQuest(id, skipped = false) {
    const quest = this.quests[id];
    this.skip_pending = null;
    this.active = null;
    this.quest_idx[id.startsWith('Q1') ? 'ch1' : 'ch0']++;
    if (skipped) {
      this.skipped.push(id);
      await this.commit('skip', { id });
      await this.say('init.demo_skipped');
    } else {
      this.done.push(id);
      await this.commit('task', { id });
      if (quest.on_done?.say) await this.say(quest.on_done.say);
    }
    for (const flag of quest.on_done?.sets || []) await this.setFlag(flag);
    for (const item of quest.on_done?.gives || []) await this.action({ give: item });
    if (quest.on_done?.checkpoint) await this.commit('checkpoint', { id: quest.on_done.checkpoint });
    await this.drain();
  }
  /** UI/提示呼叫；無參數 → 首個條件符合的 guidance 或 null；唯讀，順序就是引導優先度。 */
  currentLadder() { return this.flow.guidance.find(g => this.ev(g.when)) || null; }
  /** hint/idle 呼叫；觸發來源 → Promise<void>，持久累積各 ladder 至三階，保留必要預算後才記重複提示。 */
  async showRung(via) {
    const guide = this.currentLadder();
    if (!guide || (guide.id === 'g.none' && via === 'idle')) return;
    let id = guide.id, ref, full, vars = {};
    if (guide.ladder === 'quest_ladder') id = `q.${this.active}`;
    const prior = this.ladders[id] || 0;
    const n = Math.min(prior + 1, 3);
    // First three rungs own reserved slots. Preserve reference repeat commits
    // (including fourth hints) whenever there is genuinely spare capacity.
    const record = prior < 3 || this.canSpendCommits(1);
    this.ladders[id] = n;
    if (guide.ladder === 'quest_ladder') {
      const quest = this.quests[this.active];
      const hints = quest.hints || [], command = quest.reference?.cmd || '';
      vars = {
        quest_hint_1: hints[0] || '',
        quest_hint_2: hints[1] || `指令的第一個字是 ${command.split(/\s+/)[0]}。`,
        quest_reference_cmd: command,
      };
      ref = `init.demo_idle_${n}`;
      full = n === 3;
    } else {
      ref = guide.ladder[Math.min(n, guide.ladder.length) - 1];
      full = (this.node(ref).sets || []).includes('flag.demo.used_full_hint');
    }
    this.T('ladder', id, n, via);
    await this.say(ref, vars);
    if (record) await this.commit('hint', { n, full });
    else this.budgetNotice('hint');
    await this.drain();
  }

  /** main.js/測試的交易入口；非負有限秒數 → Promise<this>，時間與提示/結尾連鎖失敗一起回復。 */
  async advance(dt) {
    return this.transaction(() => this.advanceClock(dt));
  }
  /** advance 交易內部呼叫；秒數 → Promise<this>，逐個精確邊界觸發 timer 再 idle，不依 UI tick 整數化。 */
  async advanceClock(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError('dt 必須是非負秒數');
    const end = this.now + dt;
    if (!Number.isFinite(end)) throw new RangeError('時鐘超出有限秒數範圍');
    // Schedule exact boundaries rather than missing thresholds with fractional UI ticks.
    while (!this.ended && this.t0 !== null) {
      const pending = [];
      for (const t of [840, 900, 960]) if (!this.timers_fired.has(t)) pending.push({ at: this.t0 + t, timer: t });
      if (this.mode === null) for (const seconds of this.flow.timers.idle_thresholds) {
        if (!this.idle_fired.has(seconds)) pending.push({ at: this.last_input + seconds, idle: seconds });
      }
      const next = pending.filter(p => p.at > this.now + 1e-9 && p.at <= end + 1e-9).sort((a, b) => a.at - b.at || (a.timer ? -1 : 1))[0];
      if (!next) break;
      this.now = next.at;
      // timer precedes idle when the same second contains both (Python reference).
      for (const t of [840, 900, 960]) if (!this.timers_fired.has(t) && Math.abs(this.now - this.t0 - t) < 1e-6) {
        this.timers_fired.add(t);
        this.queue.push(['timer', { t }]);
        await this.drain();
      }
      if (!this.ended && this.mode === null) for (const seconds of this.flow.timers.idle_thresholds) {
        if (!this.idle_fired.has(seconds) && Math.abs(this.now - this.last_input - seconds) < 1e-6) {
          this.idle_fired.add(seconds);
          this.queue.push(['idle', { seconds }]);
          await this.showRung('idle');
        }
      }
    }
    this.now = end;
    return this;
  }

  /** main.js/重播的交易入口；一行輸入/經過秒數 → Promise<this>，失敗不發布輸出也不保留半套效果。 */
  commandContext(signal) {
    return Object.freeze({executor:this.shellExecutor,shell:this.shellDialect||(this.shellExecutor===executeShell?'legacy':'bash'),signal});
  }
  async feed(raw, dt = 0, {signal} = {}) {
    const context=this.commandContext(signal);
    return this.transaction(async()=>{
      signal?.throwIfAborted();
      const result=await this.feedInput(raw,dt,context);
      signal?.throwIfAborted();
      return result;
    });
  }
  /**
   * feed 交易內部呼叫；raw/dt → Promise<this>，先 advance，再依 input/choice/command 模式派送。
   * 非空輸入重設 idle；暱稱/口令/投票不走一般 Shell，暫態確認與對話模式由交易一起回復。
   */
  async feedInput(raw, dt = 0, context = this.commandContext()) {
    await this.advance(dt);
    context.signal?.throwIfAborted();
    raw = String(raw).trim();
    if (!raw) {
      if (this.mode?.[0] === 'input' && this.mode[2].expect_input.secret) this.mode = null;
      return this;
    }
    this.last_input = this.now;
    this.idle_fired.clear();
    if (this.ended) {
      if (/^save(?:\s|$)/.test(raw)) await this.say('init.demo_export_help');
      else if (raw === 'help') await this.say('init.demo_help');
      return this;
    }
    this.T('input', raw);
    if (this.mode?.[0] === 'input') {
      const [, ref, node] = this.mode, input = node.expect_input;
      const correct = input.pattern ? new RegExp(`^(?:${input.pattern})$`).test(raw) : raw.replace(/ /g, '').toLowerCase() === input.secret.toLowerCase();
      if (!correct && input.secret && (this.whitelist.has(raw.split(/\s+/)[0]) || ['hint', 'skip', 'save', 'help'].includes(raw.split(/\s+/)[0]))) {
        this.mode = null;
        this.T('input.escape', raw);
        await this.feedCommand(raw,context);
        return this;
      }
      const npc = ref.split('.')[0];
      if (correct) {
        this.mode = null;
        if (input.store === 'player.nick') this.nick = raw;
        await this.say(`${npc}.${input.on_right}`);
      } else {
        this.tries++;
        await this.say(`${npc}.${input.on_wrong}`);
      }
      await this.drain();
      return this;
    }
    if (this.mode?.[0] === 'choice') {
      const [, ref, node] = this.mode;
      if (raw === 'hint') { await this.showRung('hint'); return this; }
      // UI save/help are available in choices without advancing world time.
      if (/^save(?:\s|$)/.test(raw)) { await this.say('init.demo_export_help'); return this; }
      if (raw === 'help') { await this.say('init.demo_help'); return this; }
      const choice = node.choices.find(c => c.input === raw);
      if (choice) {
        this.mode = null;
        await this.commit('choice', { id: 'vote', value: choice.input });
        for (const flag of choice.sets || []) await this.setFlag(flag);
        const npc = ref.split('.')[0];
        if (choice.say) await this.say(choice.say.includes('.') ? choice.say : `${npc}.${choice.say}`);
        if (node.then) await this.say(node.then.includes('.') ? node.then : `${npc}.${node.then}`);
        await this.drain();
      } else await this.say('init.demo_g_vote_1');
      return this;
    }
    await this.feedCommand(raw,context);
    return this;
  }

  /**
   * feedInput 呼叫；raw → Promise<void>，推世界時間、執行指令、先派讀檔再 cmd、判題與延遲輸出。
   * readEvents 的 inode 必須用讀取當下快照，不能在同一腳本刪除/重綁後再解析，否則會誤發現。
   */
  async feedCommand(raw,context = this.commandContext()) {
    this.advanceWorld(30);
    this.commandCount++;
    context.signal?.throwIfAborted();
    const result = await this.execute(raw,context);
    context.signal?.throwIfAborted();
    const history = { raw, output: result.stdout || '', rc: result.rc, cwd: this.vfs.cwd };
    this.history.push(history);
    const seen = new Set();
    const hasSnapshots = Array.isArray(result.readEvents);
    for (const read of (hasSnapshots ? result.readEvents : result.reads) || []) {
      const path = typeof read === 'string' ? read : read.path;
      const paths = [path, ...(typeof read === 'object' ? read.same_inode || [] : [])];
      // Shell may report an alias; known source paths still count as reading it.
      // A pathname may have been removed/rebound later in the same script.
      // Never resolve it again when Shell supplied the read-time inode snapshot.
      if (!hasSnapshots && typeof read === 'string' && typeof this.vfs.sameInodePaths === 'function') paths.push(...this.vfs.sameInodePaths(path));
      for (const p of paths) if (p && !seen.has(p)) {
        seen.add(p);
        this.queue.push(['file.read', { path: p, branch: this.branch }]);
      }
    }
    this.queue.push(['cmd', { ...history, argv0: raw.split(/\s+/)[0], branch: this.branch }]);
    await this.drain();
    if (this.active && !this.done.includes(this.active) && this.questCheck(this.quests[this.active], history)) await this.finishQuest(this.active);
    else if (this.active) this.wrongOutputHints(this.quests[this.active], history);
    await this.drain();
    const ready = this.delayed.filter(d => d.due <= this.commandCount);
    this.delayed = this.delayed.filter(d => d.due > this.commandCount);
    for (const delayed of ready) this.output(`${this.format(delayed.text, delayed.vars)}\n`);
  }
  /** feedCommand 未過題時呼叫；題目/歷史 → undefined，符合已知錯誤末行才補提示；不完成題目。 */
  wrongOutputHints(quest, history) {
    const lastLine = history.output.trimEnd().split('\n').at(-1)?.trim();
    for (const hint of quest.wrong_output_hints || []) {
      const value = String(hint.when_last_line_equals || '').replace(/\{manifest\.([^}]+)\}/g, (_, key) => this.manifest[key]);
      if (value && lastLine === value) this.output(`${this.format(hint.say)}\n`, 'hint');
    }
  }
  /**
   * feedCommand 呼叫；raw → Promise<Shell 結果>，處理 hint/skip/help/故事命令後才交模擬 Shell。
   * 可能輸出、完成跳題或改 VFS；此處不處理宿主檔案，skip 確認綁定題號與十秒期限。
   */
  async execute(raw,context = this.commandContext()) {
    const tokens = raw.split(/\s+/), first = tokens[0];
    // Story controls are whole submissions; compound scripts belong to the shell.
    const standalone = context.shell==='legacy'||!/[;&|<>()\n`$\\]/.test(raw);
    const empty = { stdout: '', stderr: '', rc: 0, reads: [] };
    if (standalone && first === 'hint') { await this.showRung('hint'); return empty; }
    if (standalone && first === 'skip') {
      if (!this.active) { this.skip_pending = null; await this.say('init.demo_skip_nothing'); }
      else if (this.skip_pending?.questId === this.active && this.now - this.skip_pending.at <= 10) {
        this.skip_pending = null;
        await this.finishQuest(this.active, true);
      } else {
        this.skip_pending = { questId: this.active, at: this.now };
        await this.say('init.demo_skip_confirm');
      }
      return empty;
    }
    if (standalone && first === 'help') { await this.say('init.demo_help'); return empty; }
    if (standalone && ['save', 'git', 'ssh', 'ask', 'finger', 'man', 'close', 'sudo'].includes(first)) return empty;
    if (['block', 'pass'].includes(first)) {
      const stderr = `bash: ${first}: command not found`;
      this.output(`${stderr}\n`, 'stderr');
      return { ...empty, stdout: stderr, stderr, rc: 127 };
    }
    const rm = this.flow.rules.find(rule => rule.id === 'r.rm_main').match.regex;
    if (first === 'rm' && !this.inBranch && new RegExp(rm).test(raw)) return { ...empty, rc: 1 };
    context.signal?.throwIfAborted();
    const result = await context.executor(raw, this.vfs, { flags: this.flags, branch: this.branch, nick: this.nick, seed: this.seed, nowMs: 1700000000000 + Math.round(this.now * 1000) });
    if (result.stdout) this.output(result.stdout, 'stdout');
    if (result.stderr) this.output(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`, 'stderr');
    if (result.rc === 127) {
      const unknown = raw.split(/\|\||&&|;|\|/).map(s => s.trim().split(/\s+/)[0]).find(command => command && !this.whitelist.has(command));
      if (unknown) await this.typo(unknown);
    }
    return result;
  }
  /** execute 的 rc=127 分支呼叫；未知指令名 → Promise<void>，僅輸出唯一建議/trace，不代為執行。 */
  async typo(command) {
    let suggest = this.flow.command_pipeline.typos.table[command];
    if (!suggest && command.length >= 2) {
      const candidates = [...this.whitelist].filter(word => distance(command, word) === 1);
      if (candidates.length === 1) suggest = candidates[0];
    }
    if (suggest) { await this.say('init.demo_typo', { suggest }); this.T('typo', command, suggest); }
  }

  /** 測試/驗收呼叫；無參數 → Promise<摘要|null>，seal 會更新 save.head，其餘為唯讀投影與驗鏈。 */
  async summary() {
    if (!this.save) return null;
    await S.seal(this.save);
    const state = S.fold(this.save);
    const [level, reasons] = await S.level(this.save);
    const score = S.score(this.save);
    const fullgame = await S.toFullgame(this.save);
    return {
      nick: this.save.nick, n_commits: this.save.commits.length, head: this.save.head, level, reasons,
      tasks: state.tasks, skipped: state.skipped, finds: state.finds, items: state.items, cards: state.cards,
      vote: state.vote, seconds: state.seconds, ended: state.ended, time_up: state.flags.has('flag.demo.time_up'),
      score: score.score, title_id: score.title_id, flags: [...state.flags].sort(), fullgame_checkpoints: fullgame.checkpoints,
    };
  }

  /** main.js 匯入呼叫；save/選項 → Promise<新 Engine>，restore 准入失敗即拒絕，來源存檔不改寫。 */
  static async fromSave(save, options = {}) {
    const engine = new Engine({ ...options, seed: save.seed, event: save.event });
    await engine.restore(save);
    return engine;
  }
  /**
   * fromSave/測試呼叫；形狀合法 save → Promise<this>，先在獨立候選物件恢復並驗預算/時間再發布。
   * 只重建 durable 狀態與已知分支效果，不重播對話、不保證任意 Shell 檔/cwd；完整本機還原靠 UI journal。
   */
  async restore(save) {
    await S.checkShape(save);
    const restored = new Engine({ seed: save.seed, event: save.event, mode: save.event === 'host-led' ? 'host' : this.runMode, onOutput: this.onOutput });
    restored.save = JSON.parse(JSON.stringify(save));
    restored.nick = save.nick;
    restored.started = true;
    restored.t0 = 0;
    const state = S.fold(save);
    // Replay only durable state, never dialogue effects or commits.
    for (const commit of save.commits) {
      const { kind, data } = commit;
      restored.pendingEvents.delete(eventKey(kind, data));
      if (kind === 'flag') restored.flags.add(data.name);
      else if (kind === 'task') restored.done.push(data.id);
      else if (kind === 'skip') restored.skipped.push(data.id);
      else if (kind === 'branch.enter') restored.branch = data.name;
      else if (kind === 'branch.exit') restored.branch = 'main';
      else if (kind === 'hint') {
        const sequence = restored.questSequence()[0];
        restored.active = sequence.find(id => !restored.done.includes(id) && !restored.skipped.includes(id)) || null;
        const guide = restored.currentLadder();
        const id = guide?.ladder === 'quest_ladder' ? `q.${restored.active}` : guide?.id;
        if (id) restored.ladders[id] = data.n;
      }
    }
    for (const flag of state.flags) restored.flags.add(flag);
    restored.items = new Set(state.items);
    restored.cards = new Set(state.cards);
    restored.finds = new Set(state.finds);
    restored.world = save.commits.some(c => c.chapter === 'ch1') || restored.flags.has('flag.met_harbor') ? 'ch1' : 'ch0';
    restored.vfs = createWorld(restored.world, restored.seed, restored.flags);
    if (restored.inBranch) {
      restored.main_snapshot = restored.vfs;
      restored.vfs = restored.vfs.clone();
      if (restored.flags.has('flag.b0.lost0_created')) {
        executeShell('rm -rf ~/notes', restored.vfs, { flags: restored.flags, branch: restored.branch });
        restored.vfs.writeFile('/lost+found/#0', DATA.text['text/ch0/lost0.txt']);
      }
    }
    for (const group of ['ch0', 'ch1']) {
      const sequence = group === 'ch0' ? restored.flow.quests.order : restored.flow.quests.after.order;
      restored.quest_idx[group] = sequence.filter(id => restored.done.includes(id) || restored.skipped.includes(id)).length;
    }
    const [sequence, group] = restored.questSequence();
    restored.ended = state.ended || restored.flags.has('flag.demo.finished');
    restored.active = restored.ended || (restored.hostMode && restored.flags.has('flag.lamp_lit')) ? null : sequence[restored.quest_idx[group]] || null;
    restored.mode = !restored.ended && restored.flags.has('flag.demo.in_vote') ? ['choice', 'init.demo_vote', restored.node('init.demo_vote')] : null;
    const last = save.commits.at(-1);
    restored.now = (last?.r || 0) / 1000;
    restored.last_input = restored.now;
    restored.world_t = last?.t || 0;
    for (const t of [840, 900, 960]) if (t <= restored.now) restored.timers_fired.add(t);
    for (const [rule, flag] of Object.entries({
      'r.mail_file': 'flag.mail_read', 'r.first_night': 'flag.first_night_read', 'r.draft': 'flag.draft_read',
      'r.notes_emptied': 'flag.b0.lost0_created', 'r.ch0_done': 'flag.ch0_done', 'r.vote_open': 'flag.demo.in_vote',
    })) if (restored.flags.has(flag)) restored.once.add(rule);
    if (restored.finds.has('cat')) restored.once.add('r.cat_find');
    // Shape-valid old saves may already have spent the reserve. Reject before
    // publishing any restored state, rather than failing after a future command
    // has changed flags/VFS or trimming the caller's existing hash chain.
    if (!restored.canSpendCommits(0)) throw new S.CodeError('存檔剩餘事件空間不足，無法安全續玩；請保留原始存檔，紀錄未被修改。');
    if (!restored.ended && (restored.world_t > DATA.yaml['demo/integrity.yaml'].limits.max_t - 30 ||
      restored.now >= 960 || (restored.now >= 900 && !restored.flags.has('flag.demo.in_vote')))) {
      throw new S.CodeError('存檔時間已達安全續玩界線；請保留原始存檔，紀錄未被修改。');
    }
    Object.assign(this, restored);
    return this;
  }
}
