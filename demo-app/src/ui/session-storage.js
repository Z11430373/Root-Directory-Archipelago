import {SAVE_KEY} from '../storage.js';

/**
 * Per-session whole-envelope ownership guard; no RA1/schema changes.
 * load() fixes a synchronous raw-string baseline before replay starts.
 * write()/clear() use one exclusive Web Lock when available. The fallback is
 * synchronous compare+mutation in one JS task, NOT cross-process atomic CAS.
 * All cooperating writers must use this helper (and the same lock name).
 */
export function createSessionStorage({key=SAVE_KEY, storage, locks, maxChars=2_000_000}={}) {
  let expected, loaded=false, conflicted=false;
  const getStorage = () => storage ?? globalThis.localStorage;
  const getLocks = () => {
    try { return locks === undefined ? globalThis.navigator?.locks : locks; }
    catch { return null; }
  };
  const failure = reason => ({ok:false,reason});
  function compare(target) {
    if (!loaded) return failure('unloaded');
    if (conflicted) return failure('conflict');
    if (target.getItem(key) !== expected) {
      conflicted=true;
      return failure('conflict');
    }
    return {ok:true};
  }
  async function exclusive(operation) {
    // No storage read is performed before acquiring the lock. In particular,
    // a queued writer compares against the latest bytes inside its lock task.
    const manager = getLocks();
    const protection = manager?.request ? 'web-lock' : 'best-effort';
    try {
      const run = () => {
        try { return {...operation(),protection}; }
        catch { return {...failure('unavailable'),protection}; }
      };
      return manager?.request
        ? await manager.request(`root-archipelago:storage:${key}`,{mode:'exclusive'},run)
        : run();
    } catch { return {...failure('unavailable'),protection}; }
  }
  return {
    get conflicted() { return conflicted; },
    get loaded() { return loaded; },
    load() {
      // This is an explicit read/adopt operation, never called by autosave or
      // observe(). The caller must replay THIS returned value, not a prior read.
      try {
        const text = getStorage().getItem(key);
        expected=text; loaded=true; conflicted=false;
        if (text === null) return {ok:true,value:null,text};
        if (typeof text !== 'string' || text.length > maxChars) return {...failure('too_large'),text};
        try { return {ok:true,value:JSON.parse(text),text}; }
        catch { return {...failure('invalid'),text}; }
      } catch {
        loaded=false;
        return failure('unavailable');
      }
    },
    check() {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      try { return compare(getStorage()); }
      catch { return failure('unavailable'); }
    },
    observe(event) {
      // A storage event can expose an intervening write even if the current
      // bytes have already returned to the old value (ABA). Never auto-adopt.
      if (loaded && (event.key === key || event.key === null) && event.newValue !== expected) conflicted=true;
      return conflicted ? failure('conflict') : {ok:true};
    },
    async write(value) {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      let text;
      try { text=JSON.stringify(value); }
      catch { return failure('invalid'); }
      if (typeof text !== 'string') return failure('invalid');
      if (text.length > maxChars) return failure('too_large');
      return exclusive(() => {
        const target=getStorage(), checked=compare(target);
        if (!checked.ok) return checked;
        // No await/callback between this final comparison and the write.
        target.setItem(key,text);
        expected=text;
        return {ok:true};
      });
    },
    async clear({precondition}={}) {
      if (!loaded) return failure('unloaded');
      if (conflicted) return failure('conflict');
      return exclusive(() => {
        const target=getStorage(), checked=compare(target);
        if (!checked.ok) return checked;
        // Cross-key callers can recheck their primary ownership AFTER waiting
        // for this key's lock. This is still not a multi-key atomic transaction.
        if (precondition && !precondition()) return failure('conflict');
        // Restart/kiosk must call this, not bypass ownership via clearLocal().
        target.removeItem(key);
        expected=null;
        return {ok:true};
      });
    },
  };
}
