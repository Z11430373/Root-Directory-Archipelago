/**
 * 存檔事件投影層，無檔案依賴；供 score/integrity/import/card 與 Engine.restore 使用。
 * 將 durable commits 折成新狀態，不重播對話、不恢復任意 Shell 檔案，也不修改來源。
 */
// Python round() uses ties-to-even; Math.round() does not.
/** 由 fold 呼叫；整數毫秒 → 最接近的秒，半秒採偶數捨入以符合 Python；無副作用。 */
export function roundMilliseconds(ms) {
  const whole = Math.floor(ms / 1000);
  const remainder = ms - whole * 1000;
  return remainder < 500 ? whole : remainder > 500 ? whole + 1 : whole + whole % 2;
}

/** 由存檔各投影讀者呼叫；save → 含 Set 旗標與去重進度的新物件；不驗鏈，須先由邊界驗證。 */
export function fold(save) {
  const st = { flags: new Set(), tasks: [], finds: [], items: [], cards: [], checkpoints: [],
    skipped: [], vote: null, hints: 0, branches: [], seconds: 0, ended: false };
  // 同類獎勵只計一次；保留首次取得順序，避免重複事件灌高分數或改變稱號。
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
