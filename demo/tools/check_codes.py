#!/usr/bin/env python3
# 跨語言 QA CLI；依賴同層 savelib.py 及其 YAML，讀 JS 匯出的代碼/JSON 並印出結論。
# 不修改來源檔或存檔，沒有暫存樹；損毀/拒絕以非零退出，供 demo-app 的 T11 測試使用。
"""
互通檢查：前端（JavaScript）匯出的存檔代碼，Python 參考實作必須讀得懂。
  python3 demo/tools/check_codes.py codes.txt        # 每行一個代碼
  python3 demo/tools/check_codes.py --file save.rasave.json
輸出每一行的結果（完整／可疑／損毀／拒絕）、分數與稱號。有任何一行被拒絕或損毀就以非零結束。
注意：JS 壓出來的位元組不必與 Python 相同；要求的是『解得開、鏈對得上、結論一致』。
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import savelib as S  # noqa: E402


# 呼叫：CLI/T11 子程序；argv → 程序退出，逐行 load_any/分級/計分，累計失敗並印結果。
def main():
    bad = 0
    if len(sys.argv) >= 3 and sys.argv[1] == "--file":
        items = [("file", sys.argv[2])]
    else:
        items = [("line %d" % (i + 1), l.strip()) for i, l in enumerate(open(sys.argv[1], encoding="utf-8")) if l.strip()]
    for name, x in items:
        try:
            sv = S.load_any(x)
        except S.CodeError as e:
            print("%-8s 拒絕：%s" % (name, e))
            bad += 1
            continue
        lv, why = S.level(sv)
        sc = S.score(sv)
        print("%-8s %s%s  op-%s  commits=%d  分數=%d  稱號=%s  耗時=%s" % (
            name, {"intact": "完整", "suspicious": "可疑", "broken": "損毀"}[lv], ("(%s)" % ",".join(why)) if why else "",
            sv["nick"], len(sv["commits"]), sc["score"], sc["title"], S.fmt_time(sc["seconds"])))
        if lv == "broken":
            bad += 1
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
