#!/usr/bin/env python3
"""
flow.yaml 的參考實作（headless，無畫面）。用真的 bash 在實體資料夾上執行一般指令，
其餘（mail/systemctl/git/ssh/ask/finger/man/close/sudo/hint/skip…）由本程式內建。

用途
  1. 證明流程規格自洽：照走法一路走到底，不會卡死，產出的存檔通過 savelib 所有檢查。
  2. 產生 testvectors/walkthrough.json：走法 + 預期軌跡。前端的 headless 模式必須重現同樣的軌跡。

  python3 tools/flow_sim.py run   [walkthrough 名稱]   # 走一遍，印出軌跡摘要
  python3 tools/flow_sim.py make                       # 重新產生 testvectors/walkthrough.json 與 expr.json
  python3 tools/flow_sim.py check                      # 重跑並與檔案比對

虛擬時鐘：每個步驟有 dt（距上一步的秒數），r（毫秒）= 累計 dt。commit 的 t（世界秒）每個有效指令 +30、渡海 +600。
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(PACK, "tools"))
import savelib as S      # noqa: E402
import flowexpr as FX    # noqa: E402
import validate as V     # noqa: E402
import yaml              # noqa: E402

TV = os.path.join(PACK, "demo", "testvectors")
READERS = {"cat", "head", "tail", "grep", "sort", "uniq", "cut", "wc"}
OPT_WITH_VALUE = {"head": {"-n", "-c"}, "tail": {"-n", "-c"}, "cut": {"-d", "-f", "-c"}, "sort": {"-k", "-t", "-o"}, "grep": {"-e", "-m", "-A", "-B", "-C"}}


def Y(*p):
    return yaml.safe_load(open(os.path.join(PACK, *p), encoding="utf-8"))


def dl1(a, b):
    """Damerau-Levenshtein（相鄰對調算 1）"""
    d = {}
    for i in range(-1, len(a) + 1):
        d[(i, -1)] = i + 1
    for j in range(-1, len(b) + 1):
        d[(-1, j)] = j + 1
    for i in range(len(a)):
        for j in range(len(b)):
            c = 0 if a[i] == b[j] else 1
            d[(i, j)] = min(d[(i - 1, j)] + 1, d[(i, j - 1)] + 1, d[(i - 1, j - 1)] + c)
            if i and j and a[i] == b[j - 1] and a[i - 1] == b[j]:
                d[(i, j)] = min(d[(i, j)], d[(i - 2, j - 2)] + 1)
    return d[(len(a) - 1, len(b) - 1)]


class Sim:
    def __init__(self, seed=5, nick_real="zien"):
        self.cfg = S.demo_cfg()
        self.flow = Y("demo", "flow.yaml")
        self.D = V.load_all()
        self.demo_dlg = Y("demo", "dialogue", "init_demo.yaml")
        self.nodes = {}
        for npc, d in self.D["dialogue"].items():
            for n in d["nodes"]:
                self.nodes[(npc, n["node"])] = n
                if d.get("alias"):
                    self.nodes[(d["alias"], n["node"])] = n
        for n in self.demo_dlg["nodes"]:
            self.nodes[("init", n["node"])] = n
        self.nodes[("harbor", "finger_plan")] = self.nodes[("harbor-master", "finger_plan")]
        self.quests = {q: self.D["quests"][q] for q in self.cfg["content"]["quick_tasks"]}
        self.whitelist = set(self.cfg["command_whitelist"])
        self.tmp = tempfile.mkdtemp(prefix="flowsim_")
        gen = os.path.join(self.tmp, "gen")
        ov = self.cfg["content"]["chapters"]["ch1_teaser"]["generate_override"]
        subprocess.run([sys.executable, os.path.join(PACK, "tools", "gen_logs.py"), "--out", gen, "--lines-per-day", str(ov["lines_per_day"]),
                        "--days", str(ov["days"]), "--seed", str(seed), "--npc"], check=True, capture_output=True)
        self.man = json.load(open(os.path.join(gen, "manifest.json")))
        self.worlds = {}
        for chid in ("ch0", "ch1"):
            ch = dict(self.D["chapters"][[k for k in self.D["chapters"] if k.startswith(chid)][0]])
            if chid == "ch1":
                inc = set(self.cfg["content"]["chapters"]["ch1_teaser"]["include_files"])
                ch["files"] = [f for f in ch["files"] if f["path"] in inc]
            root = os.path.join(self.tmp, chid)
            os.makedirs(root)
            V.materialize(ch, root, gen, {})
            home = os.path.join(root, ch["player_start"]["home"].lstrip("/"))
            os.makedirs(home, exist_ok=True)
            self.worlds[chid] = {"root": root, "home": home, "start": ch["player_start"]["cwd"], "ch": ch}
        self.world = "ch0"
        self.root = self.worlds["ch0"]["root"]
        self.home = self.worlds["ch0"]["home"]
        self.cwd = self.home
        self.branch = "main"
        self.main_snapshot = None
        # 狀態
        self.flags = set()
        self.done, self.skipped = [], []
        self.items, self.cards = set(), set()
        self.finds = set()
        self.history = []
        self.ladders = {}
        self.once = set()
        self.quest_idx = {"ch0": 0, "ch1": 0}
        self.active = None
        self.mode = None          # None | ("input", node) | ("choice", node)
        self.tries = 0
        self.skip_pending = None
        self.delayed = []
        self.nick = None
        self.t0 = None
        self.now = 0.0            # 虛擬秒
        self.last_input = 0.0
        self.idle_fired = set()
        self.timers_fired = set()
        self.world_t = 0
        self.save = None
        self.trace = []
        self.branch_cmds = 0
        self.ended = False
        self.queue = []
        self.said = set()

    # ------------------------------------------------------------------ 工具
    def T(self, *a):
        self.trace.append(list(a))

    def r_ms(self):
        return 0 if self.t0 is None else int(round((self.now - self.t0) * 1000))

    def commit(self, kind, data):
        if self.save is None:
            return
        ch = "ch1" if self.world == "ch1" else "ch0"
        S.add_commit(self.save, kind, data, self.r_ms(), self.world_t, chapter=ch, branch=self.branch)
        self.T("commit", kind, data, self.branch, ch, self.r_ms())

    def env(self):
        return {"flags": self.flags,
                "vars": {"tries": self.tries, "in_branch": self.branch != "main", "branch": self.branch,
                         "quest_active": self.active or ""},
                "funcs": {"done": lambda q: q in self.done or q in self.skipped, "exists": self.p_exists, "empty": self.p_empty}}

    def ev(self, expr):
        return FX.evaluate(expr, self.env())

    def vpath(self, p):
        """虛擬路徑 → 實體路徑（~ 與相對路徑以 home 為準）"""
        if p.startswith("~"):
            p = "/" + os.path.relpath(self.home, self.root) + p[1:]
        return os.path.join(self.root, p.lstrip("/"))

    def p_exists(self, p):
        return os.path.exists(self.vpath(p))

    def p_empty(self, p):
        r = self.vpath(p)
        return (not os.path.exists(r)) or (os.path.isdir(r) and not os.listdir(r))

    def to_virtual(self, real):
        rel = os.path.relpath(os.path.realpath(real), os.path.realpath(self.root))
        return "/" if rel == "." else "/" + rel

    # ------------------------------------------------------------------ 旗標與動作
    def set_flag(self, name):
        if name in self.flags:
            return
        self.flags.add(name)
        if name == "flag.demo.started":
            self.t0 = self.now
            self.save = S.new_save(self.nick, 5, event="demo-event-1")
        self.commit("flag", {"name": name})
        self.queue.append(("flag.set", {"name": name}))

    def do(self, act):
        (k, v), = act.items()
        if k == "say":
            self.say(v)
        elif k == "set":
            self.set_flag(v)
        elif k == "give":
            if v not in self.items:
                self.items.add(v)
                self.commit("item", {"id": v})
        elif k == "card":
            if v not in self.cards:
                self.cards.add(v)
                self.commit("card", {"id": v})
        elif k == "checkpoint":
            self.commit("checkpoint", {"id": v})
        elif k == "find":
            if v not in self.finds:
                self.finds.add(v)
                self.commit("find", {"id": v})
        elif k == "world":
            self.world = v
            w = self.worlds[v]
            self.root, self.home = w["root"], w["home"]
            self.cwd = self.vpath(w["start"]) if w["start"] != "~" else self.home
            self.world_t += 600
            self.T("world", v)
        elif k == "print":
            self.T("print", v)
        elif k == "create_file":
            dest = os.path.join(self.root, v["path"].lstrip("/"))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy(os.path.join(PACK, v["content_ref"]), dest)
            self.T("create_file", v["path"])
        elif k == "branch_enter":
            self.main_snapshot = (self.root, self.home, self.cwd)
            snap = os.path.join(self.tmp, "branch_" + v["name"].replace("/", "_"))
            shutil.copytree(self.root, snap, symlinks=True)
            self.cwd = os.path.join(snap, os.path.relpath(self.cwd, self.root))
            self.home = os.path.join(snap, os.path.relpath(self.home, self.root))
            self.root = snap
            self.branch = v["name"]
            self.branch_cmds = 0
            self.commit("branch.enter", {"name": v["name"], "from": v["from"]})
        elif k == "branch_exit":
            if v["mode"] == "merge":
                self.commit("merge", {"mode": "knowledge", "card": v["card"]})
            self.commit("branch.exit", {"mode": v["mode"]})
            shutil.rmtree(self.root, ignore_errors=True)
            self.root, self.home, self.cwd = self.main_snapshot
            self.branch = "main"
            self.say("init.branch_welcome_back")
        elif k == "end":
            self.commit("end", {"time_up": "flag.demo.time_up" in self.flags})
            self.ended = True
            self.mode = None
            self.T("end")
        else:
            raise RuntimeError("未知動作 " + k)

    def node(self, ref):
        npc, name = ref.split(".", 1)
        n = self.nodes.get((npc, name))
        if n is None:
            raise RuntimeError("找不到對話節點 " + ref)
        return npc, name, n

    def say(self, ref, vars=None):
        npc, name, n = self.node(ref)
        key = (npc if npc != "harbor" else "harbor-master", name)
        self.T("say", ref)
        if n.get("expect_input"):
            self.mode = ("input", ref, n)
            self.tries = 0
        for s in n.get("sets", []):
            self.set_flag(s)
        if n.get("checkpoint"):
            self.commit("checkpoint", {"id": n["checkpoint"]})
        for g in n.get("gives", []):
            self.do({"give": g})
        for tr in n.get("triggers", []):
            if tr.startswith("ckpt/"):
                self.commit("checkpoint", {"id": tr})
            elif (npc, tr) in self.nodes:
                self.say(npc + "." + tr)
        if n.get("choices"):
            self.mode = ("choice", ref, n)
        nxt = n.get("goto") or (None if n.get("choices") else n.get("then")) or n.get("next")
        if nxt and name == "intro" and npc.startswith("harbor"):
            nxt = None      # 試玩版：topics_menu 視為 null
        if nxt and not n.get("expect_input"):
            if nxt not in [x[1] for x in self.nodes if x[0] == npc]:
                raise RuntimeError("%s 的 next=%s 不存在" % (ref, nxt))
            if (npc, nxt) not in self.said or True:
                self.say(npc + "." + nxt)

    # ------------------------------------------------------------------ 事件與規則
    def drain(self):
        guard = 0
        while self.queue:
            guard += 1
            assert guard < 500, "事件迴圈"
            ev, pl = self.queue.pop(0)
            self.fire(ev, pl)
        self.run_state_rules()
        if self.queue:
            self.drain()

    def match(self, rule, ev, pl):
        if rule["event"] != ev:
            return False
        m = rule.get("match", {})
        if ev == "flag.set" and m.get("name") != pl["name"]:
            return False
        if ev == "timer" and m.get("t") != pl["t"]:
            return False
        if ev == "file.read":
            if m.get("path") != pl["path"]:
                return False
        if ev == "cmd":
            if "regex" in m and not re.search(m["regex"], pl["raw"]):
                return False
            if "output_contains" in m and m["output_contains"] not in pl["output"]:
                return False
            if "rc" in m and pl["rc"] != m["rc"]:
                return False
            if "ln_source" in m:
                if not self.ln_matches(pl["raw"], m["ln_source"]):
                    return False
        if rule.get("when") and not self.ev(rule["when"]):
            return False
        return True

    def ln_matches(self, raw, src):
        toks = raw.split()
        if not toks or toks[0] != "ln":
            return False
        ops = [t for t in toks[1:] if not t.startswith("-")]
        if len(ops) < 2:
            return False
        real = self.vpath(ops[0]) if ops[0].startswith(("~", "/")) else os.path.join(self.cwd, ops[0])
        return os.path.normpath(real) == os.path.normpath(self.vpath(src))

    def fire(self, ev, pl):
        stop = False
        for rule in self.flow["rules"]:
            if rule["event"] == "state":
                continue
            if stop and ev == "cmd":
                break
            if not self.match(rule, ev, pl):
                continue
            if rule.get("once"):
                if rule["id"] in self.once:
                    continue
                self.once.add(rule["id"])
            self.T("rule", rule["id"])
            for act in rule.get("do", []):
                self.do_with_vars(act, pl)
            if rule.get("stop"):
                stop = True

    def do_with_vars(self, act, pl):
        (k, v), = act.items()
        if k == "print" and isinstance(v, str):
            v = v.replace("{n}", str(self.branch_commits())).replace("{name}", (re.search(r"^git\s+tag\s+(\S+)", pl.get("raw", "")) or [None, ""])[1] if "raw" in pl else "")
            act = {"print": v}
        self.do(act)

    def branch_commits(self):
        n = 0
        for c in self.save["commits"]:
            if c["branch"] == self.branch and c["kind"] != "branch.enter":
                n += 1
        return n

    def run_state_rules(self):
        changed = True
        while changed:
            changed = False
            for rule in self.flow["rules"]:
                if rule["event"] != "state":
                    continue
                if rule["id"] in self.once:
                    continue
                if self.ev(rule["when"]):
                    if rule.get("once"):
                        self.once.add(rule["id"])
                    self.T("rule", rule["id"])
                    for act in rule.get("do", []):
                        self.do(act)
                    changed = True
                    while self.queue:
                        ev, pl = self.queue.pop(0)
                        self.fire(ev, pl)
        self.update_quest()

    # ------------------------------------------------------------------ 快題
    def quest_seq(self):
        if "flag.ch0_done" in self.flags and "flag.met_harbor" in self.flags:
            return self.flow["quests"]["after"]["order"], "ch1"
        return self.flow["quests"]["order"], "ch0"

    def update_quest(self):
        while True:
            seq, grp = self.quest_seq()
            if self.active:
                return
            idx = self.quest_idx[grp]
            if idx >= len(seq):
                return
            qid = seq[idx]
            self.active = qid
            self.T("quest.active", qid)
            # 歷史補登
            for h in self.history[-20:]:
                if self.quest_check(self.quests[qid], h):
                    self.finish_quest(qid, credited=True)
                    break
            else:
                return

    def quest_check(self, q, h):
        return V.eval_check(q["check"], h["raw"], h["output"], self.man)

    def finish_quest(self, qid, skipped=False, credited=False):
        q = self.quests[qid]
        _, grp = (None, "ch1" if qid.startswith("Q1") else "ch0")
        self.active = None
        self.quest_idx[grp] += 1
        od = q.get("on_done", {})
        if skipped:
            self.skipped.append(qid)
            self.commit("skip", {"id": qid})
            self.say("init.demo_skipped")
        else:
            self.done.append(qid)
            self.commit("task", {"id": qid})
            if od.get("say"):
                self.say(od["say"])
        for s in od.get("sets", []):
            self.set_flag(s)
        for g in od.get("gives", []):
            self.do({"give": g})
        if od.get("checkpoint"):
            self.commit("checkpoint", {"id": od["checkpoint"]})
        self.drain()

    # ------------------------------------------------------------------ 階梯
    def current_ladder(self):
        for g in self.flow["guidance"]:
            if self.ev(g["when"]):
                return g
        return None

    def show_rung(self, via):
        g = self.current_ladder()
        if g is None:
            return
        gid = g["id"]
        if g["ladder"] == "quest_ladder":
            q = self.quests[self.active]
            gid = "q." + self.active
            n = min(self.ladders.get(gid, 0) + 1, 3)
            hints = q.get("hints", [])
            ref = q.get("reference", {}).get("cmd", "")
            r1 = hints[0] if hints else ""
            r2 = hints[1] if len(hints) > 1 else "指令的第一個字是 %s。" % ref.split()[0]
            vars_ = {"{quest_hint_1}": r1, "{quest_hint_2}": r2, "{quest_reference_cmd}": ref}
            node = "init.demo_idle_%d" % n
            self.ladders[gid] = n
            self.T("ladder", gid, n, via)
            self.say(node)
            full = n == 3
        else:
            nodes = g["ladder"]
            if g["id"] == "g.none" and via == "idle":
                return
            n = min(self.ladders.get(gid, 0) + 1, 3)
            node = nodes[min(n, len(nodes)) - 1]
            self.ladders[gid] = n
            self.T("ladder", gid, n, via)
            self.say(node)
            full = "flag.demo.used_full_hint" in (self.nodes[("init", node.split(".", 1)[1])].get("sets") or [])
        self.commit("hint", {"n": n, "full": bool(full)})
        self.drain()

    # ------------------------------------------------------------------ 時間
    def advance(self, dt):
        end = self.now + dt
        # 以 1 秒為單位前進，依序觸發 timer 與 idle
        while self.now + 1e-9 < end:
            self.now = min(self.now + 1, end) if end - self.now >= 1 else end
            self.tick()
        self.now = end

    def tick(self):
        if self.ended:
            return
        if self.t0 is not None:
            t = int(round(self.now - self.t0))
            if t in (840, 900, 960) and (t, ) not in self.timers_fired and abs((self.now - self.t0) - t) < 1e-6:
                self.timers_fired.add((t,))
                self.queue.append(("timer", {"t": t}))
                self.drain()
            idle = int(round(self.now - self.last_input))
            if self.mode is None and idle in (30, 60, 90) and idle not in self.idle_fired and abs((self.now - self.last_input) - idle) < 1e-6:
                self.idle_fired.add(idle)
                self.queue.append(("idle", {"seconds": idle}))
                self.show_rung("idle")

    # ------------------------------------------------------------------ 指令
    def segments(self, raw):
        return [s.strip() for s in re.split(r"\|\||&&|;|\|", raw) if s.strip()]

    def feed(self, raw, dt=20):
        """送出一行輸入。dt：距離上一個輸入的秒數。"""
        if self.ended:
            self.advance(dt)
            self.last_input = self.now
            return
        self.advance(dt)
        raw = raw.strip()
        if not raw:
            if self.mode and self.mode[0] == "input" and "secret" in self.mode[2]["expect_input"]:
                self.mode = None
            return
        self.last_input = self.now
        self.idle_fired = set()
        self.T("input", raw)
        # --- INPUT / CHOICE 模式
        if self.mode and self.mode[0] == "input":
            _, ref, n = self.mode
            ei = n["expect_input"]
            if "pattern" in ei:
                ok = re.fullmatch(ei["pattern"], raw) is not None
            else:
                ok = raw.replace(" ", "").lower() == ei["secret"].lower()
                if not ok and raw.split()[0] in (self.whitelist | {"hint", "skip", "save", "help"}):
                    self.mode = None          # 口令階段：看起來是指令 → 結束 INPUT 模式，當一般指令執行（不計 tries）
                    self.T("input.escape", raw)
                    return self.feed_command(raw)
            npc = ref.split(".")[0]
            if ok:
                self.mode = None
                if ei.get("store") == "player.nick":
                    self.nick = raw
                self.say(npc + "." + ei["on_right"])
            else:
                self.tries += 1
                self.say(npc + "." + ei["on_wrong"])
            self.drain()
            return
        if self.mode and self.mode[0] == "choice":
            _, ref, n = self.mode
            if raw == "hint":
                self.show_rung("hint")
                return
            for c in n["choices"]:
                if raw == c["input"]:
                    self.mode = None
                    self.commit("choice", {"id": "vote", "value": c["input"]})
                    for s in c.get("sets", []):
                        self.set_flag(s)
                    self.say("init." + c["say"])
                    if n.get("then"):
                        self.say("init." + n["then"])
                    self.drain()
                    return
            self.say("init.demo_g_vote_1")
            return
        return self.feed_command(raw)

    def feed_command(self, raw):
        self.world_t += 30
        out, rc = self.execute(raw)
        h = {"raw": raw, "output": out, "rc": rc, "cwd": self.to_virtual(self.cwd)}
        self.history.append(h)
        for p in self.file_reads(raw, out):
            self.queue.append(("file.read", {"path": p, "branch": self.branch}))
        self.queue.append(("cmd", {"raw": raw, "argv0": raw.split()[0], "cwd": h["cwd"], "branch": self.branch, "rc": rc, "output": out}))
        self.drain()
        # 評估目前快題
        if self.active and not (self.active in self.done):
            if self.quest_check(self.quests[self.active], h):
                self.finish_quest(self.active)
        self.drain()

    def execute(self, raw):
        toks = raw.split()
        c0 = toks[0]
        # 內建
        if c0 == "hint":
            self.show_rung("hint")
            return "", 0
        if c0 == "skip":
            if not self.active:
                self.say("init.demo_skip_nothing")
            elif self.skip_pending is not None and self.now - self.skip_pending <= 10:
                self.skip_pending = None
                self.finish_quest(self.active, skipped=True)
            else:
                self.skip_pending = self.now
                self.say("init.demo_skip_confirm")
            return "", 0
        if c0 in ("save",):
            return "", 0
        if c0 == "help":
            self.say("init.demo_help")
            return "", 0
        if c0 in ("block", "pass"):
            return "bash: %s: command not found" % c0, 127
        if c0 == "mail":
            out = open(self.vpath("/var/mail/op"), encoding="utf-8").read()
            self.queue.append(("file.read", {"path": "/var/mail/op", "branch": self.branch}))
            return out, 0
        if c0 == "systemctl":
            return ("active (running)" if "flag.lamp_lit" in self.flags else "inactive (dead)") if toks[1:2] == ["status"] else "", 0
        if c0 in ("git", "ssh", "ask", "finger", "man", "close", "sudo"):
            return "", 0
        # 白名單與打錯字
        for seg in self.segments(raw):
            t0 = seg.split()[0]
            if t0 not in self.whitelist:
                self.typo(t0)
                return "bash: %s: command not found" % t0, 127
        # main 上被攔下的 rm
        if c0 == "rm" and self.branch == "main" and re.search(self.rule_regex("r.rm_main"), raw):
            return "", 1
        # ln 寬鬆：目的以 / 結尾且不存在 → 建立
        if c0 == "ln" and toks[-1].endswith("/"):
            d = toks[-1]
            dv = self.vpath(d) if d.startswith(("~", "/")) else os.path.join(self.cwd, d)
            if not os.path.exists(dv) and os.path.isdir(os.path.dirname(dv.rstrip("/"))):
                os.makedirs(dv)
        return self.run_bash(raw)

    def rule_regex(self, rid):
        return next(r for r in self.flow["rules"] if r["id"] == rid)["match"]["regex"]

    def typo(self, t0):
        table = self.flow["command_pipeline"]["typos"]["table"]
        sug = table.get(t0)
        if not sug and len(t0) >= 2:
            c = [w for w in self.whitelist if dl1(t0, w) == 1]
            sug = c[0] if len(c) == 1 else None
        if sug:
            self.say("init.demo_typo")
            self.T("typo", t0, sug)

    def run_bash(self, raw):
        env = dict(os.environ, HOME=self.home, LC_ALL="C")
        script = raw + '\n__rc=$?\nprintf "\\n__CWD__%s\\n__RC__%s" "$PWD" "$__rc"'
        p = subprocess.run(["bash", "-c", script], cwd=self.cwd, env=env, capture_output=True, text=True, timeout=30)
        out = p.stdout
        m = re.search(r"\n__CWD__(.*)\n__RC__(\d+)$", out, re.S)
        rc = 0
        if m:
            out = out[:m.start()]
            new = m.group(1)
            rc = int(m.group(2))
            if os.path.isdir(new) and os.path.realpath(new).startswith(os.path.realpath(self.root)):
                self.cwd = new
        if self.branch != "main" and not os.path.isdir(self.home):
            os.makedirs(self.home)        # rm -rf ~ 之後家目錄仍保留
            if not os.path.isdir(self.cwd):
                self.cwd = self.home
        out = out.replace(os.path.realpath(self.root), "").replace(self.root, "")
        return out, rc

    def file_reads(self, raw, out):
        res = []
        for seg in self.segments(raw):
            toks = seg.split()
            c = toks[0]
            if c not in READERS:
                continue
            opts, ops, skip = [], [], False
            ov = OPT_WITH_VALUE.get(c, set())
            pat_taken = c != "grep"
            for i, t in enumerate(toks[1:]):
                if skip:
                    skip = False
                    continue
                if t.startswith("-") and len(t) > 1:
                    opts.append(t)
                    if t in ov:
                        skip = True
                    continue
                if not pat_taken:
                    pat_taken = True
                    continue
                ops.append(t.strip("'\""))
            recursive = any(o.startswith("-") and not o.startswith("--") and ("r" in o or "R" in o) for o in opts) and c == "grep"
            for op in ops:
                real = self.vpath(op) if op.startswith(("~", "/")) else os.path.join(self.cwd, op)
                if os.path.isfile(real):
                    res.append(self.to_virtual(real))
                elif os.path.isdir(real) and recursive:
                    for line in out.split("\n"):
                        if ":" in line:
                            pth = line.split(":", 1)[0]
                            rr = pth if pth.startswith("/") else os.path.join(self.cwd, pth)
                            if pth.startswith("/") and not os.path.exists(rr):
                                rr = os.path.join(self.root, pth.lstrip("/"))
                            if os.path.isfile(rr):
                                res.append(self.to_virtual(rr))
        out_l, seen = [], set()
        for p in res:
            if p not in seen:
                seen.add(p)
                out_l.append(p)
        return out_l

    def close(self):
        shutil.rmtree(self.tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
WALKTHROUGHS = {
    "digger": [
        ("zien", 6), ("mail", 12), ("cat .bash_history", 8), ("ls", 10), ("cat handbook.md", 14), ("ls -a notes", 25),
        ("grep lamp logs/lamp.log", 28), ("cat notes/.draft.txt", 12), ("grep -r KEY-FRAG ~", 20),
        ("cat shelf/cat.txt", 9), ("cat shelf/jar.txt", 7), ("cat incidents/TICKET-0001.md", 10), ("sudo ls", 8), ("sudo make me a sandwich", 9),
        ("ln notes/01-first-night.txt keep/", 15),
        ("systemctl start lamp", 12), ("wrong-pass", 6), ("lamp-before-sudo", 8),
        ("systemctl start lamp", 5), ("cat shelf/cat.txt", 7), ("rm -rf ~", 8),
        ("git checkout -b alt/sandbox", 12), ("rm -rf ~", 9), ("ls /lost+found", 6), ("cat /lost+found/#0", 8), ("git merge --knowledge", 12),
        ("ssh logport", 10), ("cat error.log", 14), ("finger harbor-master", 8), ("ask harbor-master cat", 9),
        ("grep -c ' 404 ' access.log", 28), ("grep '02:00:00' access.log", 20), ("block", 12),
    ],
    "newbie": [      # 完全新手：打錯字、用 hint、用 idle 提示、skip 一題
        ("zien", 15), ("sl", 5), ("ls", 40), ("cat handbook.md", 61), ("hint", 5), ("hint", 5), ("ls", 8), ("ls -a notes", 45),
        ("skip", 70), ("skip", 3), ("grep -r KEY-FRAG ~", 35), ("systemctl start lamp", 30), ("lamp-before-sudo", 10),
        ("git checkout -b alt/sandbox", 95), ("rm -rf ~/notes", 100), ("cat /lost+found/#0", 31), ("git merge --knowledge", 62),
        ("ssh logport", 91), ("hint", 5), ("grep -c ' 404 ' access.log", 120), ("grep '02:00:00' access.log", 40), ("nonsense", 20), ("pass", 15),
    ],
    "edge": [        # 邊角：每一條「防呆」規則都走一遍
        ("bad nick!", 2), ("zien", 5), ("save", 2), ("ask lin", 5), ("man ticket-0001", 5), ("close TICKET-0001", 5), ("systemctl status lamp", 5), ("block", 5),
        ("git merge --knowledge", 5), ("git status", 5), ("git checkout -b x", 5), ("ssh logport", 5), ("catt handbook.md", 5), ("xyzzy", 5),
        ("ls", 5), ("cat handbook.md", 5), ("ls -a notes", 5), ("grep lamp logs/lamp.log", 5), ("grep -r KEY-FRAG ~", 5),
        ("skip", 2), ("hint", 2), ("hint", 2), ("hint", 2), ("help", 2), ("cat notes/01-first-night.txt", 2),
        ("systemctl start lamp", 5), ("", 3), ("systemctl start lamp", 5), ("cat handbook.md", 5), ("systemctl start lamp", 5), ("lamp-before-sudo", 5),
        ("systemctl start lamp", 5), ("systemctl status lamp", 5), ("git checkout -b foo", 5), ("git checkout -b alt/sandbox", 5),
        ("ssh logport", 5), ("git merge --knowledge", 5), ("git tag mark1", 5), ("rm notes/01-first-night.txt", 5), ("rm -rf ~/notes", 5), ("hint", 2), ("hint", 2), ("hint", 2),
        ("cat /lost+found/#0", 5), ("hint", 2), ("hint", 2), ("hint", 2), ("git abandon", 5), ("ask harbor-master tea", 5), ("ssh logport", 5), ("ask harbor-master tea", 5), ("finger harbor-master", 5),
        ("grep -c 404 access.log", 5), ("grep -c ' 404 ' access.log", 5), ("grep '02:00:00' access.log", 5), ("hint", 5), ("maybe", 5), ("pass", 5),
    ],
    "timeup": [      # 慢：到 15:00 還在 Ch1，時間到
        ("zien", 10), ("ls", 60), ("cat handbook.md", 70), ("ls -a notes", 80), ("grep lamp logs/lamp.log", 80), ("grep -r KEY-FRAG ~", 80),
        ("systemctl start lamp", 60), ("lamp-before-sudo", 15), ("git checkout -b alt/sandbox", 60), ("rm -rf ~/notes", 60), ("cat /lost+found/#0", 40),
        ("git abandon", 30), ("ssh logport", 60), ("grep -c ' 404 ' access.log", 60), ("hint", 100), ("hint", 5), ("hint", 5),
        ("wait", 120), ("block", 5),
    ],
}


def run_walk(name, steps=None, keep=False):
    sim = Sim()
    try:
        steps = steps or WALKTHROUGHS[name]
        first = True
        for raw, dt in steps:
            if raw == "wait":
                sim.advance(dt)
                continue
            sim.feed_first = first
            if first:
                sim.queue.append(("session.start", {}))
                sim.drain()
                first = False
            sim.feed(raw, dt)
        if not first:
            sim.advance(0)
        return sim
    except Exception:
        sim.close()
        raise


def summarize(sim):
    sv = sim.save
    S.seal(sv)
    st = S.fold(sv)
    lv, why = S.level(sv)
    sc = S.score(sv)
    return {
        "nick": sv["nick"], "n_commits": len(sv["commits"]), "head": sv["commits"][-1]["id"], "level": lv, "reasons": why,
        "tasks": st["tasks"], "skipped": st["skipped"], "finds": st["finds"], "items": st["items"], "cards": st["cards"],
        "vote": st["vote"], "seconds": st["seconds"], "ended": st["ended"], "time_up": "flag.demo.time_up" in st["flags"],
        "score": sc["score"], "title_id": sc["title_id"], "flags": sorted(st["flags"]),
        "fullgame_checkpoints": S.to_fullgame(sv)["checkpoints"],
    }


def build_vectors():
    out = {"note": "由 demo/tools/flow_sim.py make 產生，請勿手改。前端 headless 模式用同樣的步驟（dt 為虛擬秒）必須得到同樣的 commit 序列。",
           "schema": 1, "walkthroughs": []}
    for name in WALKTHROUGHS:
        sim = run_walk(name)
        try:
            steps = [{"in": r, "dt": d} for r, d in WALKTHROUGHS[name]]
            sv = sim.save
            S.seal(sv)
            commits = [[c["kind"], c["data"], c["branch"], c["chapter"], c["t"], c["r"], c["id"]] for c in sv["commits"]]
            says = [t[1] for t in sim.trace if t[0] == "say"]
            out["walkthroughs"].append({"name": name, "steps": steps, "says": says, "commits": commits,
                                        "code": S.export_code(sv), "summary": summarize(sim)})
        finally:
            sim.close()
    # 運算式
    env = {"flags": ["flag.a", "flag.b0.done"], "vars": {"in_branch": True, "tries": 2, "quest_active": "Q0-1", "branch": "alt/sandbox"},
           "done": ["Q0-5"], "empty": ["~/notes"], "exists": ["~/notes"]}
    exprs = ["flag.a and not flag.c", "flag.b0.done or flag.zzz", "tries == 2", "tries >= 3", "tries < 3", "quest_active != ''",
             "quest_active == 'Q0-1'", "not (flag.a and flag.c)", "done('Q0-5') and empty('~/notes')", "done('Q0-1')", "exists('~/notes')",
             "in_branch and (empty('~/notes') or empty('~'))", "true", "false", "1 == 'a'", "1 != 'a'", "tries", "nothing", "not not flag.a",
             "branch == 'alt/sandbox'", "flag.a and flag.b0.done and in_branch and tries == 2", "not flag.a or flag.b0.done and not in_branch",
             "(flag.a or flag.c) and (flag.b0.done or flag.d)", "tries <= 2 and tries >= 2", "quest_active == \"Q0-1\""]
    e = {"flags": set(env["flags"]), "vars": env["vars"],
         "funcs": {"done": lambda q: q in env["done"], "empty": lambda p: p in env["empty"], "exists": lambda p: p in env["exists"]}}
    out["expr"] = {"env": env, "cases": [{"expr": x, "expect": FX.evaluate(x, e)} for x in exprs],
                   "errors": ["flag.a and", "(flag.a", "foo(1)", "flag.a flag.b", "1 +", "'unterminated"]}
    for x in out["expr"]["errors"]:
        try:
            FX.evaluate(x, e)
            raise SystemExit("應該要出錯：" + x)
        except FX.ExprError:
            pass
    return out


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "run"
    if cmd == "run":
        names = sys.argv[2:] or list(WALKTHROUGHS)
        for n in names:
            sim = run_walk(n)
            try:
                s = summarize(sim)
                print("== %s：%s" % (n, json.dumps(s, ensure_ascii=False)[:600]))
                print("   對話：%s" % " > ".join(t[1] for t in sim.trace if t[0] == "say"))
            finally:
                sim.close()
        return
    os.makedirs(TV, exist_ok=True)
    path = os.path.join(TV, "walkthrough.json")
    new = build_vectors()
    if cmd == "make":
        json.dump(new, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
        print("寫入", path)
    old = json.load(open(path, encoding="utf-8"))
    same = json.loads(json.dumps(new, sort_keys=True)) == json.loads(json.dumps(old, sort_keys=True))
    print("流程走法測資：%s" % ("與參考模擬器重跑一致" if same else "已過期，請執行 make"))
    sys.exit(0 if same else 1)


if __name__ == "__main__":
    main()
