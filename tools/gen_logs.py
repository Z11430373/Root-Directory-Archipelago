#!/usr/bin/env python3
# 世界資料工具：決定性生成日誌與 manifest，供 validate.py、demo/tools 及 JS loggen.js 對照。
# 依賴 Python 標準庫，不讀其他專案檔；CLI 會寫 --out 下的 access.log、rotated/、manifest.json。
# 函式本身多為記憶體計算；CLI 輸出不自動刪除，暫存目錄由呼叫端驗證器負責清理。
"""
日誌港 access.log 產生器（參考實作 + 規格）。

用途
  1. 當 Ch1 的 access.log（約 120 萬行）的規格：引擎（TypeScript）請移植「不變量」，不必逐字相同。
  2. 驗證器用它產生縮小版（--lines-per-day 小）來檢查快題的標準答案。

決定性
  所有隨機由 Mulberry32(seed) 決定，只用整數運算，方便在瀏覽器與伺服器兩邊得到同一結果。
  seed 來自存檔（save.seed）。

行格式（Apache combined + 回應時間毫秒）
  IP - USER [DD/Mon/YYYY:HH:MM:SS +0000] "METHOD PATH HTTP/1.1" STATUS BYTES "-" "UA" RT_MS

不變量（manifest.json 會把它們算出來）
  I1  GC 每晚 02:00:00 恰好來一次：IP 10.7.0.2，GET /gc/probe，UA 'gc/1.0 (sweep)'，只有這個 IP 用這個 UA。
  I2  渡輪車隊 10.7.0.23 每晚 02:00:12 經過（前綴比對陷阱：grep 10.7.0.2 會連它一起抓到）。
  I3  狀態碼 404 的行數 = manifest.n404；另有 decoy 行，BYTES 或 RT 欄含 '404' 字樣但狀態不是 404
      （所以 grep -c 404 會多算；grep -c ' 404 ' 才是對的）。
  I4  有一天（appeal_day）流量明顯最高：大量 POST /appeal，UA 'wristwatch/0.9'，狀態 400。
      這是憲章第八條（以鐘塔為準，「我這邊顯示是」不得抗辯）的日誌版彩蛋。
  I5  玩家足跡：登入燈塔、啟動燈（Ch0 的動作）寫進今日的日誌；單人離線再加 ada、bo 的足跡。
  I6  前三名 IP 在整份日誌裡是固定的一組熱門 IP（不是 GC）。
  I7  rotated/access.log.1 是更早的 30 天，最後一天（lin 離開那晚）有 lin 的足跡（彩蛋）。
"""
import argparse
import json
import os
from datetime import date, timedelta

MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

GC_IP = "10.7.0.2"
GC_UA = "gc/1.0 (sweep)"
CONVOY_IP = "10.7.0.23"


class Mulberry32:
    # 呼叫：各產生器；輸入 seed → 新 RNG，將狀態限為 32-bit，無檔案副作用。
    def __init__(self, seed):
        self.a = seed & 0xFFFFFFFF

    # 呼叫：below/互通測試；無參數 → 下一 unsigned 32-bit 值，原地推進 self.a。
    def next_u32(self):
        # 標準 mulberry32（與常見 JS 版相同）
        M = 0xFFFFFFFF
        self.a = (self.a + 0x6D2B79F5) & M
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & M
        t ^= (t + (((t ^ (t >> 7)) * (t | 61)) & M)) & M
        return (t ^ (t >> 14)) & M

    # 呼叫：流量/足跡生成；正整數 n → [0,n) 值，消耗一次 RNG，非安全隨機。
    def below(self, n):
        return self.next_u32() % n

    # 呼叫：day_lines/rand_ip；非空序列 → 隨機元素，透過 below 推進 RNG。
    def pick(self, seq):
        return seq[self.below(len(seq))]


HOT_IPS = ["10.2.1.1", "10.4.0.9", "10.1.5.5"]          # 固定前三名熱門 IP，約 4.0% / 2.6% / 1.9%
HOT_WEIGHT = [400, 260, 190]                               # 單位：萬分之一

PATHS_OK = ["/ship/ferry", "/dock/manifest", "/crane/status", "/tower/time", "/harbor/berths",
            "/tea/order", "/static/gull.png", "/dock/berth-%02d", "/ship/cargo", "/tide/table"]
