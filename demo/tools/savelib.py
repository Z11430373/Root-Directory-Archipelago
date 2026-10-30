#!/usr/bin/env python3
"""
存檔函式庫（試玩版與正式版共用的存檔格式 schema 1 的參考實作）。

存檔 = 事件溯源的 commit 紀錄：
  {"schema":1,"game":"root-archipelago","demo":true,"nick":...,"seed":...,"pack":...,"commits":[...]}
commit = {"id","parent","branch","chapter","kind","data","t","r"}
  id      sha256(parent_id + 規範化 JSON(其餘欄位))[:8]   → 雜湊鏈
  t       世界時間（秒，自賽季起點）
  r       真實時間（毫秒，自試玩開始），只用於活動統計

出口
  檔案  <nick>.rasave.json
  代碼  RA1-<base64url(zlib(規範化 JSON))>-<CRC32 8 碼>
  值班證 純文字

CLI
  python3 savelib.py verify  <檔案|代碼>
  python3 savelib.py card    <檔案|代碼>
  python3 savelib.py import  <檔案|代碼>        # 套用 import_rules.yaml，印出正式版的起始狀態
  python3 savelib.py aggregate <代碼清單檔>      # 每行一個代碼；輸出活動統計
"""
import argparse
import base64
import re
import hashlib
import json
import os
import statistics
import sys
import zlib

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.dirname(HERE)
PREFIX = "RA1-"


