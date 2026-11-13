// Documentation-only verification. Run from the repository root:
// node planning/fullgame/reviews/check-docs.mjs
// Optional first argument: original attachment path, for byte-level SHA-256 comparison.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const display = path => relative(root, path).split(sep).join('/');
const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => {
  const child = resolve(path, entry.name);
  return entry.isDirectory() ? walk(child) : entry.name.endsWith('.md') ? [child] : [];
});
const files = walk(root).sort();
const issues = [];
const documents = new Map();
let jsonExamples = 0;
let localLinks = 0;
let anchorLinks = 0;

for (const path of files) {
  const lines = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
  const prose = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length, language: marker[2].trim(), line: i + 1, body: [] };
    } else if (fence && marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) {
      if (fence.language === 'json') {
        jsonExamples++;
        try { JSON.parse(fence.body.join('\n')); }
        catch (error) { issues.push({ file: display(path), line: fence.line, kind: 'json', message: error.message }); }
      }
      fence = null;
    } else if (fence) {
      fence.body.push(line);
    } else {
      prose.push({ line: i + 1, text: line });
    }
  }
  if (fence) issues.push({ file: display(path), line: fence.line, kind: 'fence', message: 'Unclosed code fence' });
  documents.set(path, prose);
}

// GitHub-style heading anchors for the simple ATX headings used in this package.
const slug = text => text.toLowerCase().trim().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
const anchors = path => {
  const prose = documents.get(path) ?? readFileSync(path, 'utf8').split(/\r?\n/).map(text => ({ text }));
  const counts = new Map();
  const result = new Set();
  for (const { text } of prose) {
    const heading = text.match(/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?$/);
    if (!heading) continue;
    const key = slug(heading[1]);
    const count = counts.get(key) ?? 0;
    result.add(count ? `${key}-${count}` : key);
    counts.set(key, count + 1);
  }
  return result;
};
const indexed = new Set();
for (const [path, prose] of documents) {
  for (const { line, text } of prose) {
    // Inline Markdown links; this package does not use nested link destinations.
    for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].trim().replace(/^<(.+)>$/, '$1').replace(/\s+"[^"]*"$/, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) continue;
      localLinks++;
      const [rawPath, rawAnchor] = href.split('#', 2);
      let target;
      try { target = rawPath ? resolve(dirname(path), decodeURIComponent(rawPath)) : path; }
      catch { issues.push({ file: display(path), line, kind: 'link', message: `Invalid URI: ${href}` }); continue; }
      if (path === resolve(root, 'README.md')) indexed.add(target);
      if (!existsSync(target)) {
        issues.push({ file: display(path), line, kind: 'link', message: `Missing: ${href}` });
      } else if (rawAnchor && statSync(target).isFile() && target.endsWith('.md')) {
        anchorLinks++;
        const anchor = decodeURIComponent(rawAnchor);
        if (!anchors(target).has(anchor)) issues.push({ file: display(path), line, kind: 'anchor', message: `Missing heading: ${href}` });
      }
    }
  }
}
for (const path of files) {
  if (path !== resolve(root, 'README.md') && !indexed.has(path)) issues.push({ file: display(path), kind: 'index', message: 'Not linked from README.md' });
}

const definitions = (file, expression) => [...readFileSync(resolve(root, file), 'utf8').matchAll(expression)].map(match => match[1]);
const sequence = (prefix, count, pad = 0, start = 1) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + start).padStart(pad, '0')}`);
// 基線數量只寫這一處；比對用的序列與輸出的 expectedBaselineIDs 都由它產生，避免顯示值與實際檢查脫節。
const BASELINE = { decisions: 26, authorQuestions: 8, acceptanceCases: 25, workPackages: 13 };
for (const [file, expression, expected] of [
  ['DECISIONS.md', /^\| (D\d+) \|/gm, sequence('D', BASELINE.decisions, 2)],
  ['DECISIONS.md', /^\| (O-N\d+) \|/gm, sequence('O-N', BASELINE.authorQuestions, 2)],
  ['delivery/ACCEPTANCE_MATRIX.md', /^\| (ACC-\d+) \|/gm, sequence('ACC-', BASELINE.acceptanceCases, 2)],
  ['delivery/WORK_PACKAGES.md', /^\| (WP\d+) /gm, sequence('WP', BASELINE.workPackages, 0, 0)],
]) {
  const actual = definitions(file, expression);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push({ file, kind: 'ids', message: { expected, actual } });
}
const knownIDs = new Set([
  ...sequence('D', BASELINE.decisions, 2), ...sequence('O-N', BASELINE.authorQuestions, 2),
  ...sequence('ACC-', BASELINE.acceptanceCases, 2), ...sequence('WP', BASELINE.workPackages, 0, 0),
]);
for (const [path, prose] of documents) {
  if (display(path).startsWith('source/')) continue;
  for (const { line, text } of prose) {
    for (const match of text.matchAll(/\b(?:ACC-\d+|O-N\d+|D\d{2}|WP\d+)\b/g)) {
      if (!knownIDs.has(match[0])) issues.push({ file: display(path), line, kind: 'ids', message: `Undefined: ${match[0]}` });
    }
  }
}

const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const archived = resolve(root, 'source/《根目錄群島》完整版規劃書.original.md');
const sourceHash = hash(archived);
const attachment = process.argv[2];
let attachmentMatches = null;
if (attachment) {
  attachmentMatches = hash(resolve(attachment)) === sourceHash;
  if (!attachmentMatches) issues.push({ kind: 'archive', message: 'Attachment and archive SHA-256 differ' });
}
console.log(JSON.stringify({
  markdownFiles: files.length, localLinks, anchorLinks, jsonExamples,
  expectedBaselineIDs: BASELINE,
  archiveSHA256: sourceHash, attachmentMatches,
  scope: 'Local inline links, ATX heading anchors, code fences, JSON syntax, index coverage, baseline IDs and optional archive hash. Not semantic, game or human verification.',
  issues,
}, null, 2));
process.exitCode = issues.length ? 1 : 0;