PATHS_404 = ["/dock/berth-%02d/old", "/ship/ghost", "/crane/9", "/static/seal.png", "/tea/menu-v0",
             "/tower/clock.old", "/harbor/lighthouse2"]
UAS = ["ssh-ferry/2.1", "crane-ctl/0.8", "dockwatch/3", "curl/7.88", "tidemon/1.2", "gull-bot/0.3"]


# stamp/fmt 是純格式層；時區固定 +0000，改格式會影響 Shell 欄位解析、題目與 JS 雜湊對照。
# 呼叫：fmt；日期/當日秒數 → Apache 時間戳字串，無副作用。
def stamp(d, sec):
    h, r = divmod(sec, 3600)
    m, s = divmod(r, 60)
    return "%02d/%s/%04d:%02d:%02d:%02d +0000" % (d.day, MON[d.month - 1], d.year, h, m, s)


# 呼叫：所有 rows 產生器；一筆訪問欄位 → 不帶換行的日誌行，不改日期或 RNG。
def fmt(ip, user, d, sec, method, path, status, nbytes, ua, rt):
    return '%s - %s [%s] "%s %s HTTP/1.1" %d %d "-" "%s" %d' % (
        ip, user, stamp(d, sec), method, path, status, nbytes, ua, rt)


# 呼叫：generate/generate_rotated；RNG → 虛構 IP，避開保留組，會消耗不定次數 RNG。
def rand_ip(rng):
    # 避開 10.7.0.x（GC 與車隊專用）與三個熱門 IP
    while True:
        ip = "10.%d.%d.%d" % (rng.pick([1, 2, 3, 4, 5, 6, 8, 9, 11, 12]), rng.below(40), 1 + rng.below(250))
        if not ip.startswith("10.7.0.") and ip not in HOT_IPS:
            return ip


# 呼叫：day_lines；RNG/[lo,hi) → 非 404 整數，避免未規劃的欄位干擾，會推進 RNG。
def nonfour(rng, lo, hi):
    while True:
        v = lo + rng.below(hi - lo)
        if v != 404:
            return v


# 呼叫：主/輪替日誌；RNG/日期/規模/IP 池/申訴選項 → rows，消耗 RNG 但不寫檔；user_pool 目前未使用。
def day_lines(rng, d, n, ips, is_appeal=False, appeal_extra=0, user_pool=None):
    """回傳 [(sec, order, line)]。n = 一般流量行數。"""
    rows = []
    for i in range(n):
        # 白天比較忙：兩段取最大值偏向白天
        sec = max(rng.below(86400), rng.below(86400)) if rng.below(3) else rng.below(86400)
        r = rng.below(10000)
        acc = 0
        ip = None
        for hip, w in zip(HOT_IPS, HOT_WEIGHT):
            acc += w
            if r < acc:
                ip = hip
                break
        if ip is None:
            ip = ips[rng.below(len(ips))]
        s = rng.below(1000)
        if s < 22:
            status = 404
            path = rng.pick(PATHS_404)
        elif s < 26:
            status = 500
            path = rng.pick(PATHS_OK)
        elif s < 30:
            status = 503
            path = rng.pick(PATHS_OK)
        elif s < 130:
            status = 304
            path = rng.pick(PATHS_OK)
        else:
            status = 200
            path = rng.pick(PATHS_OK)
        if "%02d" in path:
            path = path % rng.below(40)
        nbytes = nonfour(rng, 40, 9000) if status != 304 else 0
        rt = nonfour(rng, 2, 900)
        rows.append((sec, 1, fmt(ip, "-", d, sec, "GET", path, status, nbytes, rng.pick(UAS), rt)))
    if is_appeal:
        for i in range(appeal_extra):
            sec = 9 * 3600 + rng.below(8 * 3600)
            ip = ips[rng.below(len(ips))]
            rows.append((sec, 1, fmt(ip, "-", d, sec, "POST", "/appeal", 400,
                                     nonfour(rng, 200, 700), "wristwatch/0.9", nonfour(rng, 5, 60))))
    return rows


# 呼叫：主/輪替生成；日期 → GC 與車隊兩筆固定 rows，不消耗 RNG。
def gc_rows(d):
    rows = [(7200, 0, fmt(GC_IP, "-", d, 7200, "GET", "/gc/probe", 200, 12, GC_UA, 3))]
    rows.append((7212, 0, fmt(CONVOY_IP, "-", d, 7212, "GET", "/ship/convoy", 200, 96, "ssh-ferry/2.1", 40)))
    return rows


