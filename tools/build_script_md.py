#!/usr/bin/env python3
"""把 chapters/*.yaml 的 scenes 展開成可閱讀的 SCRIPT.md（劇本全文）。
用法：python3 tools/build_script_md.py > SCRIPT.md
"""
import glob
import os
import sys

import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def P(*a):
    return os.path.join(ROOT, *a)


def Y(path):
    return yaml.safe_load(open(path, encoding="utf-8"))


def text(ref):
    return open(P(ref), encoding="utf-8").read().rstrip("\n")


def fence(s, lang=""):
    return "```%s\n%s\n```\n" % (lang, s)


W = Y(P("world", "world.yaml"))
CH = {d["id"]: d for d in (Y(f) for f in sorted(glob.glob(P("chapters", "*.yaml"))))}
DLG = {}
for f in sorted(glob.glob(P("dialogue", "*.yaml"))):
    d = Y(f)
    for n in d["nodes"]:
        DLG[(d["npc"], n["node"])] = n
        if d.get("alias"):
            DLG[(d["alias"], n["node"])] = n
Q = {}
for f in sorted(glob.glob(P("quests", "*.yaml"))):
    for q in Y(f)["quests"]:
        Q[q["id"]] = q
T = {d["id"]: d for d in (Y(f) for f in sorted(glob.glob(P("tickets", "*", "ticket.yaml"))))}
K = {d["id"]: d for d in (Y(f) for f in sorted(glob.glob(P("cards", "*.yaml"))))}
B = {d["id"]: d for d in (Y(f) for f in sorted(glob.glob(P("branches", "*.yaml"))))}
CHARTER = Y(P("world", "charter.yaml"))


def lines_of(node):
    out = []
    note = node.get("when")
    if note:
        out.append("*（觸發：%s）*" % note)
    blocks = list(node.get("lines", []))
    body = []
    for l in blocks:
        cond = l.get("if")
        t = text(l["text_ref"]) if "text_ref" in l else l.get("text", "")
        body.append(("〔if %s〕 " % cond if cond else "") + t)
    if body:
        out.append(fence("\n".join(body)))
    for v in node.get("variants", []):
        vb = []
        for l in v.get("lines", []):
            vb.append(l["text"] if "text" in l else text(l["text_ref"]))
        if "goto" in v:
            vb.append("→ 接 %s" % v["goto"])
        out.append("**變體（if %s）**\n%s" % (v["if"], fence("\n".join(vb))))
    if node.get("note"):
        out.append("> 備註：%s\n" % node["note"])
    if node.get("sets"):
        out.append("*設定旗標：%s*\n" % ", ".join(node["sets"]))
    return "\n".join(out)


def beat(b, ch):
    if "stage" in b:
        return "*（%s）*\n" % b["stage"]
    if "say" in b:
        npc, nid = b["say"].split(".", 1)
        return "**對話 `%s`**\n\n%s\n" % (b["say"], lines_of(DLG[(npc, nid)]))
    if "task" in b:
        q = Q[b["task"]]
        s = "**快題 %s｜%s**（學到：%s）\n\n" % (q["id"], q["title"], "、".join(q["teaches"]))
        s += "- 任務文字：%s\n" % q["prompt"]
        ref = q.get("reference")
        if ref:
            s += "- 標準做法：`%s`\n" % ref["cmd"]
        for i, h in enumerate(q.get("hints", []), 1):
            s += "- 提示 %d：%s\n" % (i, h)
        for w in q.get("wrong_output_hints", []):
            s += "- 輸出不對時：%s\n" % w["say"]
        if q.get("note"):
            s += "- 備註：%s\n" % q["note"]
        s += "- 完成：%s" % q.get("on_done", {}).get("say", "")
        if q["on_done"].get("gives"):
            s += "（取得 %s）" % "、".join(q["on_done"]["gives"])
        return s + "\n"
    if "ticket" in b:
        t = T[b["ticket"]]
        s = "**工單 %s｜%s**（SEV-%d，獎勵 %d 區塊 + %d 鑰匙幣）\n\n" % (
            t["display_id"], t["title"], t["severity"], t["reward"]["sectors"], t["reward"]["keys"])
        s += fence(text(t["story_ref"]), "md")
        s += "- 提示：" + "；".join("%s（%d 鑰匙）：%s" % (h["cmd"], h["cost_keys"], h["text"]) for h in t["hints"]) + "\n"
        if t.get("egg"):
            s += "- 彩蛋：%s\n" % t["egg"]
        return s
    if "branch" in b:
        br = B[b["branch"]]
        s = "**分支 %s｜%s**（%s，`%s`，起點 `%s`）\n\n" % (br["id"], br["title"], br["branch_type"], br["name"], br["from"])
        s += "進入：`%s`\n\n" % br["enter"]["command"]
        s += fence("\n".join(br["enter"]["init_says"]))
        if "outcomes" in br:
            for o in br["outcomes"]:
                s += "**結果 `%s`**（%s）\n%s" % (o["id"], "、".join("%s=%s" % kv for kv in o["when"].items()), fence("\n".join(o["lines"])))
        if "rules" in br:
            for r in br["rules"]:
                if "say" in r:
                    s += "- 觸發 `%s` → %s\n" % (r["id"], r["say"])
        for e in br["exits"]:
            s += "- 離開 `%s` → %s\n" % (e["command"], (e.get("on_success", {}).get("say", "")))
        return s + "\n"
    if "card" in b:
        k = K[b["card"]]
        return "**知識卡 %s｜%s**\n\n%s" % (k["id"], k["name"], fence(k["text"].rstrip("\n")))
    if "file" in b:
        f = [x for x in ch["files"] if x["path"] == b["file"]][0]
        ref = f.get("content_ref") or f["variants"][0]["content_ref"]
        extra = ""
        if f.get("variants"):
            extra = "（兩個版本：燈亮前／燈亮後；此為燈亮前，後者見 text/ch0/cat_working.txt）"
        return "**檔案 `%s`**%s\n\n%s" % (f["path"], extra, fence(text(ref)))
    return ""


