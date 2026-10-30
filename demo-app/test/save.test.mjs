import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { deflateSync, gzipSync, deflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import * as S from '../src/save/index.js';

globalThis.crypto ??= webcrypto;
const vectors = JSON.parse(await readFile(new URL('../../demo/testvectors/vectors.json', import.meta.url), 'utf8'));

async function expectOf(save) {
  const [level, level_reasons] = await S.level(save);
  const sc = S.score(save);
  const st = S.fold(save);
  return {
    nick: save.nick, seed: save.seed, n_commits: save.commits.length,
    head: save.commits.at(-1)?.id ?? null, first_id: save.commits[0]?.id ?? null,
    level, level_reasons, score: sc.score, title_id: sc.title_id, seconds: sc.seconds,
    tasks: st.tasks, finds: st.finds, vote: st.vote,
    full_hint: sc.full_hint, time_up: sc.time_up,
    fullgame: await S.toFullgame(save),
  };
}

for (const [i, v] of vectors.canonical_and_id.entries()) {
  test(`T1 canonical and commit id ${i}`, async () => {
    assert.equal(S.canonical(v.body), v.canonical);
    assert.equal(await S.commitId(v.parent, v.body), v.id);
  });
}
for (const [i, v] of vectors.crc32.entries()) {
  test(`T1 CRC32 ${i}`, () => assert.equal(S.crc32(v.text).toString(16).padStart(8, '0'), v.crc32_hex8));
}
for (const v of [...vectors.accept, ...vectors.suspicious]) {
  test(`T2 ${v.name}: every expect field including fullgame`, async () => {
    const save = await S.importCode(v.code);
    assert.equal(S.checkShape(save), true);
    assert.deepEqual(await expectOf(save), v.expect);
    if (v.reasons) assert.deepEqual((await S.level(save))[1], v.reasons);
    const code = await S.exportCode(save);
    assert.deepEqual(await expectOf(await S.importCode(code)), v.expect);
  });
}
for (const v of vectors.reject) {
  test(`T3 ${v.name}: clean CodeError rejection`, { timeout: 2000 }, async () => {
    const start = performance.now();
    await assert.rejects(S.importCode(v.code), S.CodeError);
    if (v.name === 'zip_bomb') assert.ok(performance.now() - start < 1000, 'bounded streaming rejection must take < 1s');
  });
}
test('T4 tampered JSON file: broken, unverified, no badge', async () => {
  const save = await S.importFile(JSON.stringify(vectors.file_tampered.file));
  const fg = await S.toFullgame(save);
  assert.deepEqual({ level: (await S.level(save))[0], verified: fg.verified,
    badge: fg.items.includes('badge.demo_first_night') }, vectors.file_tampered.expect);
  assert.deepEqual(fg.perks, []);
});

function encodeRaw(raw) {
  const body = Buffer.from(raw).toString('base64url');
  return 'RA1-' + body + '-' + S.crc32('RA1-' + body).toString(16).padStart(8, '0');
}
const encodeText = text => encodeRaw(deflateSync(text));
const packed = JSON.parse(S.canonical(S.pack(JSON.parse(JSON.stringify(vectors.file_tampered.file)))));
const rawPacked = JSON.stringify(packed);
const clone = value => JSON.parse(JSON.stringify(value));

test('Safety: integer-only lexical JSON, including floats rounded to integers', async t => {
  for (const token of ['1.0', '1e0', '1E+0', '1.0000000000000000000001', '1e309', 'NaN', 'Infinity', '-Infinity', '9007199254740993']) {
    await t.test(token, async () => {
      const text = rawPacked.replace('"schema":1', '"schema":' + token);
      await assert.rejects(S.importCode(encodeText(text)), S.CodeError);
      await assert.rejects(S.importFile(text), S.CodeError);
    });
  }
});

test('Safety: bool is not an integer or a packed zero sentinel', async t => {
  for (const [name, change] of [
    ['schema', p => { p.m.schema = true; }],
    ['seed', p => { p.m.seed = true; }],
    ['dt', p => { p.c[0][2] = true; }],
    ['dr', p => { p.c[0][3] = false; }],
    ['branch', p => { p.c[0][4] = false; }],
    ['chapter', p => { p.c[0][5] = false; }],
    ['hint.n', p => { p.c = [['hint', { n: true }, 0, 0, 0, 0]]; }],
    ['hint.full', p => { p.c = [['hint', { n: 1, full: 1 }, 0, 0, 0, 0]]; }],
    ['end.time_up', p => { p.c = [['end', { time_up: 1 }, 0, 0, 0, 0]]; }],
  ]) {
    await t.test(name, async () => {
      const p = clone(packed); change(p);
      await assert.rejects(S.importCode(encodeText(JSON.stringify(p))), S.CodeError);
    });
  }
});

test('Safety: JSON duplicate/escaped keys and prototype fields are rejected', async t => {
  for (const text of [
    rawPacked.replace('"schema":1', '"schema":1,"schema":1'),
    rawPacked.replace('"schema":1', '"schema":1,"sch\\u0065ma":1'),
    rawPacked.replace('"schema":1', '"schema":1,"__proto__":{}'),
    rawPacked.replace('"schema":1', '"schema":1,"\\u005f_proto__":{}'),
    rawPacked.replace('"schema":1', '"schema":1,"constructor":{}'),
    rawPacked.replace('"schema":1', '"schema":1,"prototype":{}'),
    '{"m":{"a":'.repeat(10000) + '0' + '}}'.repeat(10000),
  ]) await t.test(text.slice(0, 50), async () => {
    await assert.rejects(S.importCode(encodeText(text)), S.CodeError);
    await assert.rejects(S.importFile(text), S.CodeError);
    assert.equal({}.polluted, undefined);
  });
});

test('Safety: malformed packed shapes and metadata always produce CodeError', async t => {
  const cases = [null, true, 1, [], {}, { m: [], c: [] }, { m: {}, c: [] },
    { ...packed, x: 1 }, { ...packed, c: 'not an array' }, { ...packed, c: [null] },
    { ...packed, c: [['flag', 'mail_read', 0, 0, 0]] }];
  for (const change of [
    p => { p.m.commits = []; }, p => { delete p.m.head; }, p => { p.m.head = 'bad'; },
    p => { p.m.demo = false; }, p => { p.m.demo_id = 'other'; }, p => { p.m.event = '<script>'; },
    p => { p.m.pack = 'bad'; }, p => { p.m.nick = 'line\n'; }, p => { p.m.seed = {}; },
    p => { p.c[0][1] = true; }, p => { p.c[0][4] = null; }, p => { p.c[0][5] = null; },
    p => { p.c[0][2] = 9007199254740991; }, p => { p.c[0][3] = 9007199254740991; },
    p => { p.c[0].push(0); }, p => { p.c[0][1] = 'é'; },
  ]) { const p = clone(packed); change(p); cases.push(p); }
  for (const [i, p] of cases.entries()) await t.test(String(i), async () => {
    await assert.rejects(S.importCode(encodeText(JSON.stringify(p))), S.CodeError);
    await assert.rejects(S.unpack(p), S.CodeError);
  });
});

test('Safety: importFile shape, hash fields, limits and untrusted input types', async t => {
  for (const change of [
    f => { f.commits[0].extra = 'x'; }, f => { delete f.commits[0].id; },
    f => { delete f.commits[0].parent; }, f => { f.commits[0].id = {}; },
    f => { f.commits[0].parent = true; }, f => { f.commits[0].r = true; },
    f => { f.commits[0].data = []; }, f => { f.event = 'a'.repeat(65); },
    f => { f.game = {}; }, f => { f.nick = '<img src=x onerror=alert(1)>'; },
  ]) await t.test(change.toString(), async () => {
    const f = clone(vectors.file_tampered.file); change(f);
    await assert.rejects(S.importFile(JSON.stringify(f)), S.CodeError);
    assert.throws(() => S.checkShape(f), S.CodeError);
  });
  for (const input of [null, undefined, {}, [], true, 1, Symbol('x')]) {
    await assert.rejects(S.importCode(input), S.CodeError);
    await assert.rejects(S.importFile(input), S.CodeError);
  }
  await assert.rejects(S.importFile(' '.repeat(262145)), S.CodeError);
  const cyclic = S.newSave('safe', 0); cyclic.commits.push(cyclic);
  assert.throws(() => S.checkShape(cyclic), S.CodeError);
  const getter = S.newSave('safe', 0);
  Object.defineProperty(getter, 'event', { enumerable: true, get() { throw new Error('getter'); } });
  assert.throws(() => S.checkShape(getter), S.CodeError);
});

test('Safety: single RFC1950 stream only; no gzip, raw, tail, concat or bad UTF-8', async t => {
  const compressed = deflateSync(rawPacked);
  for (const [name, bytes] of [
    ['gzip', gzipSync(rawPacked)], ['raw', deflateRawSync(rawPacked)],
    ['tail', Buffer.concat([compressed, Buffer.from([0])])],
    ['concat', Buffer.concat([compressed, deflateSync(' ')])],
    ['bad utf8', deflateSync(Buffer.from([0xff, 0xfe]))],
    ['BOM', deflateSync('\ufeff' + rawPacked)],
    ['bad Adler32', Buffer.concat([compressed.subarray(0, -1), Buffer.from([compressed.at(-1) ^ 1])])],
  ]) await t.test(name, async () => assert.rejects(S.importCode(encodeRaw(bytes)), S.CodeError));
});

test('Safety: streaming limit boundary and proof of early zip-bomb interruption', async () => {
  assert.equal(S.inflateBounded(deflateSync('x'.repeat(262144))).length, 262144);
  assert.throws(() => S.inflateBounded(deflateSync('x'.repeat(262145))), error => {
    assert.ok(error instanceof S.CodeError);
    assert.equal(error.code, 'inflate_limit');
    assert.ok(error.inflatedBytes <= 262144 + 4096);
    return true;
  });
  const start = performance.now();
  await assert.rejects(S.importCode(vectors.reject.find(v => v.name === 'zip_bomb').code), error => {
    assert.equal(error.code, 'inflate_limit');
    assert.ok(error.inflatedBytes <= 262144 + 4096, 'must stop before the 5MB body is expanded');
    return true;
  });
  assert.ok(performance.now() - start < 1000);
});

test('Semantics: empty save, all valid commit kinds, de-duplication and data snapshots', async () => {
  const save = S.newSave('safe', 0xffffffff);
  assert.equal(S.checkShape(save), true);
  assert.deepEqual(await S.verifyChain(save), [true, null]);
  assert.deepEqual(await S.importCode(await S.exportCode(save)), save);
  const data = { name: 'flag.mail_read' };
  await S.addCommit(save, 'flag', data, 0);
  data.name = 'flag.modified';
  assert.equal(save.commits[0].data.name, 'flag.mail_read');
  const rows = [
    ['task', { id: 'Q0-1' }], ['task', { id: 'Q0-1' }], ['skip', { id: 'Q0-2' }],
    ['find', { id: 'jar' }], ['find', { id: 'jar' }], ['item', { id: 'F1' }], ['card', { id: 'K0' }],
    ['checkpoint', { id: 'ckpt/ch0-start' }], ['choice', { id: 'vote', value: 'pass' }],
    ['hint', { n: 2 }], ['hint', { n: 3, full: true }],
    ['branch.enter', { name: 'alt/sandbox', from: 'ckpt/ch0-lamp' }],
    ['branch.exit', { mode: 'abandon' }], ['merge', { mode: 'knowledge', card: 'K0' }],
    ['end', { time_up: true }],
  ];
  for (const [kind, data] of rows) await S.addCommit(save, kind, data, 1000, 10, 'ch1', 'alt/sandbox');
  S.seal(save);
  assert.equal(S.checkShape(save), true);
  assert.deepEqual(await S.verifyChain(save), [true, null]);
  const folded = S.fold(save);
  assert.ok(folded.flags instanceof Set);
  assert.deepEqual(folded.tasks, ['Q0-1']);
  assert.deepEqual(folded.skipped, ['Q0-2']);
  assert.deepEqual(folded.finds, ['jar']);
  assert.equal(folded.hints, 5);
  assert.equal(S.score(save).full_hint, true);
  assert.deepEqual(await S.importCode(await S.exportCode(save)), save);
});

test('Semantics: Python ties-to-even time rounding and Unicode canonical ordering', async () => {
  for (const [ms, seconds] of [[500, 0], [1500, 2], [2500, 2], [3500, 4], [1501, 2], [1499, 1]]) {
    const s = S.newSave('round', 0);
    await S.addCommit(s, 'flag', { name: 'flag.demo.started' }, 0);
    await S.addCommit(s, 'flag', { name: 'flag.mail_read' }, ms);
    assert.equal(S.fold(s).seconds, seconds);
  }
  assert.equal(S.canonical({ '10': 1, '2': 2, a: true }), '{"10":1,"2":2,"a":true}');
  assert.equal(S.canonical({ '\u{10000}': 2, '\ue000': 1 }), '{"\ue000":1,"\u{10000}":2}');
});

test('Semantics: broken heads, including empty/null head, are not silently intact', async () => {
  const save = await S.importCode(vectors.accept[0].code);
  save.head = '00000000';
  assert.deepEqual(await S.level(save), ['broken', ['chain']]);
  const broken = await S.importFile(JSON.stringify(save));
  assert.equal((await S.level(broken))[0], 'broken');
  await assert.rejects(S.exportCode(broken), error => error instanceof S.CodeError
    && error.code === 'export_self_check' && typeof error.rawJSON === 'string');
  save.head = null;
  assert.equal((await S.level(save))[0], 'broken');
  const empty = S.newSave('empty', 0); empty.head = '00000000';
  assert.equal((await S.level(empty))[0], 'broken');
});

test('Interop: JS exports and card text agree with Python savelib for every accepted vector', async t => {
  const codes = [];
  const cards = [];
  for (const v of [...vectors.accept, ...vectors.suspicious]) {
    const save = await S.importCode(v.code);
    codes.push(await S.exportCode(save));
    cards.push(await S.card(save));
  }
  const result = spawnSync('python', ['-B', '-c',
    'import json,sys;sys.path.insert(0,"demo/tools");import savelib as S;import testvectors as T;codes=json.load(sys.stdin);saves=[S.import_code(c) for c in codes];print(json.dumps({"expect":[T.expect_of(s) for s in saves],"cards":[S.card(s) for s in saves]},ensure_ascii=True))'],
  { cwd: new URL('../../', import.meta.url), input: JSON.stringify(codes), encoding: 'utf8', timeout: 10000 });
  if (result.error?.code === 'ENOENT') { t.skip('Python is unavailable'); return; }
  assert.equal(result.status, 0, result.stderr);
  const python = JSON.parse(result.stdout);
  assert.deepEqual(python.expect, [...vectors.accept, ...vectors.suspicious].map(v => v.expect));
  assert.deepEqual(python.cards, cards);
});
