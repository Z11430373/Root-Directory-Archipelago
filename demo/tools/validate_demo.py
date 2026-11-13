#!/usr/bin/env python3
# 試玩設計 QA 整合入口；依賴 savelib/simulate/testvectors/validate_flow/flow_sim/make_conformance、
# tools/validate.py/gen_logs.py、demo YAML/text 與真 Bash；檢查來源唯讀，不重新產生對照答案。
# 暫存世界 finally 清理；錯誤/警告/說明累積全域清單，最後以非零退出回報失敗。
"""
試玩版驗證器：不用真人玩，只檢查設計是否自洽。
  python3 demo/tools/validate_demo.py

檢查：引用、15 分鐘預算、指令白名單、試玩規模日誌上的快題標準答案、
      匯入規則（白名單旗標都存在、不洩漏試玩專用旗標）、存檔來回／竄改／截斷、活動統計、劇透護欄。
"""
import base64
import importlib.util
import json
import os
import random
import re
import shutil
import subprocess
import sys
import tempfile
import zlib

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.dirname(HERE)
ROOT = os.path.dirname(DEMO)
sys.path.insert(0, HERE)

spec = importlib.util.spec_from_file_location("packvalidate", os.path.join(ROOT, "tools", "validate.py"))
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)
import savelib as S      # noqa: E402
import simulate as SIM   # noqa: E402

errors, warnings, notes = [], [], []
err, warn, ok = errors.append, warnings.append, notes.append


# 呼叫：main；demo 相對片段 → YAML 值，只讀資料，不修改來源。
def Y(*p):
    return yaml.safe_load(open(os.path.join(DEMO, *p), encoding="utf-8"))


# 呼叫：vector_contract；僅供既有 truncated_zlib 測資的表示無關比對。
# CRC、字元、解壓上限及未結束串流都必須正確；不把任意「會被拒絕」視為同一案例。
def truncated_zlib_payload(code):
    limits = S.integrity()["limits"]
    if len(code) > limits["max_code_chars"]:
        raise ValueError("truncated_zlib 代碼超過上限")
    match = re.fullmatch(re.escape(S.PREFIX) + r"([A-Za-z0-9_-]+)-([0-9a-fA-F]{8})", code)
    if not match:
        raise ValueError("truncated_zlib 必須是合法 RA1/base64url 外殼")
    body, crc = match.groups()
    if crc.lower() != "%08x" % (zlib.crc32((S.PREFIX + body).encode("ascii")) & 0xFFFFFFFF):
        raise ValueError("truncated_zlib 的 CRC 不符，未測到壓縮截斷")
    raw = base64.urlsafe_b64decode(body + "=" * (-len(body) % 4))
    decoder = zlib.decompressobj()
    payload = decoder.decompress(raw, limits["max_inflated_bytes"] + 1)
    if len(payload) > limits["max_inflated_bytes"] or decoder.unconsumed_tail:
        raise ValueError("truncated_zlib 解壓超過上限")
    if decoder.eof or decoder.unused_data or not payload:
        raise ValueError("truncated_zlib 必須能部分解壓且串流尚未結束")
    return payload


# 呼叫：main；測資 → 比對用副本，只有已證實為壓縮表示差異的截斷案例改比部分解壓 bytes。
# 其餘 code、名稱、原因、預期結論與結構仍精確比對；不修改測資或重新產生 golden 檔案。
def vector_contract(vectors):
    comparable = json.loads(json.dumps(vectors))
    for case in comparable["reject"]:
        if case["name"] == "truncated_zlib":
            case["code"] = truncated_zlib_payload(case["code"])
    return comparable


