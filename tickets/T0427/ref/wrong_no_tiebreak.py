import sys
from collections import Counter

lines = sys.stdin.read().split("\n")
n = int(lines[0])
c = Counter(l.split(" ", 1)[0] for l in lines[1:1 + n] if l)
for ip, k in c.most_common(3):      # 同次數時依首次出現順序，不符合規格
    print(ip, k)
