/**
 * just-bash 3.6.0 parser/interpreter + game VFS and read-time inode events.
 * State is data, never an interpreter/Worker instance and never command history.
 * See references/ENGINE_IMPLEMENTATION.md for the one pinned upstream hook.
 */
import { Bash, defineCommand } from 'just-bash/browser';
import { BashVFS, BashVFSError, bytesToText } from './bash-vfs.js';
import { runCommand } from './commands.js';
import { fromText, collect } from './stream.js';

export const BASH_VERSION = '3.6.0';

/** Build/Node loader adapter. Fails closed on an upstream source-shape change. */
export function patchBashBrowserSource(source) {
  const needle = 'R=await new ia(E,m).executeScript(x)';
  if (source.split(needle).length !== 2) throw new Error('just-bash 3.6.0 session hook mismatch; review upstream before upgrading');
  // Keep real deadlines/cleanup budgets even while shell-visible time is virtual.
  const budgetStart = source.indexOf('kl=class{'), budgetEnd = source.indexOf('};function', budgetStart);
  const randomNeedle = 'crypto.getRandomValues(t)';
  if (budgetStart < 0 || budgetEnd < budgetStart || source.split(randomNeedle).length !== 2) throw new Error('just-bash 3.6.0 deterministic hook mismatch');
  const budget = source.slice(budgetStart, budgetEnd).replaceAll('Date.now()', '__raHostDate.now()');
  source = source.slice(0, budgetStart) + budget + source.slice(budgetEnd);
  source = source.replace(randomNeedle, '(__raRuntime?__raRuntime.fillRandom(t):crypto.getRandomValues(t))');
  source = source.replace(needle, 'R=await ((I)=>(this.__raCaptureState?.(m,s,I,(r)=>__raRuntime=r),I.executeScript(x)))(new ia(E,m))');
  // Lexical shadows are private to this package module: no global monkeypatch.
  // Date instances/prototypes remain native, including structuredClone behavior.
  return `let __raRuntime=null; const __raHostDate=globalThis.Date;
const Date=new Proxy(__raHostDate,{
  construct(T,args){return new T(...(args.length?args:[__raRuntime?.nowMs??T.now()]));},
  apply(T){return new T(__raRuntime?.nowMs??T.now()).toString();},
  get(T,key){return key==='now'?()=>__raRuntime?.nowMs??T.now():Reflect.get(T,key);}
});
const Math=Object.create(globalThis.Math);
Math.random=()=>__raRuntime?__raRuntime.random():globalThis.Math.random();
` + source;
}

// Scoped game utilities retain quest formatting, inode events and main/branch
// rules. Shell grammar, expansion, builtins and other commands are upstream.
const GAME_COMMANDS = ['ls', 'cat', 'grep', 'head', 'tail', 'sort', 'uniq', 'cut', 'wc', 'ln', 'rm',
  'mail', 'systemctl', 'man', 'git', 'ssh', 'ask', 'finger', 'close', 'sudo', 'hint', 'skip', 'save', 'help', 'merge'];
const GAME_EFFECTS = new Set(['systemctl', 'man', 'git', 'ssh', 'ask', 'finger', 'close', 'sudo', 'hint', 'skip', 'save', 'help', 'merge']);
let executionQueue = Promise.resolve();

function commandView(vfs, cwd) {
  return new Proxy(vfs, {
    get(target, key, receiver) {
      if (key === 'cwd') return cwd;
      if (key === 'resolve') return (path = '.') => target.resolve(String(path).startsWith('/') ? path : `${cwd}/${path}`);
      return Reflect.get(target, key, receiver);
    },
    set(target, key, value, receiver) { if (key === 'cwd') { cwd = value; return true; } return Reflect.set(target, key, value, receiver); },
  });
}

function blocksHomeBatch(args, view) {
  // Expanded argv, including variables/functions/aliases, is authoritative.
  // A complete direct-child batch is treated like HOME/* by the game guard.
  let recursive = false, stop = false;
  const paths = [];
  for (const arg of args) {
    if (arg === '--' && !stop) { stop = true; continue; }
    if (!stop && arg.startsWith('-')) { recursive ||= /[rR]/.test(arg); continue; }
    paths.push(view.resolve(arg));
  }
  if (!recursive) return false;
  for (const root of ['/', view.home]) {
    const children = view.list(root).map(child => view.resolve(`${root}/${child}`));
    if (children.length && children.every(child => paths.includes(child))) return true;
  }
  return false;
}

