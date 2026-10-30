import { integrityConfig } from './config.js';
import { fold } from './fold.js';
import { verifyChain } from './hash.js';

export function plausibility(save) {
  const st = fold(save);
  const timeUp = st.flags.has('flag.demo.time_up');
  const reasons = [];
  if (st.ended && !timeUp && st.seconds < integrityConfig.plausibility.min_total_seconds_if_finished) reasons.push('too_fast');
  const order = ['Q0-1', 'Q0-2', 'Q0-3', 'Q0-4', 'Q0-5', 'Q1-1', 'Q1-3'];
  const indices = st.tasks.filter(t => order.includes(t)).map(t => order.indexOf(t));
  if (indices.some((n, i) => i > 0 && n < indices[i - 1])) reasons.push('task_order');
  if (st.vote && !timeUp) {
    let seenNight = false;
    let voteBefore = false;
    for (const c of save.commits) {
      if (c.kind === 'flag' && c.data.name === 'flag.gc_name_heard') seenNight = true;
      if (c.kind === 'choice' && !seenNight) voteBefore = true;
    }
    if (voteBefore) reasons.push('vote_before_night');
  }
  return reasons;
}

export async function level(save) {
  const [ok] = await verifyChain(save);
  if (!ok) return ['broken', ['chain']];
  const reasons = plausibility(save);
  return [reasons.length ? 'suspicious' : 'intact', reasons];
}
