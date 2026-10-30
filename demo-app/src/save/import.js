import { importRules } from './config.js';
import { fold } from './fold.js';
import { score } from './score.js';
import { verifyChain } from './hash.js';
import { level } from './integrity.js';
import { checkShape } from './validate.js';
import { parseSaveJSON } from './json.js';
import { codeError } from './errors.js';

export async function importFile(jsonText) {
  try {
    const save = parseSaveJSON(jsonText);
    checkShape(save);
    // Corrupt but well-shaped files remain playable; level() reports broken.
    return save;
  } catch (error) { throw codeError(error, '存檔檔案格式錯誤'); }
}

export async function toFullgame(save, ru = importRules) {
  checkShape(save);
  const st = fold(save);
  const [ok] = await verifyChain(save);
  const [lv, why] = await level(save);
  const carry = ru.carry;
  const out = {
    schema: 1, demo: false, nick: 'op-' + save.nick, seed: save.seed,
    verified: ok ? 'chain' : 'unverified', level: lv, level_reasons: why,
    flags: [...st.flags].filter(f => carry.flags.includes(f)).sort(),
    quests_done: carry.quests_done.filter(q => st.tasks.includes(q)),
    items: st.items.filter(i => carry.items.includes(i)), cards: st.cards.filter(c => carry.cards.includes(c)),
    checkpoints: st.checkpoints.filter(c => carry.checkpoints.includes(c)),
    dropped_flags: [...st.flags].filter(f => !carry.flags.includes(f)).sort(), memory: [], perks: [],
  };
  for (const cp of carry.create_on_import) if (st.flags.has(cp.when)) out.checkpoints.push(cp.make);
  for (const m of ru.memory) if (!m.nothing && st.flags.has(m.from)) out.memory.push(m.say);
  if (lv === 'intact') {
    const sc = score(save);
    if (sc.finished || sc.time_up) {
      out.items.push('badge.demo_first_night');
      for (const perk of ru.perks) out.perks.push(perk.id === 'title' ? { title: sc.title } : perk.id);
    }
  }
  out.items = [...new Set(out.items)].sort();
  return out;
}
