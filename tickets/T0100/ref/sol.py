# 工單 T0100 參考程式；僅依賴 sys，由 tools/validate.py 的 run_sol 以子程序執行。
# stdin 一行名字 → stdout 簽到訊息；去掉兩端空白但保留內部空白，不改檔案，程序結束釋放輸入緩衝。
import sys

# 頂層即執行：讀一行而非 split 單字，確保「op zien 07」仍是完整名字。
name = sys.stdin.readline().rstrip("\r\n").strip()
print("值班已登記：" + name)
