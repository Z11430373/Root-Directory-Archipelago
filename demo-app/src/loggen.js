/**
 * 世界系統的決定性日誌產生器，對應 tools/gen_logs.py；依賴 data.js 的 error.log 文字。
 * createWorld/Engine 使用輸出與 manifest；PRNG 呼叫次序、UTC 日期與同秒排序會影響 SHA 對照。
 * 試玩版先實體化字串再供 VFS 串流，並非正式版百萬行惰性產生器；最多快取四組參數。
 */
import { DATA } from './data.js';

// Integer-for-integer port of tools/gen_logs.py (no floating point PRNG).
export class Mulberry32 {
  /** 由日誌建構呼叫；seed → 32-bit 狀態，僅修改新實例。 */
  constructor(seed) { this.a = seed >>> 0; }
  /** 由 below/參考測試呼叫；無參數 → 下一 unsigned 32-bit 整數，推進本實例 PRNG 狀態。 */
  nextU32() {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** Python 相容名稱；無參數 → 同 nextU32 的數值與狀態推進。 */
  next_u32() { return this.nextU32(); }
  /** 由流量生成呼叫；正整數 n → [0,n) 整數，消耗一次 PRNG，不是安全隨機。 */
  below(n) { return this.nextU32() % n; }
  /** 由流量生成呼叫；非空陣列 → 隨機元素，透過 below 消耗一次 PRNG。 */
  pick(values) { return values[this.below(values.length)]; }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOT = ['10.2.1.1', '10.4.0.9', '10.1.5.5'];
const WEIGHTS = [400, 260, 190];
const OK = ['/ship/ferry', '/dock/manifest', '/crane/status', '/tower/time', '/harbor/berths', '/tea/order', '/static/gull.png', '/dock/berth-%02d', '/ship/cargo', '/tide/table'];
const NOT_FOUND = ['/dock/berth-%02d/old', '/ship/ghost', '/crane/9', '/static/seal.png', '/tea/menu-v0', '/tower/clock.old', '/harbor/lighthouse2'];
const UAS = ['ssh-ferry/2.1', 'crane-ctl/0.8', 'dockwatch/3', 'curl/7.88', 'tidemon/1.2', 'gull-bot/0.3'];
// 純格式工具：pad 補兩位、addDays 回傳新 UTC 日期、dateText 輸出與 Python 相同的英語月份日期。
const pad = n => String(n).padStart(2, '0');
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const dateText = d => `${pad(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
/** 由各 rows 產生器呼叫；一筆訪問欄位 → Apache 文字行（不帶換行），不修改日期或 RNG。 */
function fmt(ip, user, d, sec, method, path, status, bytes, ua, rt) {
  const stamp = `${dateText(d)}:${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)} +0000`;
  return `${ip} - ${user} [${stamp}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}" ${rt}`;
}
/** 由日誌產生呼叫；rng → 避開 GC 網段與熱門組的 IP 字串，會消耗不定次數 PRNG。 */
function randIp(rng) {
  for (;;) {
    const ip = `10.${rng.pick([1, 2, 3, 4, 5, 6, 8, 9, 11, 12])}.${rng.below(40)}.${1 + rng.below(250)}`;
    if (!HOT.includes(ip)) return ip;
  }
}
/** 由 dayLines 呼叫；rng/半開數值範圍 → 非 404 整數，避免一般欄位製造未規劃的陷阱。 */
function nonfour(rng, low, high) {
  for (;;) { const n = low + rng.below(high - low); if (n !== 404) return n; }
}
/** 由主/輪替日誌呼叫；rng/日期/行數/IP 池/申訴選項 → [秒,排序權重,文字] rows，消耗 RNG。 */
function dayLines(rng, d, n, ips, appeal = false, extra = 0) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const sec = rng.below(3) ? Math.max(rng.below(86400), rng.below(86400)) : rng.below(86400);
    const r = rng.below(10000);
    let acc = 0;
    let ip;
    for (let j = 0; j < HOT.length; j++) { acc += WEIGHTS[j]; if (r < acc) { ip = HOT[j]; break; } }
    if (!ip) ip = ips[rng.below(ips.length)];
    const s = rng.below(1000);
    const status = s < 22 ? 404 : s < 26 ? 500 : s < 30 ? 503 : s < 130 ? 304 : 200;
    let path = rng.pick(status === 404 ? NOT_FOUND : OK);
    if (path.includes('%02d')) path = path.replace('%02d', pad(rng.below(40)));
    const bytes = status !== 304 ? nonfour(rng, 40, 9000) : 0;
    const rt = nonfour(rng, 2, 900);
    rows.push([sec, 1, fmt(ip, '-', d, sec, 'GET', path, status, bytes, rng.pick(UAS), rt)]);
  }
  if (appeal) {
    for (let i = 0; i < extra; i++) {
      const sec = 9 * 3600 + rng.below(8 * 3600);
      const ip = ips[rng.below(ips.length)];
      rows.push([sec, 1, fmt(ip, '-', d, sec, 'POST', '/appeal', 400, nonfour(rng, 200, 700), 'wristwatch/0.9', nonfour(rng, 5, 60))]);
    }
  }
  return rows;
}
/** 由主/輪替日誌呼叫；日期 → GC 與車隊固定 rows，新陣列且不消耗 PRNG。 */
function gcRows(d) {
  return [
    [7200, 0, fmt('10.7.0.2', '-', d, 7200, 'GET', '/gc/probe', 200, 12, 'gc/1.0 (sweep)', 3)],
    [7212, 0, fmt('10.7.0.23', '-', d, 7212, 'GET', '/ship/convoy', 200, 96, 'ssh-ferry/2.1', 40)]
  ];
}
/** 由 generateLogs 呼叫；日期/暱稱/IP/起始秒 → 玩家固定步驟 rows，不讀真實玩家網路資料。 */
function footprints(d, nick, ip, baseSec) {
  return [['POST', '/lighthouse/login', 200, 64], ['GET', '/lighthouse/handbook', 200, 910], ['GET', '/lighthouse/map', 200, 480], ['POST', '/lighthouse/lamp/start', 200, 32]].map(([m, p, st, b], i) => {
    const sec = baseSec + i * 37;
    return [sec, 2, fmt(ip, nick, d, sec, m, p, st, b, 'ssh/op', 20 + sec % 7)];
  });
}
/** 由 rotated 呼叫；無參數 → lin 離開當晚的固定彩蛋 rows，無隨機副作用。 */
function linRows() {
  const d = new Date('2031-10-27T00:00:00Z');
  return [
    [7092, 0, fmt('10.9.0.1', 'lin', d, 7092, 'POST', '/session/login', 200, 64, 'ssh/lin', 18)],
    [7200, 0, fmt('10.7.0.2', '-', d, 7200, 'GET', '/gc/probe', 200, 12, 'gc/1.0 (sweep)', 3)],
    [7200, 0, fmt('10.9.0.1', 'lin', d, 7200, 'GET', '/gc/probe', 200, 12, 'lin/tty1 (watching)', 150)],
    [7200, 0, fmt('10.9.0.1', 'lin', d, 7200, 'POST', '/ssh/lighthouse?cmd=systemctl+stop+lamp', 200, 0, 'ssh/lin', 41)],
    [7241, 0, fmt('10.9.0.1', 'lin', d, 7241, 'POST', '/session/logout', 200, 0, 'ssh/lin', 22)]
  ];
}
/** 由 rows.sort 呼叫；兩 row → 秒/權重比較值，同鍵維持產生順序；無副作用。 */
const rowOrder = (a, b) => a[0] - b[0] || a[1] - b[1];
/** 由 generateLogs 呼叫；種子/規模/日期 → 輪替行陣列，使用獨立 XOR 種子，不推進主日誌 RNG。 */
function rotated(seed, lines, days, now) {
  const rng = new Mulberry32(seed ^ 0xa5a5);
  const ips = [...new Set(Array.from({ length: 200 }, () => randIp(rng)))].sort();
  const start = addDays(now, -days * 2);
  const out = [];
  for (let k = 0; k < days; k++) {
    const d = addDays(start, k);
    const rows = dayLines(rng, d, Math.max(10, Math.floor(lines / 3)), ips).concat(gcRows(d));
    if (d.toISOString().slice(0, 10) === '2031-10-27') rows.push(...linRows());
    for (const row of rows.sort(rowOrder)) out.push(row[2]);
  }
  return out;
}
/** 由 generateLogs 呼叫；文字行/申訴日 → 題目答案 manifest，純計算，不覆寫輸入行。 */
function analyze(lines, appealDay) {
  const dates = new Map();
  const ips = new Map();
  const manifest = { n_lines: lines.length, n404: 0, n_grep404_naive: 0, busiest_day: '', busiest_count: 0, appeal_day: dateText(appealDay), n_0200: 0, n_gc: 0, n_ip_prefix_naive: 0, top3: [], n_appeal: 0 };
  for (const line of lines) {
    if (line.includes(' 404 ')) manifest.n404++;
    if (line.includes('404')) manifest.n_grep404_naive++;
    if (line.includes('02:00:00')) manifest.n_0200++;
    if (line.startsWith('10.7.0.2 ')) manifest.n_gc++;
    if (line.startsWith('10.7.0.2')) manifest.n_ip_prefix_naive++;
    if (line.includes('POST /appeal')) manifest.n_appeal++;
    const date = line.split('[', 2)[1].split(':', 1)[0];
    const ip = line.split(' ', 1)[0];
    dates.set(date, (dates.get(date) || 0) + 1);
    ips.set(ip, (ips.get(ip) || 0) + 1);
  }
  for (const [date, n] of dates) if (n > manifest.busiest_count) { manifest.busiest_day = date; manifest.busiest_count = n; }
  // compareIp 將四段轉整數，供同次數時的數值 IP 平手排序；字串排序會把 .100 排在 .9 前。
  const compareIp = (a, b) => {
    const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return 0;
  };
  manifest.top3 = [...ips].sort((a, b) => b[1] - a[1] || compareIp(a[0], b[0])).slice(0, 3).map(([ip, n]) => `${ip} ${n}`);
  return manifest;
}

