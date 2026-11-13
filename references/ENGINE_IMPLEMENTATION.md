# just-bash engine implementation (2026-11-02)

## Integration contract

- Exact npm version: **just-bash 3.6.0**, entry `just-bash/browser`; Node >=20.19.
- `src/shell/bash-runtime.js`: `executeBash(raw, vfs, options={})` asynchronously returns `{stdout,stderr,rc,reads,readEvents}`. `options`: flags, branch, signal, executionLimits, seed, nowMs, allowGameCommand (false additionally forbids even standalone game effects).
- `src/shell/bash-vfs.js`: `BashVFS` implements asynchronous IFileSystem over the game VFS only.
- `vfs.shellState = {version:'3.6.0',state:<structured-cloneable interpreter state>,randomState:<uint32>}`. VFS constructor must initialize null; clone must deep-copy it; Worker successful results transfer it. No history replay or permanent Worker.
- **Required pinned source hook:** export `patchBashBrowserSource(source)` from bash-runtime.js. The official minified 3.6.0 browser file contains exactly once `R=await new ia(E,m).executeScript(x)`. The function inserts one observer before `Interpreter.executeScript`, passing `(m,s,I,setRuntime)` (state, recursion depth, interpreter, module-private determinism setter). Always call the exported patch function rather than copying its implementation. Session injection and state capture occur only at depth 0. **Never restore saved data into Bash's base `.state`**: recursive bash/sh/env calls copy that base and would leak unexported state into children. Source/eval still operate on the current interpreter state.
- Apply that source transformation in the **esbuild onLoad for just-bash/dist/bundle/browser.js** and the **Node loader/build used for headless Engine/tests**. No dynamic eval, Function constructor, upstream source fork, or parser rewrite is needed. Source shape mismatch throws before replacing. `executeBash` checks for the hook before executing user input and fails before side effects if loading was not patched.
- The runtime imports `Bash` normally from just-bash/browser. Importing `patchBashBrowserSource` for build configuration is safe (does not execute a shell). Test harness bundles runtime with the same onLoad hook, then imports its generated ESM. The isolated runtime test externalizes upstream compression imports; **production build/loader maps node:zlib to the parent's browser-zlib.js shim**. Do not leave node:zlib unresolved in production.
- `vfs.cwd` wins when a game world switch changes cwd. Restored state uses it, and updates env.PWD. OLDPWD retains the previous shell directory; if that path is absent in the new world, `cd -` appropriately fails. Parent can reset OLDPWD on world switches if product semantics require it.

## Private API risk

Source adaptation is confined to the observer, lexical Date/Math shims, mktemp random-byte call, and preserving the execution-budget class's real Date.now calls. Runtime accesses stable-in-this-version but private `.state`, `.execInScope`, `.executeCommandInner` and `.executePipeline`. Command/pipeline methods are wrapped, not reimplemented: AST frames attribute input-redirection byte reads to the actual consumer; pipeline-stage cwd/PWD/OLDPWD are restored (except lastpipe's final stage); tagged VFS opening errors become rc1 before a function body starts. An upstream upgrade MUST review all pinned source markers/state shape and rerun tests. Do not silently fall back to stateless execution.

### Build hookup

```js
import { readFile } from 'node:fs/promises';
import { patchBashBrowserSource } from './src/shell/bash-runtime.js';
const plugin = {
  name: 'pinned-bash-runtime',
  setup(build) {
    build.onLoad({ filter: /just-bash[\\/]dist[\\/]bundle[\\/]browser\.js$/ }, async ({ path }) => ({
      contents: patchBashBrowserSource(await readFile(path, 'utf8')),
      loader: 'js',
    }));
  },
};
// Include plugin in BOTH main and Worker esbuild calls. The Node ESM loader
// applies the same function to that same package URL before evaluating source.
```

The parent now supplies `test/helpers/register-bash.mjs` / `bash-loader.mjs`; invoke headless integration tests with `node --import ./test/helpers/register-bash.mjs --test ...`.

### Determinism and debate corrections

- Accepted reviewer §9 P0: restoring base state leaked unexported scalars, arrays, functions, aliases and pipefail into `bash -c`, and resurrected unset values. Injection now occurs only into depth-0 **local** state. Regression verifies child exports/default options, unset, `env -i`, and same-shell eval/source.
- Shell-visible Date and Math are lexical names in the patched package only; host `globalThis.Date`/`Math` are untouched. A runtime-module queue prevents overlapping calls from sharing the current binding. Cleanup clears it in finally. Clock defaults to fixed epoch 1700000000000; Engine passes `1700000000000 + round(now*1000)` and seed. LCG PRNG state is cloned with shellState. This is a deterministic simulation sequence, not GNU Bash's particular PRNG algorithm.
- ExecutionScope deadlines and cleanup use the captured native Date.now, so virtual time does not disable real timeout enforcement. `$RANDOM`, `$SECONDS`, date (including tomorrow), printf time formats, jq now, awk rand/srand, mktemp names are covered by replay/clone/concurrent-session tests. Runtime bindings/functions are never serialized.
- Accepted reviewer P1: story effects embedded in lists/functions/pipelines previously succeeded without effects. Runtime checks the parsed single top-level command identity plus its canonical literal raw arguments; nested/synthesized/redirected game effects get explicit stderr and nonzero overall rc. `systemctl status` is read-only everywhere; exact standalone `systemctl start lamp` remains eligible for Engine's raw flow rule. No raw command scan is used for **file read** events.

