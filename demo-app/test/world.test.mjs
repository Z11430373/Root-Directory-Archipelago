/**
 * 世界 QA（T6–T9）：依賴 vfs/loggen/shell/quests、conformance.json 與標準庫 SHA-256。
 * 以 Python/真 Bash 固定答案逐字比對，命名案例 callback 回傳 void，各自建立 VFS，不改資料包。
 * 硬連結/惰性來源/安全刪除皆只作用記憶體，iterator 的關閉由 Shell 驗證；無宿主檔案刪除。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createWorld } from '../src/vfs.js';
import { generateLogs, Mulberry32 } from '../src/loggen.js';
import { execute } from '../src/shell/exec.js';
import { checkQuest } from '../src/quests.js';

const vectors = JSON.parse(readFileSync(new URL('../../demo/testvectors/conformance.json', import.meta.url), 'utf8'));
/** 檔案/日誌案例呼叫；UTF-8 文字 → SHA-256 hex，純計算，不依賴被測的存檔雜湊函式。 */
const sha = text => createHash('sha256').update(text, 'utf8').digest('hex');

for (const [chapter, expected] of Object.entries(vectors.vfs)) {
  test(`T6 ${chapter}: exact files, directories, UTF-8 hashes`, () => {
    const world = createWorld(chapter);
    assert.equal(world.home, expected.home);
    assert.equal(world.cwd, world.resolve(expected.cwd_start));
    assert.deepEqual(world.filePaths().sort(), Object.keys(expected.files).sort());
    assert.deepEqual(world.dirPaths().sort(), expected.dirs);
    for (const [path, hash] of Object.entries(expected.files)) assert.equal(sha(world.readFile(path)), hash, path);
  });
}

for (const entry of vectors.cases) {
  test(`T7 ${entry.id}: ${entry.cmd}`, () => {
    const world = createWorld(entry.chapter);
    world.cwd = world.resolve(entry.cwd);
    const actual = execute(entry.cmd, world);
    assert.equal(actual.stdout, entry.stdout);
    assert.equal(actual.rc, entry.rc);
  });
}

test('T8: complete Python log SHA-256, manifest, first/last lines', () => {
  const { params, manifest } = vectors.log;
  const actual = generateLogs(params);
  assert.equal(sha(actual.accessLog), vectors.log.access_log_sha256);
  assert.deepEqual(actual.manifest, manifest);
  assert.equal(actual.accessLog.split('\n')[0], vectors.log.first_line);
  assert.equal(actual.accessLog.trimEnd().split('\n').at(-1), vectors.log.last_nonempty_line);
  assert.match(actual.rotatedLog, /lin\/tty1 \(watching\)/);
  assert.equal(actual.rotatedLog.split('\n').filter(Boolean).length, manifest.rotated_lines);
});

test('T8+ mulberry32 unsigned wraparound is deterministic', () => {
  const a = new Mulberry32(-1), b = new Mulberry32(0xffffffff);
  for (let i = 0; i < 100; i++) {
    const value = a.nextU32();
    assert.equal(value, b.next_u32());
    assert.equal(value >>> 0, value);
  }
  const logs = generateLogs({ seed: 0, linesPerDay: 300 });
  assert.deepEqual(logs, generateLogs({ seed: 0, lines_per_day: 300 }));
  assert.equal(logs.manifest.n_gc, 31);
  assert.equal(logs.manifest.n_ip_prefix_naive, 62);
  assert.equal(logs.manifest.busiest_day, logs.manifest.appeal_day);
  assert.ok(logs.manifest.n_grep404_naive > logs.manifest.n404);
});

test('T8+ independent Python SHA-256 oracles for other seeds, NPC modes, and rotated logs', () => {
  // Computed by the unmodified tools/gen_logs.py generate/generate_rotated.
  const oracles = [
    { seed: 0, linesPerDay: 300, npc: true, access: 'fa919faa198ecf05f5892e291a7eb3c8e0949abcd2238d278920a5b30cec41e6', rotated: 'c6c49f2f7e22dffae0850aad5cca347087b0b25588218f26838ff172b6fb96e7' },
    { seed: 4294967295, linesPerDay: 100, npc: false, access: 'c8cc7053153aeb1f42b76b9b472d58f944ef3974f9631134103dc8f9ed435705', rotated: 'fc0b1e8a92102b57c44cc250e966b92ff67ae7f145023022bdf05f1757ab917d' },
    { seed: 1, linesPerDay: 100, npc: true, access: 'fb59a4730ea3cc629316bce42ee6e8d188ea1ee4095ebbc52ad03e6e24ee6f1b', rotated: '2a1c94f0a4a1fa2fda6e0f2c6e6f3e9ad6523865c6a01e9b92a17f6ceda3f00c' }
  ];
  for (const oracle of oracles) {
    const result = generateLogs(oracle);
    assert.equal(sha(result.accessLog), oracle.access, String(oracle.seed));
    assert.equal(sha(result.rotatedLog), oracle.rotated, String(oracle.seed));
  }
});

