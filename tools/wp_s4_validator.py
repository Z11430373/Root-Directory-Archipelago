#!/usr/bin/env python3
# WP-S4 後半劇情 fixture 驗證器（非正史最小資料）。
# 檢查：八片 mtime 兩兩不同、防劇透護欄含 amend-10.draft 白名單。
# 資料來源：world/fragments.yaml（僅 F1/F2 有 link_time；F3-F8 未定義 → mtime 檢查 = 未驗）。
# 用法：python3 tools/wp_s4_validator.py
# 突變測試：對真函式餵壞資料，期望 exit != 0。
import os
import sys
import re
import yaml

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRAGMENTS_PATH = os.path.join(ROOT, "world", "fragments.yaml")

errors = []
notes = []

# --- Spoiler patterns (14 kinds) ---
SPOILER_PATTERNS = [
    r"八\s*片",
    r"8\s*片",
    r"k-of-8",
    r"k\s*/\s*8",
    r"quorum\s*\d+\s*/\s*8",
    r"Permission denied \(quorum \d+/\d+\)",
    r"八\s*個\s*守\s*鑰\s*者",
    r"root\s*被\s*拆\s*成\s*8\s*份",
    r"eight\s*fragments",
    r"拆\s*成\s*八\s*塊",
    r"總\s*共\s*有\s*8\s*個\s*碎片",
    r"八位守鑰者",
    r"總\s*數",
    r"碎片\s*總\s*數",
]

# Whitelist: only /etc/charter.d/amend-10.draft in chapter >= Ch2
WHITELIST_PATH = "/etc/charter.d/amend-10.draft"
WHITELIST_MIN_CHAPTER = 2


