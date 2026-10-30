import sys

lines = sys.stdin.read().split("\n")
n = int(lines[0])
c = {}
for l in lines[1:1 + n]:
    if l:
        ip = l.split(" ", 1)[0]
        c[ip] = c.get(ip, 0) + 1
for ip, k in sorted(c.items(), key=lambda kv: (-kv[1], kv[0]))[:3]:
    print(ip, k)
