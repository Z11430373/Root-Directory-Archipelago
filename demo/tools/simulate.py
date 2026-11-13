#!/usr/bin/env python3
# 存檔/活動統計的合成資料工具；依賴 savelib.py、demo.yaml 的 golden_paths/segments/finds。
# 只合成事件、不執行 Shell 或證明玩家實際流程；輸出供 testvectors.py、validate_demo.py 與 CLI。
# import 時讀設定，build/crowd 回傳記憶體存檔，main 僅寫 stdout，不自動產生檔案。
"""
假玩家：依 demo.yaml 的 golden_paths 產生存檔，用來測存檔／匯入／統計，不需要真人試玩。
  python3 simulate.py golden fast         # 印出該黃金路徑的存檔代碼與值班證
  python3 simulate.py crowd 40            # 產生 40 位合成玩家，輸出活動統計
"""
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import savelib as S  # noqa: E402

CFG = S.demo_cfg()
SEG_WEIGHT = [sum(b["est"][1] for b in seg["beats"]) for seg in CFG["segments"]]


# 呼叫：CLI/測資/驗證器/crowd；路線名或設定/身份/種子/RNG → 新 save，推進傳入 RNG 但不寫檔。
# 事件先依段落排序再配置時間；它與 flow_sim.run_walk 的逐指令重播不同，不能拿來驗 Shell 行為。
def build(path_name_or_cfg, nick="zien", seed=5, rng=None):
    cfg = CFG["golden_paths"][path_name_or_cfg] if isinstance(path_name_or_cfg, str) else path_name_or_cfg
    rng = rng or random.Random(seed)
    total_ms = cfg["seconds"] * 1000
    time_up = cfg.get("time_up", False)
    finds = list(cfg.get("finds", []))
    sv = S.new_save(nick, seed, event="demo-event-1")

    # 事件清單：(段落索引, kind, data)
    ev = []
    A = lambda seg, k, d: ev.append((seg, k, d))   # noqa: E731
    A(0, "flag", {"name": "flag.demo.started"})
    A(0, "flag", {"name": "flag.mail_read"})
    A(1, "task", {"id": "Q0-1"})
    A(1, "task", {"id": "Q0-2"}); A(1, "flag", {"name": "flag.handbook_read"}); A(1, "flag", {"name": "flag.charter_summary_read"})
    A(1, "task", {"id": "Q0-3"}); A(1, "flag", {"name": "flag.draft_found"})
    A(1, "task", {"id": "Q0-4"}); A(1, "flag", {"name": "flag.lin_stopped_lamp"})
    A(2, "task", {"id": "Q0-5"}); A(2, "flag", {"name": "flag.f1"}); A(2, "item", {"id": "F1"})
    A(2, "flag", {"name": "flag.draft_read"})
    A(3, "flag", {"name": "flag.lamp_lit"}); A(3, "flag", {"name": "flag.cat_working"}); A(3, "flag", {"name": "flag.map_seen"})
    A(3, "checkpoint", {"id": "ckpt/ch0-lamp"})
    A(4, "branch.enter", {"name": "alt/sandbox", "from": "ckpt/ch0-lamp"})
    A(4, "flag", {"name": "flag.b0.lost0_created"}); A(4, "flag", {"name": "flag.b0.read_lost0"})
    A(4, "merge", {"mode": "knowledge", "card": "K0"}); A(4, "card", {"id": "K0"}); A(4, "flag", {"name": "flag.k0"})
    A(4, "branch.exit", {"mode": "merge"}); A(4, "flag", {"name": "flag.b0.done"})
    A(4, "flag", {"name": "flag.ch0_done"}); A(4, "checkpoint", {"id": "ckpt/ch0-end"})
    A(5, "flag", {"name": "flag.met_harbor"})
    A(5, "task", {"id": "Q1-1"})
    if not time_up:
        A(5, "task", {"id": "Q1-3"}); A(5, "flag", {"name": "flag.q1_3_done"}); A(5, "flag", {"name": "flag.gc_name_heard"})
        A(5, "checkpoint", {"id": "ckpt/ch1-night"})
    if cfg.get("vote"):
        A(6, "choice", {"id": "vote", "value": cfg["vote"]})
        A(6, "flag", {"name": "flag.demo.vote_" + cfg["vote"]})
    # 發現
    fseg = {"jar": 1, "cat": 3, "ticket1": 1, "history": 2, "sudo": 1, "relic": 2, "sandwich": 1, "finger": 5,
            "harbor_cat": 5, "error_log": 5, "rm_main": 3, "rm_branch": 4}
    for f in finds:
        A(fseg[f], "find", {"id": f})
        if f == "sudo":
            A(fseg[f], "flag", {"name": "flag.sudo_warned"})
        if f == "relic":
            A(fseg[f], "item", {"id": "R0"})
        if f == "ticket1":
            A(fseg[f], "flag", {"name": "flag.first_night_read"})
        if f == "harbor_cat":
            A(fseg[f], "flag", {"name": "flag.heard_cat"})
    for h in range(cfg.get("hints", 0)):
        A(1 + h, "hint", {"n": 1, "full": h == cfg["hints"] - 1 and cfg["hints"] >= 3})
    ev.sort(key=lambda e: e[0])

    # 時間：依段落權重分配，段內等距 + 小抖動
    wsum = sum(SEG_WEIGHT)
    seg_start, acc = [], 0
    for w in SEG_WEIGHT:
        seg_start.append(acc)
        acc += w
    cur_by_seg = {}
    t_world = 0
    for seg, k, d in ev:
        n_in = sum(1 for e in ev if e[0] == seg)
        i = cur_by_seg.get(seg, 0)
        cur_by_seg[seg] = i + 1
        frac = (seg_start[seg] + SEG_WEIGHT[seg] * (i + 1) / (n_in + 1)) / wsum
        r = int(total_ms * frac * (0.98 if not time_up else 0.92)) + rng.randint(0, 400)
        r = max(r, (S_last(sv) + 50))
        t_world += rng.randint(20, 90)
        ch = "ch1" if seg >= 5 else "ch0"
        br = "alt/sandbox" if (seg == 4 and k in ("flag", "merge", "card") and d.get("name", "").startswith("flag.b0.") and "done" not in d.get("name", "")) else "main"
        S.add_commit(sv, k, d, r, t_world, chapter=ch, branch=br)
    S.add_commit(sv, "end", {"time_up": time_up}, total_ms, t_world + 30, chapter="ch1")
    return sv


