// Local replay metadata is deliberately separate from the portable RA1 schema.
export const SAVE_KEY = 'ra.demo.save.v1';
export const PREFS_KEY = 'ra.demo.preferences.v1';
export const RECOVERY_KEY = 'ra.demo.recovery.v1';
const MAX_LOCAL_CHARS = 2_000_000;
// Journal wall time can include a suspended tab. It is not commit.r, which is
// independently bounded by the save format and stops when the game ends.
const MAX_JOURNAL_SECONDS = Number.MAX_SAFE_INTEGER / 1000;

export function readLocal(key = SAVE_KEY) {
  try {
    const text = globalThis.localStorage.getItem(key);
    if (!text || text.length > MAX_LOCAL_CHARS) return null;
    return JSON.parse(text);
  } catch { return null; }
}
export function writeLocal(value, key = SAVE_KEY) {
  try {
    const text = JSON.stringify(value);
    if (text.length > MAX_LOCAL_CHARS) return false;
    globalThis.localStorage.setItem(key, text);
    return true;
  } catch { return false; }
}
export function clearLocal(key = SAVE_KEY) {
  try { globalThis.localStorage.removeItem(key); return true; }
  catch { return false; }
}

export function checkJournal(journal) {
  if (!Array.isArray(journal) || journal.length > 20_000) return false;
  let elapsed=0;
  return journal.every(step => {
    if(!step||typeof step!=='object'||!['input','advance'].includes(step.type)||
      typeof step.dt!=='number'||!Number.isFinite(step.dt)||step.dt<0)return false;
    elapsed+=step.dt;
    return Number.isFinite(elapsed)&&elapsed<=MAX_JOURNAL_SECONDS&&
      (step.type!=='input'||(step.dt<=2700&&typeof step.raw==='string'&&step.raw.length<=4096));
  });
}

export function appendAdvance(journal, dt) {
  if(typeof dt!=='number'||!Number.isFinite(dt)||dt<0)throw new RangeError('時鐘間隔必須是非負有限秒數');
  if(dt===0)return;
  let start=0;
  for(let i=0;i<journal.length-1;i++)start+=journal[i].dt;
  const last = journal[journal.length - 1];
  const now=start+(last?.dt||0),end=now+dt;
  if(!Number.isFinite(end)||end>MAX_JOURNAL_SECONDS)throw new RangeError('本機操作紀錄的時間超出安全範圍');
  // Keep the same floating-point endpoint as live Engine.advance. Summing only
  // the deltas changes addition grouping and can move r across a 0.5ms boundary.
  const merged=end-start;
  if(last?.type==='advance'&&merged>0&&start+merged===end)last.dt=merged;
  else journal.push({type:'advance',dt});
}
