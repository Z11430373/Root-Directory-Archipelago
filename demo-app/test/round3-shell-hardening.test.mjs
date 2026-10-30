import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { VFS, createWorld } from '../src/vfs.js';
import { execute } from '../src/shell/exec.js';
import { Engine } from '../src/engine/index.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

function emptyWorld() {
  const world = new VFS();
  world.mkdir(world.home);
  return world;
}

test('R3 fix glob: malformed and unmatched patterns stay literal; valid and quoted globs differ', () => {
  const world = emptyWorld();
  world.writeFile('a.txt', 'a');
  world.writeFile('b.txt', 'b');
  for (const raw of ['[z-a]', 'none*', 'none?', '[', '[!']) {
    const result = execute(`echo ${raw}`, world);
    assert.equal(result.stdout, raw + '\n', raw);
    assert.equal(result.rc, 0, raw);
  }
  assert.equal(execute('echo [ab].txt', world).stdout, 'a.txt b.txt\n');
  assert.equal(execute('echo [!a].txt', world).stdout, 'b.txt\n');
  assert.equal(execute("echo '*.txt' \\*.txt", world).stdout, '*.txt *.txt\n');
});

test('R3 fix glob: redirect targets retain invalid literals and reject ambiguous expansion', () => {
  const world = emptyWorld();
  const result = execute('echo literal > [z-a]; cat \'[z-a]\'', world);
  assert.equal(result.stdout, 'literal\n');
  assert.equal(result.rc, 0);
  world.writeFile('one.txt', 'one\n');
  world.writeFile('two.txt', 'two\n');
  const failed = execute('echo wrong > *.txt', world);
  assert.equal(failed.rc, 1);
  assert.equal(failed.stdout, '');
  assert.equal(world.readFile('one.txt'), 'one\n');
  assert.equal(world.readFile('two.txt'), 'two\n');
});