def main():
    out = []
    out.append("# 《根目錄群島》Ch0–Ch1 完整劇本\n")
    out.append("這份文件由 `tools/build_script_md.py` 從資料檔自動展開，內容與資料檔一致；改資料檔後重新產生即可。\n")
    out.append("世界曆：賽季 %s，%s 開始，%s（閏日）結束；鐘塔時間，時區 +0000。\n" % (
        W["season"]["number"], W["season"]["start"], W["season"]["end"]))
    for cid in sorted(CH):
        ch = CH[cid]
        out.append("\n---\n\n## %s 〈%s〉%s\n" % (cid.upper().replace("CH", "Ch"), ch["title"], ch["subtitle"]))
        out.append("**目標：** %s\n\n**基調：** %s\n" % (ch["goal"], ch["tone"]))
        out.append("**玩家起點：** %s，世界時間 %s\n" % (ch["player_start"]["host"], ch["player_start"].get("world_time", "（渡海抵達）")))
        for s in ch["scenes"]:
            out.append("\n### %s　%s\n" % (s["id"], s["title"]))
            for b in s["beats"]:
                out.append(beat(b, ch))
        out.append("\n### 單人離線、多人離線、連線\n")
        for k, name in (("solo", "單人離線"), ("multi_offline", "多人離線"), ("online", "連線")):
            m = ch["modes"][k]
            out.append("**%s**：%s\n" % (name, m["summary"]))
            for d in m.get("details", []):
                out.append("- %s" % d)
            out.append("")
        out.append("\n### 作者備忘\n")
        for n in ch.get("authoring_notes", []):
            out.append("- %s" % n)
    out.append("\n---\n\n## 附錄 A：島嶼憲章修訂史（Rev 1–5）\n")
    out.append(CHARTER["note"].strip() + "\n")
    out.append("| Rev | 時代 | 出事 | 修了什麼 |\n|---|---|---|---|")
    for r in CHARTER["revisions"]:
        ch_ = r.get("changes") or r.get("articles")
        summ = "；".join("第%s條" % k for k in ch_.keys()) if ch_ else ""
        inc = " ".join(r["incident_before"].split())
        out.append("| %s | %s | %s | %s |" % (r["rev"], r["era"], inc[:110] + ("…" if len(inc) > 110 else ""), summ))
    out.append("\n### 現行版（Rev 5）全文\n")
    for k, v in CHARTER["current"]["articles"].items():
        out.append("第%s條　%s\n" % (k, v))
    out.append("附則　%s\n" % CHARTER["current"]["addendum"])
    out.append("### lin 的未完成修憲案\n")
    pa = CHARTER["pending_amendment"]
    out.append("%s\n\n- 提交：%s｜CI：%s\n- 失敗原因：%s\n- %s\n" % (
        pa["draft_text"].strip(), pa["submitted"], pa["ci_result"],
        "；".join(x["check"] for x in pa["ci_failures"]), " ".join(pa["consequence"].split())))
    out.append("\n## 附錄 B：舊設定保留清單\n")
    for x in CHARTER["legacy_canon_kept"]:
        out.append("- %s" % x)
    sys.stdout.write("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