for (const quest of vectors.quests) {
  for (const kind of ['pass', 'fail']) {
    for (const [i, entry] of quest[kind].entries()) {
      test(`T9 ${quest.id} ${kind}[${i}]: ${entry.cmd}`, () => {
        const world = createWorld(quest.chapter);
        world.cwd = world.resolve(entry.cwd);
        const actual = execute(entry.cmd, world);
        if (entry.stdout !== null) assert.equal(actual.stdout, entry.stdout);
        assert.equal(checkQuest(quest.check, entry.cmd, actual.stdout, world.manifest, world), entry.expect_check);
      });
    }
  }
}

test('T6+ hard links survive deep clone without sharing file changes', () => {
  const main = createWorld();
  main.link('notes/01-first-night.txt', 'copy.txt');
  assert.equal(main.stat('copy.txt').inode, main.stat('notes/01-first-night.txt').inode);
  const branch = main.clone();
  branch.writeFile('copy.txt', 'branch\n');
  assert.equal(branch.readFile('notes/01-first-night.txt'), 'branch\n');
  assert.notEqual(main.readFile('copy.txt'), 'branch\n');
  branch.remove('copy.txt');
  assert.equal(branch.readFile('notes/01-first-night.txt'), 'branch\n');
});

test('T7+ safe rm, absent/hidden notes, failed cd, lenient ln', () => {
  const main = createWorld();
  const paths = main.filePaths();
  for (const cmd of ['rm -rf ~', 'rm -rf /', 'rm -rf $HOME/*', 'rm -r /home/op/']) {
    execute(cmd, main);
    assert.deepEqual(main.filePaths(), paths, cmd);
  }
  execute('ln notes/01-first-night.txt ~/keep/', main);
  assert.equal(main.stat('keep/01-first-night.txt').inode, main.stat('notes/01-first-night.txt').inode);
  const cwd = main.cwd;
  assert.equal(execute('cd no-such-directory', main).rc, 1);
  assert.equal(main.cwd, cwd);
  const branch = main.clone();
  execute('rm -rf ~/notes', branch, { branch: 'alt/sandbox' });
  assert.equal(branch.empty('~/notes'), true);
  assert.equal(main.empty('~/notes'), false);
  execute('rm -rf ~', branch, { branch: 'alt/sandbox' });
  assert.equal(branch.empty('~'), true);
  assert.equal(branch.isDirectory('~'), true);
  const hidden = createWorld();
  hidden.mkdir('test-empty');
  hidden.writeFile('test-empty/.hidden', 'x');
  assert.equal(hidden.empty('test-empty'), false);
  assert.equal(hidden.empty('missing'), true);
});

test('T7+ named file reads, recursive matching only, inode aliases, redirects', () => {
  const world = createWorld();
  assert.deepEqual(execute('cat notes/.draft.txt | head -n 1; cat notes/.draft.txt', world).reads, ['/home/op/notes/.draft.txt']);
  assert.deepEqual(execute('grep -r KEY-FRAG .', world).reads, ['/home/op/notes/.draft.txt']);
  assert.deepEqual(execute('grep absent handbook.md', world).reads, ['/home/op/handbook.md']);
  assert.deepEqual(execute('echo test > created.txt', world).reads, []);
  world.link('notes/.draft.txt', 'fragment.txt');
  const result = execute('cat fragment.txt', world);
  assert.deepEqual(result.reads, ['/home/op/fragment.txt']);
  assert.deepEqual(result.readEvents[0].same_inode.sort(), ['/home/op/fragment.txt', '/home/op/notes/.draft.txt']);
  assert.deepEqual(execute('mail', world).reads, ['/var/mail/op']);
});

test('T7+ BRE, quoting, short circuit, literal unsafe shell syntax', () => {
  const world = createWorld();
  assert.equal(execute("echo 'a+b' | grep 'a+b'", world).stdout, 'a+b\n');
  assert.equal(execute("echo ab | grep 'a+b'", world).rc, 1);
  assert.equal(execute("echo aaab | grep 'a\\+b'", world).stdout, 'aaab\n');
  assert.equal(execute("echo 'a(b)|c?' | grep 'a(b)|c?'", world).rc, 0);
  assert.equal(execute("echo 'a b; c|d&&e'", world).stdout, 'a b; c|d&&e\n');
  assert.equal(execute('cat missing && echo no; echo rc=$?', world).stdout, 'rc=1\n');
  assert.equal(execute('node -e boom', world).rc, 127);
  assert.equal(execute('echo $(cat handbook.md)', world).rc, 2);
  assert.equal(execute('cat "unterminated', world).rc, 2);
  assert.equal(execute('echo trailing |', world).rc, 2);
});