# 呼叫：build 時間配置；save → 最後 r 或 0，唯讀以確保下一事件時間遞增。
def S_last(sv):
    return sv["commits"][-1]["r"] if sv["commits"] else 0


# 呼叫：CLI/驗證/測資；人數/種子 → 合成存檔陣列，局部 RNG 決定行為，不代表真實研究統計。
def crowd(n, seed=1):
    rng = random.Random(seed)
    all_finds = [f["id"] for f in CFG["finds"]]
    saves = []
    for i in range(n):
        r = rng.random()
        if r < 0.12:
            cfg = {"seconds": 900, "time_up": True, "vote": rng.choice([None, "pass", "block"]), "hints": rng.choice([2, 3]), "finds": []}
        elif r < 0.30:
            cfg = {"seconds": rng.randint(380, 560), "vote": rng.choice(["block", "pass"]), "hints": 0,
                   "finds": rng.sample(all_finds, rng.randint(0, 4))}
        else:
            cfg = {"seconds": rng.randint(600, 880), "vote": rng.choice(["block", "block", "pass"]),
                   "hints": rng.choice([0, 1, 1, 2, 3]), "finds": rng.sample(all_finds, rng.randint(0, 7))}
        nick = "p%02d" % i
        saves.append(build(cfg, nick=nick, seed=1000 + i, rng=random.Random(seed * 100 + i)))
    return saves


# 呼叫：CLI；golden/crowd 參數 → None，印代碼/值班證或使用說明，不寫磁碟。
def main():
    if len(sys.argv) >= 3 and sys.argv[1] == "golden":
        sv = build(sys.argv[2])
        print(S.export_code(sv))
        print()
        print(S.card(sv, rank=7))
    elif len(sys.argv) >= 3 and sys.argv[1] == "crowd":
        saves = crowd(int(sys.argv[2]))
        for s in saves:
            print(S.export_code(s))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