def canonical(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def commit_id(parent, body):
    return hashlib.sha256(((parent or "") + canonical(body)).encode("utf-8")).hexdigest()[:8]


def new_save(nick, seed, pack="root-archipelago-ch01@0.1.0", event=None):
    return {"schema": 1, "game": "root-archipelago", "demo": True, "demo_id": "demo-first-night",
            "pack": pack, "nick": nick, "seed": seed, "event": event, "commits": []}


def add_commit(save, kind, data, r, t=0, chapter="ch0", branch="main"):
    parent = save["commits"][-1]["id"] if save["commits"] else None
    body = {"branch": branch, "chapter": chapter, "kind": kind, "data": data, "t": t, "r": r}
    c = dict(body)
    c["parent"] = parent
    c["id"] = commit_id(parent, body)
    save["commits"].append(c)
    return c


def verify_chain(save):
    parent = None
    for i, c in enumerate(save["commits"]):
        body = {k: c[k] for k in ("branch", "chapter", "kind", "data", "t", "r")}
        if c["parent"] != parent or c["id"] != commit_id(parent, body):
            return False, i
        parent = c["id"]
    if save.get("head") and save["commits"] and save["head"] != save["commits"][-1]["id"]:
        return False, len(save["commits"]) - 1
    return True, None


# ---------------------------------------------------------------------------
def seal(save):
    """寫入 head（鏈尾 id）。匯出前呼叫。"""
    save["head"] = save["commits"][-1]["id"] if save["commits"] else None
    return save


def pack(save):
    """代碼用的緊湊形式：commit 變成陣列、不存 id/parent（匯入時由鏈重算，head 用來對帳）。"""
    seal(save)
    meta = {k: v for k, v in save.items() if k != "commits"}
    rows, prev_t, prev_r = [], 0, 0
    for c in save["commits"]:
        d = c["data"]
        if c["kind"] == "flag":
            d = d["name"][5:] if d["name"].startswith("flag.") else d["name"]
        rows.append([c["kind"], d, c["t"] - prev_t, c["r"] - prev_r,
                     0 if c["branch"] == "main" else c["branch"], 0 if c["chapter"] == "ch0" else c["chapter"]])
        prev_t, prev_r = c["t"], c["r"]
    return {"m": meta, "c": rows}


def unpack(o):
    save = dict(o["m"])
    save["commits"] = []
    t = r = 0
    for kind, d, dt, dr, br, ch in o["c"]:
        t += dt
        r += dr
        if kind == "flag" and not isinstance(d, dict):
            d = {"name": d if d.startswith("flag.") else "flag." + d}
        add_commit(save, kind, d, r, t, chapter=ch or "ch0", branch=br or "main")
    return save


def export_code(save):
    raw = zlib.compress(canonical(pack(save)).encode("utf-8"), 9)
    b = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    crc = "%08x" % (zlib.crc32((PREFIX + b).encode()) & 0xFFFFFFFF)
    return "%s%s-%s" % (PREFIX, b, crc)


class CodeError(Exception):
    pass


def integrity():
    return yaml.safe_load(open(os.path.join(DEMO, "integrity.yaml"), encoding="utf-8"))


def _is_int(x):
    return isinstance(x, int) and not isinstance(x, bool)


def _depth(o, d=0):
    if d > 64:
        return d
    if isinstance(o, dict):
        return max([_depth(v, d + 1) for v in o.values()] + [d + 1])
    if isinstance(o, list):
        return max([_depth(v, d + 1) for v in o] + [d + 1])
    return d


def check_shape(save, cfg=None, ig=None):
    """硬規則：形狀不對就丟 CodeError。這是安全問題，不是可信度問題。"""
    cfg = cfg or demo_cfg()
    ig = ig or integrity()
    L = ig["limits"]
    if not isinstance(save, dict):
        raise CodeError("存檔格式錯誤（不是物件）")
    extra = set(save) - set(L["meta_keys"])
    if extra:
        raise CodeError("存檔含有不認得的欄位：%s" % sorted(extra)[0][:20])
    if save.get("schema") != 1 or save.get("game") != "root-archipelago":
        raise CodeError("不是根目錄群島的存檔（schema/game 不符）")
    if _depth(save) > L["max_depth"]:
        raise CodeError("存檔巢狀過深")
    if not isinstance(save.get("nick"), str) or not re.fullmatch(L["nick_regex"], save["nick"]):
        raise CodeError("暱稱不合規則（英文、數字、底線、連字號，最多 12 字）")
    lo, hi = L["seed_range"]
    if not _is_int(save.get("seed")) or not lo <= save["seed"] <= hi:
        raise CodeError("種子不合規則")
    if save.get("event") is not None and not (isinstance(save["event"], str) and re.fullmatch(L["event_regex"], save["event"])):
        raise CodeError("活動代號不合規則")
    if "pack" in save and not (isinstance(save["pack"], str) and re.fullmatch(L["pack_regex"], save["pack"])):
        raise CodeError("pack 欄位不合規則")
    if not isinstance(save.get("commits"), list) or len(save["commits"]) > L["max_commits"]:
        raise CodeError("commit 數量不合規則（上限 %d）" % L["max_commits"])
    tasks = set(cfg["content"]["quick_tasks"])
    finds = {f["id"] for f in cfg["finds"]}
    items, cards = {"F1", "R0"}, {"K0"}
    flag_re = re.compile(r"flag\.[a-z0-9_.]{1,40}")
    ckpt_re = re.compile(r"ckpt/[a-z0-9-]{1,24}")
    br_re = re.compile(r"[a-z]{1,8}/[a-z0-9-]{1,16}")
    kinds = set(cfg["save"]["commit_kinds"])
    last_t = last_r = 0
    for i, c in enumerate(save["commits"]):
        where = "commit #%d" % i
        if not isinstance(c, dict):
            raise CodeError("%s 格式錯誤" % where)
        for k in ("branch", "chapter", "kind", "data", "t", "r"):
            if k not in c:
                raise CodeError("%s 缺少欄位 %s" % (where, k))
        if not _is_int(c["t"]) or not _is_int(c["r"]) or c["t"] < 0 or c["r"] < 0 or c["t"] > L["max_t"] or c["r"] > L["max_r_ms"]:
            raise CodeError("%s 的時間欄位不合規則" % where)
        if c["t"] < last_t or c["r"] < last_r:
            raise CodeError("%s 的時間倒退" % where)
        last_t, last_r = c["t"], c["r"]
        if c["chapter"] not in ig["chapters"]:
            raise CodeError("%s 的章節不合規則" % where)
        b = c["branch"]
        if not (b == "main" or (isinstance(b, str) and br_re.fullmatch(b))):
            raise CodeError("%s 的分支名不合規則" % where)
        k, d = c["kind"], c["data"]
        if k not in kinds:
            raise CodeError("%s 的種類不認得" % where)
        if not isinstance(d, dict):
            raise CodeError("%s 的 data 不是物件" % where)

        def need(keys, optional=()):
            if set(d) - set(keys) - set(optional) or set(keys) - set(d):
                raise CodeError("%s（%s）的欄位不符" % (where, k))
        s_ = lambda x: isinstance(x, str) and len(x) <= L["max_string_len"]   # noqa: E731
        if k == "flag":
            need(["name"])
            if not (s_(d["name"]) and flag_re.fullmatch(d["name"])):
                raise CodeError("%s 的旗標名不合規則" % where)
        elif k in ("task", "skip", "find", "item", "card"):
            need(["id"])
            ok = {"task": tasks, "skip": tasks, "find": finds, "item": items, "card": cards}[k]
            if d["id"] not in ok:
                raise CodeError("%s 的 %s id 不在清單內" % (where, k))
        elif k == "checkpoint":
            need(["id"])
            if not (s_(d["id"]) and ckpt_re.fullmatch(d["id"])):
                raise CodeError("%s 的檢查點名不合規則" % where)
        elif k == "choice":
            need(["id", "value"])
            if d["id"] != "vote" or d["value"] not in ("block", "pass"):
                raise CodeError("%s 的選擇不合規則" % where)
        elif k == "hint":
            need(["n"], ["full"])
            if not _is_int(d["n"]) or not 1 <= d["n"] <= 3 or ("full" in d and not isinstance(d["full"], bool)):
                raise CodeError("%s 的提示欄位不合規則" % where)
        elif k == "branch.enter":
            need(["name", "from"])
            if not (s_(d["name"]) and br_re.fullmatch(d["name"]) and s_(d["from"]) and ckpt_re.fullmatch(d["from"])):
                raise CodeError("%s 的分支欄位不合規則" % where)
        elif k == "branch.exit":
            need(["mode"])
            if d["mode"] not in ("merge", "abandon"):
                raise CodeError("%s 的離開模式不合規則" % where)
        elif k == "merge":
            need(["mode", "card"])
            if d["mode"] != "knowledge" or d["card"] not in cards:
                raise CodeError("%s 的合併欄位不合規則" % where)
        elif k == "end":
            need(["time_up"])
            if not isinstance(d["time_up"], bool):
                raise CodeError("%s 的 end 欄位不合規則" % where)
            if i != len(save["commits"]) - 1:
                raise CodeError("end 必須是最後一個 commit")
    return True


def plausibility(save, cfg=None, ig=None):
    """可信度：回傳命中的原因（list[str]）。只標記，不拒絕。"""
    cfg = cfg or demo_cfg()
    ig = ig or integrity()
    P = ig["plausibility"]
    reasons = []
    st = fold(save)
    time_up = "flag.demo.time_up" in st["flags"]
    if st["ended"] and not time_up and st["seconds"] < P["min_total_seconds_if_finished"]:
        reasons.append("too_fast")
    order = ["Q0-1", "Q0-2", "Q0-3", "Q0-4", "Q0-5", "Q1-1", "Q1-3"]
    idx = [order.index(t) for t in st["tasks"] if t in order]
    if idx != sorted(idx):
        reasons.append("task_order")
    if st["vote"] and not time_up:
        seen_night, vote_before = False, False
        for c in save["commits"]:
            if c["kind"] == "flag" and c["data"]["name"] == "flag.gc_name_heard":
                seen_night = True
            if c["kind"] == "choice" and not seen_night:
                vote_before = True
        if vote_before:
            reasons.append("vote_before_night")
    return reasons


def level(save):
    """回傳 ('intact'|'suspicious'|'broken', 原因清單)"""
    ok, _ = verify_chain(save)
    if not ok:
        return "broken", ["chain"]
    r = plausibility(save)
    return ("suspicious", r) if r else ("intact", [])


def _inflate_bounded(raw, limit):
    d = zlib.decompressobj()
    out = d.decompress(raw, limit + 1)
    if len(out) > limit or d.unconsumed_tail:
        raise CodeError("代碼解開後過大（上限 %d bytes）" % limit)
    if not d.eof:
        raise CodeError("代碼不完整（壓縮資料被截斷）")
    return out


def import_code(code):
    ig = integrity()
    L = ig["limits"]
    code = "".join(code.split())            # 容忍換行與空白（複製貼上常見）
    if len(code) > L["max_code_chars"]:
        raise CodeError("代碼太長（上限 %d 字元）" % L["max_code_chars"])
    if not code.startswith(PREFIX) or "-" not in code[len(PREFIX):]:
        raise CodeError("不是存檔代碼（應以 RA1- 開頭）")
    body, crc = code[len(PREFIX):].rsplit("-", 1)
    want = "%08x" % (zlib.crc32((PREFIX + body).encode()) & 0xFFFFFFFF)
    if crc.lower() != want:
        raise CodeError("代碼被截斷或貼錯（CRC 不符）")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", body):
        raise CodeError("代碼含有不合法的字元")
    pad = "=" * (-len(body) % 4)
    try:
        raw = base64.urlsafe_b64decode(body + pad)
        text = _inflate_bounded(raw, L["max_inflated_bytes"]).decode("utf-8")
        o = json.loads(text, parse_float=_no_float, parse_constant=_no_float)
    except CodeError:
        raise
    except Exception as e:  # noqa
        raise CodeError("代碼無法解開：%s" % type(e).__name__)
    try:
        save = unpack(o)
    except CodeError:
        raise
    except Exception as e:  # noqa
        raise CodeError("代碼內容格式錯誤：%s" % type(e).__name__)
    check_shape(save)
    return save


def _no_float(x):
    raise CodeError("存檔不接受浮點數或特殊數值")


def load_any(s):
    if os.path.exists(s):
        txt = open(s, encoding="utf-8").read()
        if txt.lstrip().startswith("{"):
            if len(txt) > 4 * integrity()["limits"]["max_inflated_bytes"]:
                raise CodeError("存檔檔案過大")
            try:
                sv = json.loads(txt, parse_float=_no_float, parse_constant=_no_float)
            except CodeError:
                raise
            except Exception:
                raise CodeError("存檔檔案不是合法的 JSON")
            check_shape(sv)
            return sv
        return import_code(txt)
    return import_code(s)


# ---------------------------------------------------------------------------
def demo_cfg():
    return yaml.safe_load(open(os.path.join(DEMO, "demo.yaml"), encoding="utf-8"))


def rules():
    return yaml.safe_load(open(os.path.join(DEMO, "import_rules.yaml"), encoding="utf-8"))


def fold(save):
    """把 commit 折成狀態：旗標、完成的快題、發現、選擇、耗時…"""
    st = {"flags": set(), "tasks": [], "finds": [], "items": [], "cards": [], "checkpoints": [],
          "skipped": [], "vote": None, "hints": 0, "branches": [], "seconds": 0, "ended": False}
    for c in save["commits"]:
        k, d = c["kind"], c["data"]
        if k == "flag":
            st["flags"].add(d["name"])
        elif k == "task" and d["id"] not in st["tasks"]:
            st["tasks"].append(d["id"])
        elif k == "skip" and d["id"] not in st["skipped"]:
            st["skipped"].append(d["id"])
        elif k == "find" and d["id"] not in st["finds"]:
            st["finds"].append(d["id"])
        elif k == "item" and d["id"] not in st["items"]:
            st["items"].append(d["id"])
        elif k == "card" and d["id"] not in st["cards"]:
            st["cards"].append(d["id"])
        elif k == "checkpoint":
            st["checkpoints"].append(d["id"])
        elif k == "choice" and d["id"] == "vote":
            st["vote"] = d["value"]
        elif k == "hint":
            st["hints"] += d.get("n", 1)
            if d.get("full"):
                st["flags"].add("flag.demo.used_full_hint")
        elif k in ("branch.enter", "branch.exit", "merge"):
            st["branches"].append((k, d))
        elif k == "end":
            st["ended"] = True
            if d.get("time_up"):
                st["flags"].add("flag.demo.time_up")
            st["flags"].add("flag.demo.finished")
    if save["commits"]:
        st["seconds"] = round((save["commits"][-1]["r"] - save["commits"][0]["r"]) / 1000)
    return st


def score(save, cfg=None):
    cfg = cfg or demo_cfg()
    st = fold(save)
    pts = {f["id"]: f["points"] for f in cfg["finds"]}
    fp = sum(pts.get(f, 0) for f in st["finds"])
    full = "flag.demo.used_full_hint" in st["flags"]
    sb = cfg["scoring"]["speed_bonus"]
    sec = st["seconds"]
    bonus = sb["under_seconds_600"] if sec < 600 else sb["under_seconds_780"] if sec < 780 else sb["otherwise"]
    total = len(st["tasks"]) * 10 + fp * 5 + (0 if full else 20) + bonus
    # 稱號
    have = set(st["finds"])
    conds = {
        "breaker": "rm_branch" in have and "K0" in st["cards"],
        "reader": len(st["finds"]) >= 6,
        "sprinter": sec < 600 and not full,
        "watcher": st["vote"] == "pass",
        "blocker": st["vote"] == "block",
        "default": True,
    }
    title = next(t for t in cfg["title_priority"] if conds[t])
    ttxt = {t["id"]: t["text"] for t in cfg["titles"]}[title]
    return {"score": total, "tasks": len(st["tasks"]), "finds": len(st["finds"]), "find_points": fp,
            "seconds": sec, "full_hint": full, "vote": st["vote"], "title_id": title, "title": ttxt,
            "finished": "flag.demo.finished" in st["flags"], "time_up": "flag.demo.time_up" in st["flags"]}


def to_fullgame(save, ru=None):
    ru = ru or rules()
    st = fold(save)
    ok, bad = verify_chain(save)
    lv, why = level(save)
    carry = ru["carry"]
    flags = sorted(f for f in st["flags"] if f in carry["flags"])
    dropped = sorted(f for f in st["flags"] if f not in carry["flags"])
    out = {
        "schema": 1, "demo": False, "nick": "op-" + save["nick"], "seed": save["seed"],
        "verified": "chain" if ok else "unverified",     # 只代表「沒壞」，不代表「真的玩出來的」
        "level": lv, "level_reasons": why,
        "flags": flags,
        "quests_done": [q for q in carry["quests_done"] if q in st["tasks"]],
        "items": [i for i in st["items"] if i in carry["items"]],
        "cards": [c for c in st["cards"] if c in carry["cards"]],
        "checkpoints": [c for c in st["checkpoints"] if c in carry["checkpoints"]],
        "dropped_flags": dropped,
        "memory": [], "perks": [],
    }
    for cp in carry["create_on_import"]:
        flagname = cp["when"]
        if flagname in st["flags"]:
            out["checkpoints"].append(cp["make"])
    for m in ru["memory"]:
        if m.get("nothing"):
            continue
        if m["from"] in st["flags"]:
            out["memory"].append(m["say"])
    if lv == "intact":
        sc = score(save)
        if sc["finished"] or sc["time_up"]:
            out["items"].append("badge.demo_first_night")
            for p in ru["perks"]:
                if p["id"] == "title":
                    out["perks"].append({"title": sc["title"]})
                else:
                    out["perks"].append(p["id"])
    out["items"] = sorted(set(out["items"]))
    return out


def fmt_time(sec):
    return "%d:%02d" % (sec // 60, sec % 60)


def card(save, rank=None, cfg=None):
    cfg = cfg or demo_cfg()
    sc = score(save, cfg)
    lv, _why = level(save)
    rk = ("第 %d 位" % rank) if rank else "—"
    state = "完成" if sc["finished"] and not sc["time_up"] else "值班時間到（進度已保存）" if sc["time_up"] else "進行中"
    vote = {"block": "擋", "pass": "放行", None: "—"}[sc["vote"]]
    w = 40
    def ln(s):
        pad = w - sum(2 if ord(c) > 0x2E80 else 1 for c in s)
        return "│ " + s + " " * max(0, pad - 1) + "│"
    lines = ["┌" + "─" * w + "┐",
             ln("值 班 證   ROOT ARCHIPELAGO"),
             ln("試玩版〈第一夜〉"),
             "├" + "─" * w + "┤",
             ln("值班員　op-%s" % save["nick"]),
             ln("稱號　　%s" % sc["title"]),
             ln("燈塔　　%s（%s）" % (rk, state)),
             ln("耗時　　%s" % fmt_time(sc["seconds"])),
             ln("快題　　%d/7　發現 %d/%d" % (sc["tasks"], sc["finds"], len(cfg["finds"]))),
             ln("02:00 的訪客　%s" % vote),
             ln("存檔完整性　%s" % {"intact": "完整", "suspicious": "可疑", "broken": "損毀"}[lv]),
             "├" + "─" * w + "┤",
             ln("燈我幫你留著。"),
             "└" + "─" * w + "┘"]
    return "\n".join(lines)


def aggregate(saves):
    cfg = demo_cfg()
    rows = []
    for s in saves:
        sc = score(s, cfg)
        st = fold(s)
        ok, _ = verify_chain(s)
        lv, why = level(s)
        # 每個快題完成的時間點（距開始秒）
        first_r = s["commits"][0]["r"] if s["commits"] else 0
        tmap = {}
        for c in s["commits"]:
            if c["kind"] == "task":
                tmap[c["data"]["id"]] = round((c["r"] - first_r) / 1000)
        rows.append({"nick": s["nick"], "verified": ok, "level": lv, "why": why, **sc, "task_times": tmap})
    n = len(rows)
    fin = [r for r in rows if r["finished"] and not r["time_up"]]
    summary = {
        "players": n,
        "completed": len(fin),
        "time_up": sum(1 for r in rows if r["time_up"]),
        "completion_rate": round(len(fin) / n, 3) if n else 0,
        "median_seconds_completed": statistics.median([r["seconds"] for r in fin]) if fin else None,
        "vote_block": sum(1 for r in rows if r["vote"] == "block"),
        "vote_pass": sum(1 for r in rows if r["vote"] == "pass"),
        "full_hint_rate": round(sum(1 for r in rows if r["full_hint"]) / n, 3) if n else 0,
        "unverified": sum(1 for r in rows if not r["verified"]),
        "suspicious": sum(1 for r in rows if r["level"] == "suspicious"),
        "avg_find_points": round(statistics.mean([r["find_points"] for r in rows]), 2) if rows else 0,
    }
    # 哪一題最卡：完成時間的中位數（只看有完成該題的人）
    per = {}
    for r in rows:
        prev = 0
        for q, t in sorted(r["task_times"].items(), key=lambda kv: kv[1]):
            per.setdefault(q, []).append(t - prev)
            prev = t
    summary["median_seconds_per_task"] = {q: statistics.median(v) for q, v in sorted(per.items())}
    ranking = sorted(rows, key=lambda r: (-r["score"], r["seconds"]))
    return summary, ranking


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("verify", "card", "import"):
        p = sub.add_parser(name)
        p.add_argument("src")
    p = sub.add_parser("aggregate")
    p.add_argument("file")
    a = ap.parse_args()
    if a.cmd == "aggregate":
        saves = []
        for line in open(a.file, encoding="utf-8"):
            line = line.strip()
            if line:
                try:
                    saves.append(import_code(line))
                except CodeError as e:
                    print("略過一行：%s" % e, file=sys.stderr)
        summary, ranking = aggregate(saves)
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        print("\n排行榜（自行回報，僅供參考；只列『完整』的存檔，可疑與損毀另列）")
        shown = 0
        for r in ranking:
            if r["level"] == "intact":
                shown += 1
                print("%2d. %-12s %4d 分  %s  %s" % (shown, r["nick"], r["score"], fmt_time(r["seconds"]), r["title"]))
        odd = [r for r in ranking if r["level"] != "intact"]
        if odd:
            print("\n未列入排行（%d）" % len(odd))
            for r in odd:
                print("    %-12s %s  %s" % (r["nick"], {"suspicious": "可疑", "broken": "損毀"}[r["level"]], ",".join(r["why"])))
        return
    s = load_any(a.src)
    if a.cmd == "verify":
        ok, bad = verify_chain(s)
        print("verified:chain" if ok else "unverified（第 %d 個 commit 起不符）" % bad)
    elif a.cmd == "card":
        print(card(s))
    elif a.cmd == "import":
        print(json.dumps(to_fullgame(s), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
