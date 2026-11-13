#!/usr/bin/env python3
# 存檔 QA 測資工具；依賴 savelib.py、simulate.py 與其 YAML，給 JS save.test.mjs 跨語言對照。
# build/check 只回傳資料或錯誤清單；CLI make 才覆寫 vectors.json；壓縮差異不當成語意失敗。
"""
跨語言對照測資。Python 的 savelib.py 是參考實作；前端（JavaScript）要對同一份測資給出同樣的結果。

  python3 tools/testvectors.py make    # 重新產生 testvectors/vectors.json
  python3 tools/testvectors.py check   # 用 Python 參考實作重跑一次（確認測資自己沒壞）

比對的是「解出來的結構與結論」，不是壓縮後的位元組：
  zlib 在不同實作（Python / pako / CompressionStream）壓出來的位元組本來就可能不同，
  所以 JS 匯出的代碼與 Python 的代碼不會逐字相同，這是正常的。要求是：互相讀得懂。
"""
import base64
import copy
import json
import os
import random
import sys
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import savelib as S        # noqa: E402
import simulate as SIM     # noqa: E402

OUT = os.path.join(S.DEMO, "testvectors", "vectors.json")


# 呼叫：build 異常案例；packed/可選原始 bytes → CRC 正確的 RA1，故意繞過安全形狀檢查，不作正式匯出。
def enc(packed, raw_override=None):
    """把任意 packed 物件編成『CRC 正確』的代碼，這樣被擋下的原因就不是 CRC。"""
    raw = raw_override if raw_override is not None else zlib.compress(S.canonical(packed).encode("utf-8"), 9)
    b = base64.urlsafe_b64encode(raw).decode().rstrip("=")
    return "%s%s-%s" % (S.PREFIX, b, "%08x" % (zlib.crc32((S.PREFIX + b).encode()) & 0xFFFFFFFF))


# 呼叫：build；黃金路線名 → 固定暱稱/種子的合成 save，無檔案副作用。
def golden(name):
    return SIM.build(name, nick="zien", seed=5)


# 呼叫：build/check/JS 互通子程序；save → 完整預期欄位 dict，唯讀計分/分級/正式版投影。
def expect_of(sv):
    lv, why = S.level(sv)
    sc = S.score(sv)
    st = S.fold(sv)
    return {
        "nick": sv["nick"], "seed": sv["seed"], "n_commits": len(sv["commits"]),
        "head": sv["commits"][-1]["id"], "first_id": sv["commits"][0]["id"],
        "level": lv, "level_reasons": why,
        "score": sc["score"], "title_id": sc["title_id"], "seconds": sc["seconds"],
        "tasks": st["tasks"], "finds": st["finds"], "vote": st["vote"],
        "full_hint": sc["full_hint"], "time_up": sc["time_up"],
        "fullgame": S.to_fullgame(sv),
    }


