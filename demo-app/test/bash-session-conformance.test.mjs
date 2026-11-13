/**
 * Independent executeBash contract: fixed GNU Bash oracles, persistent sessions,
 * and game-only VFS invariants. No runtime implementation/private fields inspected.
 * Native scripts below are literals; argv, player journals and upstream scripts
 * are never executed. Native writes stay in a fresh test-owned Temp directory.
 * Run with node --test directly: npm test's pretest would build the application.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { VFS } from '../src/vfs.js';

const bash = 'C:/Program Files/Git/bin/bash.exe';
const runtimeURL = new URL('../src/shell/bash-runtime.js', import.meta.url);
const nativeSkip = existsSync(bash) ? false : `GNU Bash oracle unavailable: ${bash}`;
const runtimeSkip = existsSync(runtimeURL) ? false : 'Pending: src/shell/bash-runtime.js does not exist yet';
const differentialSkip = runtimeSkip || nativeSkip;
const commandMissing = 'ra_conformance_command_does_not_exist_20261102';
const fixtures = Object.freeze({
  'input.txt': 'alpha\nbeta\n',
  'two words.txt': 'quoted fixture\n',
  'source.txt': 'first\n',
  'other.txt': 'second\n',
  'cwd-marker.txt': 'root\n',
  'nested/cwd-marker.txt': 'nested\n',
});

// raw is always a literal authored here. A descriptor may specify stable stderr
// or a diagnostic pattern when Bash's executable/line prefix is host-dependent.
const step = (raw, stdout = '', rc = 0, extra = {}) => ({ raw, stdout, stderr: '', rc, ...extra });
const probes = [
  {
    name: 'variables, functions, aliases, cwd and previous status persist',
    clone: true,
    steps: [
      step(String.raw`shopt -s expand_aliases; answer='two words'; counter=41; report() { printf '%s:%s\n' "$answer" "$1"; }; alias ra_hello='printf "alias ready\n"'; cd nested; false`, '', 1, { cwd: 'nested' }),
      step(String.raw`printf 'last=%s\n' "$?"; printf 'cwd=%s\n' "${'${PWD##*/}'}"; report "$((counter + 1))"; ra_hello`, 'last=1\ncwd=nested\ntwo words:42\nalias ready\n', 0, { cwd: 'nested' }),
      step(String.raw`answer=changed; report next; ra_hello`, 'changed:next\nalias ready\n', 0, { cwd: 'nested' }),
    ],
  },
  {
    name: 'quoting preserves empty arguments, punctuation and quoted filenames',
    steps: [step(String.raw`value='two words'; printf '<%s>\n' "$value" '$value' '' 'semi;|&'; cat "two words.txt"`, '<two words>\n<$value>\n<>\n<semi;|&>\nquoted fixture\n', 0, {
      events: [{ path: 'two words.txt', aliases: ['two words.txt'] }],
    })],
  },
  {
    name: 'command substitution strips trailing newlines and records actual reads',
    steps: [
      step(String.raw`value=$(printf 'line one\nline two\n\n'); printf '<%s>\n' "$value"`, '<line one\nline two>\n'),
      step(String.raw`value=$(cat "two words.txt"); printf '<%s>\n' "$value"`, '<quoted fixture>\n', 0, {
        events: [{ path: 'two words.txt', aliases: ['two words.txt'] }],
      }),
    ],
  },
  {
    name: 'arithmetic expansion and assignment retain numeric results',
    steps: [
      step(String.raw`n=3; printf '%s\n' "$((n * (n + 1)))"; n=$((n + 2))`, '12\n'),
      step(String.raw`printf '%s:%s\n' "$n" "$((n % 2))"`, '5:1\n'),
    ],
  },
  {
    name: 'OR, AND and if use command status and short circuit',
    steps: [step(String.raw`false || printf 'fallback\n'; true || printf 'wrong\n'; false && printf 'wrong\n'; if false; then printf 'wrong\n'; elif true; then printf 'selected\n'; else printf 'wrong\n'; fi`, 'fallback\nselected\n')],
  },
  {
    name: 'for and while loops preserve quoted words and loop variables',
    steps: [
      step(String.raw`for word in one 'two words'; do printf '[%s]\n' "$word"; done; n=0; while [ "$n" -lt 3 ]; do printf '%s\n' "$n"; n=$((n + 1)); done`, '[one]\n[two words]\n0\n1\n2\n'),
      step(String.raw`printf '%s:%s\n' "$word" "$n"`, 'two words:3\n'),
    ],
  },
  {
    name: 'printf keeps UTF-8, tab, padding and missing final newline bytes',
    steps: [step(String.raw`printf '%s\t%04d\n' '群島' 7; printf '%s' no-newline`, '群島\t0007\nno-newline')],
  },
  {
    name: 'stdin redirection preserves bytes and credits the named file',
    steps: [step('cat < input.txt', 'alpha\nbeta\n', 0, {
      events: [{ path: 'input.txt', aliases: ['input.txt'] }],
    })],
  },
  {
    name: 'stdout and stderr redirects stay distinct',
    steps: [step(String.raw`{ printf 'out\n'; printf 'err\n' >&2; } > out.txt 2> err.txt; cat out.txt; cat err.txt; printf 'visible error\n' >&2`, 'out\nerr\n', 0, { stderr: 'visible error\n' })],
    files: { 'out.txt': 'out\n', 'err.txt': 'err\n' },
  },
  {
    name: 'descriptor duplication follows left-to-right redirect order',
    steps: [step(String.raw`{ printf 'out\n'; printf 'err\n' >&2; } > both.txt 2>&1; cat both.txt; { printf 'out2\n'; printf 'err2\n' >&2; } 2>&1 > stdout.txt; cat stdout.txt`, 'out\nerr\nerr2\nout2\n')],
    files: { 'both.txt': 'out\nerr\n', 'stdout.txt': 'out2\n' },
  },
  {
    name: 'pipelines transport bytes and use the final command status',
    steps: [
      step(String.raw`printf 'c\na\nb\n' | sort | head -n 2; false | true; printf 'last=%s\n' "$?"; true | false`, 'a\nb\nlast=0\n', 1),
      step(String.raw`printf 'previous=%s\n' "$?"`, 'previous=1\n'),
    ],
  },
  {
    name: 'pipeline and command-substitution state cannot leak into the parent',
    steps: [step(String.raw`cd nested | cat; cat cwd-marker.txt; value=outer; value=inner | cat; sub=$(value=child; cd nested; cat cwd-marker.txt); printf '%s:%s\n' "$value" "$sub"; cat cwd-marker.txt`, 'root\nouter:nested\nroot\n', 0, { cwd: '' })],
  },
  {
    name: 'pipeline cd does not change later file lookup or the next call cwd',
    steps: [
      step('cd nested | cat; cat cwd-marker.txt', 'root\n', 0, { cwd: '' }),
      step('cat cwd-marker.txt', 'root\n', 0, { cwd: '' }),
    ],
  },
  {
    name: 'command-substitution cd does not change later file lookup or the next call cwd',
    steps: [
      step(String.raw`sub=$(cd nested; cat cwd-marker.txt); printf '%s\n' "$sub"; cat cwd-marker.txt`, 'nested\nroot\n', 0, { cwd: '' }),
      step('cat cwd-marker.txt', 'root\n', 0, { cwd: '' }),
    ],
  },
  {
    name: 'brace expansion and parameter defaults close the recorded gaps',
    steps: [step(String.raw`unset RA_CONFORMANCE_UNSET; printf '<%s>\n' {one,two} "${'${RA_CONFORMANCE_UNSET:-fallback}'}"`, '<one>\n<two>\n<fallback>\n')],
  },
  {
    name: 'saving session state never replays substitution or function side effects',
    clone: true,
    steps: [
      step(String.raw`value=$(printf 'substitution\n' >> effects.txt; printf seed); printf 'direct\n' >> effects.txt; bump() { printf 'function\n' >> effects.txt; }; bump`, '', 0, {
        files: { 'effects.txt': 'substitution\ndirect\nfunction\n' }, events: [],
      }),
      step(String.raw`printf '%s\n' "$value"; cat effects.txt; bump`, 'seed\nsubstitution\ndirect\nfunction\n', 0, {
        files: { 'effects.txt': 'substitution\ndirect\nfunction\nfunction\n' },
        events: [{ path: 'effects.txt', aliases: ['effects.txt'] }],
      }),
      step('cat effects.txt', 'substitution\ndirect\nfunction\nfunction\n', 0, {
        events: [{ path: 'effects.txt', aliases: ['effects.txt'] }],
      }),
    ],
    files: { 'effects.txt': 'substitution\ndirect\nfunction\nfunction\n' },
  },
  {
    name: 'hardlink overwrite and append retain one inode across calls',
    clone: true,
    steps: [
      step(String.raw`ln source.txt linked.txt; printf 'updated\n' > linked.txt; cat source.txt`, 'updated\n', 0, {
        events: [{ path: 'source.txt', aliases: ['source.txt', 'linked.txt'] }],
      }),
      step(String.raw`printf 'plus\n' >> source.txt; cat linked.txt`, 'updated\nplus\n', 0, {
        events: [{ path: 'linked.txt', aliases: ['source.txt', 'linked.txt'] }],
      }),
    ],
    files: { 'source.txt': 'updated\nplus\n', 'linked.txt': 'updated\nplus\n' },
    hardlinks: [['source.txt', 'linked.txt']],
  },
  {
    name: 'read events snapshot aliases before unlink and pathname rebinding',
    steps: [step('ln source.txt temp.txt; cat temp.txt; rm temp.txt; ln other.txt temp.txt; cat temp.txt; rm temp.txt', 'first\nsecond\n', 0, {
      events: [
        { path: 'temp.txt', aliases: ['source.txt', 'temp.txt'] },
        { path: 'temp.txt', aliases: ['other.txt', 'temp.txt'] },
      ],
    })],
    files: { 'source.txt': 'first\n', 'other.txt': 'second\n' },
    absent: ['temp.txt'],
  },
  {
    name: 'unknown commands report stderr and preserve rc 127 for the next call',
    clone: true,
    steps: [
      step(commandMissing, '', 127, { diagnostic: new RegExp(`${commandMissing}: command not found`) }),
      step(String.raw`printf 'last=%s\n' "$?"`, 'last=127\n'),
    ],
  },
  {
    name: 'unknown-command diagnostics stay out of stdout pipes and can be redirected',
    steps: [
      step(`${commandMissing} | wc -c`, '0\n', 0, { diagnostic: new RegExp(`${commandMissing}: command not found`) }),
      step(`${commandMissing} 2> diagnostic.txt`, '', 127),
      step(String.raw`printf '%s\n' "$?"; grep -c 'command not found' diagnostic.txt`, '127\n1\n'),
    ],
  },
  {
    name: 'nonzero status commits completed writes and assignments',
    clone: true,
    steps: [
      step(String.raw`kept=alive; printf 'persisted\n' > kept.txt; false`, '', 1, { files: { 'kept.txt': 'persisted\n' } }),
      step(String.raw`printf '%s:%s\n' "$?" "$kept"; cat kept.txt`, '1:alive\npersisted\n'),
    ],
    files: { 'kept.txt': 'persisted\n' },
  },
  {
    name: 'failed cd preserves cwd and a failed redirect suppresses command startup',
    steps: [
      step('cd absent-directory', '', 1, { diagnostic: /absent-directory.*No such file or directory/, cwd: '' }),
      step(String.raw`printf 'cd=%s\n' "$?"; cat cwd-marker.txt; value=before; bump() { value=changed; }; bump > missing/out.txt`, 'cd=1\nroot\n', 1, { diagnostic: /missing\/out\.txt.*No such file or directory/, cwd: '' }),
      step(String.raw`printf 'redirect=%s:%s\n' "$?" "$value"`, 'redirect=1:before\n'),
    ],
    absent: ['missing', 'missing/out.txt'],
  },
  {
    name: 'parse errors return rc 2 and leave a settled session usable',
    clone: true,
    steps: [
      step(String.raw`kept=ready; printf 'before\n' > kept.txt`),
      step("printf '%s\\n' 'unterminated", '', 2, { diagnostic: /unexpected|unterminated|unclosed|syntax/i }),
      step(String.raw`printf '%s:%s\n' "$?" "$kept"; cat kept.txt`, '2:ready\nbefore\n'),
    ],
    files: { 'kept.txt': 'before\n' },
  },
  {
    name: 'unset, function deletion and unalias persist without resurrecting state',
    clone: true,
    steps: [
      step(String.raw`shopt -s expand_aliases; value=old; report() { printf 'old\n'; }; alias ra_old='printf "old alias\n"'`),
      step('unset value; unset -f report; unalias ra_old'),
      step(String.raw`printf '%s\n' "${'${value:-missing}'}"; if type report; then printf 'wrong\n'; else printf 'function removed\n'; fi; if alias ra_old; then printf 'wrong\n'; else printf 'alias removed\n'; fi`, 'missing\nfunction removed\nalias removed\n', 0, { diagnostic: /report.*not found[\s\S]*ra_old.*not found/ }),
    ],
  },
];