test('T6+ dynamic variants share global flags with branch', () => {
  const flags = new Set();
  const world = createWorld('ch0', 5, flags);
  const branch = world.clone();
  assert.match(world.readFile('shelf/cat.txt'), /罷工/);
  flags.add('flag.lamp_lit');
  assert.match(world.readFile('shelf/cat.txt'), /復工/);
  assert.equal(branch.readFile('shelf/cat.txt'), world.readFile('shelf/cat.txt'));
});

test('T9+ remaining check types, manifest substitution, only new cwd files', () => {
  const world = createWorld('ch1');
  assert.equal(checkQuest({ type: 'output_line_contains_all', cmd_regex: '\\|', values: ['{manifest.busiest_count}', '{manifest.busiest_day}'] }, 'a | b', '185 24/Nov/2031\n', world.manifest, world), true);
  const check = { type: 'file_matches', all_lines_regex: '^10\\.7\\.0\\.2 ', line_count: '{manifest.n_gc}' };
  execute("grep '^10\\.7\\.0\\.2 ' access.log > gc.txt", world);
  assert.equal(checkQuest(check, '', '', world.manifest, world), true);
  world.writeFile('gc.txt', 'bad\n');
  assert.equal(checkQuest(check, '', '', world.manifest, world), false);
  world.writeFile('elsewhere/gc.txt', Array(31).fill('10.7.0.2 x').join('\n') + '\n');
  assert.equal(checkQuest(check, '', '', world.manifest, world), false);
});

test('T7+ direct head/tail seek and pipelines consume lazily', () => {
  const world = createWorld();
  world.writeFile('large.txt', 'first\n' + 'filler\n'.repeat(10000) + 'last\n');
  const chunks = world.iterChunks.bind(world);
  let pulled = 0;
  world.iterChunks = function* (path) { for (const chunk of chunks(path)) { pulled++; yield chunk; } };
  assert.equal(execute('cat large.txt | head -n 1', world).stdout, 'first\n');
  assert.equal(pulled, 1);
  pulled = 0;
  assert.equal(execute('tail -n 1 large.txt', world).stdout, 'last\n');
  assert.equal(pulled, 0);
  for (const text of ['', '\n', 'a', 'a\n', 'a\nb', 'a\nb\n']) {
    world.writeFile('endings.txt', text);
    for (const n of [0, 1, 2, 4]) {
      const rawLines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
      assert.equal(execute(`tail -n ${n} endings.txt`, world).stdout, n === 0 ? '' : rawLines.slice(-n).join(''), `${JSON.stringify(text)} tail ${n}`);
    }
  }
});

test('T7+ option combinations, C ordering, adjacency, globbing and literal syntax', () => {
  const world = createWorld();
  world.writeFile('values.txt', 'b 10\na 2\na 2\nb 1\n');
  assert.equal(execute('sort -k2n values.txt', world).stdout, 'b 1\na 2\na 2\nb 10\n');
  assert.equal(execute('sort -rn -k2 values.txt | head -2', world).stdout, 'b 10\na 2\n');
  assert.equal(execute('uniq -c values.txt', world).stdout, '      1 b 10\n      2 a 2\n      1 b 1\n');
  assert.equal(execute('cut -d" " -f2 values.txt | sort -n', world).stdout, '1\n2\n2\n10\n');
  assert.equal(execute('cat notes/*.txt | grep KEY-FRAG', world).rc, 1, 'glob must not include hidden files');
  assert.equal(execute('cat notes/.* | grep KEY-FRAG', world).rc, 0);
  assert.equal(execute('echo \'$HOME\' "$HOME"', world).stdout, '$HOME /home/op\n');
  assert.equal(execute("echo literal > '~'; cat '~'", world).stdout, 'literal\n');
  assert.equal(execute("echo literal > '$HOME'; cat '$HOME'", world).stdout, 'literal\n');
  assert.equal(execute("echo match > 'a*b1'; echo wrong > axxb1; cat 'a*'b?", world).stdout, 'match\n');
  assert.equal(execute("echo '$(cat handbook.md)'", world).stdout, '$(cat handbook.md)\n');
  assert.equal(execute('echo hello > missing-parent/new.txt', world).rc, 1);
  assert.equal(world.exists('missing-parent'), false);
  const linked = execute('ln notes/.draft.txt fragment.txt && ls -li notes/.draft.txt fragment.txt', world).stdout.trim().split('\n');
  assert.equal(linked.length, 2);
  assert.equal(linked[0].split(' ')[0], linked[1].split(' ')[0]);
});