# 呼叫：CLI make/validate_demo；無參數 → 正常/可疑/必拒/竄改測資，僅改局部副本與各 save.head。
def build():
    V = {"note": "vectors.json：由 tools/testvectors.py make 產生。請勿手改。", "schema": 1}

    # 1. 規範化與 commit id
    canon = []
    for body, parent in [
        ({"branch": "main", "chapter": "ch0", "kind": "flag", "data": {"name": "flag.mail_read"}, "t": 0, "r": 1200}, None),
        ({"branch": "alt/sandbox", "chapter": "ch0", "kind": "merge", "data": {"mode": "knowledge", "card": "K0"}, "t": 64, "r": 400000}, "0a1b2c3d"),
        ({"branch": "main", "chapter": "ch1", "kind": "hint", "data": {"n": 3, "full": True}, "t": 9, "r": 5}, "ffffffff"),
    ]:
        canon.append({"parent": parent, "body": body, "canonical": S.canonical(body), "id": S.commit_id(parent, body),
                      "rule": "id = sha256_hex(utf8((parent or '') + canonical(body)))[:8]；canonical = 鍵依 Unicode 排序、無空白的 JSON"})
    V["canonical_and_id"] = canon
    V["crc32"] = [{"text": t, "crc32_hex8": "%08x" % (zlib.crc32(t.encode()) & 0xFFFFFFFF)}
                  for t in ["RA1-", "RA1-abc", "RA1-eNqNVU2T4jYQ_S86G1bftjnllMuekuvWlkrYAivYFpHFzG6m5r-nWwZmx5hUiguCp36vX3_ojTRk9-0bOfT2SArSuiFsp2Rjci0pFC8E1ZoW8Ple3EGD"]]

    # 2. 可接受
    acc = []
    for nm in ("fast", "median", "slow", "digger"):
        sv = golden(nm)
        acc.append({"name": "golden_" + nm, "code": S.export_code(sv), "expect": expect_of(sv)})
    rng = random.Random(77)
    for i, sv in enumerate(SIM.crowd(4, seed=9)):
        acc.append({"name": "crowd_%d" % i, "code": S.export_code(sv), "expect": expect_of(sv)})
    # 空白與換行容忍
    c0 = acc[0]["code"]
    acc.append({"name": "golden_fast_with_whitespace", "code": c0[:100] + "\n  " + c0[100:300] + "\r\n" + c0[300:] + "\n",
                "expect": acc[0]["expect"]})
    V["accept"] = acc

    # 3. 可疑（接受，但 level=suspicious）
    sus = []
    sv = golden("fast")
    # too_fast：把 r 全部壓縮到 100 秒內
    sv2 = S.new_save("speedy", 5, event="demo-event-1")
    for i, c in enumerate(sv["commits"]):
        S.add_commit(sv2, c["kind"], c["data"], int(c["r"] * 100 / (sv["commits"][-1]["r"] / 1000) / 1000 * 1000 / 1000), c["t"], chapter=c["chapter"], branch=c["branch"])
    sus.append({"name": "too_fast", "code": S.export_code(sv2), "expect": expect_of(sv2), "reasons": ["too_fast"]})
    # task_order：Q0-2 在 Q0-1 之前
    sv3 = S.new_save("shuffle", 5)
    for i, (k, d) in enumerate([("task", {"id": "Q0-2"}), ("task", {"id": "Q0-1"}), ("end", {"time_up": True})]):
        S.add_commit(sv3, k, d, 1000 * (i + 1), i)
    sus.append({"name": "task_order", "code": S.export_code(sv3), "expect": expect_of(sv3), "reasons": ["task_order"]})
    # vote_before_night
    sv4 = S.new_save("early", 5)
    for i, (k, d) in enumerate([("task", {"id": "Q0-1"}), ("choice", {"id": "vote", "value": "block"}), ("end", {"time_up": False})]):
        S.add_commit(sv4, k, d, 100000 * (i + 1), i)
    sus.append({"name": "vote_before_night", "code": S.export_code(sv4), "expect": expect_of(sv4), "reasons": ["vote_before_night"]})
    V["suspicious"] = sus

    # 4. 必須拒絕
    base = S.pack(golden("median"))
    good = S.export_code(golden("median"))
    rej = []

    # 呼叫：必拒案例宣告；名稱/代碼/原因 → None，附加局部 rej，不測結果也不改來源。
    def R(name, code, why):
        rej.append({"name": name, "code": code, "why": why})

    R("not_a_code", "hello", "不是 RA1- 開頭")
    R("wrong_prefix", "RB1-abc-00000000", "前綴錯")
    R("crc_bad_char", good[:40] + ("A" if good[40] != "A" else "B") + good[41:], "改一個字元，CRC 不符")
    R("truncated", good[:-12], "截斷")
    R("empty_body", "RA1--" + "%08x" % (zlib.crc32(b"RA1-") & 0xFFFFFFFF), "沒有本體（CRC 正確）")
    R("illegal_chars", enc(None, raw_override=b"x").replace("RA1-", "RA1-*+/") if False else "RA1-ab*cd-" + "%08x" % (zlib.crc32(b"RA1-ab*cd") & 0xFFFFFFFF), "含非 base64url 字元（CRC 正確）")
    R("too_long", "RA1-" + "A" * 9000 + "-" + "%08x" % (zlib.crc32(("RA1-" + "A" * 9000).encode()) & 0xFFFFFFFF), "超過 8000 字元")
    R("zip_bomb", enc(None, raw_override=zlib.compress(S.canonical(base).encode() + b" " * 5_000_000, 9)), "本體是合法存檔，後面補 5 MB 空白：沒有解壓上限就會被接受（代碼本身 < 8000 字元）")
    R("not_json", enc(None, raw_override=zlib.compress(b"not json at all")), "解開後不是 JSON")
    R("not_zlib", enc(None, raw_override=b"this is not zlib data"), "不是 zlib 資料")
    R("truncated_zlib", enc(None, raw_override=zlib.compress(S.canonical(base).encode())[:-6]), "壓縮資料被截斷（但 CRC 對）")

    # 呼叫：單欄變異案例；突變 callback → 代碼，先 deepcopy base，再改副本編碼，避免案例互相污染。
    def mut(fn):
        o = copy.deepcopy(base)
        fn(o)
        return enc(o)

    R("float_time", mut(lambda o: o["c"][3].__setitem__(2, 1.5)), "時間欄位是浮點數")
    R("nick_xss", mut(lambda o: o["m"].__setitem__("nick", "<b>x</b>")), "暱稱含 HTML")
    R("nick_too_long", mut(lambda o: o["m"].__setitem__("nick", "a" * 13)), "暱稱 13 字")
    R("seed_negative", mut(lambda o: o["m"].__setitem__("seed", -1)), "種子為負")
    R("seed_huge", mut(lambda o: o["m"].__setitem__("seed", 2 ** 32)), "種子超過 32 位元")
    R("unknown_meta_key", mut(lambda o: o["m"].__setitem__("evil", 1)), "meta 有不認得的鍵")
    R("wrong_game", mut(lambda o: o["m"].__setitem__("game", "other")), "game 不符")
    R("unknown_kind", mut(lambda o: o["c"][0].__setitem__(0, "exec")), "commit 種類不在清單")
    R("unknown_task_id", mut(lambda o: [r for r in o["c"] if r[0] == "task"][0].__setitem__(1, {"id": "Q9-9"})), "任務 id 不在清單")
    R("extra_data_key", mut(lambda o: [r for r in o["c"] if r[0] == "task"][0].__setitem__(1, {"id": "Q0-1", "x": 1})), "data 多一個鍵")
    R("bad_flag_name", mut(lambda o: [r for r in o["c"] if r[0] == "flag"][0].__setitem__(1, "A B<script>")), "旗標名不合規則")
    R("bad_vote_value", mut(lambda o: [r for r in o["c"] if r[0] == "choice"][0].__setitem__(1, {"id": "vote", "value": "both"})), "投票值不合規則")
    R("time_backwards", mut(lambda o: o["c"][5].__setitem__(3, -1)), "r 倒退（差 1 毫秒）")
    R("r_too_large", mut(lambda o: o["c"][5].__setitem__(3, 10 ** 9)), "r 超過 45 分鐘")
    R("end_not_last", mut(lambda o: o["c"].insert(2, ["end", {"time_up": False}, 1, 1, 0, 0])), "end 不是最後一個")
    R("too_many_commits", mut(lambda o: o["c"].__setitem__(slice(1, 1), [["flag", "mail_read", 0, 0, 0, 0]] * 401)), "超過 400 個 commit（其餘都合法；沒有數量上限就會被接受）")
    R("bad_branch", mut(lambda o: o["c"][0].__setitem__(4, "../../etc")), "分支名不合規則")
    R("bad_chapter", mut(lambda o: o["c"][0].__setitem__(5, "ch9")), "章節不在清單")
    deep = {"a": 1}
    for _ in range(10):
        deep = {"a": deep}
    R("deep_nesting", mut(lambda o: [r for r in o["c"] if r[0] == "task"][0].__setitem__(1, deep)), "data 巢狀過深／欄位不符")
    V["reject"] = rej

    # 5. 竄改後的存檔「檔案」（JSON）：形狀合法但雜湊鏈對不上 → 接受，level=broken，不給徽章
    f = golden("median")
    f = json.loads(json.dumps(f))
    for c in f["commits"]:
        if c["kind"] == "choice":
            c["data"]["value"] = "block"
    S.seal  # noqa
    V["file_tampered"] = {"name": "file_vote_flipped", "file": f,
                          "expect": {"level": "broken", "verified": "unverified", "badge": False}}
    return V