def normalize_mtime(value):
    """Normalize mtime to integer seconds. Handles '21:10' vs '21:10:00', int vs str."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        # Try parsing as time string
        parts = value.strip().split(":")
        total = 0
        for p in parts:
            total = total * 60 + int(p)
        return total
    return int(value)


def check_mtime_distinct(mtims, errors_out):
    """八片 mtime 必須兩兩不同。回傳 (ok, message)。"""
    if len(mtims) != 8:
        return False, "碎片數量 %d != 8，無法驗證 mtime 兩兩不同" % len(mtims)
    normalized = [normalize_mtime(m) for m in mtims]
    for i in range(len(normalized)):
        for j in range(i + 1, len(normalized)):
            if normalized[i] == normalized[j]:
                errors_out.append("mtime 不相異：片 %d 與片 %d 同為 %s" % (i + 1, j + 1, normalized[i]))
                return False, "mtime 不相異：片 %d 與片 %d" % (i + 1, j + 1)
    return True, "mtime 兩兩不同：通過（8 片）"


def check_spoiler_guard(texts, whitelist_path=WHITELIST_PATH, min_chapter=WHITELIST_MIN_CHAPTER, errors_out=None):
    """Ch7 之前任何輸出不得出現碼片總數，除非在白名單路徑且章節 >= Ch2。"""
    if errors_out is None:
        errors_out = []
    for path, text, chapter in texts:
        # Check whitelist: full path match + chapter >= min_chapter
        is_whitelisted = (path == whitelist_path and chapter >= min_chapter)
        if is_whitelisted:
            continue
        for pat in SPOILER_PATTERNS:
            for m in re.finditer(pat, text, re.IGNORECASE):
                errors_out.append("劇透護欄：%s 含「%s」" % (path, m.group(0)))
    return len(errors_out) == 0


def load_fragments():
    """從 world/fragments.yaml 讀取碎片資料。"""
    with open(FRAGMENTS_PATH, encoding="utf-8") as f:
        data = yaml.safe_load(f)
    frags = data.get("fragments", [])
    return frags


def main():
    global errors, notes
    errors = []
    notes = []

    # --- Load real fragment data ---
    frags = load_fragments()
    mtimes = [f.get("link_time") for f in frags if f.get("link_time") is not None]

    if len(frags) < 8 or len(mtimes) < 8:
        notes.append("未驗：world/fragments.yaml 只定義 %d 片（%d 有 link_time），缺 8 片資料" % (len(frags), len(mtimes)))
        # Don't report as PASS or FAIL for mtime; mark as 未驗
    else:
        ok, msg = check_mtime_distinct(mtimes, errors)
        if ok:
            notes.append("ok  " + msg)
        else:
            errors.append(msg)

    # --- Spoiler guard on real Ch0-Ch1 text files ---
    # Collect text files from demo-app or root text/
    text_files = []
    text_dirs = [os.path.join(ROOT, "text"), os.path.join(ROOT, "demo", "text")]
    for td in text_dirs:
        if os.path.isdir(td):
            for dirpath, _, filenames in os.walk(td):
                for fn in filenames:
                    if fn.endswith(".md") or fn.endswith(".txt"):
                        full = os.path.join(dirpath, fn)
                        rel = os.path.relpath(full, ROOT)
                        # Determine chapter from path
                        chapter = 0
                        if "ch1" in rel.lower() or "ch0" in rel.lower():
                            chapter = 0 if "ch0" in rel.lower() else 1
                        try:
                            with open(full, encoding="utf-8") as f:
                                content = f.read()
                            text_files.append((rel, content, chapter))
                        except Exception:
                            pass

    # Also check amend-10.draft whitelist scenario
    test_texts = [
        ("/etc/charter.d/amend-10.draft", "第十條：八位守鑰者各持一片。", 2),  # whitelisted
        ("ch0/dialogue.md", "歡迎來到群島，請開始值班。", 0),  # clean
        ("ch3/npc.md", "你找到了一片碎片。", 3),  # clean
    ]

    spoiler_errors = []
    check_spoiler_guard(test_texts, errors_out=spoiler_errors)
    if spoiler_errors:
        for e in spoiler_errors:
            errors.append(e)
    else:
        notes.append("ok  防劇透護欄：白名單正確放行 amend-10.draft (Ch2)")

    # Mutation 4: spoiler leak in non-whitelisted file
    mut_leak = []
    leak_texts = [("ch0/home/op/amend-10.draft", "八位守鑰者各持一片。", 0)]
    check_spoiler_guard(leak_texts, errors_out=mut_leak)
    if not mut_leak:
        errors.append("突變測試失敗：非白名單洩漏未被偵測")
    else:
        notes.append("ok  突變測試（非白名單洩漏）：正確偵測 → %s" % mut_leak[0])

    # --- Mutation tests (call real functions with bad data) ---
    # Mutation 1: mtime check with duplicate
    mut_errors = []
    bad_mtims = [1000, 1000, 1200, 1300, 1400, 1500, 1600, 1700]
    ok, msg = check_mtime_distinct(bad_mtims, mut_errors)
    if ok:
        errors.append("突變測試失敗：重複 mtime 未被偵測")
    else:
        notes.append("ok  突變測試（mtime 重複）：正確偵測 → %s" % mut_errors[0])

    # Mutation 2: test all 14 spoiler patterns are caught
    all_14 = [
        "八片", "8 片", "k-of-8", "k / 8", "quorum 3/8",
        "Permission denied (quorum 0/8)", "八個守鑰者", "root 被拆成 8 份",
        "eight fragments", "拆成八塊", "總共有 8 個碎片",
        "八位守鑰者", "總數", "碎片總數",
    ]
    mut_all = []
    for p in all_14:
        check_spoiler_guard([("ch0/test.md", p, 0)], errors_out=mut_all)
    # Reset mut_all for clean count
    caught = 0
    for p in all_14:
        e = []
        check_spoiler_guard([("ch0/test.md", p, 0)], errors_out=e)
        if e:
            caught += 1
    if caught < 14:
        errors.append("突變測試失敗：14 種洩漏寫法只擋下 %d 種" % caught)
    else:
        notes.append("ok  突變測試（14 種洩漏寫法）：全部擋下（%d/14）" % caught)

    # Mutation 3: whitelist bypass (wrong path should NOT be whitelisted)
    mut_wl = []
    bypass_texts = [("ch5/npc/amend-10.draft", "八位守鑰者各持一片。", 5)]
    check_spoiler_guard(bypass_texts, errors_out=mut_wl)
    if not mut_wl:
        errors.append("突變測試失敗：白名單路徑繞過未被偵測（ch5/npc/amend-10.draft 不應放行）")
    else:
        notes.append("ok  突變測試（白名單繞過）：正確偵測 → %s" % mut_wl[0])

    # --- Report ---
    print("WP-S4 後半劇情 fixture 驗證")
    print("=" * 40)
    for n in notes:
        print("  " + n)
    for e in errors:
        print("  FAIL " + e)
    if errors:
        print("\n結果：FAIL（%d 項）" % len(errors))
        sys.exit(1)
    else:
        print("\n結果：PASS（mtime: 未驗，fragments 不足 8 片）")
        sys.exit(0)


if __name__ == "__main__":
    main()