function fixtureWorld() {
  const world = new VFS();
  world.mkdir(world.home);
  for (const [name, text] of Object.entries(fixtures)) world.writeFile(name, text);
  return world;
}

// This is the public worker boundary already used by shell/worker.js. No shell
// state property is named: every portable own field must survive structuredClone.
const rehydrate = world => Object.assign(new VFS(), structuredClone(world));
const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";

/** Split framed raw buffers without trimming newlines or normalizing CR/LF. */
function frames(buffer, count) {
  const result = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const marker = Buffer.from(`\0RA_BASH_STEP_${i}_RC_`);
    const start = buffer.indexOf(marker, offset);
    assert.notEqual(start, -1, `Missing native frame ${i}`);
    const end = buffer.indexOf(0, start + marker.length);
    assert.notEqual(end, -1, `Unterminated native frame ${i}`);
    const code = buffer.subarray(start + marker.length, end).toString('ascii');
    assert.match(code, /^\d+$/);
    result.push({ bytes: buffer.subarray(offset, start), rc: Number(code) });
    offset = end + 1;
  }
  assert.equal(buffer.subarray(offset).length, 0, 'Unexpected bytes after native frames');
  return result;
}

const nativeCache = new Map();
function oracle(probe) {
  // Only descriptors in this module's fixed registry may reach the host shell.
  assert.ok(probes.includes(probe), 'Oracle accepts only its fixed probe registry');
  if (!nativeCache.has(probe)) nativeCache.set(probe, runOracle(probe));
  return nativeCache.get(probe);
}

