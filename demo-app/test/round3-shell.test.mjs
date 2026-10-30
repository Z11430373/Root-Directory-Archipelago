import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { DATA } from '../src/data.js';
import { VFS, createWorld } from '../src/vfs.js';
import { execute } from '../src/shell/exec.js';
import { Engine } from '../src/engine/index.js';
import { checkQuest } from '../src/quests.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function emptyWorld() {
  const world = new VFS();
  world.mkdir(world.home);
  return world;
}

// Expected Bash/coreutils results were independently checked with local Git
// Bash, UTF-8 strings, LC_ALL=C, and a 3000 ms hard subprocess timeout.
// These are ordinary regression assertions, not expected-failure/todo tests.

test('R3-S01: a nonmatching invalid glob range remains literal without throwing', () => {
  const world = emptyWorld();
  let result;
  assert.doesNotThrow(() => { result = execute('echo [z-a]', world); });
  assert.equal(result.stdout, '[z-a]\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, []);
});

test('R3-S02: pipeline producers run side effects even when the consumer ignores stdin', () => {
  const world = emptyWorld();
  const result = execute('echo written > saved.txt | echo done', world);
  assert.equal(result.stdout, 'done\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, []);
  assert.equal(world.readFile('saved.txt'), 'written\n');
});

test('R3-S03: file.read uses the inode alias snapshot from the actual read', async () => {
  const raw = 'ln shelf/jar.txt temp.txt; cat temp.txt; rm temp.txt; ln shelf/cat.txt temp.txt';
  const world = createWorld();
  const expectedOutput = world.readFile('shelf/jar.txt');
  const result = execute(raw, world);
  assert.equal(result.stdout, expectedOutput);
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, ['/home/op/temp.txt']);
  assert.deepEqual(result.readEvents, [{
    path: '/home/op/temp.txt',
    same_inode: ['/home/op/shelf/jar.txt', '/home/op/temp.txt'],
  }]);

  const engine = new Engine();
  await engine.start();
  await engine.feed('round3shell');
  await engine.feed(raw);
  assert.equal(engine.history.at(-1).output, expectedOutput);
  assert.equal(engine.history.at(-1).rc, 0);
  assert.deepEqual({
    jarDiscovered: engine.finds.has('jar'),
    unreadCatCredited: engine.flags.has('flag.demo.cat_dark'),
  }, {
    jarDiscovered: true,
    unreadCatCredited: false,
  });
});

test('R3-S04: sort and cut keep separate input-file line boundaries', () => {
  const world = emptyWorld();
  world.writeFile('first.txt', 'b:2');
  world.writeFile('second.txt', 'a:1\n');
  const sorted = execute('sort first.txt second.txt', world);
  const cut = execute('cut -d: -f1 first.txt second.txt', world);
  for (const result of [sorted, cut]) {
    assert.equal(result.rc, 0);
    assert.deepEqual(result.reads, ['/home/op/first.txt', '/home/op/second.txt']);
  }
  assert.deepEqual({ sort: sorted.stdout, cut: cut.stdout }, {
    sort: 'a:1\nb:2\n',
    cut: 'b\na\n',
  });
});

test('R3-S05: Unicode spaces are word data, not Bash token separators', () => {
  const world = emptyWorld();
  const results = ['\u00a0', '\u3000'].map(space => {
    const result = execute(`echo x${space}y`, world);
    assert.equal(result.rc, 0);
    assert.deepEqual(result.reads, []);
    return result.stdout;
  });
  assert.deepEqual(results, ['x\u00a0y\n', 'x\u3000y\n']);
});

test('R3 control: stdin, missing-file continuation, redirect errors and named reads', () => {
  const world = emptyWorld();
  world.writeFile('first.txt', 'alpha\n');
  world.writeFile('second.txt', 'beta\n');
  const result = execute('echo stdin | cat - first.txt missing.txt second.txt', world);
  assert.equal(result.stdout, 'stdin\nalpha\nbeta\n');
  assert.equal(result.rc, 1);
  assert.deepEqual(result.reads, ['/home/op/first.txt', '/home/op/second.txt']);
  const failedRedirect = execute('cat first.txt > missing/target.txt; echo rc=$?', world);
  assert.equal(failedRedirect.stdout, 'rc=1\n');
  assert.equal(failedRedirect.rc, 0);
  assert.deepEqual(failedRedirect.reads, []);
  assert.equal(world.exists('missing'), false);
});

test('R3 control: quotes, escapes, short circuit and quoted Unicode round-trip', () => {
  const world = emptyWorld();
  assert.equal(execute("echo 'a;b|c&&d'", world).stdout, 'a;b|c&&d\n');
  assert.equal(execute('echo a\\;b\\|c\\&\\&d', world).stdout, 'a;b|c&&d\n');
  assert.equal(execute('cat missing && echo not-run; echo rc=$?', world).stdout, 'rc=1\n');
  const name = 'note\u00a0one.txt', text = '\u6839\u76ee\u9304 \ud83d\udc41';
  const result = execute(`echo '${text}' > '${name}'; cat '${name}' | cat`, world);
  assert.equal(result.stdout, text + '\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, [world.resolve(name)]);
});

test('R3 control: main rm protection is atomic across aliases, options and compounds', () => {
  for (const raw of [
    'rm -rf ~', 'rm -fr /', 'rm -R /home', 'rm -rf /home/op/.',
    'rm -rf /home/op/notes/..', 'rm -r -f -- /home/op',
    'rm -rf $HOME/*', 'rm -rf ${HOME}/*', 'rm -rf "${HOME}"/*',
    'rm -rf ~/notes /home/op; echo survived',
  ]) {
    const world = createWorld();
    const before = world.filePaths().map(path => [path, world.readFile(path)]);
    execute(raw, world);
    assert.deepEqual(world.filePaths().map(path => [path, world.readFile(path)]), before, raw);
  }
});

test('R3 control: alternate valid quest solutions and combined grep options agree', () => {
  const world = createWorld('ch1');
  const quest = DATA.yaml['quests/ch1.yaml'].quests.find(q => q.id === 'Q1-1');
  for (const raw of [
    "grep -c ' 404 ' access.log",
    "grep ' 404 ' access.log | wc -l",
    "grep -inc ' 404 ' access.log",
  ]) {
    const result = execute(raw, world);
    assert.equal(result.rc, 0, raw);
    assert.equal(checkQuest(quest.check, raw, result.stdout, world.manifest, world), true, raw);
    assert.deepEqual(result.reads, ['/var/log/harbor/access.log']);
  }
});
