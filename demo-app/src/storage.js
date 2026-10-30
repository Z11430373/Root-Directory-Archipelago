// Local replay metadata is deliberately separate from the portable RA1 schema.
export const SAVE_KEY = 'ra.demo.save.v1';
export const PREFS_KEY = 'ra.demo.preferences.v1';
const MAX_LOCAL_CHARS = 2_000_000;

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
  return journal.every(step => step && typeof step === 'object' &&
    ['input','advance'].includes(step.type) && typeof step.dt === 'number' &&
    Number.isFinite(step.dt) && step.dt >= 0 && step.dt <= 2700 &&
    (step.type !== 'input' || (typeof step.raw === 'string' && step.raw.length <= 4096)));
}

export function appendAdvance(journal, dt) {
  if (!(dt > 0)) return;
  const last = journal[journal.length - 1];
  // Merging ticks is deterministic: Engine.advance visits each timer boundary.
  if (last?.type === 'advance' && last.dt + dt <= 2700) last.dt += dt;
  else journal.push({type:'advance',dt});
}
