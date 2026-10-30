export function* fromText(text) { if (text) yield text; }
export function* lines(chunks) {
  let pending = '';
  for (const chunk of chunks) {
    pending += chunk;
    let start = 0, end;
    while ((end = pending.indexOf('\n', start)) >= 0) {
      yield pending.slice(start, end + 1);
      start = end + 1;
    }
    pending = pending.slice(start);
  }
  if (pending) yield pending;
}
export const withoutNewline = line => line.endsWith('\n') ? line.slice(0, -1) : line;
export function collect(chunks) { let text = ''; for (const chunk of chunks) text += chunk; return text; }

// Start a command even if its consumer ignores stdin, buffering at most its
// first output chunk. Closing this wrapper must also close an unconsumed but
// already-started producer; a generator wrapper's return-before-next would not.
export function startable(chunks) {
  const iterator = chunks[Symbol.iterator]();
  let started = false, closed = false, pending = null;
  return {
    start() {
      if (!started && !closed) { started = true; pending = iterator.next(); }
    },
    next() {
      if (closed) return { done: true };
      this.start();
      const next = pending || iterator.next();
      pending = null;
      if (next.done) closed = true;
      return next;
    },
    return() {
      if (closed) return { done: true };
      closed = true; pending = null;
      return iterator.return ? iterator.return() : { done: true };
    },
    [Symbol.iterator]() { return this; },
  };
}