async function runOracle(probe) {
  const base = path.join(process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local'), 'Temp', 'opencode');
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(path.join(base, 'ra-bash-session-'));
  try {
    for (const [name, text] of Object.entries(fixtures)) {
      const target = path.join(directory, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, text);
    }
    // One Bash process per session, eval solely to create parser boundaries like
    // separate submitted commands. The status-restoring subshell has no writes;
    // it prevents the framing printf commands from changing the next step's $?.
    const script = [
      'export PATH=/usr/bin:/bin LC_ALL=C LANG=C',
      'shopt -s expand_aliases',
      'true',
      ...probe.steps.flatMap((entry, i) => [
        `eval ${quote(entry.raw)}`,
        '__ra_conformance_status=$?',
        `printf '\\000RA_BASH_STEP_${i}_RC_%s\\000' "$__ra_conformance_status"`,
        `printf '\\000RA_BASH_STEP_${i}_RC_%s\\000' "$__ra_conformance_status" >&2`,
        '(exit "$__ra_conformance_status")',
      ]),
      'exit "$__ra_conformance_status"',
      '',
    ].join('\n');
    // No inherited BASH_ENV, exported functions, user PATH, scripts or shell
    // options. HOME/cwd stay isolated. TEMP/TMP use the stable approved base:
    // MSYS /tmp mappings can outlive a process and must not name a deleted case.
    const env = {
      SystemRoot: process.env.SystemRoot || process.env.SYSTEMROOT || 'C:\\Windows',
      WINDIR: process.env.WINDIR || 'C:\\Windows',
      PATH: 'C:/Program Files/Git/usr/bin;C:/Program Files/Git/bin',
      HOME: directory, TEMP: base, TMP: base,
      LC_ALL: 'C', LANG: 'C', BASH_ENV: '', ENV: '',
    };
    const native = spawnSync(bash, ['--noprofile', '--norc', '-s'], {
      input: script, cwd: directory, env, timeout: 10_000, maxBuffer: 1024 * 1024, windowsHide: true,
    });
    if (native.error) throw native.error;
    assert.equal(native.signal, null, `${probe.name}: native Bash was interrupted`);
    const stdout = frames(native.stdout, probe.steps.length);
    const stderr = frames(native.stderr, probe.steps.length);
    const results = stdout.map((out, i) => {
      assert.equal(out.rc, stderr[i].rc, 'stdout/stderr frame status agrees');
      return { stdout: out.bytes, stderr: stderr[i].bytes, rc: out.rc };
    });
    assert.equal(native.status, results.at(-1).rc, 'Native process exits with its final command status');
    for (const [name, text] of Object.entries(probe.files || {})) {
      assert.deepEqual(await readFile(path.join(directory, name)), Buffer.from(text), `native file ${name}`);
    }
    for (const name of probe.absent || []) assert.equal(existsSync(path.join(directory, name)), false, `native absence: ${name}`);
    for (const [source, linked] of probe.hardlinks || []) {
      const [a, b] = await Promise.all([stat(path.join(directory, source)), stat(path.join(directory, linked))]);
      assert.equal(a.ino, b.ino, 'Native link fixture really shares an inode');
      assert.equal(a.nlink, 2);
    }
    return results;
  } finally {
    await rm(directory, { recursive: true, force: true });
    assert.equal(existsSync(directory), false, 'Owned native fixtures must be cleaned even after assertion failure');
  }
}

function assertBytes(actual, expected, message) {
  assert.deepEqual(typeof actual === 'string' ? Buffer.from(actual, 'utf8') : actual,
    typeof expected === 'string' ? Buffer.from(expected, 'utf8') : expected, message);
}

function assertDiagnostic(actual, entry, label) {
  if (entry.diagnostic) {
    const text = typeof actual === 'string' ? actual : actual.toString('utf8');
    assert.ok(text.length, `${label}: diagnostics belong on stderr`);
    assert.match(text, entry.diagnostic, label);
  } else assertBytes(actual, entry.stderr, `${label}: stderr`);
}

let runtime;
async function invoke(raw, world, options = {}) {
  // Import lazily, so the native-only command never loads an unfinished module.
  runtime ??= import(runtimeURL.href);
  const { executeBash } = await runtime;
  assert.equal(typeof executeBash, 'function', 'bash-runtime.js exports executeBash');
  const result = await executeBash(raw, world, options);
  assert.ok(result && typeof result === 'object', 'executeBash returns a result object');
  assert.equal(typeof result.stdout, 'string');
  assert.equal(typeof result.stderr, 'string');
  assert.ok(Number.isInteger(result.rc) && result.rc >= 0 && result.rc <= 255, 'rc is a shell exit status');
  assert.ok(Array.isArray(result.readEvents), 'readEvents is present on every result, including errors');
  return result;
}

function checkWorld(world, entry) {
  for (const [name, text] of Object.entries(entry.files || {})) assertBytes(world.readFile(name), text, `VFS file ${name}`);
  for (const name of entry.absent || []) assert.equal(world.exists(name), false, `VFS absence: ${name}`);
  for (const [source, linked] of entry.hardlinks || []) {
    assert.equal(world.stat(source).inode, world.stat(linked).inode);
    assert.equal(world.stat(source).nlink, 2);
  }
  if (Object.hasOwn(entry, 'cwd')) assert.equal(world.cwd, world.home + (entry.cwd ? '/' + entry.cwd : ''));
}

async function compareSession(probe, cloneBetweenCalls) {
  const expected = await oracle(probe);
  let world = fixtureWorld();
  const sourcePath = world.resolve('source.txt'), sourceInode = world.stat(sourcePath).inode;
  for (const [i, entry] of probe.steps.entries()) {
    const actual = await invoke(entry.raw, world);
    const label = `${probe.name}, step ${i + 1}`;
    assert.equal(actual.rc, expected[i].rc, `${label}: rc`);
    assertBytes(actual.stdout, expected[i].stdout, `${label}: stdout`);
    if (entry.diagnostic) assertDiagnostic(actual.stderr, entry, label);
    else assertBytes(actual.stderr, expected[i].stderr, `${label}: stderr`);
    if (entry.events) {
      assert.deepEqual(actual.readEvents.map(event => ({ path: event.path, same_inode: [...event.same_inode].sort() })),
        entry.events.map(event => ({
          path: `${world.home}/${event.path}`,
          same_inode: event.aliases.map(name => `${world.home}/${name}`).sort(),
        })), `${label}: actual reads with read-time inode aliases`);
    }
    checkWorld(world, entry);
    if (cloneBetweenCalls) world = rehydrate(world);
  }
  checkWorld(world, probe);
  assert.equal(world.stat(sourcePath).inode, sourceInode, 'Unrelated serialization or writes must not replace an existing inode');
}

test('Bash native oracle: fixed sessions match independently specified bytes and statuses', { skip: nativeSkip, timeout: 60_000 }, async t => {
  const version = spawnSync(bash, ['--noprofile', '--norc', '--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
  if (version.error) throw version.error;
  assert.equal(version.status, 0);
  assert.match(version.stdout, /GNU bash, version/);
  t.diagnostic(version.stdout.split(/\r?\n/)[0]);
  for (const probe of probes) await t.test(probe.name, async () => {
    const results = await oracle(probe);
    for (const [i, entry] of probe.steps.entries()) {
      assert.equal(results[i].rc, entry.rc, `${probe.name}: step ${i + 1} rc`);
      assertBytes(results[i].stdout, entry.stdout, `${probe.name}: step ${i + 1} stdout`);
      assertDiagnostic(results[i].stderr, entry, `${probe.name}: step ${i + 1}`);
    }
  });
});

for (const probe of probes) {
  test(`Bash adapter: ${probe.name}`, { skip: differentialSkip, timeout: 15_000 }, () => compareSession(probe, false));
  if (probe.clone) test(`Bash structuredClone: ${probe.name}`, { skip: differentialSkip, timeout: 15_000 }, () => compareSession(probe, true));
}

test('Bash isolation: interleaved VFS instances have independent variables, definitions and last status', { skip: runtimeSkip, timeout: 15_000 }, async () => {
  const left = fixtureWorld(), right = fixtureWorld();
  await invoke(String.raw`value=left; report() { printf 'left\n'; }; false`, left);
  await invoke(String.raw`value=right; report() { printf 'right\n'; }; true`, right);
  assert.equal((await invoke(String.raw`printf '%s:%s\n' "$?" "$value"; report`, left)).stdout, '1:left\nleft\n');
  assert.equal((await invoke(String.raw`printf '%s:%s\n' "$?" "$value"; report`, right)).stdout, '0:right\nright\n');
});

for (const [name, copy] of [['structuredClone', rehydrate], ['VFS.clone', world => world.clone()]]) {
  test(`Bash isolation: ${name} copies shell state and detached hardlinks without replay`, { skip: runtimeSkip, timeout: 15_000 }, async () => {
    const original = fixtureWorld();
    await invoke(String.raw`shopt -s expand_aliases; value=main; report() { printf '%s\n' "$value"; }; alias ra_report=report; ln source.txt linked.txt; printf 'once\n' >> source.txt; false`, original);
    const fork = copy(original);
    assert.equal((await invoke(String.raw`printf '%s\n' "$?"; ra_report; value=branch; printf 'branch\n' > linked.txt; cd nested`, fork)).stdout, '1\nmain\n');
    assert.equal(fork.readFile('../source.txt'), 'branch\n');
    assert.equal((await invoke(String.raw`printf '%s\n' "$?"; ra_report; cat linked.txt`, original)).stdout, '1\nmain\nfirst\nonce\n');
    assert.equal(original.cwd, original.home);
    assert.equal(original.stat('source.txt').inode, original.stat('linked.txt').inode);
    assert.equal((await invoke(String.raw`printf '%s\n' "$value"`, fork)).stdout, 'branch\n');
  });
}

test('Bash game policy: main-world recursive rm protection is intentional and never sent to native Bash', { skip: runtimeSkip, timeout: 15_000 }, async () => {
  for (const raw of ['rm -rf ~', 'rm -rf /', 'rm -rf $HOME/*']) {
    const world = fixtureWorld();
    const before = world.filePaths().map(name => [name, world.readFile(name)]);
    const result = await invoke(raw, world, { branch: 'main' });
    assert.notEqual(result.rc, 0, raw);
    assert.match(result.stderr, /blocked/i, raw);
    assert.deepEqual(world.filePaths().map(name => [name, world.readFile(name)]), before, raw);
  }
  const branch = fixtureWorld();
  const result = await invoke('rm -rf ~', branch, { branch: 'alt/sandbox' });
  assert.equal(result.rc, 0);
  assert.equal(branch.empty(branch.home), true);
  assert.equal(branch.isDirectory(branch.home), true, 'Game branch deletion intentionally retains its home directory');
});

async function sessionEngine(onOutput) {
  const { Engine } = await import('../src/engine/index.js');
  const engine = new Engine({ onOutput });
  engine.shellExecutor = invoke;
  await engine.start();
  await engine.feed('bashcontract');
  return engine;
}

const settledSession = String.raw`shopt -s expand_aliases; value=before; report() { printf '%s\n' "$value"; }; alias ra_report=report; printf 'kept\n' > transaction.txt; false`;
const abandonedSession = String.raw`value=after; report() { printf 'changed function\n'; }; alias ra_report='printf "changed alias\n"'; printf 'abandoned\n' > transaction.txt; cd notes; true`;
const inspectSession = String.raw`printf '%s:%s\n' "$?" "$value"; ra_report; cat transaction.txt`;

for (const initialized of [false, true]) {
  test(`Bash transaction: executor failure restores ${initialized ? 'settled' : 'initial'} shellState and VFS`, { skip: runtimeSkip, timeout: 15_000 }, async () => {
    const published = [], engine = await sessionEngine((text, kind) => published.push({ text, kind }));
    if (initialized) {
      await engine.feed(settledSession);
      assert.ok(engine.vfs.shellState && typeof engine.vfs.shellState === 'object', 'Session is stored in serializable vfs.shellState');
    }
    const world = engine.vfs, before = structuredClone(world), state = structuredClone(world.shellState);
    const hadState = Object.hasOwn(world, 'shellState');
    const outputCount = published.length, history = structuredClone(engine.history), now = engine.now;
    let executed = false;
    engine.shellExecutor = async (...args) => {
      await invoke(...args);
      executed = true;
      assert.notDeepEqual(world.shellState, state, 'Actual runtime changed session state before the injected failure');
      assert.equal(world.readFile('../transaction.txt'), 'abandoned\n');
      throw new Error('conformance injected executor failure after execution');
    };
    await assert.rejects(engine.feed(abandonedSession, 31), /conformance injected executor failure/);
    assert.equal(executed, true);
    assert.equal(engine.vfs, world);
    assert.equal(Object.hasOwn(world, 'shellState'), hadState, 'Rollback also restores absence of initial session state');
    assert.deepEqual(world.shellState, state);
    assert.deepEqual(structuredClone(world), before);
    assert.deepEqual(engine.history, history);
    assert.equal(engine.now, now);
    assert.equal(published.length, outputCount);
    engine.shellExecutor = invoke;
    await engine.feed(initialized ? inspectSession : String.raw`printf '%s:%s\n' "$?" "${'${value:-absent}'}"`);
    assert.equal(engine.history.at(-1).output, initialized ? '1:before\nbefore\nkept\n' : '0:absent\n', 'The next execution reads restored state, not a cached failed session');
  });
}

test('Bash transaction: ShellJob cancellation discards a completed isolated shellState before reply acceptance', { skip: runtimeSkip, timeout: 15_000 }, async t => {
  const { ShellJob } = await import('../src/ui/shell-job.js');
  const published = [], engine = await sessionEngine((text, kind) => published.push({ text, kind }));
  await engine.feed(settledSession);
  const world = engine.vfs, before = structuredClone(world), state = structuredClone(world.shellState);
  assert.ok(state && typeof state === 'object');
  const history = structuredClone(engine.history), outputCount = published.length, now = engine.now;
  let completed, failed;
  const received = new Promise((resolve, reject) => { completed = resolve; failed = reject; });
  const globals = new Map(['Worker', '__SHELL_WORKER_SOURCE__'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

  // Controlled worker *transport*, not a replacement shell implementation.
  // Run the real executeBash against a real structured clone, then withhold its
  // reply. This targets ShellJob.cancel's acceptance race deterministically;
  // actual Worker termination remains covered by console-worker.test.mjs.
  class HeldWorker {
    postMessage(data) {
      const { raw, state: incoming, options } = structuredClone(data);
      const isolated = Object.assign(new VFS(), incoming);
      invoke(raw, isolated, options).then(result => {
        this.reply = structuredClone({ result, state: isolated });
        completed(this);
      }, failed);
    }
    terminate() { this.terminated = true; }
  }
  globalThis.Worker = HeldWorker;
  globalThis.__SHELL_WORKER_SOURCE__ = '// Test-controlled structured-clone transport; real executeBash runs in postMessage.';
  const job = new ShellJob();
  t.after(() => {
    job.cancel();
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  engine.shellExecutor = (...args) => job.run(...args);
  const pending = engine.feed(abandonedSession, 31);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  const worker = await received;
  assert.notDeepEqual(worker.reply.state.shellState, state, 'The isolated command actually completed a different shell session');
  assert.equal(worker.reply.state.cwd, '/home/op/notes');
  assert.deepEqual(world.shellState, state, 'Unaccepted worker state is never visible to the live VFS');
  assert.equal(job.cancel(), true);
  await rejected;
  assert.equal(worker.terminated, true);
  assert.equal(job.pending, null);
  assert.equal(job.cancel(), false);
  assert.equal(engine.vfs, world);
  assert.deepEqual(world.shellState, state);
  assert.deepEqual(structuredClone(world), before);
  assert.deepEqual(engine.history, history);
  assert.equal(engine.now, now);
  assert.equal(published.length, outputCount);
  engine.shellExecutor = invoke;
  await engine.feed(inspectSession);
  assert.equal(engine.history.at(-1).output, '1:before\nbefore\nkept\n');
});
