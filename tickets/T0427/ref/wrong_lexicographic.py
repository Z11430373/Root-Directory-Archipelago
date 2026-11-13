# T0427 刻意保留的錯解，不是待修正實作；僅依賴 sys，供 validate.py 驗證 test #4 能擋錯誤平手排序。
# stdin n+日誌 → stdout 前三名；頂層執行、無檔案寫入，子程序退出後釋放計數表。
import sys

lines = sys.stdin.read().split("\n")
n = int(lines[0])
c = {}
for l in lines[1:1 + n]:
    if l:
        ip = l.split(" ", 1)[0]
        c[ip] = c.get(ip, 0) + 1
# 錯誤點：同次數用 IP 字串而非四段整數，故 .100/.10/.9 的順序不合規格；勿把這裡「修好」。
for ip, k in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:3]:
    print(ip, k)