function snapshotState(state, rc, randomState) {
  const copy = { ...state, lastExitCode: rc, commandCount: 0, callDepth: 0, sourceDepth: 0, loopDepth: 0,
    inCondition: false, localScopes: [], lastSubstitutionExitCode: null };
  // Request-scoped resources/byte input are not interactive session state.
  for (const key of ['signal', 'extraArgs', 'groupStdin', 'groupStdinSourceFd', 'processSubstitutions',
    'expansionExitCode', 'expansionStderr', 'internalOutputAccounting']) delete copy[key];
  copy.env = new Map(copy.env); copy.env.set('?', String(rc));
  return { version: BASH_VERSION, state: structuredClone(copy), randomState };
}

export async function executeBash(raw, vfs, options = {}) {
  // A module-private clock binding cannot leak between overlapping headless
  // executions. Worker runtimes each have their own queue. No host globals change.
  const previous = executionQueue;
  let release;
  executionQueue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await executeSession(raw, vfs, options); }
  finally { release(); }
}

async function executeSession(raw, vfs, options) {
  raw = String(raw);
  const reads = [], readEvents = [], readSet = new Set(), commandFrames = [];
  let topCommand = null, rejectedGameCommand = false;
  const host = {
    nowMs: Number.isFinite(options.nowMs) ? options.nowMs : 1700000000000,
    randomState: vfs.shellState?.randomState ?? (Number(options.seed ?? 5) >>> 0),
    random() { this.randomState = (Math.imul(this.randomState, 1664525) + 1013904223) >>> 0; return this.randomState / 4294967296; },
    fillRandom(array) { for (let i = 0; i < array.length; i++) array[i] = Math.floor(this.random() * 256); return array; },
  };
  const branch = options.branch || 'main', flags = options.flags || vfs.flags;
  const fs = new BashVFS(vfs, { branch });
  const record = event => {
    const { path } = event;
    if (!readSet.has(path)) { readSet.add(path); reads.push(path); }
    readEvents.push(event);
  };
  const snapshotRead = path => ({ path: fs.absolute(path), same_inode: vfs.sameInodePaths(fs.absolute(path)) });
  const read = path => record(snapshotRead(path));
  // The interpreter reads redirect bytes before invoking a command. Keep the
  // inode snapshot on that command's AST frame, then publish it only when the
  // actual consumer advances stdin. No source-text/pathname guessing.
  fs.onReadBytes = path => {
    const frame = commandFrames.at(-1);
    if (frame?.fileInput && path !== '/dev/null') frame.input = { event: snapshotRead(path), consumed: false };
  };
  const customCommands = GAME_COMMANDS.map(name => defineCommand(name, async (args, ctx) => {
    if (GAME_EFFECTS.has(name) && !(name === 'systemctl' && args[0] === 'status')) {
      const frame = commandFrames.at(-1);
      const literalTop = frame?.node === topCommand && topCommand?.name?.parts?.length === 1 && topCommand.name.parts[0].value === name &&
        !/[\r\n]/.test(raw.trim()) && raw.trim().split(/[ \t]+/).join('\0') === [name, ...args].join('\0');
      if (!literalTop || options.allowGameCommand === false || name === 'systemctl' && (args.length !== 2 || args[0] !== 'start' || args[1] !== 'lamp')) {
        rejectedGameCommand = true;
        return { stdout: '', stderr: `${name}: game commands require a standalone top-level submission\n`, exitCode: 2 };
      }
    }
    const view = commandView(vfs, ctx.cwd), state = { rc: 0, stderr: '' };
    const error = (message, rc = 1) => { state.rc = rc; state.stderr += `${message}\n`; };
    let stdout = '';
    const context = { vfs: view, flags, branch, state, read, error, protectedGlob: name === 'rm' && blocksHomeBatch(args, view) };
    // head -n0 opens files but consumes no content. Avoid a discovery event.
    if (name === 'head' && /^(?:-n0|-c0)$/.test(args[0] || '') || name === 'head' && ['-n', '-c'].includes(args[0]) && args[1] === '0') context.read = () => {};
    const inputFrame = [...commandFrames].reverse().find(frame => frame.ownsInput);
    const input = (function* () {
      if (inputFrame?.input && !inputFrame.input.consumed) { inputFrame.input.consumed = true; record(inputFrame.input.event); }
      yield* fromText(bytesToText(ctx.stdin));
    })();
    stdout = collect(runCommand(name, args, input, context));
    return { stdout, stderr: state.stderr, exitCode: state.rc, stdoutKind: 'text' };
  }));
  const bash = new Bash({ fs, cwd: vfs.cwd, env: { HOME: vfs.home, USER: 'op', LOGNAME: 'op', LC_ALL: 'C', TZ: 'UTC' },
    customCommands, executionLimits: options.executionLimits, defenseInDepth: false, sleep: async () => {} });
  // This check is before execution: a missing build hook cannot partially edit
  // the world and then silently discard state.
  if (!bash.execInScope?.toString().includes('__raCaptureState')) throw new Error('just-bash session adapter missing; apply patchBashBrowserSource when loading just-bash/browser');
  if (vfs.shellState && vfs.shellState.version !== BASH_VERSION) throw new Error('Unsupported saved Bash session version');
  const restored = vfs.shellState ? structuredClone(vfs.shellState.state) : null;
  let activeState = restored || structuredClone(bash.state), resetRuntime;
  activeState.cwd = vfs.cwd; activeState.env.set('PWD', vfs.cwd);
  if (!restored) { activeState.shoptOptions.expand_aliases = true; activeState.startTime = host.nowMs; }
  bash.registerTransformPlugin({ name: 'game-top-level-scope', transform({ ast }) {
    const statement = ast.statements.length === 1 ? ast.statements[0] : null;
    const pipeline = statement?.pipelines.length === 1 ? statement.pipelines[0] : null;
    const command = pipeline?.commands.length === 1 ? pipeline.commands[0] : null;
    topCommand = command?.type === 'SimpleCommand' && !statement.background && !pipeline.negated && !command.redirections.length && !command.assignments.length ? command : null;
    return { ast };
  } });
  bash.__raCaptureState = (state, depth, interpreter, setRuntime) => {
    if (depth === 0) {
      // Only the top execution receives session data. bash/sh/env child shells
      // must start from the untouched base defaults plus their exported env.
      const request = { signal: state.signal, groupStdin: state.groupStdin, extraArgs: state.extraArgs };
      Object.assign(state, activeState, request);
      activeState = state;
      setRuntime(host); resetRuntime = () => setRuntime(null);
    } else state.startTime = host.nowMs;
    const original = interpreter.executeCommandInner, originalPipeline = interpreter.executePipeline, pipelines = [];
    if (typeof original !== 'function' || typeof originalPipeline !== 'function') throw new Error('just-bash command observation hook mismatch');
    interpreter.executePipeline = async function(node, ...args) {
      pipelines.push(node);
      try { return await originalPipeline.call(this, node, ...args); }
      finally { pipelines.pop(); }
    };
    interpreter.executeCommandInner = async function(node, ...args) {
      const inputs = (node.redirections || []).filter(redir => (redir.fd === null || redir.fd === 0) && redir.operator.startsWith('<'));
      const pipeline = pipelines.at(-1), stage = pipeline?.commands.indexOf(node) ?? -1;
      const pipedInput = stage > 0;
      // Upstream 3.6.0 isolates pipeline variables but leaks cd into the next
      // stage. Restore process-local directories, except a lastpipe final stage.
      const shell = this.ctx.state;
      const isolated = stage >= 0 && pipeline.commands.length > 1 && !(shell.shoptOptions.lastpipe && stage === pipeline.commands.length - 1);
      const directory = isolated ? { cwd: shell.cwd, previousDir: shell.previousDir, pwd: shell.env.get('PWD'), oldpwd: shell.env.get('OLDPWD') } : null;
      const frame = { node, ownsInput: inputs.length > 0 || pipedInput, fileInput: ['<', '<>', '<&'].includes(inputs.at(-1)?.operator), input: null };
      commandFrames.push(frame);
      try { return await original.call(this, node, ...args); }
      catch (error) {
        if (error instanceof BashVFSError) return { stdout: '', stderr: `bash: ${error.message}\n`, exitCode: 1 };
        throw error;
      } finally {
        commandFrames.pop();
        if (directory) {
          shell.cwd = directory.cwd; shell.previousDir = directory.previousDir;
          for (const [key, value] of [['PWD', directory.pwd], ['OLDPWD', directory.oldpwd]]) {
            if (value === undefined) shell.env.delete(key); else shell.env.set(key, value);
          }
        }
      }
    };
  };
  let result;
  try { result = await bash.exec(raw, { rawScript: true, signal: options.signal }); }
  finally { resetRuntime?.(); }
  const rc = rejectedGameCommand ? result.exitCode || 2 : result.exitCode;
  vfs.cwd = activeState.cwd;
  vfs.shellState = snapshotState(activeState, rc, host.randomState);
  return { stdout: result.stdout, stderr: result.stderr, rc, reads, readEvents };
}