## Temporary package study

Registry query: `npm.cmd view just-bash version dist-tags engines scripts --json` -> latest 3.6.0, node >=20.19. Plain `npm` hit Windows execution-policy npm.ps1 denial; used npm.cmd without changing policy.

Created unique directory:
`C:\Users\user\AppData\Local\Temp\opencode\ra-bash-runtime-836d386a41d54797b21b090a252808c0`

Executed:
`npm.cmd install --prefix <above> --ignore-scripts --no-audit --no-fund --save-exact just-bash@3.6.0`

75 packages installed; read package.json, browser bundle method implementations and declaration files. No lifecycle/native build scripts ran. No global install or curl script. The production dependency is separately installed by the parent agent. Unmodified published `dist/bundle/browser.js` SHA-256: `38F1AD1E3283980ECDF68CEDE8A4EED028C6DFF6E8C31793DEC1E0AF529C446E`.

**Cleanup completed.** Verified the temporary root contained only `node_modules`, `package.json`, `package-lock.json`, and package identity was just-bash@3.6.0; then `Remove-Item -LiteralPath <exact study> -Recurse -Force`, with `Test-Path=False`. Also removed the empty owned `ra-bash-test-fGn4aO` directory left by the first test's percent-encoded Windows path setup failure; `Test-Path=False`. Later tests use fileURLToPath and remove their own directories even on setup failure. No other agent's Temp directory or user files were removed. This npm invocation used npm's default cache; it was not purged because that shared cache is not an owned study directory.

## Explicit boundaries

- Parser/expansion/control flow/substitution/builtins are just-bash. Scoped game utility overrides preserve story formatting and actual read-time inode events through existing runCommand (cat/grep/head/tail/sort/uniq/cut/wc/ls/ln/rm and game commands).
- just-bash pipelines materialize full output between stages. Upstream cat can therefore read more operands than the old lazy pipeline before downstream head stops; events describe actual upstream consumption, not a raw-script guess.
- The game VFS stores Unicode text. Arbitrary non-UTF8 binary persistence and symlinks are not claimed; symlink explicitly returns ENOTSUP. Hard links retain existing shared inode semantics.
- Main recursive root/home protection runs on expanded argv, including variable/alias/function invocations. Complete direct-child batches are treated conservatively like HOME/*; this also blocks an explicit batch covering all visible children.
- Runtime provides no network capability, no host filesystem adapter and no host process execution.

## Validation

`node --test test/bash-runtime.test.mjs` uses the project's installed package and esbuild, writes a uniquely named approved Temp bundle, and removes it in teardown (also cleans setup/build failures). **29 tests pass**, including 12 recorded BASH_GAPS probes, all requested syntax categories, two real disposable Node Workers with structured-cloned state, clone isolation, early exit, no side-effect replay, aliases/functions/arrays/last-rc, child isolation, deterministic time/randomness, story-command rejection, pipeline cwd, failed function redirect, hardlink alias snapshots, recursive grep filtering, zero-count head, UTF-8 and main/branch deletion guards.

`node --import ./test/helpers/register-bash.mjs --test test/bash-session-conformance.test.mjs test/bash-engine.test.mjs`: **71/71 pass, 0 skips**. This includes 24 independent GNU Bash oracle sessions, all adapter/clone/transaction checks, all four golden game walkthroughs (dialogue/commits/summary), world handoff, rollback, mixed-runtime journal and branch session restoration. No independent assertions or tests were edited by this engine owner. The previously reported three failures (two pipeline-cd assertions, one failed function redirect rejection) now pass.

The 12 fixed probes now match GNU Bash stdout/rc; 11 match all three streams exactly. The unknown-command probe intentionally checks diagnostic content rather than GNU Bash's executable path and line-number prefix. This is not a full Bash conformance claim.

Input-redirection tests verify `echo < a` / `head -n0 < a` do not discover a, `cat < a < b` discovers only b, group input retains read-time inode aliases after unlink, and pipeline stdin does not inherit a misleading outer file provenance. No raw command text is scanned to invent events.

The test builds a minified **platform=browser, target=es2020** bundle and executes it in Node and fresh Workers. A real browser/UI/CSP smoke test remains with the parent integration owner; do not label the Node Worker test as an actual browser run.