# 呼叫：CLI/validate_demo；測資物件 → 錯誤字串清單，跑參考編解碼/分級/投影，不重寫測資。
def check(V):
    errs = []
    for c in V["canonical_and_id"]:
        if S.canonical(c["body"]) != c["canonical"] or S.commit_id(c["parent"], c["body"]) != c["id"]:
            errs.append("canonical/id：" + c["canonical"][:40])
    for c in V["crc32"]:
        if "%08x" % (zlib.crc32(c["text"].encode()) & 0xFFFFFFFF) != c["crc32_hex8"]:
            errs.append("crc32")
    for a in V["accept"] + V["suspicious"]:
        try:
            sv = S.import_code(a["code"])
        except S.CodeError as e:
            errs.append("應接受卻被擋：%s（%s）" % (a["name"], e))
            continue
        got = expect_of(sv)
        if got != a["expect"]:
            diff = [k for k in got if got[k] != a["expect"].get(k)]
            errs.append("結論不符：%s %s" % (a["name"], diff))
        if "reasons" in a and got["level_reasons"] != a["reasons"]:
            errs.append("可疑原因不符：%s" % a["name"])
        if a in V["accept"] and got["level"] != "intact":
            errs.append("應為 intact：%s" % a["name"])
    for r in V["reject"]:
        try:
            S.import_code(r["code"])
            errs.append("應拒絕卻被接受：%s（%s）" % (r["name"], r["why"]))
        except S.CodeError:
            pass
        except Exception as e:  # noqa
            errs.append("拒絕方式不乾淨（丟出 %s）：%s" % (type(e).__name__, r["name"]))
    ft = V["file_tampered"]
    S.check_shape(ft["file"])
    fg = S.to_fullgame(ft["file"])
    if S.level(ft["file"])[0] != "broken" or fg["verified"] != "unverified" or "badge.demo_first_night" in fg["items"]:
        errs.append("竄改的檔案應為 broken 且無徽章")
    return errs


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "make":
        V = build()
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(V, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
        print("寫入", OUT, "（accept %d / suspicious %d / reject %d）" % (len(V["accept"]), len(V["suspicious"]), len(V["reject"])))
    V = json.load(open(OUT, encoding="utf-8"))
    errs = check(V)
    for e in errs:
        print("FAIL", e)
    print("測資：%d 項錯誤" % len(errs))
    sys.exit(1 if errs else 0)
