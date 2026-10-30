import { canonical } from './canonical.js';
import { CodeError } from './errors.js';

export async function commitId(parent, body) {
  if (!globalThis.crypto?.subtle) throw new CodeError('此環境無法計算存檔雜湊');
  const bytes = new TextEncoder().encode((parent ?? '') + canonical(body));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.subarray(0, 4), b => b.toString(16).padStart(2, '0')).join('');
}

export function commitBody(c) {
  return { branch: c.branch, chapter: c.chapter, kind: c.kind, data: c.data, t: c.t, r: c.r };
}

export async function verifyChain(save) {
  let parent = null;
  for (const [i, c] of save.commits.entries()) {
    if (c.parent !== parent || c.id !== await commitId(parent, commitBody(c))) return [false, i];
    parent = c.id;
  }
  if (Object.hasOwn(save, 'head') && save.head !== parent) {
    return [false, Math.max(0, save.commits.length - 1)];
  }
  return [true, null];
}
