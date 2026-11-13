#!/usr/bin/env python3
# 資料包 QA 子系統入口；依賴 PyYAML、tools/gen_logs.py、各 YAML/text、tickets/ref/tests 與真 Bash。
# demo/tools 的流程/一致性驗證也匯入本檔的載入、materialize、eval_check 等輔助函式。
# 檢查累積於模組 errors/warnings/notes；暫存樹通常在 finally 清理，--keep 明示保留供除錯。
# 真 Bash 與 cond 的求值只供受信任專案規格，並非不可信玩家輸入的安全沙箱。
"""
劇本資料包驗證器（Ch0–Ch1）。只做便宜的自動檢查，不需要引擎。

  python3 tools/validate.py            # 在資料包根目錄執行
  python3 tools/validate.py --keep     # 保留還原出來的虛擬檔案系統（除錯用）

檢查項目
  1. 所有 YAML 語法正確
  2. 引用不斷鏈：章節 → 快題/工單/分支/NPC/檔案；對話 → 節點/文字檔；分支 → 知識卡/檢查點；場景 → 以上全部
  3. 旗標：每個被條件使用的 flag 至少有一個地方會設定它
  4. 劇透護欄：Ch0–1 的文字不得出現後面章節才能揭露的字眼
  5. 快題：在還原的虛擬檔案系統上，用真的 bash 執行 reference，結果必須通過該題的 check；
          negative_references 必須「不通過」；examples.pass/fail 的 regex 要吻合
  6. 工單：參考解答通過全部測資；已知的錯誤解答在指定測資上 WA；另跑一組大測資確認時間
  7. 碎片：KEY-FRAG 標記在正確的檔案裡；損毀版找不到、復原版找得到
  8. 憲章：現行版 1–9 條齊全；handbook 摘要的條號都存在
"""
import argparse
import glob
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
errors, warnings, notes = [], [], []


# 呼叫：所有檢查器；訊息 → None，附加全域 errors，供 report/退出碼使用，不立即中斷。
def err(m):
    errors.append(m)


# 呼叫：可接受偏差/效能檢查；訊息 → None，附加 warnings，不令 CLI 自動失敗。
def warn(m):
    warnings.append(m)


# 呼叫：檢查器；說明 → None，附加 notes，僅為檢查資訊而非逐項證明所有玩法。
def ok(m):
    notes.append(m)


# 呼叫：本模組與驗證流程；路徑片段 → ROOT 下路徑，無 I/O，不提供不可信路徑的逃逸防護。
def P(*a):
    return os.path.join(ROOT, *a)


