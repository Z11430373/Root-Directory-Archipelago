# T0427 刻意保留的錯解；依賴 sys/collections.Counter，供 validate.py 確認 test #2 擋掉缺少 IP 平手排序。
# stdin n+日誌 → stdout 前三名；頂層執行、不寫磁碟，程序結束釋放 Counter；不是正式參考解。
import sys
from collections import Counter

lines = sys.stdin.read().split("\n")
n = int(lines[0])
c = Counter(l.split(" ", 1)[0] for l in lines[1:1 + n] if l)
for ip, k in c.most_common(3):      # 同次數時依首次出現順序，不符合規格
    print(ip, k)
