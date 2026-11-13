# 工單 T0427 參考程式；依賴 sys，供 tools/validate.py 按 tests/*.in/out 與獨立 Shell oracle 驗證。
# 只讀 stdin/寫 stdout，不修改檔案；以 bytes 計數避免重複解碼，記憶體隨子程序退出釋放。
import sys


# 呼叫：檔案末端；stdin 的 n 與日誌 → stdout 前三 IP/次數，回傳 None；先次數降冪，再 IPv4 四段整數升冪。
def main():
    data = sys.stdin.buffer.read().split(b"\n")
    n = int(data[0])
    counts = {}
    for line in data[1:1 + n]:
        if not line:
            continue
        ip = line.split(b" ", 1)[0]
        counts[ip] = counts.get(ip, 0) + 1
    # 平手必須比較數值四段，不能改成字串排序或沿用首次出現順序；兩種錯法有專用回歸測資。
    ranked = sorted(counts.items(),
                    key=lambda kv: (-kv[1], tuple(int(x) for x in kv[0].split(b".")))) [:3]
    out = [b"%s %d" % (ip, c) for ip, c in ranked]
    sys.stdout.write(b"\n".join(out).decode() + "\n")


main()