# 呼叫：load_all；檔名 → YAML 值或 None，with 關閉檔案，失敗寫 errors 不直接拋出。
def load(path):
    try:
        with open(path, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except Exception as e:  # noqa
        err("YAML 語法錯誤 %s: %s" % (os.path.relpath(path, ROOT), e))
        return None


# --------------------------------------------------------------------------- 載入
# 呼叫：main/demo 工具；無參數 → 分類 ID 索引，讀全部來源 YAML，新增 _chapter/_dir 僅在記憶體。
def load_all():
    D = {"world": load(P("world", "world.yaml")), "charter": load(P("world", "charter.yaml")),
         "cast": load(P("world", "cast.yaml")), "fragments": load(P("world", "fragments.yaml")),
         "chapters": {}, "dialogue": {}, "quests": {}, "tickets": {}, "cards": {}, "branches": {}}
    for f in sorted(glob.glob(P("chapters", "*.yaml"))):
        d = load(f)
        if d:
            D["chapters"][d["id"]] = d
    for f in sorted(glob.glob(P("dialogue", "*.yaml"))):
        d = load(f)
        if d:
            D["dialogue"][d["npc"]] = d
    for f in sorted(glob.glob(P("quests", "*.yaml"))):
        d = load(f)
        if d:
            for q in d["quests"]:
                q["_chapter"] = d["chapter"]
                D["quests"][q["id"]] = q
    for f in sorted(glob.glob(P("tickets", "*", "ticket.yaml"))):
        d = load(f)
        if d:
            d["_dir"] = os.path.dirname(f)
            D["tickets"][d["id"]] = d
    for f in sorted(glob.glob(P("cards", "*.yaml"))):
        d = load(f)
        if d:
            D["cards"][d["id"]] = d
    for f in sorted(glob.glob(P("branches", "*.yaml"))):
        d = load(f)
        if d:
            D["branches"][d["id"]] = d
    return D


# 呼叫：strings/遞迴；巢狀物件 → (鍵或 None, 值) iterator，唯讀遍歷，不修改來源。
def walk(o):
    """走訪所有巢狀值"""
    if isinstance(o, dict):
        for k, v in o.items():
            yield k, v
            yield from walk(v)
    elif isinstance(o, list):
        for v in o:
            yield None, v
            yield from walk(v)


# 呼叫：資料掃描工具；巢狀值 → 所有字串值 iterator，依 walk 順序，無副作用。
def strings(o):
    for _, v in walk(o):
        if isinstance(v, str):
            yield v


# --------------------------------------------------------------------------- 引用檢查
# 呼叫：check_refs；資料索引 → 已宣告/保留 NPC 的 set，唯讀。
def npc_ids(D):
    ids = set(D["cast"]["npcs"].keys()) | set(D["cast"].get("reserved", []))
    return ids


# 呼叫：check_refs/demo 驗證；資料索引 → (NPC,節點名) 對照表，包含 alias，節點本體保持唯讀參照。
def dialogue_index(D):
    idx = {}
    for npc, d in D["dialogue"].items():
        for n in d["nodes"]:
            idx[(npc, n["node"])] = n
        if d.get("alias"):
            for n in d["nodes"]:
                idx[(d["alias"], n["node"])] = n
    return idx


# 呼叫：main；資料索引 → None，檢查跨檔 ID/引用存在與一致，問題/摘要累積全域清單；不寫來源。
def check_refs(D):
    DI = dialogue_index(D)
    npcs = npc_ids(D)

    # 呼叫：本檢查器；npc.node/診斷位置 → None，格式或索引缺少就記 errors，無來源修改。
    def has_node(ref, where):
        if "." not in ref:
            err("%s: 對話引用格式應為 npc.node：%s" % (where, ref))
            return
        npc, node = ref.split(".", 1)
        if (npc, node) not in DI:
            err("%s: 找不到對話節點 %s" % (where, ref))

    declared_ckpt = set()
    for cid, ch in D["chapters"].items():
        for c in ch.get("checkpoints", []):
            declared_ckpt.add(c["id"])
    for cid, ch in D["chapters"].items():
        w = "chapter %s" % cid
        for u in ch.get("unlock", []):
            pass  # 旗標另行檢查
        for q in ch.get("quick_tasks", []):
            if q not in D["quests"]:
                err("%s: 快題 %s 不存在" % (w, q))
        for t in ch.get("tickets", []):
            if t not in D["tickets"]:
                err("%s: 工單 %s 不存在" % (w, t))
        for n in ch.get("npcs", []):
            if n not in npcs:
                err("%s: NPC %s 不在 cast" % (w, n))
        for b in ch.get("branch_points", []):
            if b["id"] not in D["branches"]:
                err("%s: 分支 %s 不存在" % (w, b["id"]))
            else:
                br = D["branches"][b["id"]]
                if br["card"] != b["card"]:
                    err("%s: 分支 %s 的知識卡與章節宣告不一致" % (w, b["id"]))
                if b["from"] not in declared_ckpt:
                    err("%s: 檢查點 %s 沒有宣告" % (w, b["from"]))
        for fr in ch.get("fragments", []):
            if fr not in [f["id"] for f in D["fragments"]["fragments"]]:
                err("%s: 碎片 %s 不存在" % (w, fr))
        paths = set()
        for f in ch.get("files", []):
            paths.add(f["path"])
            if "content_ref" in f and not os.path.exists(P(f["content_ref"])):
                err("%s: content_ref 不存在 %s" % (w, f["content_ref"]))
            for v in f.get("variants", []):
                if "content_ref" in v and not os.path.exists(P(v["content_ref"])):
                    err("%s: variant content_ref 不存在 %s" % (w, v["content_ref"]))
            if "dialogue" in f:
                has_node(f["dialogue"], "%s 檔案 %s" % (w, f["path"]))
        for r in ch.get("relics", []):
            if r["path"] not in paths:
                err("%s: 遺物路徑不在檔案清單 %s" % (w, r["path"]))
        for s in ch.get("scenes", []):
            for b in s["beats"]:
                ww = "%s %s" % (w, s["id"])
                if "say" in b:
                    has_node(b["say"], ww)
                if "task" in b and b["task"] not in D["quests"]:
                    err("%s: 快題 %s 不存在" % (ww, b["task"]))
                if "ticket" in b and b["ticket"] not in D["tickets"]:
                    err("%s: 工單 %s 不存在" % (ww, b["ticket"]))
                if "branch" in b and b["branch"] not in D["branches"]:
                    err("%s: 分支 %s 不存在" % (ww, b["branch"]))
                if "card" in b and b["card"] not in D["cards"]:
                    err("%s: 知識卡 %s 不存在" % (ww, b["card"]))
                if "file" in b and b["file"] not in paths:
                    err("%s: 場景檔案 %s 不在檔案清單" % (ww, b["file"]))
    # 對話
    for npc, d in D["dialogue"].items():
        if npc not in npcs:
            err("dialogue %s: NPC 不在 cast" % npc)
        names = {n["node"] for n in d["nodes"]}
        for n in d["nodes"]:
            w = "dialogue %s.%s" % (npc, n["node"])
            blocks = list(n.get("lines", []))
            for v in n.get("variants", []):
                blocks += v.get("lines", [])
                if "goto" in v and v["goto"] not in names:
                    err("%s: goto %s 不存在" % (w, v["goto"]))
            for l in blocks:
                if "text_ref" in l and not os.path.exists(P(l["text_ref"])):
                    err("%s: text_ref 不存在 %s" % (w, l["text_ref"]))
            nxt = n.get("next")
            if nxt and nxt not in names:
                err("%s: next %s 不存在" % (w, nxt))
            for k in ("on_wrong", "on_right"):
                if k in n.get("expect_input", {}) and n["expect_input"][k] not in names:
                    err("%s: expect_input.%s 不存在" % (w, k))
            for t in n.get("triggers", []):
                if t.startswith("ckpt/") and t not in declared_ckpt:
                    err("%s: 檢查點 %s 沒有宣告" % (w, t))
    # 快題
    for qid, q in D["quests"].items():
        od = q.get("on_done", {}).get("say")
        if od:
            npc, node = od.split(".", 1)
            if (npc, node) not in DI:
                err("quest %s: on_done.say %s 不存在" % (qid, od))
        ck = q.get("on_done", {}).get("checkpoint")
        if ck and ck not in declared_ckpt:
            err("quest %s: 檢查點 %s 沒有宣告" % (qid, ck))
        for g in q.get("on_done", {}).get("gives", []):
            if g not in [f["id"] for f in D["fragments"]["fragments"]]:
                err("quest %s: 給出的碎片 %s 不存在" % (qid, g))
    # 工單
    for tid, t in D["tickets"].items():
        for k in ("story_ref",):
            if not os.path.exists(P(t[k])):
                err("ticket %s: %s 不存在" % (tid, t[k]))
        for k in ("ref_solution", "tests_dir"):
            if not os.path.exists(P(t["judge"]["local"][k])):
                err("ticket %s: %s 不存在" % (tid, t["judge"]["local"][k]))
        od = t.get("on_ac", {}).get("dialogue")
        if od:
            npc, node = od.split(".", 1)
            if (npc, node) not in DI:
                err("ticket %s: on_ac.dialogue %s 不存在" % (tid, od))
    # 知識卡與分支
    for cid, c in D["cards"].items():
        if c["source_branch"] not in D["branches"]:
            err("card %s: 來源分支不存在" % cid)
    for bid, b in D["branches"].items():
        if b["card"] not in D["cards"]:
            err("branch %s: 知識卡不存在" % bid)
        if b["from"] not in declared_ckpt:
            err("branch %s: 檢查點 %s 沒有宣告" % (bid, b["from"]))
        th = None
        for e in b.get("exits", []):
            th = e.get("on_success", {}).get("then", {}).get("dialogue")
            if th:
                npc, node = th.split(".", 1)
                if (npc, node) not in DI:
                    err("branch %s: then.dialogue %s 不存在" % (bid, th))
        for r in b.get("rules", []):
            for e in r.get("effects", []):
                if isinstance(e, dict) and "create_file" in e:
                    cr = e["create_file"].get("content_ref")
                    if cr and not os.path.exists(P(cr)):
                        err("branch %s: create_file content_ref 不存在 %s" % (bid, cr))
    ok("引用檢查完成：%d 章、%d 對話檔、%d 快題、%d 工單、%d 知識卡、%d 分支" % (
        len(D["chapters"]), len(D["dialogue"]), len(D["quests"]), len(D["tickets"]), len(D["cards"]), len(D["branches"])))


# --------------------------------------------------------------------------- 旗標
FLAG_RE = re.compile(r"flag\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*")


# 呼叫：main/demo 驗證；資料索引 → (使用旗標,設定旗標)，未定義記 errors，僅設定的列入 notes。
def check_flags(D):
    used, setf = set(), set()

    # 呼叫：check_flags/自身；巢狀值/上下文 → None，更新局部 used/setf；in_set 保留參數目前未參與判定。
    def scan(o, in_set=False):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("sets", "set"):
                    for s in (v if isinstance(v, list) else [v]):
                        if isinstance(s, str):
                            setf.update(FLAG_RE.findall(s))
                    scan(v, True)
                elif k in ("if", "requires", "when", "unlock", "unlock_flag", "done_flag"):
                    for s in (v if isinstance(v, list) else [v]):
                        if isinstance(s, str):
                            if k == "unlock_flag" or k == "done_flag":
                                setf.update(FLAG_RE.findall(s)) if k == "unlock_flag" else None
                            used.update(FLAG_RE.findall(s))
                    scan(v)
                else:
                    scan(v)
        elif isinstance(o, list):
            for v in o:
                scan(v)
    for part in ("chapters", "dialogue", "quests", "tickets", "cards", "branches"):
        for obj in D[part].values():
            scan(obj)
    # done_flag 由章節自己的對話 sets 設定（ch0_done / ch1_done），已在 sets 裡
    # 世界/引擎層旗標（由引擎計算，不在資料裡 set）
    engine_flags = {"flag.mail_read"}
    undefined = sorted(f for f in used if f not in setf and f not in engine_flags)
    for f in undefined:
        err("旗標 %s 被條件使用，但沒有任何地方會設定它" % f)
    unused = sorted(f for f in setf if f not in used)
    if unused:
        ok("僅被設定、沒被條件使用的旗標（純紀錄，可用於成就）：" + ", ".join(unused))
    ok("旗標檢查：使用 %d、設定 %d" % (len(used), len(setf)))
    return used, setf


# --------------------------------------------------------------------------- 劇透護欄
FORBIDDEN = [
    ("八片", "不可透露碎片總數（Ch3 才揭露）"),
    ("八個", "不可透露碎片總數"),
    ("/8]", "KEY-FRAG 不可寫成 n/8"),
    ("Admin 是頭銜", "Admin 是頭銜是 Ch2 揭露"),
    ("lin 是 Admin", "lin 是最後一任 Admin 是 Ch2 揭露"),
    ("最後一任 Admin", "同上（只有 cast 檔的 secrets 可寫）"),
    ("INIT 開了", "TICKET-0001 是 INIT 開的，Ch7 才揭露"),
    ("INIT 是報告人", "同上"),
    ("免疫系統", "GC 是免疫系統是 Ch5 揭露"),
    ("被回收了", "lin 被回收是 Ch5–7 揭露"),
]
SPOILER_SCOPES = ["text/ch0", "text/ch1", "text/tickets", "dialogue", "quests", "chapters"]
SPOILER_SKIP_KEYS = {"note", "notes", "secrets", "authoring_notes", "rules_notes", "tone_rules", "teaching_goal",
                     "world_link", "consequence", "foreshadow", "summary", "details", "lin_touches_article_7"}


# 呼叫：main；資料索引 → None，讀玩家可見文字/對話/提示掃禁詞，累積錯誤，不掃來源註解。
def check_spoilers(D):
    n = 0
    # 純文字
    for scope in ("text/ch0", "text/ch1", "text/tickets"):
        for f in glob.glob(P(scope, "*")):
            t = open(f, encoding="utf-8").read()
            for s, why in FORBIDDEN:
                if s in t:
                    err("劇透護欄 %s 含「%s」：%s" % (os.path.relpath(f, ROOT), s, why))
            n += 1
    # 對話與快題的玩家可見文字（lines[].text / prompt / hints）
    for npc, d in D["dialogue"].items():
        for nd in d["nodes"]:
            blocks = list(nd.get("lines", []))
            for v in nd.get("variants", []):
                blocks += v.get("lines", [])
            for l in blocks:
                for s, why in FORBIDDEN:
                    if s in l.get("text", ""):
                        err("劇透護欄 對話 %s.%s 含「%s」：%s" % (npc, nd["node"], s, why))
    for qid, q in D["quests"].items():
        vis = [q.get("prompt", "")] + q.get("hints", [])
        for s, why in FORBIDDEN:
            if any(s in v for v in vis):
                err("劇透護欄 快題 %s 含「%s」" % (qid, s))
    ok("劇透護欄：掃描 %d 個文字檔與全部對話、快題" % n)


# --------------------------------------------------------------------------- 碎片、憲章
# 呼叫：main；資料索引 → None，核對碎片/損毀版/憲章與手冊關鍵字，讀文字且累積診斷，不修資料。
def check_fragments_charter(D):
    ch0 = open(P("text/ch0/draft.txt"), encoding="utf-8").read()
    rest = open(P("text/ch1/letter3141_restored.txt"), encoding="utf-8").read()
    dmg = open(P("text/ch1/letter3141_damaged.txt"), encoding="utf-8").read()
    fr = {f["id"]: f for f in D["fragments"]["fragments"]}
    if fr["F1"]["marker"] + ": " + fr["F1"]["value"] not in ch0:
        err("F1 標記或值不在 draft.txt")
    if fr["F2"]["marker"] + ": " + fr["F2"]["value"] not in rest:
        err("F2 標記或值不在復原版信件")
    if "KEY-FRAG" in dmg or fr["F2"]["value"] in dmg:
        err("損毀版信件不應含 KEY-FRAG 或碎片值（否則 grep -r 會直接找到，fsck 就沒意義）")
    t1, t2 = fr["F1"]["link_time"], fr["F2"]["link_time"]
    if not t1 < t2:
        warn("F1 的連結時間應早於 F2（Ch7 以時間排序；本章刻意讓編號與時間一致）")
    # 憲章
    cur = D["charter"]["current"]["articles"]
    if sorted(cur) != list(range(1, 10)):
        err("憲章現行版應有第 1–9 條，實際：%s" % sorted(cur))
    for h in D["charter"]["handbook_digest"]:
        if h["article"] not in cur:
            err("handbook 摘要引用不存在的條號 %s" % h["article"])
    hb = open(P("text/ch0/handbook.md"), encoding="utf-8").read()
    for kw in ["150 毫秒", "不得在週五下午修憲", "掛機不算人", "標準眨眼貓"]:
        if kw not in hb:
            err("handbook.md 缺少憲章摘要關鍵字：%s" % kw)
    if "不得被封鎖" in hb:
        err("handbook.md 不可寫『GC 不得被封鎖』（留給 B1 揭露）")
    revs = {r["rev"] for r in D["charter"]["revisions"]}
    if revs != {1, 2, 3, 4, 5}:
        err("憲章修訂史應為 Rev 1–5，實際：%s" % revs)
    # Rev 1 應保留舊版七條
    r1 = [r for r in D["charter"]["revisions"] if r["rev"] == 1][0]
    if sorted(r1["articles"]) != list(range(1, 8)):
        err("Rev 1 應保留 kestrel v2.4 的七條原文")
    # 舊口令句：draft.txt 引用 v2.4 第三條原句
    old3 = r1["articles"][3]
    if old3 not in ch0:
        err("draft.txt 應引用第三條 v2.4 原句（Ch2 口令）：%s" % old3)
    ok("碎片與憲章檢查完成（Rev 1–5、v2.4 原句保留、F1/F2 位置正確）")


# --------------------------------------------------------------------------- 虛擬檔案系統與快題
# 呼叫：快題/一致性工具；設定文字/manifest → 替換答案佔位符的值，非字串原樣回傳，無副作用。
def fsub(s, man):
    return re.sub(r"\{manifest\.(\w+)\}", lambda m: str(man[m.group(1)]), s) if isinstance(s, str) else s


# 呼叫：materialize；受信任規格條件/flags dict → boolean；使用 Python 求值，絕不可用於玩家輸入。
def cond(expr, flags):
    e = re.sub(r"flag\.([A-Za-z0-9_.]+)", lambda m: "F.get('%s', False)" % m.group(1), expr)
    return bool(eval(e, {"F": flags}))


# 呼叫：check_quests/demo 模擬與一致性工具；章節/暫存根/生成目錄/flags → None，實體寫出章節檔案。
# 變體依第一個符合條件選來源；只供可信資料，root 不是系統級 chroot；產物由上層 finally 清理。
def materialize(ch, root, gen_dir, flags):
    for f in ch.get("files", []):
        path = f["path"]
        dest = os.path.join(root, path.lstrip("/"))
        if f.get("dir") or path.endswith("/"):
            os.makedirs(dest, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if "generate" in f:
            if f["generate"].get("gzip"):
                src = os.path.join(gen_dir, "rotated", "access.log.1")
                with open(src, "rb") as a, gzip.open(dest, "wb") as b:
                    b.write(a.read())
            else:
                shutil.copy(os.path.join(gen_dir, "access.log"), dest)
            continue
        ref = f.get("content_ref")
        for v in f.get("variants", []):
            if cond(v["if"], flags):
                ref = v["content_ref"]
                break
        if ref is None:
            err("檔案 %s 沒有內容來源" % path)
            continue
        shutil.copy(P(ref), dest)
    for d in ch.get("dirs", []):
        os.makedirs(os.path.join(root, d.lstrip("/")), exist_ok=True)


# 呼叫：快題驗證；可信 cmd/cwd/home/root → CompletedProcess，真 Bash 限 30 秒；root 目前未作隔離使用。
def run(cmd, cwd, home, root):
    env = dict(os.environ, HOME=home, LC_ALL="C.UTF-8")
    return subprocess.run(["bash", "-c", cmd], cwd=cwd, env=env, capture_output=True, text=True, encoding="utf-8", timeout=30)


# 呼叫：快題/flow_sim/一致性；check/指令/stdout/manifest/新檔行 → boolean，未知型別另記 errors；不寫狀態。
def eval_check(chk, cmd, out, man, newfile_lines=None):
    t = chk["type"]
    cr = chk.get("cmd_regex")
    if cr and not re.search(cr, cmd):
        return False
    if t == "ran_regex":
        return bool(re.search(chk["regex"], cmd))
    if t == "output_contains":
        return fsub(chk["text"], man) in out
    if t == "output_last_line_equals":
        lines = [l for l in out.split("\n") if l.strip()]
        return bool(lines) and lines[-1].strip() == fsub(chk["value"], man)
    if t == "output_line_contains_all":
        vals = [fsub(v, man) for v in chk["values"]]
        return any(all(v in l for v in vals) for l in out.split("\n"))
    if t == "file_matches":
        if newfile_lines is None:
            return False
        rx = re.compile(chk["all_lines_regex"])
        return bool(newfile_lines) and all(rx.search(l) for l in newfile_lines) and \
            len(newfile_lines) == int(fsub(chk["line_count"], man))
    err("未知的 check 型別：%s" % t)
    return False


# 呼叫：main；資料索引/是否保留 → None，生成日誌/實體檔案並以真 Bash 驗正反例，finally 清暫存或印保留路徑。
def check_quests(D, keep):
    tmp = tempfile.mkdtemp(prefix="ra01_")
    try:
        gen = os.path.join(tmp, "gen")
        subprocess.run([sys.executable, P("tools", "gen_logs.py"), "--out", gen, "--lines-per-day", "300",
                        "--seed", "5", "--npc"], check=True, capture_output=True)
        man = json.load(open(os.path.join(gen, "manifest.json")))
        ok("日誌產生器（縮小版）：%d 行，404=%d，最忙一天=%s(%d)，GC 探測=%d" % (
            man["n_lines"], man["n404"], man["busiest_day"], man["busiest_count"], man["n_gc"]))
        # 不變量
        if man["busiest_day"] != man["appeal_day"]:
            err("不變量 I4 失敗：最忙的一天不是申訴日")
        if man["n_gc"] != man["days"] + 1:
            err("不變量 I1 失敗：GC 探測次數 %d != %d" % (man["n_gc"], man["days"] + 1))
        if man["n_grep404_naive"] <= man["n404"]:
            err("不變量 I3 失敗：沒有 decoy 行，grep -c 404 不會多算")
        if man["n_ip_prefix_naive"] <= man["n_gc"]:
            err("不變量 I2 失敗：沒有 10.7.0.23 車隊行，前綴比對沒有陷阱")
        if any(x.startswith("10.7.0.2 ") for x in man["top3"]):
            err("不變量 I6 失敗：GC 排進了真實日誌的前三名")
        for chid, ch in D["chapters"].items():
            root = os.path.join(tmp, "fs_" + chid)
            os.makedirs(root)
            materialize(ch, root, gen, {})
            home = os.path.join(root, ch["player_start"]["home"].lstrip("/"))
            os.makedirs(home, exist_ok=True)
            for qid in ch["quick_tasks"]:
                q = D["quests"][qid]
                chk = q["check"]
                for ex in q.get("examples", {}).get("pass", []):
                    if chk["type"] == "ran_regex" and not re.search(chk["regex"], ex):
                        err("快題 %s: 正例 %r 不符合 regex" % (qid, ex))
                for ex in q.get("examples", {}).get("fail", []):
                    if chk["type"] == "ran_regex" and re.search(chk["regex"], ex):
                        err("快題 %s: 反例 %r 竟然符合 regex" % (qid, ex))
                ref = q.get("reference")
                if ref:
                    cwd = home if ref["cwd"] == "~" else os.path.join(root, ref["cwd"].lstrip("/"))
                    r = run(fsub(ref["cmd"], man), cwd, home, root)
                    out = r.stdout
                    nf = None
                    if chk["type"] == "file_matches":
                        ef = ref.get("expect_file", {})
                        fp = os.path.join(cwd, ef.get("name", ""))
                        nf = open(fp).read().rstrip("\n").split("\n") if os.path.exists(fp) else None
                    if r.returncode not in (0, 1):
                        err("快題 %s: reference 指令失敗 rc=%d %s" % (qid, r.returncode, r.stderr[:200]))
                    if not eval_check(chk, ref["cmd"], out, man, nf):
                        err("快題 %s: reference 沒有通過自己的 check。輸出前 200 字：%r" % (qid, out[:200]))
                    ex = ref.get("expect", {})
                    for s in ex.get("contains", []):
                        if fsub(s, man) not in out:
                            err("快題 %s: reference 輸出缺少 %r" % (qid, s))
                    if "last_line_contains" in ex:
                        ll = [l for l in out.split("\n") if l.strip()]
                        if not ll or fsub(ex["last_line_contains"], man) not in ll[-1]:
                            err("快題 %s: reference 最後一行不含 %r" % (qid, ex["last_line_contains"]))
                for neg in q.get("negative_references", []):
                    cwd = home if neg["cwd"] == "~" else os.path.join(root, neg["cwd"].lstrip("/"))
                    r = run(fsub(neg["cmd"], man), cwd, home, root)
                    nf = None
                    if chk["type"] == "file_matches":
                        fp = os.path.join(cwd, neg.get("file", ""))
                        nf = open(fp).read().rstrip("\n").split("\n") if os.path.exists(fp) else None
                    if eval_check(chk, neg["cmd"], r.stdout, man, nf):
                        err("快題 %s: negative reference 竟然通過 check：%s" % (qid, neg["cmd"]))
        # Q1-5 的 verify_by
        q15 = D["quests"]["Q1-5"]["verify_by"]
        rest = open(P("text/ch1/letter3141_restored.txt"), encoding="utf-8").read()
        dmg = open(P("text/ch1/letter3141_damaged.txt"), encoding="utf-8").read()
        if q15["restored_text_contains"] not in rest or q15["damaged_text_not_contains"] in dmg:
            err("Q1-5 verify_by 失敗")
        # 光是 grep 不該直接找到 F2（需要 fsck）
        # 從暫存世界內用相對路徑，避免 Windows 反斜線被 Bash 當成跳脫字元。
        r = run("grep -r KEY-FRAG srv/harbor", os.path.join(tmp, "fs_ch1"), tmp, tmp)
        if r.returncode not in (0, 1):
            err("F2 搜尋指令失敗 rc=%d %s" % (r.returncode, r.stderr[:200]))
        if "KEY-FRAG" in r.stdout:
            err("在 fsck 之前，grep -r KEY-FRAG /srv/harbor 就找得到 F2")
        # 第二層：「grep appeal」彩蛋、rotated 彩蛋
        r = run("zcat var/log/harbor/rotated/access.log.1.gz | grep -c 'lin/tty1'", os.path.join(tmp, "fs_ch1"), tmp, tmp)
        if r.stdout.strip() != "1":
            err("rotated 日誌的 lin 彩蛋缺失（預期 lin/tty1 一行）")
        r = run("grep -c 'POST /appeal' var/log/harbor/access.log", os.path.join(tmp, "fs_ch1"), tmp, tmp)
        if int(r.stdout.strip() or 0) != man["n_appeal"]:
            err("grep appeal 計數與 manifest 不符")
        ok("快題：reference 全數通過 check，negative_references 全數被擋下")
    finally:
        if keep:
            print("保留虛擬檔案系統於", tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- 工單
# 呼叫：check_tickets；可信解答檔/輸入/時限 → (stdout,耗秒,rc)，啟動隔離模式 Python；超時拋錯，上層彙報。
def run_sol(sol, inp, timeout=10):
    t = time.time()
    # -I 會忽略 PYTHONUTF8/PYTHONIOENCODING；明示子程序與管線均用 UTF-8，避免 Windows CP950 混碼。
    r = subprocess.run([sys.executable, "-I", "-X", "utf8", sol], input=inp, capture_output=True,
                       text=True, encoding="utf-8", timeout=timeout)
    return r.stdout, time.time() - t, r.returncode


# 呼叫：main；資料索引 → None，跑參考/錯解/大案例並用獨立 Shell 答案對照；累積診斷，不改測資。
def check_tickets(D):
    for tid, t in D["tickets"].items():
        td = P(t["judge"]["local"]["tests_dir"])
        ref = P(t["judge"]["local"]["ref_solution"])
        ins = sorted(glob.glob(os.path.join(td, "*.in")))
        if not ins:
            err("ticket %s: 沒有測資" % tid)
        for fin in ins:
            exp = open(fin[:-3] + ".out", encoding="utf-8").read()
            got, el, rc = run_sol(ref, open(fin, encoding="utf-8").read())
            if rc != 0 or [l.rstrip() for l in got.rstrip("\n").split("\n")] != [l.rstrip() for l in exp.rstrip("\n").split("\n")]:
                err("ticket %s: 參考解答在 %s 上沒有 AC" % (tid, os.path.basename(fin)))
        # 已知錯解
        for w in t.get("common_wrong", []):
            f = os.path.join(t["_dir"], "ref", "wrong_%s.py" % {"lexicographic_tiebreak": "lexicographic",
                                                               "no_tiebreak": "no_tiebreak"}[w["id"]])
            if not os.path.exists(f):
                err("ticket %s: 缺少錯解 %s" % (tid, f))
                continue
            bad = []
            for fin in ins:
                num = int(os.path.basename(fin)[:-3])
                exp = open(fin[:-3] + ".out", encoding="utf-8").read()
                got, _, _ = run_sol(f, open(fin, encoding="utf-8").read())
                if got.strip() != exp.strip():
                    bad.append(num)
            for need in w["tests"]:
                if need not in bad:
                    err("ticket %s: 錯解 %s 沒有在 test #%d 被擋下" % (tid, w["id"], need))
        # 效能：T0427 大測資（30 萬行、10 萬個 IP）
        if tid == "T0427":
            import random
            rnd = random.Random(1)
            n = 300000
            ips = ["10.%d.%d.%d" % (rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(100000)]
            lines = ['%s - - [06/Dec/2031:10:00:01 +0000] "GET /ship/ferry HTTP/1.1" 200 512' % rnd.choice(ips) for _ in range(n)]
            inp = "%d\n%s\n" % (n, "\n".join(lines))
            got, el, rc = run_sol(ref, inp)
            cmd = "awk '{print $1}' | sort | uniq -c | awk '{print $2\" \"$1}' | sort -k2,2nr -k1,1V | head -3"
            exp = subprocess.run(["bash", "-c", cmd], input="\n".join(lines) + "\n", capture_output=True, text=True).stdout
            if got != exp:
                err("T0427 大測資：參考解答與 shell 管線結果不同")
            if el > 2.0:
                warn("T0427 大測資參考解答耗時 %.2fs（時限 2s，Python 本機參考；30 萬行）" % el)
            ok("T0427 大測資（30 萬行）參考解答 %.2fs，與 shell 管線一致" % el)
    ok("工單：參考解答 AC，已知錯解被指定測資擋下")


# 呼叫：CLI；argv → 程序退出，先載入/靜態檢查再跑動態驗證，中斷也轉 errors；不部署或改來源。
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()
    D = load_all()
    if errors:
        report()
        sys.exit(1)
    check_refs(D)
    check_flags(D)
    check_spoilers(D)
    check_fragments_charter(D)
    for fn, args in ((check_quests, (D, a.keep)), (check_tickets, (D,))):
        try:
            fn(*args)
        except Exception as e:  # 前面的斷鏈可能讓後面的檢查跑不起來：當成錯誤回報，不要崩潰
            err("%s 中斷：%s: %s" % (fn.__name__, type(e).__name__, e))
    report()
    sys.exit(1 if errors else 0)


# 呼叫：main；無參數 → None，輸出目前全域 notes/warnings/errors 與計數，不清空清單。
def report():
    for m in notes:
        print("  ok   " + m)
    for m in warnings:
        print("  WARN " + m)
    for m in errors:
        print("  FAIL " + m)
    print("\n結果：%d 項錯誤，%d 項警告" % (len(errors), len(warnings)))


if __name__ == "__main__":
    main()