# 呼叫：generate；日期/虛構身份/IP/起始秒/額外訪問 → 足跡 rows，新陣列且不讀真實活動資訊。
def footprint_rows(d, nick, ip, base_sec, extra=()):
    rows = []
    seq = [("POST", "/lighthouse/login", 200, 64), ("GET", "/lighthouse/handbook", 200, 910),
           ("GET", "/lighthouse/map", 200, 480), ("POST", "/lighthouse/lamp/start", 200, 32)]
    seq += list(extra)
    sec = base_sec
    for m, p, st, b in seq:
        rows.append((sec, 2, fmt(ip, nick, d, sec, m, p, st, b, "ssh/op", 20 + (sec % 7))))
        sec += 37
    return rows


# 呼叫：generate_rotated；無參數 → lin 離開當晚的固定彩蛋 rows，無副作用。
def lin_rows():
    d = date(2031, 10, 27)
    return [
        (1 * 3600 + 58 * 60 + 12, 0, fmt("10.9.0.1", "lin", d, 7092, "POST", "/session/login", 200, 64, "ssh/lin", 18)),
        (7200, 0, fmt(GC_IP, "-", d, 7200, "GET", "/gc/probe", 200, 12, GC_UA, 3)),
        (7200, 0, fmt("10.9.0.1", "lin", d, 7200, "GET", "/gc/probe", 200, 12, "lin/tty1 (watching)", 150)),
        (7200, 0, fmt("10.9.0.1", "lin", d, 7200, "POST", "/ssh/lighthouse?cmd=systemctl+stop+lamp", 200, 0, "ssh/lin", 41)),
        (7241, 0, fmt("10.9.0.1", "lin", d, 7241, "POST", "/session/logout", 200, 0, "ssh/lin", 22)),
    ]


