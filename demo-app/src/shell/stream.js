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
