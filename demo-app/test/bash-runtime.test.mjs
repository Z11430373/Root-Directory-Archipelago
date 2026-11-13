import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Worker } from 'node:worker_threads';
import { createWorld, VFS } from '../src/vfs.js';
import { patchBashBrowserSource } from '../src/shell/bash-runtime.js';

const temp = await mkdtemp(join(process.env.LOCALAPPDATA || process.env.TEMP, process.env.LOCALAPPDATA ? 'Temp/opencode/ra-bash-test-' : 'ra-bash-test-'));
after(() => rm(temp, { recursive: true, force: true }));
const output = join(temp, 'runtime.mjs');
await build({ entryPoints: [fileURLToPath(new URL('../src/shell/bash-runtime.js', import.meta.url))],
  outfile: output, bundle: true, platform: 'browser', format: 'esm', target: 'es2020', minify: true,
  external: ['node:zlib', '@mongodb-js/zstd', 'node-liblzma', 'seek-bzip'],
  plugins: [{ name: 'pinned-just-bash-session', setup(builder) {
    builder.onLoad({ filter: /just-bash[\\/]dist[\\/]bundle[\\/]browser\.js$/ }, async ({ path }) => ({
      contents: patchBashBrowserSource(await readFile(path, 'utf8')), loader: 'js',
    }));
  } }],
}).catch(async error => { await rm(temp, { recursive: true, force: true }); throw error; });
const { executeBash } = await import(pathToFileURL(output).href)
  .catch(async error => { await rm(temp, { recursive: true, force: true }); throw error; });
const execute = (raw, vfs, options) => executeBash(raw, vfs, options);
function world() { const v = new VFS(); v.mkdir(v.home); return v; }

test('the twelve recorded Bash gap probes now run through the mature interpreter', async t => {
  const gaps = JSON.parse(await readFile(new URL('../../references/BASH_GAPS.json', import.meta.url), 'utf8'));
  for (const probe of gaps.results) await t.test(probe.name, async () => {
    const v = world(); v.writeFile('two words.txt', 'quoted\n'); v.writeFile('input.txt', 'fixture\n');
    const r = await execute(probe.command, v);
    assert.equal(r.stdout, probe.bash.stdout); assert.equal(r.rc, probe.bash.rc);
    if (probe.name === 'unknown command stream') assert.match(r.stderr, /ra_nonexistent_probe_command: command not found/);
    else assert.equal(r.stderr, probe.bash.stderr);
  });
});

test('mature parser: variables, substitution, arithmetic, OR, control flow, printf and redirects', async () => {
  const v = world();
  const r = await execute('answer=42; printf "%s\\n" "$answer" "$(echo ready)" "$((2+3))"; false || echo fallback; if [ "$answer" = 42 ]; then echo yes; fi; for word in one two; do echo "$word"; done; i=0; while [ "$i" -lt 2 ]; do echo "$i"; i=$((i+1)); done; printf fixture > input; cat < input; printf err >&2', v);
  assert.equal(r.stdout, '42\nready\n5\nfallback\nyes\none\ntwo\n0\n1\nfixture');
  assert.equal(r.stderr, 'err'); assert.equal(r.rc, 0);
  assert.equal(v.readFile('input'), 'fixture');
  const redirected = await execute('cat missing 2> errors; cat errors', v);
  assert.match(redirected.stdout, /missing.*No such file/); assert.equal(redirected.stderr, '');
});

test('variables, arrays, functions, aliases, cwd and previous rc survive structuredClone', async () => {
  const v = world();
  assert.equal((await execute('answer=42; a=(red blue); greet(){ printf "%s:%s\\n" "$answer" "$1"; }; alias hi="greet alias"; mkdir child; cd child; false', v)).rc, 1);
  const transferred = Object.assign(Object.create(Object.getPrototypeOf(v)), structuredClone(v));
  const r = await execute('printf "%s:%s:%s\\n" "$?" "$answer" "${a[1]}"; pwd; greet function; hi', transferred);
  assert.equal(r.stdout, '1:42:blue\n/home/op/child\n42:function\n42:alias\n'); assert.equal(r.stderr, '');
  assert.equal((await execute('printf "%s\\n" "$answer"', v)).stdout, '42\n');
});