const cache = new Map();
/**
 * 由 createWorld/Engine/測試呼叫；生成選項 → accessLog/errorLog/rotatedLog/manifest。
 * 無磁碟寫入；更新四筆 FIFO 快取，回傳時複製 manifest/top3 避免呼叫端污染下次結果。
 */
export function generateLogs(options = {}) {
  const { seed = 5, days = 30, npc = true, now = '2031-12-07', nick = 'op-zien', peers = [] } = options;
  const linesPerDay = options.linesPerDay ?? options.lines_per_day ?? 100;
  if (!Number.isInteger(days) || days <= 10 || !Number.isInteger(linesPerDay) || linesPerDay < 0) throw new Error('Invalid log generation parameters');
  const key = JSON.stringify([seed, linesPerDay, days, npc, now, nick, peers]);
  const cached = cache.get(key);
  if (cached) return { ...cached, manifest: { ...cached.manifest, top3: [...cached.manifest.top3] } };
  const date = new Date(`${now}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid log date');
  const rng = new Mulberry32(seed);
  const ips = [...new Set(Array.from({ length: Math.max(300, Math.floor(linesPerDay / 3)) }, () => randIp(rng)))].sort();
  const appealIdx = 5 + rng.below(days - 10);
  const start = addDays(date, -days);
  const perDay = [];
  for (let k = 0; k < days; k++) {
    const d = addDays(start, k);
    const rows = dayLines(rng, d, linesPerDay + rng.below(Math.max(2, Math.floor(linesPerDay / 10))), ips, k === appealIdx, Math.floor(linesPerDay * 0.8));
    perDay.push([d, rows.concat(gcRows(d))]);
  }
  const today = dayLines(rng, date, Math.max(5, Math.floor(linesPerDay / 12)), ips).filter(r => r[0] < 7 * 3600).concat(gcRows(date));
  // footprintIp 僅生成虛構 10.9.* 位址，消耗本次 RNG；不讀宿主 IP 或裝置資訊。
  const footprintIp = () => `10.9.${rng.below(200)}.${1 + rng.below(250)}`;
  today.push(...footprints(date, nick, footprintIp(), 7 * 3600 + 31 * 60));
  if (npc) for (const [name, hh] of [['op-ada', 9], ['op-bo', 10]]) today.push(...footprints(date, name, footprintIp(), hh * 3600 + 5 * 60));
  for (const name of peers) today.push(...footprints(date, name, footprintIp(), 7 * 3600 + 50 * 60));
  perDay.push([date, today]);
  let decoy = 0;
  for (let k = 0; k < perDay.length; k++) {
    const [d, rows] = perDay[k];
    if (k % 3 === 0 && rows.length > 40) for (let j = 0; j < 3; j++) {
      const sec = 10 * 3600 + 600 * (j + 1) + k;
      rows.push([sec, 1, fmt(randIp(rng), '-', d, sec, 'GET', '/ship/cargo', 200, [1404, 4040, 2404][j], 'crane-ctl/0.8', 55)]);
      decoy++;
    }
  }
  const lines = [];
  for (const [, rows] of perDay) for (const row of rows.sort(rowOrder)) lines.push(row[2]);
  const rot = rotated(seed, linesPerDay, days, date);
  const manifest = { ...analyze(lines, addDays(start, appealIdx)), seed, lines_per_day: linesPerDay, days, decoy404_lines: decoy, nick, rotated_lines: rot.length };
  const result = { accessLog: lines.join('\n') + '\n', errorLog: DATA.text['text/ch1/error.log'], rotatedLog: rot.join('\n') + '\n', manifest };
  // The demo is intentionally ~3,000 lines; bound cache memory across new seeds.
  if (cache.size >= 4) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return { ...result, manifest: { ...manifest, top3: [...manifest.top3] } };
}