test('R3 fix lifecycle: upstream rm and ln execute when downstream ignores stdin', () => {
  const world = emptyWorld();
  world.writeFile('source.txt', 'source\n');
  world.writeFile('victim.txt', 'victim\n');
  const result = execute('rm victim.txt | echo removed; ln source.txt alias.txt | echo linked', world);
  assert.equal(result.stdout, 'removed\nlinked\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, []);
  assert.equal(world.exists('victim.txt'), false);
  assert.equal(world.stat('alias.txt').inode, world.stat('source.txt').inode);
});

test('R3 fix lifecycle: pipeline cd starts but cannot mutate the parent or sibling cwd', () => {
  const world = emptyWorld();
  world.mkdir('notes');
  const result = execute('cd notes | pwd; pwd', world);
  assert.equal(result.stdout, '/home/op\n/home/op\n');
  assert.equal(result.rc, 0);
  assert.equal(world.cwd, '/home/op');
  const missing = execute('cd missing | echo done', world);
  assert.equal(missing.stdout, 'done\n');
  assert.equal(missing.rc, 0);
  assert.match(missing.stderr, /No such file or directory/);
  assert.equal(world.cwd, '/home/op');
  assert.equal(execute('cd notes && pwd', world).stdout, '/home/op/notes\n');
});

test('R3 fix lifecycle: failed redirects suppress command side effects before startup', () => {
  const world = emptyWorld();
  world.writeFile('source.txt', 'source\n');
  world.writeFile('victim.txt', 'victim\n');
  world.mkdir('notes');
  for (const raw of [
    'rm victim.txt > missing/out | echo done',
    'ln source.txt alias.txt > missing/out | echo done',
    'cd notes > missing/out | echo done',
  ]) {
    const result = execute(raw, world);
    assert.equal(result.stdout, 'done\n', raw);
    assert.equal(result.rc, 0, raw);
    assert.match(result.stderr, /No such file or directory/, raw);
  }
  assert.equal(world.exists('victim.txt'), true);
  assert.equal(world.exists('alias.txt'), false);
  assert.equal(world.exists('missing'), false);
  assert.equal(world.cwd, '/home/op');
});

test('R3 fix lifecycle: every redirect opens left-to-right and redirected producers finish', () => {
  const world = emptyWorld();
  world.writeFile('source.txt', 'one\ntwo\n');
  world.writeFile('append.txt', 'before\n');
  const result = execute('cat source.txt > unused.txt >> append.txt | echo done', world);
  assert.equal(result.stdout, 'done\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, ['/home/op/source.txt']);
  assert.equal(world.readFile('unused.txt'), '');
  assert.equal(world.readFile('append.txt'), 'before\none\ntwo\n');
  assert.equal(execute('echo new > opened.txt > missing/out', world).rc, 1);
  assert.equal(world.readFile('opened.txt'), '');
});

test('R3 fix lifecycle: direct and upstream redirect errors preserve useful status and stderr', () => {
  const world = emptyWorld();
  const result = execute('cat missing | echo done; echo rc=$?', world);
  assert.equal(result.stdout, 'done\nrc=0\n');
  assert.match(result.stderr, /missing: No such file or directory/);
  const failed = execute('echo no > missing/out && echo not-run; echo rc=$?', world);
  assert.equal(failed.stdout, 'rc=1\n');
  assert.equal(failed.rc, 0);
});

test('R3 fix lifecycle: a sink write error closes upstream and fails the writer, not the whole shell', () => {
  const world = emptyWorld();
  world.writeFile('stream.txt', 'fixture');
  let pulled = 0, closed = 0;
  world.iterChunks = function* () {
    try {
      for (let i = 0; i < 8; i++) { pulled++; yield 'chunk\n'; }
    } finally { closed++; }
  };
  const write = world.writeFile;
  world.writeFile = function (path, text, options) {
    if (path === '/home/op/out.txt' && text) throw new Error('simulated sink failure');
    return write.call(this, path, text, options);
  };
  const result = execute('cat stream.txt | cat > out.txt', world);
  assert.equal(result.stdout, '');
  assert.equal(result.rc, 1);
  assert.match(result.stderr, /simulated sink failure/);
  assert.equal(pulled, 1);
  assert.equal(closed, 1);
  assert.equal(execute('echo shell-still-usable', world).stdout, 'shell-still-usable\n');
});

test('R3 fix lifecycle: head still closes upstream early, including redirected and ignored output', () => {
  const world = emptyWorld();
  let pulled = 0, closed = 0;
  world.writeFile('stream.txt', 'unused fixture\n');
  world.iterChunks = function* () {
    try {
      for (let i = 0; i < 8; i++) { pulled++; yield `line${i}\n`; }
    } finally { closed++; }
  };
  for (const raw of [
    'cat stream.txt | head -n 1',
    'cat stream.txt | head -n 1 > first.txt | echo done',
  ]) {
    pulled = 0; closed = 0;
    const result = execute(raw, world);
    assert.equal(result.rc, 0, raw);
    assert.equal(result.stdout, raw.includes('>') ? 'done\n' : 'line0\n', raw);
    assert.equal(pulled, 1, raw);
    assert.equal(closed, 1, raw);
  }
  assert.equal(world.readFile('first.txt'), 'line0\n');
});

test('R3 fix lifecycle: ignored producers are started once then closed, not fully drained', () => {
  const world = emptyWorld();
  world.writeFile('stream.txt', 'fixture');
  let pulled = 0, closed = 0;
  world.iterChunks = function* () {
    try {
      for (let i = 0; i < 8; i++) { pulled++; yield 'chunk\n'; }
    } finally { closed++; }
  };
  const result = execute('cat stream.txt | echo done', world);
  assert.equal(result.stdout, 'done\n');
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, ['/home/op/stream.txt']);
  assert.equal(pulled, 1);
  assert.equal(closed, 1);
});

test('R3 fix lifecycle: main rm guards still apply to producers whose stdout is ignored', () => {
  for (const raw of ['rm -rf ~ | echo done', 'rm -rf $HOME/* | echo done']) {
    const world = createWorld();
    const before = world.filePaths();
    const result = execute(raw, world);
    assert.equal(result.stdout, 'done\n');
    assert.equal(result.rc, 0);
    assert.match(result.stderr, /blocked/);
    assert.deepEqual(world.filePaths(), before);
  }
});

test('R3 fix source boundaries: sort/cut split per file while cat preserves raw concatenation', () => {
  const world = emptyWorld();
  world.writeFile('first.txt', 'z:9');
  world.writeFile('empty.txt', '');
  world.writeFile('last.txt', 'a:1\nb:2');
  assert.equal(execute('sort first.txt empty.txt last.txt', world).stdout, 'a:1\nb:2\nz:9\n');
  assert.equal(execute('cut -d: -f1 first.txt empty.txt last.txt', world).stdout, 'z\na\nb\n');
  assert.equal(execute('cat first.txt empty.txt last.txt', world).stdout, 'z:9a:1\nb:2');
  const missing = execute('sort first.txt missing.txt last.txt', world);
  assert.equal(missing.stdout, 'a:1\nb:2\nz:9\n');
  assert.equal(missing.rc, 1);
});

test('R3 fix source boundaries: stdin between files stays a distinct source for sort/cut', () => {
  const world = emptyWorld();
  world.writeFile('first.txt', 'z:9');
  world.writeFile('last.txt', 'a:1');
  assert.equal(execute('echo -n m:5 | sort first.txt - last.txt', world).stdout, 'a:1\nm:5\nz:9\n');
  assert.equal(execute('echo -n m:5 | cut -d: -f1 first.txt - last.txt', world).stdout, 'z\nm\na\n');
  assert.equal(execute('echo -n m:5 | cat first.txt - last.txt', world).stdout, 'z:9m:5a:1');
});

test('R3 fix Unicode: quoted/unquoted non-ASCII spaces survive in words and filenames', () => {
  const world = emptyWorld();
  for (const space of ['\u00a0', '\u3000', '\u2003', '\ufeff']) {
    assert.equal(execute(`echo x${space}y`, world).stdout, `x${space}y\n`);
    assert.equal(execute(`echo 'x${space}y' "x${space}y"`, world).stdout, `x${space}y x${space}y\n`);
    const name = `note${space}one.txt`;
    const result = execute(`echo value > '${name}'; cat ${name}`, world);
    assert.equal(result.stdout, 'value\n');
    assert.equal(result.rc, 0);
    assert.deepEqual(result.reads, [world.resolve(name)]);
  }
  assert.equal(execute('echo x\ty', world).stdout, 'x y\n');
});

test('R3 fix read snapshots: a rebound pathname keeps both actual inode reads; legacy reads stay unique', () => {
  const world = createWorld();
  const expectedOutput = world.readFile('shelf/jar.txt') + world.readFile('shelf/cat.txt');
  const raw = 'ln shelf/jar.txt temp.txt; cat temp.txt; rm temp.txt; ln shelf/cat.txt temp.txt; cat temp.txt';
  const result = execute(raw, world);
  assert.equal(result.stdout, expectedOutput);
  assert.equal(result.rc, 0);
  assert.deepEqual(result.reads, ['/home/op/temp.txt']);
  assert.deepEqual(result.readEvents, [
    { path: '/home/op/temp.txt', same_inode: ['/home/op/shelf/jar.txt', '/home/op/temp.txt'] },
    { path: '/home/op/temp.txt', same_inode: ['/home/op/shelf/cat.txt', '/home/op/temp.txt'] },
  ]);
});

test('R3 fix read snapshots: only a real post-rebind cat read earns dark credit and later cat discovery', async () => {
  const prefix = 'ln shelf/jar.txt temp.txt; cat temp.txt; rm temp.txt; ln shelf/cat.txt temp.txt';
  for (const readRebound of [false, true]) {
    const engine = new Engine();
    await engine.start();
    await engine.feed('r3aliases');
    const expectedOutput = engine.vfs.readFile('shelf/jar.txt') + (readRebound ? engine.vfs.readFile('shelf/cat.txt') : '');
    await engine.feed(prefix + (readRebound ? '; cat temp.txt' : ''));
    assert.equal(engine.history.at(-1).output, expectedOutput);
    assert.equal(engine.history.at(-1).rc, 0);
    assert.deepEqual({
      jar: engine.finds.has('jar'),
      catDark: engine.flags.has('flag.demo.cat_dark'),
      catLit: engine.flags.has('flag.demo.cat_lit'),
    }, { jar: true, catDark: readRebound, catLit: false }, String(readRebound));

    await engine.feed('systemctl start lamp');
    await engine.feed('lamp-before-sudo');
    await engine.feed('cat temp.txt; cat temp.txt');
    assert.equal(engine.flags.has('flag.demo.cat_lit'), true);
    assert.equal(engine.finds.has('cat'), readRebound);
    assert.equal(engine.save.commits.filter(c => c.kind === 'find' && c.data.id === 'jar').length, 1);
    assert.equal(engine.save.commits.filter(c => c.kind === 'find' && c.data.id === 'cat').length, readRebound ? 1 : 0);
    assert.equal(engine.save.commits.filter(c => c.kind === 'flag' && c.data.name === 'flag.demo.cat_lit').length, 1);
  }
});
