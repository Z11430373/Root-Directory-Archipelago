import { DATA } from '../data.js';
import { evaluate } from '../expr.js';
import * as S from '../save/index.js';
import { createWorld } from '../vfs.js';
import { execute as executeShell } from '../shell/exec.js';
import { generateLogs } from '../loggen.js';
import { checkQuest } from '../quests.js';

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

/** Data-driven, virtual-clock runtime. Callers must await operations in order. */
export class Engine {
  constructor({ seed = 5, event = 'demo-event-1', mode = 'self', onOutput } = {}) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('種子不合規則');
    if (event !== null && (typeof event !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(event))) throw new TypeError('活動代號不合規則');
    this.seed = seed;
    this.runMode = mode;
    this.event = mode === 'host' || mode === 'host_led' ? 'host-led' : event;
    this.onOutput = typeof onOutput === 'function' ? onOutput : () => {};
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
  }

  get inBranch() { return this.branch !== 'main'; }
  get inputMode() { return this.mode?.[0] || null; }
  get hostMode() { return this.runMode === 'host' || this.runMode === 'host_led'; }
  get cwd() { return this.vfs.cwd; }
  get home() { return this.vfs.home; }
  rMs() { return this.t0 === null ? 0 : Math.round((this.now - this.t0) * 1000); }
  T(...entry) { this.trace.push(entry); }
  output(text, kind = 'dialogue') {
    if (!text) return;
    text = String(text);
    this.outputs.push({ text, kind });
    this.onOutput(text, kind);
  }
  vars(extra = {}) {
    return { nick: this.nick || '', branch: this.branch, tries: this.tries, n: this.branchCommits(), name: '', suggest: '', ...extra };
  }
  format(text, extra = {}) {
    const vars = this.vars(extra);
    return String(text).replace(/\{([^{}]+)\}/g, (whole, key) => Object.hasOwn(vars, key) ? String(vars[key]) : whole);
  }
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
  ev(source) { return evaluate(source, this.env()); }

  async start() {
    if (this.started) return this;
    this.started = true;
    this.queue.push(['session.start', {}]);
    await this.drain();
    return this;
  }
  async commit(kind, data) {
    if (!this.save || this.ended) return;
    const chapter = this.world === 'ch1' ? 'ch1' : 'ch0';
    await S.addCommit(this.save, kind, data, this.rMs(), this.world_t, chapter, this.branch);
    this.T('commit', kind, data, this.branch, chapter, this.rMs());
  }
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
      this.world = value;
      this.vfs = createWorld(value, this.seed, this.flags);
      this.world_t += 600;
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

  node(ref) {
    const node = this.nodes.get(ref);
    if (!node) throw new Error(`找不到對話節點：${ref}`);
    return node;
  }
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
  async fire(event, payload) {
    for (const rule of this.flow.rules) {
      if (rule.event === 'state' || !this.matches(rule, event, payload)) continue;
      if (rule.once) {
        if (this.once.has(rule.id)) continue;
        this.once.add(rule.id);
      }
      this.T('rule', rule.id);
      for (const action of rule.do || []) await this.action(action, payload);
      if (rule.stop && event === 'cmd') break;
    }
    if (this.hostMode && event === 'flag.set' && payload.name === 'flag.lamp_lit' && !this.flags.has('flag.demo.in_vote')) {
      await this.say('init.demo_vote');
    }
  }
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
  branchCommits() {
    return (this.save?.commits || []).filter(c => c.branch === this.branch && c.kind !== 'branch.enter').length;
  }

  questSequence() {
    if (this.flags.has('flag.ch0_done') && this.flags.has('flag.met_harbor')) return [this.flow.quests.after.order, 'ch1'];
    return [this.flow.quests.order, 'ch0'];
  }
  async updateQuest() {
    while (!this.active) {
      const [sequence, group] = this.questSequence();
      const id = sequence[this.quest_idx[group]];
      if (!id || this.ended || (this.hostMode && this.flags.has('flag.lamp_lit'))) return;
      this.active = id;
      this.T('quest.active', id);
      const prior = this.history.slice(-20).find(h => this.questCheck(this.quests[id], h));
      if (!prior) return;
      await this.finishQuest(id);
    }
  }
  questCheck(quest, history) {
    return checkQuest(quest.check, history.raw, history.output, this.manifest, this.vfs);
  }
  async finishQuest(id, skipped = false) {
    const quest = this.quests[id];
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
  currentLadder() { return this.flow.guidance.find(g => this.ev(g.when)) || null; }
  async showRung(via) {
    const guide = this.currentLadder();
    if (!guide || (guide.id === 'g.none' && via === 'idle')) return;
    let id = guide.id, ref, full, vars = {};
    if (guide.ladder === 'quest_ladder') id = `q.${this.active}`;
    const n = Math.min((this.ladders[id] || 0) + 1, 3);
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
    await this.commit('hint', { n, full });
    await this.drain();
  }

  async advance(dt) {
    if (typeof dt !== 'number' || !Number.isFinite(dt) || dt < 0) throw new RangeError('dt 必須是非負秒數');
    const end = this.now + dt;
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

  async feed(raw, dt = 0) {
    await this.advance(dt);
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
        await this.feedCommand(raw);
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
    await this.feedCommand(raw);
    return this;
  }

  async feedCommand(raw) {
    this.world_t += 30;
    this.commandCount++;
    const result = await this.execute(raw);
    const history = { raw, output: result.stdout || '', rc: result.rc, cwd: this.vfs.cwd };
    this.history.push(history);
    const seen = new Set();
    for (const read of result.reads || []) {
      const path = typeof read === 'string' ? read : read.path;
      const paths = [path, ...(typeof read === 'object' ? read.same_inode || [] : [])];
      // Shell may report an alias; known source paths still count as reading it.
      if (typeof this.vfs.sameInodePaths === 'function') paths.push(...this.vfs.sameInodePaths(path));
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
  wrongOutputHints(quest, history) {
    const lastLine = history.output.trimEnd().split('\n').at(-1)?.trim();
    for (const hint of quest.wrong_output_hints || []) {
      const value = String(hint.when_last_line_equals || '').replace(/\{manifest\.([^}]+)\}/g, (_, key) => this.manifest[key]);
      if (value && lastLine === value) this.output(`${this.format(hint.say)}\n`, 'hint');
    }
  }
  async execute(raw) {
    const tokens = raw.split(/\s+/), first = tokens[0];
    const empty = { stdout: '', stderr: '', rc: 0, reads: [] };
    if (first === 'hint') { await this.showRung('hint'); return empty; }
    if (first === 'skip') {
      if (!this.active) await this.say('init.demo_skip_nothing');
      else if (this.skip_pending !== null && this.now - this.skip_pending <= 10) {
        this.skip_pending = null;
        await this.finishQuest(this.active, true);
      } else {
        this.skip_pending = this.now;
        await this.say('init.demo_skip_confirm');
      }
      return empty;
    }
    if (first === 'help') { await this.say('init.demo_help'); return empty; }
    if (['save', 'git', 'ssh', 'ask', 'finger', 'man', 'close', 'sudo'].includes(first)) return empty;
    if (['block', 'pass'].includes(first)) {
      const stderr = `bash: ${first}: command not found`;
      this.output(`${stderr}\n`, 'stderr');
      return { ...empty, stdout: stderr, stderr, rc: 127 };
    }
    const rm = this.flow.rules.find(rule => rule.id === 'r.rm_main').match.regex;
    if (first === 'rm' && !this.inBranch && new RegExp(rm).test(raw)) return { ...empty, rc: 1 };
    const result = executeShell(raw, this.vfs, { flags: this.flags, branch: this.branch, nick: this.nick });
    if (result.stdout) this.output(result.stdout, 'stdout');
    if (result.stderr) this.output(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`, 'stderr');
    if (result.rc === 127) {
      const unknown = raw.split(/\|\||&&|;|\|/).map(s => s.trim().split(/\s+/)[0]).find(command => command && !this.whitelist.has(command));
      if (unknown) await this.typo(unknown);
    }
    return result;
  }
  async typo(command) {
    let suggest = this.flow.command_pipeline.typos.table[command];
    if (!suggest && command.length >= 2) {
      const candidates = [...this.whitelist].filter(word => distance(command, word) === 1);
      if (candidates.length === 1) suggest = candidates[0];
    }
    if (suggest) { await this.say('init.demo_typo', { suggest }); this.T('typo', command, suggest); }
  }

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

  static async fromSave(save, options = {}) {
    const engine = new Engine({ ...options, seed: save.seed, event: save.event });
    await engine.restore(save);
    return engine;
  }
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
    Object.assign(this, restored);
    return this;
  }
}
