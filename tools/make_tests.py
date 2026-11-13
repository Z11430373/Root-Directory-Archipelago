#!/usr/bin/env python3
# 工單資料工具：依固定案例與 gen_logs.py 產生兩題測資；依賴 Bash/coreutils 與 Python 標準庫。
# CLI 或 import 後呼叫 ticket_* 都可能覆寫 tests/*.in/out；只應在明示重新產生測資時執行。
# TemporaryDirectory 管理日誌暫存；不是瀏覽器執行期的一部分。
"""重新產生 tickets/T0100 與 tickets/T0427 的 tests/*.in / *.out。
標準輸出由「獨立的 shell 管線」算出（不是參考解），避免參考解與測資一起錯。
用法：python3 tools/make_tests.py [pack_root]
"""
import os
import subprocess
import sys
import tempfile

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# 呼叫：兩個 ticket 產生器；路徑/文字 → None，建立父目錄並覆寫檔案，with 負責關閉。
def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


# 呼叫：ticket_0427；IP/序號 → 固定格式訪問行，不帶換行，無 RNG/I/O。
def line(ip, k=0):
    return '%s - - [06/Dec/2031:10:%02d:%02d +0000] "GET /ship/ferry HTTP/1.1" 200 512' % (ip, k // 60 % 60, k % 60)


# 呼叫：ticket_0427；行陣列 → 前三 IP 預期 stdout；執行可信的固定 Bash 管線，不修改輸入檔。
def shell_expected(lines):
    """awk | sort | uniq -c | 排序（次數降冪、IP 版本序升冪）| head -3"""
    text = "\n".join(lines) + "\n"
    cmd = ("awk '{print $1}' | sort | uniq -c | "
           "awk '{print $2\" \"$1}' | sort -k2,2nr -k1,1V | head -3")
    r = subprocess.run(["bash", "-c", cmd], input=text, capture_output=True, text=True, check=True)
    return r.stdout


# 呼叫：CLI；無參數 → None，建平手/數值 IP/單 IP/生成日誌案例並覆寫 T0427 tests；暫存自動清理。
def ticket_0427():
    tests = {}
    # 01 範例（彩蛋：前三名有 GC）
    s = ([("10.0.0.5", 1), ("10.7.0.2", 2), ("10.0.0.5", 3), ("10.3.3.3", 4), ("10.0.0.5", 5),
          ("10.7.0.2", 6), ("10.9.1.8", 7), ("10.0.0.5", 8), ("10.7.0.2", 9), ("10.3.3.3", 10),
          ("10.0.0.5", 11), ("10.7.0.2", 12)])
    tests["01"] = [line(ip, k) for ip, k in s]
    # 02 平手：三個 IP 次數相同，出現順序刻意與 IP 大小相反
    tests["02"] = [line(ip, k) for k, ip in enumerate(
        ["10.0.0.30", "10.0.0.20", "10.0.0.10", "10.0.0.30", "10.0.0.20", "10.0.0.10", "10.0.0.40"])]
    # 03 只有一個 IP
    tests["03"] = [line("10.5.5.5", k) for k in range(4)]
    # 04 逐段比較：10.0.0.9 < 10.0.0.10 < 10.0.0.100（字串比較會錯）
    tests["04"] = [line(ip, k) for k, ip in enumerate(
        ["10.0.0.100"] * 2 + ["10.0.0.10"] * 2 + ["10.0.0.9"] * 2 + ["10.0.1.1"] * 5 + ["10.0.0.200"])]
    # 05 由日誌產生器產生的縮小日誌
    with tempfile.TemporaryDirectory() as td:
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "gen_logs.py"), "--out", td,
                        "--lines-per-day", "120", "--seed", "11", "--npc"], check=True, capture_output=True)
        tests["05"] = open(os.path.join(td, "access.log")).read().rstrip("\n").split("\n")
    d = os.path.join(ROOT, "tickets", "T0427", "tests")
    for name, lines in sorted(tests.items()):
        w(os.path.join(d, name + ".in"), "%d\n%s\n" % (len(lines), "\n".join(lines)))
        w(os.path.join(d, name + ".out"), shell_expected(lines))
    print("T0427:", sorted(tests))


# 呼叫：CLI；無參數 → None，覆寫 T0100 的五組簽到輸入/答案並印數量，保留名字內部空白。
def ticket_0100():
    names = ["lin", "op-ada", "Zien", "op zien 07", "x" * 30]
    d = os.path.join(ROOT, "tickets", "T0100", "tests")
    for i, n in enumerate(names, 1):
        w(os.path.join(d, "%02d.in" % i), n + "\n")
        w(os.path.join(d, "%02d.out" % i), "值班已登記：" + n + "\n")
    print("T0100:", len(names))


if __name__ == "__main__":
    ticket_0100()
    ticket_0427()