# 呼叫：CLI/JS 對照；生成參數 → (主日誌行陣列, 申訴日, decoy 數)，僅改本次局部 RNG/容器。
# RNG 呼叫次序也是跨語言契約；今日足跡、申訴流量與 404/前綴陷阱不可只為美化而調換。
def generate(seed, lines_per_day, days, now, nick, npc_footprints, peers):
    rng = Mulberry32(seed)
    ips = [rand_ip(rng) for _ in range(max(300, lines_per_day // 3))]
    ips = sorted(set(ips))
    appeal_idx = 5 + rng.below(days - 10)            # 第幾天是申訴日（從視窗起點算）
    start = now - timedelta(days=days)
    all_rows = []                                     # (date, sec, order, line)
    per_day = {}
    for k in range(days):
        d = start + timedelta(days=k)
        rows = day_lines(rng, d, lines_per_day + rng.below(max(2, lines_per_day // 10)), ips,
                         is_appeal=(k == appeal_idx), appeal_extra=int(lines_per_day * 0.8))
        rows += gc_rows(d)
        per_day[d] = rows
    # 今天（只到登入後一小段時間）
    rows = day_lines(rng, now, max(5, lines_per_day // 12), ips)
    rows = [r for r in rows if r[0] < 7 * 3600]       # 登入前的流量
    rows += gc_rows(now)
    rows += footprint_rows(now, nick, "10.9.%d.%d" % (rng.below(200), 1 + rng.below(250)), 7 * 3600 + 31 * 60)
    for npc, hh in npc_footprints:
        rows += footprint_rows(now, npc, "10.9.%d.%d" % (rng.below(200), 1 + rng.below(250)), hh * 3600 + 5 * 60)
    for pn in peers:
        rows += footprint_rows(now, pn, "10.9.%d.%d" % (rng.below(200), 1 + rng.below(250)), 7 * 3600 + 50 * 60)
    per_day[now] = rows
    # decoy：BYTES 含 404 字樣但狀態非 404（每 10 天挑幾行）
    decoy = 0
    for k, d in enumerate(sorted(per_day)):
        if k % 3 == 0 and len(per_day[d]) > 40:
            for j in range(3):
                sec = 10 * 3600 + 600 * (j + 1) + k
                per_day[d].append((sec, 1, fmt(rand_ip(rng), "-", d, sec, "GET", "/ship/cargo", 200,
                                                [1404, 4040, 2404][j], "crane-ctl/0.8", 55)))
                decoy += 1
    out = []
    for d in sorted(per_day):
        for sec, order, line in sorted(per_day[d], key=lambda r: (r[0], r[1])):
            out.append(line)
    appeal_day = start + timedelta(days=appeal_idx)
    return out, appeal_day, decoy


# 呼叫：CLI/一致性工具；種子/規模/日期 → 輪替行陣列，獨立 XOR 種子，不影響主日誌生成。
def generate_rotated(seed, lines_per_day, days, now):
    rng = Mulberry32(seed ^ 0xA5A5)
    ips = sorted({rand_ip(rng) for _ in range(200)})
    end = now - timedelta(days=days)                  # 主日誌視窗之前
    start = end - timedelta(days=days)
    out = []
    for k in range(days):
        d = start + timedelta(days=k)
        rows = day_lines(rng, d, max(10, lines_per_day // 3), ips) + gc_rows(d)
        if d == date(2031, 10, 27):
            rows += lin_rows()
        for sec, order, line in sorted(rows, key=lambda r: (r[0], r[1])):
            out.append(line)
    return out


# 呼叫：CLI；日誌行/申訴日 → 題目答案 manifest，唯讀計算，IP 平手依四段整數排序。
def analyze(lines, appeal_day):
    from collections import Counter
    n404 = sum(1 for l in lines if ' 404 ' in l)
    n_grep404 = sum(1 for l in lines if '404' in l)
    day_cnt = Counter(l.split('[', 1)[1].split(':', 1)[0] for l in lines)
    busiest, busiest_n = day_cnt.most_common(1)[0]
    ip_cnt = Counter(l.split(' ', 1)[0] for l in lines)
    ranked = sorted(ip_cnt.items(), key=lambda kv: (-kv[1], tuple(int(x) for x in kv[0].split('.'))))[:3]
    return {
        "n_lines": len(lines),
        "n404": n404,
        "n_grep404_naive": n_grep404,
        "busiest_day": busiest,
        "busiest_count": busiest_n,
        "appeal_day": "%02d/%s/%04d" % (appeal_day.day, MON[appeal_day.month - 1], appeal_day.year),
        "n_0200": sum(1 for l in lines if '02:00:00' in l),
        "n_gc": sum(1 for l in lines if l.startswith(GC_IP + ' ')),
        "n_ip_prefix_naive": sum(1 for l in lines if l.startswith(GC_IP)),
        "top3": ["%s %d" % kv for kv in ranked],
        "n_appeal": sum(1 for l in lines if 'POST /appeal' in l),
    }


# 呼叫：CLI；argv → None，建立輸出目錄、覆寫日誌/manifest 並列印摘要；檔案由 with 關閉，不自動刪產物。
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=5)
    ap.add_argument("--lines-per-day", type=int, default=300)   # 正式版約 40000 → 30 天 ≈ 120 萬行
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--now", default="2031-12-07")
    ap.add_argument("--nick", default="op-zien")
    ap.add_argument("--npc", action="store_true", help="單人離線：加入 ada、bo 的足跡")
    ap.add_argument("--peer", action="append", default=[], help="多人離線：加入對方暱稱的足跡")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    y, m, dd = map(int, a.now.split("-"))
    now = date(y, m, dd)
    npcs = [("op-ada", 9), ("op-bo", 10)] if a.npc else []
    lines, appeal_day, decoy = generate(a.seed, a.lines_per_day, a.days, now, a.nick, npcs, a.peer)
    os.makedirs(os.path.join(a.out, "rotated"), exist_ok=True)
    with open(os.path.join(a.out, "access.log"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines) + "\n")
    rot = generate_rotated(a.seed, a.lines_per_day, a.days, now)
    with open(os.path.join(a.out, "rotated", "access.log.1"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(rot) + "\n")
    man = analyze(lines, appeal_day)
    man.update({"seed": a.seed, "lines_per_day": a.lines_per_day, "days": a.days, "decoy404_lines": decoy,
                "nick": a.nick, "rotated_lines": len(rot)})
    with open(os.path.join(a.out, "manifest.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(man, f, ensure_ascii=False, indent=2)
    print(json.dumps(man, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
