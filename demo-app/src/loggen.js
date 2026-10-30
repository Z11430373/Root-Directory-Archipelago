import { DATA } from './data.js';

// Integer-for-integer port of tools/gen_logs.py (no floating point PRNG).
export class Mulberry32 {
  constructor(seed) { this.a = seed >>> 0; }
  nextU32() {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }
  next_u32() { return this.nextU32(); }
  below(n) { return this.nextU32() % n; }
  pick(values) { return values[this.below(values.length)]; }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOT = ['10.2.1.1', '10.4.0.9', '10.1.5.5'];
const WEIGHTS = [400, 260, 190];
const OK = ['/ship/ferry', '/dock/manifest', '/crane/status', '/tower/time', '/harbor/berths', '/tea/order', '/static/gull.png', '/dock/berth-%02d', '/ship/cargo', '/tide/table'];
const NOT_FOUND = ['/dock/berth-%02d/old', '/ship/ghost', '/crane/9', '/static/seal.png', '/tea/menu-v0', '/tower/clock.old', '/harbor/lighthouse2'];
const UAS = ['ssh-ferry/2.1', 'crane-ctl/0.8', 'dockwatch/3', 'curl/7.88', 'tidemon/1.2', 'gull-bot/0.3'];
const pad = n => String(n).padStart(2, '0');
const addDays = (date, days) => new Date(date.getTime() + days * 86400000);
const dateText = d => `${pad(d.getUTCDate())}/${MON[d.getUTCMonth()]}/${d.getUTCFullYear()}`;
function fmt(ip, user, d, sec, method, path, status, bytes, ua, rt) {
  const stamp = `${dateText(d)}:${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)} +0000`;
  return `${ip} - ${user} [${stamp}] "${method} ${path} HTTP/1.1" ${status} ${bytes} "-" "${ua}" ${rt}`;
}
function randIp(rng) {
  for (;;) {
    const ip = `10.${rng.pick([1, 2, 3, 4, 5, 6, 8, 9, 11, 12])}.${rng.below(40)}.${1 + rng.below(250)}`;
    if (!HOT.includes(ip)) return ip;
  }
}
function nonfour(rng, low, high) {
  for (;;) { const n = low + rng.below(high - low); if (n !== 404) return n; }
}
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
function gcRows(d) {
  return [
    [7200, 0, fmt('10.7.0.2', '-', d, 7200, 'GET', '/gc/probe', 200, 12, 'gc/1.0 (sweep)', 3)],
    [7212, 0, fmt('10.7.0.23', '-', d, 7212, 'GET', '/ship/convoy', 200, 96, 'ssh-ferry/2.1', 40)]
  ];
}
function footprints(d, nick, ip, baseSec) {
  return [['POST', '/lighthouse/login', 200, 64], ['GET', '/lighthouse/handbook', 200, 910], ['GET', '/lighthouse/map', 200, 480], ['POST', '/lighthouse/lamp/start', 200, 32]].map(([m, p, st, b], i) => {
    const sec = baseSec + i * 37;
    return [sec, 2, fmt(ip, nick, d, sec, m, p, st, b, 'ssh/op', 20 + sec % 7)];
  });
}
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
const rowOrder = (a, b) => a[0] - b[0] || a[1] - b[1];
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
  const compareIp = (a, b) => {
    const aa = a.split('.').map(Number), bb = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) if (aa[i] !== bb[i]) return aa[i] - bb[i];
    return 0;
  };
  manifest.top3 = [...ips].sort((a, b) => b[1] - a[1] || compareIp(a[0], b[0])).slice(0, 3).map(([ip, n]) => `${ip} ${n}`);
  return manifest;
}

const cache = new Map();
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
