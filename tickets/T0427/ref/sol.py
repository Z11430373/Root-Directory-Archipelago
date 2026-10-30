import sys


def main():
    data = sys.stdin.buffer.read().split(b"\n")
    n = int(data[0])
    counts = {}
    for line in data[1:1 + n]:
        if not line:
            continue
        ip = line.split(b" ", 1)[0]
        counts[ip] = counts.get(ip, 0) + 1
    ranked = sorted(counts.items(),
                    key=lambda kv: (-kv[1], tuple(int(x) for x in kv[0].split(b".")))) [:3]
    out = [b"%s %d" % (ip, c) for ip, c in ranked]
    sys.stdout.write(b"\n".join(out).decode() + "\n")


main()
