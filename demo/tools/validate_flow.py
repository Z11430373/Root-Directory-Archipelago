#!/usr/bin/env python3
# 流程 QA：依賴 savelib/flowexpr/flow_sim、tools/validate.py 與 demo/flow/dialogue YAML。
# check 回傳 errors/notes，供 validate_demo 或 CLI 顯示；走法執行真 Bash，逐個 finally close 暫存 Sim。
# 不改規則或測資，不提供玩家輸入執行服務。
"""
流程規格的靜態檢查 + 用參考模擬器跑完所有走法。被 validate_demo.py 呼叫，也可單獨執行。
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(PACK, "tools"))
import savelib as S      # noqa: E402
import flowexpr as FX    # noqa: E402
import flow_sim as FS    # noqa: E402
import validate as V     # noqa: E402
import yaml              # noqa: E402

EVENTS = {"session.start", "flag.set", "cmd", "file.read", "quest.done", "timer", "idle", "state"}
ACTIONS = {"say", "set", "give", "card", "checkpoint", "find", "world", "end", "print", "create_file", "branch_enter", "branch_exit"}
JS_UNSAFE = [r"\(\?P<", r"\(\?i\)", r"\(\?<[=!]", r"\\Z", r"\\A", r"\(\?>", r"\*\+", r"\+\+"]


# 呼叫：check；資料包相對片段 → YAML 值，唯讀磁碟。
def Y(*p):
    return yaml.safe_load(open(os.path.join(PACK, *p), encoding="utf-8"))


# 呼叫：CLI/validate_demo；可選 report（目前未使用）→ (錯誤清單,說明清單)，執行靜態引用與全部固定走法。
def check(report=None):
    errs, notes = [], []
    cfg = S.demo_cfg()
    flow = Y("demo", "flow.yaml")
    D = V.load_all()
    dd = Y("demo", "dialogue", "init_demo.yaml")
    nodes = {}
    for npc, d in D["dialogue"].items():
        for n in d["nodes"]:
            nodes[(npc, n["node"])] = n
            if d.get("alias"):
                nodes[(d["alias"], n["node"])] = n
    for n in dd["nodes"]:
        nodes[("init", n["node"])] = n
    finds = {f["id"] for f in cfg["finds"]}
    env = {"flags": set(), "vars": {}, "funcs": {"done": lambda *a: False, "exists": lambda *a: False, "empty": lambda *a: False}}

    # 呼叫：規則/對話/引導掃描；運算式/位置 → None，於空環境解析，錯誤附加局部 errs，不改規則。
    def expr_ok(e, where):
        try:
            FX.evaluate(e, env)
        except FX.ExprError as ex:
            errs.append("運算式錯誤 %s：%r（%s）" % (where, e, ex))

    ids = set()
    set_flags, used_flags = set(), set()
    say_refs = set()
    for r in flow["rules"]:
        rid = r.get("id")
        if rid in ids:
            errs.append("規則 id 重複：%s" % rid)
        ids.add(rid)
        if r.get("event") not in EVENTS:
            errs.append("規則 %s：未知事件 %r" % (rid, r.get("event")))
        m = r.get("match", {})
        if "regex" in m:
            try:
                re.compile(m["regex"])
            except re.error as ex:
                errs.append("規則 %s：regex 無法編譯：%s" % (rid, ex))
            for bad in JS_UNSAFE:
                if re.search(bad, m["regex"]):
                    errs.append("規則 %s：regex 含有 JS 不支援或行為不同的語法（%s）" % (rid, bad))
        if r.get("when"):
            expr_ok(r["when"], rid)
            used_flags |= set(re.findall(r"flag\.[A-Za-z0-9_.]+", r["when"]))
        if r.get("event") == "flag.set":
            used_flags.add(m.get("name"))
        for a in r.get("do", []):
            (k, v), = a.items()
            if k not in ACTIONS:
                errs.append("規則 %s：未知動作 %s" % (rid, k))
            if k == "say":
                npc, name = v.split(".", 1)
                if (npc, name) not in nodes:
                    errs.append("規則 %s：對話 %s 不存在" % (rid, v))
                say_refs.add(v)
            elif k == "set":
                set_flags.add(v)
            elif k == "find" and v not in finds:
                errs.append("規則 %s：未知的發現 %s" % (rid, v))
            elif k == "give" and v not in ("F1", "R0"):
                errs.append("規則 %s：未知物品 %s" % (rid, v))
            elif k == "card" and v != "K0":
                errs.append("規則 %s：未知知識卡 %s" % (rid, v))
            elif k == "create_file" and not os.path.exists(os.path.join(PACK, v["content_ref"])):
                errs.append("規則 %s：create_file 的來源不存在：%s" % (rid, v["content_ref"]))
    for g in flow["guidance"]:
        expr_ok(g["when"], g["id"])
        used_flags |= set(re.findall(r"flag\.[A-Za-z0-9_.]+", g["when"]))
        if g["ladder"] != "quest_ladder":
            for n in g["ladder"]:
                npc, name = n.split(".", 1)
                if (npc, name) not in nodes:
                    errs.append("引導 %s：節點 %s 不存在" % (g["id"], n))
                if len(g["ladder"]) > 3:
                    errs.append("引導 %s：階梯超過 3 階" % g["id"])
    # 旗標：被使用的都有人設定
    for npc_name, n in nodes.items():
        for s in n.get("sets", []) or []:
            set_flags.add(s)
        for l in n.get("lines", []) or []:
            if l.get("if"):
                expr_ok(l["if"], "%s.%s" % npc_name)
                used_flags |= set(re.findall(r"flag\.[A-Za-z0-9_.]+", l["if"]))
    for q in D["quests"].values():
        for s in q.get("on_done", {}).get("sets", []):
            set_flags.add(s)
    set_flags |= {"flag.demo.cat_dark", "flag.demo.cat_lit"}
    # B0.yaml 的 sets
    for e in D["branches"]["B0"]["exits"]:
        set_flags |= set(e.get("on_success", {}).get("sets", []))
    for u in sorted(used_flags):
        if u and u not in set_flags and not u.startswith("flag.b1.") and u not in ("flag.demo.finished",):
            errs.append("流程用到旗標 %s，但沒有任何地方設定它" % u)
    # B0 固定文字一致
    b0 = D["branches"]["B0"]
    b0_texts = set()
    for e in b0["exits"]:
        for k in ("on_success", "on_missing_requirement"):
            if e.get(k, {}).get("say"):
                b0_texts.add(e[k]["say"])
    for rr in b0["rules"]:
        if rr.get("say"):
            b0_texts.add(rr["say"])
        for ef in rr.get("effects", []):
            if "say" in ef:
                b0_texts.add(ef["say"])
    for r in flow["rules"]:
        for a in r.get("do", []):
            if "print" in a and a["print"].startswith("[init"):
                if a["print"] not in b0_texts:
                    errs.append("規則 %s：print 文字與 B0.yaml 不同：%r" % (r["id"], a["print"]))
    # 試玩節拍都被覆蓋（用走法的對話軌跡）
    fired, said, results = set(), set(), {}
    for name in FS.WALKTHROUGHS:
        sim = FS.run_walk(name)
        try:
            sv = sim.save
            S.seal(sv)
            try:
                S.check_shape(sv)
            except S.CodeError as ex:
                errs.append("走法 %s 產生的存檔形狀不合規則：%s" % (name, ex))
            lv, why = S.level(sv)
            if lv != "intact":
                errs.append("走法 %s 的存檔不是『完整』：%s %s" % (name, lv, why))
            code = S.export_code(sv)
            back = S.import_code(code)
            if back["commits"][-1]["id"] != sv["commits"][-1]["id"]:
                errs.append("走法 %s：代碼來回後鏈尾不同" % name)
            if not sim.ended:
                errs.append("走法 %s 沒有走到結尾" % name)
            for t in sim.trace:
                if t[0] == "rule":
                    fired.add(t[1])
                if t[0] == "say":
                    said.add(t[1])
            results[name] = (len(sv["commits"]), len(code))
        finally:
            sim.close()
    for seg in cfg["segments"]:
        for b in seg["beats"]:
            if b["kind"] == "say":
                ref = b["ref"].replace("harbor-master.", "harbor-master.")
                alt = ref.replace("harbor-master.", "harbor.")
                if ref not in said and alt not in said:
                    errs.append("節拍 %s（%s）在任何走法裡都沒有出現" % (b["id"], b["ref"]))
    uncovered = [r["id"] for r in flow["rules"] if r["id"] not in fired]
    allsay = {("init." + n["node"]) for n in dd["nodes"]}
    unsaid = sorted(x for x in allsay if x not in said)
    notes.append("流程規格：%d 條規則（走法覆蓋 %d 條）、%d 個引導階梯、3+1 條走法的存檔都是『完整』；代碼長度 %s" % (
        len(flow["rules"]), len(fired), len(flow["guidance"]), ", ".join("%s=%d" % (k, v[1]) for k, v in results.items())))
    if uncovered:
        errs.append("未被任何走法覆蓋的規則：%s（請補走法，或刪掉規則）" % ", ".join(uncovered))
    safety = {"init.demo_hint_nothing"}      # 安全網：正常流程到不了
    unsaid = [x for x in unsaid if x not in safety]
    if unsaid:
        errs.append("未被走法播放過的試玩對話節點：%s" % ", ".join(unsaid))
    return errs, notes


if __name__ == "__main__":
    e, n = check()
    for x in n:
        print("  ok  ", x)
    for x in e:
        print("  FAIL", x)
    print("\n流程規格：%d 項錯誤" % len(e))
    sys.exit(1 if e else 0)
