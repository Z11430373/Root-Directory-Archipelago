/**
 * 值班證純文字呈現層；依賴 config/score/integrity.js，供 main.js 複製與 Python 互通測試。
 * 與 DOM 值班證分開：這裡只回傳字串，不碰剪貼簿、DOM 或存檔，不需外部清理。
 */
import { demoConfig } from './config.js';
import { score } from './score.js';
import { level } from './integrity.js';

/** 由 main.js 與 card 呼叫；整數秒 → 分:兩位秒，不更改時間。 */
export const fmtTime = sec => Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');

/** 由匯出畫面/互通測試呼叫；save、可選名次/設定 → Promise<框線值班證文字>，不寫回分數。 */
export async function card(save, rank = null, cfg = demoConfig) {
  const sc = score(save, cfg);
  const [lv] = await level(save);
  const rk = rank ? '第 ' + rank + ' 位' : '—';
  const state = sc.finished && !sc.time_up ? '完成' : sc.time_up ? '值班時間到（進度已保存）' : '進行中';
  const vote = { block: '擋', pass: '放行' }[sc.vote] ?? '—';
  // 以簡化的東亞字寬補空白，保持與 Python card 相同；不是一般 Unicode 排版引擎。
  const ln = s => {
    const width = Array.from(s).reduce((n, c) => n + (c.codePointAt(0) > 0x2e80 ? 2 : 1), 0);
    return '│ ' + s + ' '.repeat(Math.max(0, 40 - width - 1)) + '│';
  };
  return ['┌' + '─'.repeat(40) + '┐', ln('值 班 證   ROOT ARCHIPELAGO'), ln('試玩版〈第一夜〉'),
    '├' + '─'.repeat(40) + '┤', ln('值班員　op-' + save.nick), ln('稱號　　' + sc.title),
    ln('燈塔　　' + rk + '（' + state + '）'), ln('耗時　　' + fmtTime(sc.seconds)),
    ln('快題　　' + sc.tasks + '/7　發現 ' + sc.finds + '/' + cfg.finds.length),
    ln('02:00 的訪客　' + vote), ln('存檔完整性　' + { intact: '完整', suspicious: '可疑', broken: '損毀' }[lv]),
    '├' + '─'.repeat(40) + '┤', ln('燈我幫你留著。'), '└' + '─'.repeat(40) + '┘'].join('\n');
}
