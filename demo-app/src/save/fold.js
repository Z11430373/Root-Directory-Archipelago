// Python round() uses ties-to-even; Math.round() does not.
export function roundMilliseconds(ms) {
  const whole = Math.floor(ms / 1000);
  const remainder = ms - whole * 1000;
  return remainder < 500 ? whole : remainder > 500 ? whole + 1 : whole + whole % 2;
}

export function fold(save) {
  const st = { flags: new Set(), tasks: [], finds: [], items: [], cards: [], checkpoints: [],
    skipped: [], vote: null, hints: 0, branches: [], seconds: 0, ended: false };
  const unique = (key, id) => { if (!st[key].includes(id)) st[key].push(id); };
  for (const c of save.commits) {
    const d = c.data;
    switch (c.kind) {
      case 'flag': st.flags.add(d.name); break;
      case 'task': unique('tasks', d.id); break;
      case 'skip': unique('skipped', d.id); break;
      case 'find': unique('finds', d.id); break;
      case 'item': unique('items', d.id); break;
      case 'card': unique('cards', d.id); break;
      case 'checkpoint': st.checkpoints.push(d.id); break;
      case 'choice': if (d.id === 'vote') st.vote = d.value; break;
      case 'hint': st.hints += d.n ?? 1;
        if (d.full) st.flags.add('flag.demo.used_full_hint'); break;
      case 'branch.enter': case 'branch.exit': case 'merge': st.branches.push([c.kind, d]); break;
      case 'end': st.ended = true;
        if (d.time_up) st.flags.add('flag.demo.time_up');
        st.flags.add('flag.demo.finished'); break;
    }
  }
  if (save.commits.length) st.seconds = roundMilliseconds(save.commits[save.commits.length - 1].r - save.commits[0].r);
  return st;
}