# 呼叫：CLI；無參數 → 程序退出，依區塊驗引用/時間/世界/存檔/統計/護欄與三種測資，會啟動參考子程序。
def main():
    cfg = Y("demo.yaml")
    ru = Y("import_rules.yaml")
    dd = Y("dialogue", "init_demo.yaml")
    D = V.load_all()
    if V.errors:
        for e in V.errors:
            err("資料包本身有錯：" + e)
    DI = V.dialogue_index(D)
    demo_nodes = {n["node"]: n for n in dd["nodes"]}

    # ---- 1. 引用
    quests = set(cfg["content"]["quick_tasks"])
    used_tasks, used_branches = set(), set()
    for seg in cfg["segments"]:
        for b in seg["beats"]:
            k, ref = b["kind"], b["ref"]
            if k == "say":
                npc, node = ref.split(".", 1)
                if npc == "init" and node.startswith("demo_"):
                    if node not in demo_nodes:
                        err("beat %s: 試玩對話 %s 不存在" % (b["id"], ref))
                elif (npc, node) not in DI:
                    err("beat %s: 對話 %s 不存在" % (b["id"], ref))
            elif k == "task":
                used_tasks.add(ref)
                if ref not in D["quests"]:
                    err("beat %s: 快題 %s 不存在" % (b["id"], ref))
            elif k == "branch":
                used_branches.add(ref)
                if ref not in D["branches"]:
                    err("beat %s: 分支 %s 不存在" % (b["id"], ref))
            if len(b["est"]) != 3 or not (b["est"][0] <= b["est"][1] <= b["est"][2]):
                err("beat %s: est 應為遞增的 [fast, median, slow]" % b["id"])
    if used_tasks != quests:
        err("快題清單與場景不一致：content=%s segments=%s" % (sorted(quests), sorted(used_tasks)))
    if used_branches != set(cfg["content"]["branches"]):
        err("分支清單與場景不一致")
    for n in dd["nodes"]:
        if n["node"] not in demo_nodes:
            err("對話節點重複")
        for key in ("goto", "next", "then"):
            t = n.get(key)
            if t and t not in demo_nodes:
                err("demo 對話 %s: %s=%s 不存在" % (n["node"], key, t))
        for c in n.get("choices", []):
            if c["say"] not in demo_nodes:
                err("demo 對話 %s: choice say %s 不存在" % (n["node"], c["say"]))
    ok("引用：%d 段、%d 個節拍；試玩專用對話 %d 節點" % (len(cfg["segments"]), sum(len(s["beats"]) for s in cfg["segments"]), len(dd["nodes"])))

    # ---- 2. 時間預算
    tot = [sum(b["est"][i] for s in cfg["segments"] for b in s["beats"]) for i in range(3)]
    bud = cfg["budget"]
    ok("時間預算（秒）：fast=%d median=%d slow=%d（上限 %d / %d / %d，另留探索 %d）" % (
        tot[0], tot[1], tot[2], bud["fast_seconds_max"], bud["median_seconds_max"], bud["slow_seconds_max"],
        bud["exploration_allowance_seconds"]))
    if tot[0] > bud["fast_seconds_max"]:
        err("fast 超出預算 %d > %d" % (tot[0], bud["fast_seconds_max"]))
    if tot[1] > bud["median_seconds_max"]:
        err("median 超出預算 %d > %d" % (tot[1], bud["median_seconds_max"]))
    if tot[2] > bud["slow_seconds_max"]:
        err("slow 超出預算 %d > %d" % (tot[2], bud["slow_seconds_max"]))
    if tot[1] + bud["exploration_allowance_seconds"] > cfg["hard_cap_minutes"] * 60:
        err("median + 探索時間超過硬上限")

    # ---- 3. 指令白名單
    wl = set(cfg["command_whitelist"])
    need = set()
    for q in quests:
        ref = D["quests"][q].get("reference")
        if ref:
            for seg in re.split(r"\|\||&&|;|\|", ref["cmd"]):
                tok = seg.strip().split(" ")[0]
                if tok:
                    need.add(tok)
    for b in used_branches:
        for e in D["branches"][b].get("exits", []):
            need.add(e["command"].split()[0])
    need |= {"systemctl", "ssh", "mail", "git", "rm", "ln", "sudo", "ask", "man", "finger", "close"}
    miss = sorted(need - wl)
    if miss:
        err("指令白名單缺少：%s" % miss)
    ok("指令白名單：%d 個，涵蓋劇本需要的 %d 個" % (len(wl), len(need)))

    # ---- 4. 發現與計分
    ids = [f["id"] for f in cfg["finds"]]
    if len(ids) != len(set(ids)):
        err("finds id 重複")
    if sum(f["points"] for f in cfg["finds"]) != cfg["max_find_points"]:
        err("max_find_points=%d，實際加總=%d" % (cfg["max_find_points"], sum(f["points"] for f in cfg["finds"])))
    for name, g in cfg["golden_paths"].items():
        for f in g.get("finds", []):
            if f not in ids:
                err("golden_path %s: 未知的發現 %s" % (name, f))
    tids = {t["id"] for t in cfg["titles"]}
    if set(cfg["title_priority"]) != tids:
        err("title_priority 與 titles 不一致")

    # ---- 5. 試玩規模日誌上的快題標準答案
    tmp = tempfile.mkdtemp(prefix="radm_")
    try:
        gen = os.path.join(tmp, "gen")
        o = cfg["content"]["chapters"]["ch1_teaser"]["generate_override"]
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "gen_logs.py"), "--out", gen,
                        "--lines-per-day", str(o["lines_per_day"]), "--days", str(o["days"]), "--seed", "5", "--npc"],
                       check=True, capture_output=True)
        man = json.load(open(os.path.join(gen, "manifest.json")))
        if man["n_lines"] > 6000:
            err("試玩版日誌過大：%d 行" % man["n_lines"])
        for chid, qs in (("ch0", [q for q in sorted(quests) if q.startswith("Q0")]),
                         ("ch1", [q for q in sorted(quests) if q.startswith("Q1")])):
            ch = D["chapters"][chid]
            root = os.path.join(tmp, "fs_" + chid)
            os.makedirs(root)
            V.materialize(ch, root, gen, {})
            home = os.path.join(root, ch["player_start"]["home"].lstrip("/"))
            os.makedirs(home, exist_ok=True)
            for q in qs:
                qq = D["quests"][q]
                ref = qq["reference"]
                cwd = home if ref["cwd"] == "~" else os.path.join(root, ref["cwd"].lstrip("/"))
                r = V.run(V.fsub(ref["cmd"], man), cwd, home, root)
                if not V.eval_check(qq["check"], ref["cmd"], r.stdout, man):
                    err("試玩規模：%s 的 reference 沒有通過 check" % q)
                for neg in qq.get("negative_references", []):
                    cwd2 = home if neg["cwd"] == "~" else os.path.join(root, neg["cwd"].lstrip("/"))
                    r2 = V.run(V.fsub(neg["cmd"], man), cwd2, home, root)
                    if V.eval_check(qq["check"], neg["cmd"], r2.stdout, man):
                        err("試玩規模：%s 的 negative reference 竟然通過" % q)
        ok("試玩規模日誌 %d 行：404=%d，最忙一天=%s，GC 探測=%d；Q0-*、Q1-1、Q1-3 標準答案通過" % (
            man["n_lines"], man["n404"], man["busiest_day"], man["n_gc"]))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # ---- 6. 匯入規則
    used, setf = V.check_flags(D)
    pack_flags = set(setf)
    for f in ru["carry"]["flags"]:
        if f not in pack_flags:
            err("匯入規則帶的旗標 %s 在資料包裡沒有任何地方會設定它" % f)
        if f.startswith("flag.demo."):
            err("試玩專用旗標不應被帶入正式版：%s" % f)
    for q in ru["carry"]["quests_done"]:
        if q not in D["quests"]:
            err("匯入規則的快題 %s 不存在" % q)
    for c in ru["carry"]["cards"]:
        if c not in D["cards"]:
            err("匯入規則的知識卡 %s 不存在" % c)
    declared = {c["id"] for ch in D["chapters"].values() for c in ch.get("checkpoints", [])}
    for c in ru["carry"]["checkpoints"] + [x["make"] for x in ru["carry"]["create_on_import"]]:
        if c not in declared:
            err("匯入規則的檢查點 %s 沒有宣告" % c)
    for f in sorted(pack_flags):   # 提醒：Ch0–1 會設定、但匯入時不帶的旗標（資訊用）
        pass
    demo_flags = set(re.findall(r"flag\.demo\.[a-z_]+", json.dumps(dd) + json.dumps(cfg) + json.dumps(ru)))
    ok("匯入規則：帶 %d 個旗標、%d 題、%d 張卡；試玩專用旗標 %s" % (
        len(ru["carry"]["flags"]), len(ru["carry"]["quests_done"]), len(ru["carry"]["cards"]), sorted(demo_flags)))

    # ---- 7. 存檔流程
    all_ok_flags = pack_flags | demo_flags
    for name in cfg["golden_paths"]:
        sv = SIM.build(name, nick="tester", seed=77)
        good, bad = S.verify_chain(sv)
        if not good:
            err("golden %s: 剛建立的存檔鏈就不通過 (index %s)" % (name, bad))
        st = S.fold(sv)
        unknown = sorted(f for f in st["flags"] if f not in all_ok_flags)
        if unknown:
            err("golden %s: 存檔出現資料包沒有的旗標 %s" % (name, unknown))
        if sv["commits"][-1]["r"] > cfg["hard_cap_minutes"] * 60 * 1000:
            err("golden %s: 超過硬上限" % name)
        code = S.export_code(sv)
        if len(code) > 1400:
            err("golden %s: 代碼太長 %d（目標 ≤ 1400）" % (name, len(code)))
        back = S.import_code(code)
        if [c["id"] for c in back["commits"]] != [c["id"] for c in sv["commits"]]:
            err("golden %s: 代碼來回後 commit 鏈不同" % name)
        if not S.verify_chain(back)[0]:
            err("golden %s: 代碼匯入後驗證失敗" % name)
        # 匯入正式版
        fg = S.to_fullgame(back)
        if any(f.startswith("flag.demo.") for f in fg["flags"]):
            err("golden %s: 匯入後仍有試玩專用旗標" % name)
        if fg["quests_done"] != ru["carry"]["quests_done"]:
            err("golden %s: Ch0 五題沒有全部帶入：%s" % (name, fg["quests_done"]))
        if "F1" not in fg["items"] or "K0" not in fg["cards"]:
            err("golden %s: F1 或 K0 沒有帶入" % name)
        want_ck = "flag.gc_name_heard" in st["flags"]
        if want_ck != ("ckpt/ch1-night" in fg["checkpoints"]):
            err("golden %s: ckpt/ch1-night 的建立條件不對" % name)
        if "badge.demo_first_night" not in fg["items"]:
            err("golden %s: 沒有拿到徽章" % name)
        if name != "slow" and not any("你在試玩時說過" in m for m in fg["memory"]):
            err("golden %s: 投票沒有進入 INIT 的記憶" % name)
        c = S.card(back, rank=3)
        if "op-tester" not in c:
            err("golden %s: 值班證缺暱稱" % name)
        sc = S.score(back)
        max_score = 7 * 10 + cfg["max_find_points"] * 5 + 20 + cfg["scoring"]["speed_bonus"]["under_seconds_600"]
        if sc["score"] > max_score:
            err("golden %s: 分數 %d 超過理論上限 %d" % (name, sc["score"], max_score))
        ok("golden %-6s 代碼 %4d 字元，%d 個 commit，%s，%d 分，稱號「%s」" % (
            name, len(code), len(sv["commits"]), S.fmt_time(sc["seconds"]), sc["score"], sc["title"]))
    # 竄改、截斷、貼錯
    sv = SIM.build("median", nick="tester", seed=77)
    code = S.export_code(sv)
    try:
        S.import_code(code[:-12])
        err("截斷的代碼竟然匯入成功")
    except S.CodeError:
        pass
    try:
        S.import_code(code[:30] + ("A" if code[30] != "A" else "B") + code[31:])
        err("改一個字元的代碼竟然匯入成功（CRC 應擋下）")
    except S.CodeError:
        pass
    try:
        S.import_code("hello")
        err("亂字串竟然匯入成功")
    except S.CodeError:
        pass
    pasted = "\n  ".join([code[i:i + 60] for i in range(0, len(code), 60)])
    if S.export_code(S.import_code(pasted)) != code:
        err("換行/空白的貼上沒有被容忍")
    # 改存檔檔案：把投票改掉但不重算雜湊 → unverified
    forged = json.loads(json.dumps(S.seal(sv)))
    for c in forged["commits"]:
        if c["kind"] == "choice":
            c["data"]["value"] = "block"
    if S.verify_chain(forged)[0]:
        err("竄改過的存檔檔案竟然通過鏈驗證")
    fg = S.to_fullgame(forged)
    if fg["verified"] != "unverified" or "badge.demo_first_night" in fg["items"]:
        err("未驗證的存檔不該拿到徽章")
    # 重新計算雜湊但不改 head（只在代碼層級能做到）→ head 對不上
    fake = S.new_save("evil", 1)
    for c in sv["commits"][:5]:
        S.add_commit(fake, c["kind"], c["data"], c["r"], c["t"])
    fake["head"] = sv["commits"][-1]["id"]
    if S.verify_chain(fake)[0]:
        err("head 對不上的存檔竟然通過驗證")
    ok("存檔：截斷、改字元、亂字串都會被擋；換行貼上可容忍；竄改的存檔檔案會標記 unverified 且不給徽章")

    # ---- 8. 活動統計
    saves = SIM.crowd(60, seed=3)
    summ, rank = S.aggregate([S.import_code(S.export_code(s)) for s in saves])
    if summ["players"] != 60 or summ["completed"] + summ["time_up"] != 60:
        err("統計人數對不上：%s" % summ)
    if summ["vote_block"] + summ["vote_pass"] != sum(1 for r in rank if r["vote"]):
        err("投票數與完成數對不上")
    if [r["score"] for r in rank] != sorted([r["score"] for r in rank], reverse=True):
        err("排行榜沒有依分數排序")
    ok("活動統計：60 位合成玩家 → 完成率 %.0f%%，中位數 %s，block/pass = %d/%d，要用完整提示的比例 %.0f%%" % (
        summ["completion_rate"] * 100, S.fmt_time(int(summ["median_seconds_completed"])),
        summ["vote_block"], summ["vote_pass"], summ["full_hint_rate"] * 100))

    # ---- 9. 劇透護欄（試玩版玩家看得到的文字）
    vis = []
    for n in dd["nodes"]:
        vis += [l.get("text", "") for l in n.get("lines", [])]
    vis.append(cfg["pitch"])
    for s, why in V.FORBIDDEN:
        if any(s in t for t in vis):
            err("試玩版劇透護欄：含「%s」（%s）" % (s, why))
    ok("劇透護欄：試玩版文字通過")

    # ---- 10. 跨語言測資（Python 參考實作必須通過自己產生的測資）
    try:
        import testvectors as TV
        vp = os.path.join(S.DEMO, "testvectors", "vectors.json")
        VV = json.load(open(vp, encoding="utf-8"))
        for e in TV.check(VV):
            err("測資：" + e)
        # 保留重建確定性與全部欄位檢查，只排除已驗證的壓縮表示差異。
        rebuilt = TV.build()
        for e in TV.check(rebuilt):
            err("重建測資：" + e)
        if rebuilt != json.loads(json.dumps(TV.build())):
            err("testvectors.build() 重建不確定或不是穩定的 JSON 結構")
        if vector_contract(rebuilt) != vector_contract(VV):
            err("testvectors/vectors.json 與重建的內容或預期結論不符；請先檢查資料與工具差異")
        elif rebuilt != VV:
            ok("跨語言測資新鮮度：僅 truncated_zlib 壓縮表示不同；各自 CRC 正確，截斷狀態與部分解壓 bytes 相同")
        ok("跨語言測資：接受 %d／可疑 %d／必拒 %d 全部符合" % (len(VV["accept"]), len(VV["suspicious"]), len(VV["reject"])))
    except Exception as e:  # noqa
        err("跨語言測資無法執行：%s" % e)

    # ---- 11. 引擎一致性測資（真 bash 重跑必須與檔案一致）
    try:
        import subprocess as _sp
        r = _sp.run([sys.executable, "-X", "utf8", os.path.join(S.HERE, "make_conformance.py"), "check"], capture_output=True, text=True, encoding="utf-8", timeout=300)
        if r.returncode != 0:
            err("一致性測資與真 bash 重跑不符（先檢查參考工具與平台差異）：" + (r.stdout + r.stderr).strip()[-300:])
        else:
            CC = json.load(open(os.path.join(S.DEMO, "testvectors", "conformance.json"), encoding="utf-8"))
            ok("引擎一致性測資：%d 個指令案例（真 bash 重跑一致）、%d 個快題判定" % (len(CC["cases"]), len(CC["quests"])))
            for line in r.stdout.splitlines():
                if line.startswith("Bash provenance:"):
                    ok(line)
    except Exception as e:  # noqa
        err("一致性測資無法執行：%s" % e)

    # ---- 12. 流程規格（flow.yaml）：靜態檢查 + 參考模擬器走完所有走法
    try:
        import validate_flow as VF
        fe, fn = VF.check()
        for e_ in fe:
            err("流程：" + e_)
        for n_ in fn:
            ok(n_)
        import flow_sim as FSM
        wp = os.path.join(S.DEMO, "testvectors", "walkthrough.json")
        r = _sp.run([sys.executable, "-X", "utf8", os.path.join(S.HERE, "flow_sim.py"), "check"], capture_output=True, text=True, encoding="utf-8", timeout=300)
        if r.returncode != 0:
            err("流程走法測資與參考模擬器重跑不符：" + (r.stdout + r.stderr).strip()[-300:])
        else:
            ok("流程走法測資（walkthrough.json、expr.json）與參考模擬器重跑一致")
    except Exception as e:  # noqa
        err("流程檢查無法執行：%s" % e)

    for m in notes:
        print("  ok   " + m)
    for m in warnings:
        print("  WARN " + m)
    for m in errors:
        print("  FAIL " + m)
    print("\n結果：%d 項錯誤，%d 項警告" % (len(errors), len(warnings)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
