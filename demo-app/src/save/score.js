import { demoConfig } from './config.js';
import { fold } from './fold.js';

export function score(save, cfg = demoConfig) {
  const st = fold(save);
  const points = new Map(cfg.finds.map(f => [f.id, f.points]));
  const fp = st.finds.reduce((sum, f) => sum + (points.get(f) ?? 0), 0);
  const full = st.flags.has('flag.demo.used_full_hint');
  const sb = cfg.scoring.speed_bonus;
  const sec = st.seconds;
  const bonus = sec < 600 ? sb.under_seconds_600 : sec < 780 ? sb.under_seconds_780 : sb.otherwise;
  const conditions = {
    breaker: st.finds.includes('rm_branch') && st.cards.includes('K0'), reader: st.finds.length >= 6,
    sprinter: sec < 600 && !full, watcher: st.vote === 'pass', blocker: st.vote === 'block', default: true,
  };
  const title = cfg.title_priority.find(t => conditions[t]);
  return { score: st.tasks.length * 10 + fp * 5 + (full ? 0 : 20) + bonus,
    tasks: st.tasks.length, finds: st.finds.length, find_points: fp,
    seconds: sec, full_hint: full, vote: st.vote, title_id: title,
    title: cfg.titles.find(t => t.id === title).text,
    finished: st.flags.has('flag.demo.finished'), time_up: st.flags.has('flag.demo.time_up') };
}