test('two disposable Node Workers transfer shell state as data', async () => {
  async function submit(raw, vfs) {
    const source = `import { parentPort } from 'node:worker_threads';
      import { executeBash } from ${JSON.stringify(pathToFileURL(output).href)};
      import { VFS } from ${JSON.stringify(new URL('../src/vfs.js', import.meta.url).href)};
      parentPort.once('message', async ({raw, vfs}) => {
        Object.setPrototypeOf(vfs, VFS.prototype);
        try { const result = await executeBash(raw, vfs); parentPort.postMessage({result, vfs}); }
        catch (error) { parentPort.postMessage({error: error.stack}); }
      });`;
    const worker = new Worker(new URL('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
    try {
      return await new Promise((resolve, reject) => {
        worker.once('error', reject); worker.once('message', message => message.error ? reject(new Error(message.error)) : resolve(message));
        worker.postMessage({ raw, vfs });
      });
    } finally { await worker.terminate(); }
  }
  const first = await submit('x=worker; f(){ echo "$x"; }; alias hi=f; mkdir child; cd child; false', world());
  const second = await submit('printf "%s:%s\\n" "$?" "$PWD"; hi', first.vfs);
  assert.equal(second.result.stdout, '1:/home/op/child\nworker\n');
  assert.equal(second.result.stderr, ''); assert.equal(second.result.rc, 0);
});

test('no history replay; exit and subshell preserve correct parent state', async () => {
  const v = world();
  await execute('printf x >> calls; x=outer; (x=inner; cd /); x=kept; exit 7', v);
  const r = await execute('printf "%s:%s:%s\\n" "$?" "$x" "$PWD"; cat calls', v);
  assert.equal(r.stdout, '7:kept:/home/op\nx');
  assert.equal(v.readFile('calls'), 'x');
});

test('child shells receive exports and clean defaults, never the saved parent base state', async () => {
  const v = world();
  await execute('LOCAL=old; export VISIBLE=yes; a=(secret); f(){ echo leaked; }; alias aa="echo leaked"; set -o pipefail', v);
  const child = await execute('bash -c \'echo ${LOCAL-unset}:${a[0]-unset}:$VISIBLE; f; aa; set -o | grep pipefail\'', v);
  assert.match(child.stdout, /^unset:unset:yes\n/);
  assert.match(child.stdout, /pipefail\s+off/); assert.doesNotMatch(child.stdout, /leaked/);
  assert.match(child.stderr, /f: command not found/); assert.match(child.stderr, /aa: command not found/);
  assert.equal((await execute('unset LOCAL; bash -c \'echo ${LOCAL-unset}\'', v)).stdout, 'unset\n');
  const empty = await execute('env -i bash -c \'echo ${VISIBLE-unset}; f\'', v);
  assert.equal(empty.stdout, 'unset\n'); assert.match(empty.stderr, /f: command not found/);
  assert.equal((await execute('LOCAL=new; eval \'echo "$LOCAL"\'; printf \'echo "$LOCAL"\\n\' > script; source script', v)).stdout, 'new\nnew\n');
});

test('clock and PRNG are deterministic across clones, submissions and concurrent sessions', async () => {
  const first = world(), replay = world();
  const options = { seed: 19, nowMs: 1700000012000 };
  const raw = 'echo "$RANDOM:$RANDOM:$SECONDS" > random.txt; date +%s; date -d tomorrow +%s; printf "%(%s)T\\n" -1; jq -n now; awk \'BEGIN { print rand(); print srand() }\'; mkdir -p /tmp; mktemp';
  const [a, b] = await Promise.all([execute(raw, first, options), execute(raw, replay, options)]);
  assert.deepEqual(a, b); assert.equal(a.rc, 0); assert.equal(a.stderr, '');
  assert.equal(first.readFile('random.txt'), replay.readFile('random.txt'));
  assert.match(a.stdout, /^1700000012\n1700086412\n1700000012\n1700000012\n/);
  const clone = first.clone();
  const [c, d] = await Promise.all([execute('echo "$RANDOM:$SECONDS"', first, { ...options, nowMs: options.nowMs + 3000 }),
    execute('echo "$RANDOM:$SECONDS"', clone, { ...options, nowMs: options.nowMs + 3000 })]);
  assert.deepEqual(c, d); assert.match(c.stdout, /:3\n$/);
});

test('nested story commands fail explicitly while standalone start and status remain supported', async () => {
  const v = world();
  for (const raw of ['echo before; systemctl start lamp; echo after', 'if true; then git tag example; fi', 'systemctl start lamp | cat', 'f(){ systemctl start lamp; }; f']) {
    const r = await execute(raw, v); assert.notEqual(r.rc, 0); assert.match(r.stderr, /standalone top-level/);
  }
  assert.equal((await execute('systemctl start lamp', v)).rc, 0);
  assert.equal((await execute('systemctl status lamp', v)).stdout, 'inactive (dead)');
});

test('pipeline cd stays process-local and failed function redirects return rc1 before its body', async () => {
  const v = world(); v.writeFile('cwd-marker.txt', 'root\n'); v.writeFile('nested/cwd-marker.txt', 'nested\n');
  assert.equal((await execute('cd nested | cat; cat cwd-marker.txt', v)).stdout, 'root\n');
  assert.equal(v.cwd, v.home);
  const r = await execute('echo before; value=before; bump(){ value=changed; }; bump > missing/out.txt', v);
  assert.equal(r.rc, 1); assert.equal(r.stdout, 'before\n'); assert.match(r.stderr, /missing\/out.txt.*No such file/);
  assert.equal((await execute('printf "%s:%s\\n" "$?" "$value"', v)).stdout, '1:before\n');
  assert.equal((await execute('bump < missing-input', v)).rc, 1);
  assert.equal((await execute('echo "$value"', v)).stdout, 'before\n');
});

test('read events snapshot actual inode aliases before unlink/rebind; dead branches do not read', async () => {
  const v = world(); v.writeFile('source', 'secret\n'); v.link('source', 'alias');
  const r = await execute('false && cat source; cat alias; rm alias; printf new > alias; cat alias', v, { branch: 'experiment' });
  assert.equal(r.stdout, 'secret\nnew');
  assert.deepEqual(r.readEvents, [
    { path: '/home/op/alias', same_inode: ['/home/op/source', '/home/op/alias'] },
    { path: '/home/op/alias', same_inode: ['/home/op/alias'] },
  ]);
  assert.deepEqual(r.reads, ['/home/op/alias']);
});

test('head zero and recursive grep unseen content do not create discoveries', async () => {
  const v = world(); v.writeFile('story/a', 'visible\n'); v.writeFile('story/b', 'hidden\n');
  assert.deepEqual((await execute('head -n 0 story/b', v)).readEvents, []);
  const r = await execute('grep -r visible story', v);
  assert.equal(r.stdout, 'story/a:visible\n');
  assert.deepEqual(r.reads, ['/home/op/story/a']);
});

test('input redirect discoveries follow actual consumers and the final redirect', async () => {
  const v = world(); v.writeFile('a', 'first\n'); v.writeFile('b', 'last\n');
  assert.deepEqual((await execute('echo no-read < a; head -n0 < b', v)).readEvents, []);
  assert.deepEqual((await execute('cat < a < b', v)).reads, ['/home/op/b']);
  assert.deepEqual((await execute('{ echo fake | cat; printf "" | cat; } < a', v)).readEvents, []);
  assert.deepEqual((await execute('{ cat | head; } < a', v)).reads, ['/home/op/a']);
  assert.deepEqual((await execute('{ rm a; cat; } < a', v, { branch: 'experiment' })).readEvents,
    [{ path: '/home/op/a', same_inode: ['/home/op/a'] }]);
});

test('hardlinks survive writes; clones isolate both filesystem and session', async () => {
  const v = world(); await execute('x=main; printf original > file; ln file linked', v);
  const fork = v.clone();
  await execute('x=branch; printf changed > linked; f(){ echo branch; }', fork, { branch: 'experiment' });
  assert.equal(v.readFile('file'), 'original'); assert.equal(fork.readFile('file'), 'changed');
  assert.equal((await execute('echo "$x"', v)).stdout, 'main\n');
  assert.equal((await execute('echo "$x"; f', fork)).stdout, 'branch\nbranch\n');
});

test('main rm protections apply through variables and aliases; branch removal stays isolated', async () => {
  const v = world(); v.writeFile('notes/a', 'keep'); v.writeFile('other', 'keep');
  assert.equal((await execute('target="$HOME"; rm -rf "$target"', v)).rc, 1);
  assert.equal((await execute('alias wipe="rm -rf"; wipe "$HOME"/*', v)).rc, 1);
  assert.ok(v.exists('notes/a')); assert.ok(v.exists('other'));
  const fork = v.clone(); await execute('rm -rf "$HOME"/*', fork, { branch: 'experiment' });
  assert.equal(fork.exists('notes/a'), false); assert.equal(v.exists('notes/a'), true);
});

test('literal quoted tilde/home paths and UTF8 input/redirects preserve text', async () => {
  const v = world();
  const r = await execute('printf 世界 > "~"; cat "~"; printf 中文 | cat; printf 中文 > text; cat text', v);
  assert.equal(r.stdout, '世界中文中文'); assert.equal(v.readFile('/home/op/~'), '世界');
});

test('syntax errors return rc2 and preserve state; world cwd wins over serialized cwd', async () => {
  const v = createWorld(); await execute('x=stored', v);
  assert.equal((await execute('if then', v)).rc, 2);
  v.cwd = '/';
  const r = await execute('printf "%s:%s:%s\\n" "$?" "$x" "$PWD"', v);
  assert.equal(r.stdout, '2:stored:/\n');
});

test('source hook refuses mismatched releases', () => {
  assert.throws(() => patchBashBrowserSource('newVersion'), /hook mismatch/);
});
