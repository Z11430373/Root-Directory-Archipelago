/**
 * Engine 交易/時鐘與 session guard 的確定性 QA；依賴 Engine/save/createSessionStorage，不需瀏覽器。
 * callback 回傳 void/Promise；注入 action/VFS/儲存故障驗完整回復，所有替身只屬本案，不改來源存檔。
 * faultAfter 回傳修復閉包；Web Locks 替身只序列化記憶體工作，不能據此宣稱所有瀏覽器競態皆解決。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {webcrypto} from 'node:crypto';
import {Engine} from '../src/engine/index.js';
import * as S from '../src/save/index.js';
import {createSessionStorage} from '../src/ui/session-storage.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

/** 案例呼叫；可選 observer → 已開始 Engine，onOutput 收集成功提交文字，僅建立記憶體資源。 */
async function started(onOutput) {
  const engine = new Engine({onOutput});
  await engine.start();
  await engine.feed('statefix');
  return engine;
}
const ch0 = ['ls','cat handbook.md','ls -a notes','grep lamp logs/lamp.log','grep -r KEY-FRAG ~',
  'systemctl start lamp','lamp-before-sudo'];
/** 案例呼叫；引擎 → Promise<void>，順序完成 Ch0 五題與點燈，改傳入實例狀態。 */
async function lamp(engine) { for (const raw of ch0) await engine.feed(raw); }
/** runtime 呼叫；VFS 或 null → 可比較欄位投影，唯讀；由外層 JSON snapshot 脫離參照。 */
function worldState(vfs) {
  return vfs && {cwd:vfs.cwd,home:vfs.home,chapter:vfs.chapter,nextInode:vfs.nextInode,
    nodes:[...vfs.nodes],inodes:[...vfs.inodes],manifest:vfs.manifest};
}
/** 回復斷言呼叫；引擎 → JSON 安全的完整 runtime 快照，Set 展開/兩個世界投影，不寫狀態。 */
function runtime(engine) {
  const fields = ['flags','done','skipped','items','cards','finds','history','ladders','once','quest_idx',
    'active','mode','tries','skip_pending','delayed','nick','t0','now','last_input','idle_fired',
    'timers_fired','world_t','save','trace','outputs','ended','started','queue','world','branch',
    'commandCount','pendingEvents','budgetNotices'];
  return JSON.parse(JSON.stringify({
    ...Object.fromEntries(fields.map(key => [key,engine[key] instanceof Set ? [...engine[key]] : engine[key]])),
    vfs:worldState(engine.vfs),main_snapshot:worldState(engine.main_snapshot),
  }));
}
/** 故障案例呼叫；引擎/動作種類 → 修復閉包，暫換該實例 action，原動作完成後故意 throw。 */
function faultAfter(engine, kind) {
  const original = engine.action;
  engine.action = async function(action,payload) {
    const result = await original.call(this,action,payload);
    if (Object.hasOwn(action,kind)) throw new Error(`injected after ${kind}`);
    return result;
  };
  return () => { engine.action = original; };
}

test('R3 fix: failed feed rolls back VFS, once, nested advance, hashes, hints and unpublished output',
  {timeout:10_000}, async () => {
    const published = [], engine = await started((text,kind) => published.push({text,kind}));
    await lamp(engine);
    await engine.feed('echo BLOCK > /lost+found');
    await engine.feed('git checkout -b alt/sandbox');
    const before = runtime(engine), count = published.length;
    const vfs = engine.vfs, main = engine.main_snapshot, flags = engine.flags, save = engine.save;
    let clones = 0;
    const clone = engine.vfs.clone;
    engine.vfs.clone = function() { clones++; return clone.call(this); };
    await assert.rejects(engine.feed('rm -rf ~/notes',37), /File exists/);
    assert.deepEqual(runtime(engine),before);
    assert.equal(published.length,count,'Neither idle hints nor failed-command output may escape');
    assert.equal(engine.vfs,vfs);
    assert.equal(engine.main_snapshot,main);
    assert.equal(engine.flags,flags);
    assert.equal(engine.vfs.flags,flags);
    assert.equal(engine.main_snapshot.flags,flags);
    assert.equal(engine.save,save);
    assert.equal(clones,1,'feed -> advance must not clone the active VFS twice');
    // Remove the obstruction and retry: the failed state rule must not remain once-latched.
    engine.vfs.clone = clone;
    await engine.feed('rm /lost+found');
    await engine.feed('rm -rf ~/notes');
    assert.ok(engine.flags.has('flag.b0.lost0_created'));
    assert.ok(engine.vfs.isFile('/lost+found/#0'));
    assert.equal(S.checkShape(S.seal(engine.save)),true);
});

test('R3 fix: timer failure after end restores the entire advance and can retry with exact IDs',
  {timeout:10_000}, async () => {
    const published = [], engine = await started(text => published.push(text));
    const before = runtime(engine), count = published.length;
    const repair = faultAfter(engine,'end');
    await assert.rejects(engine.advance(960), /injected after end/);
    assert.deepEqual(runtime(engine),before);
    assert.equal(published.length,count);
    repair();
    await engine.advance(960);
    const control = await started();
    await control.advance(960);
    assert.deepEqual(engine.save,control.save);
    assert.deepEqual(engine.trace,control.trace);
    assert.deepEqual(engine.outputs,control.outputs);
});

test('R3 fix: failing branch enter and exit restore original worlds and shared flag identity',
  {timeout:10_000}, async () => {
    const engine = await started();
    await lamp(engine);
    const main = engine.vfs, flags = engine.flags, beforeEnter = runtime(engine);
    const repairEnter = faultAfter(engine,'branch_enter');
    await assert.rejects(engine.feed('git checkout -b alt/sandbox'), /injected/);
    assert.deepEqual(runtime(engine),beforeEnter);
    assert.equal(engine.vfs,main);
    assert.equal(engine.flags,flags);
    repairEnter();
    await engine.feed('git checkout -b alt/sandbox');
    const branch = engine.vfs, beforeExit = runtime(engine);
    const repairExit = faultAfter(engine,'branch_exit');
    await assert.rejects(engine.feed('git abandon',2), /injected/);
    assert.deepEqual(runtime(engine),beforeExit);
    assert.equal(engine.vfs,branch);
    assert.equal(engine.main_snapshot,main);
    assert.equal(engine.vfs.flags,flags);
    assert.equal(engine.main_snapshot.flags,flags);
    repairExit();
    await engine.feed('git abandon',2);
    assert.equal(engine.vfs,main);
    assert.equal(engine.main_snapshot,null);
});

test('R3 fix: output observers see only committed state and cannot turn publication into a failed command',
  {timeout:5_000}, async () => {
    const engine = await started();
    const calls = [];
    engine.onOutput = (text,kind) => {
      calls.push({text,kind,world_t:engine.world_t,task:engine.done.includes('Q0-1')});
      throw new Error('UI observer failed');
    };
    await engine.feed('ls',1);
    assert.ok(calls.length > 0);
    assert.ok(calls.every(call => call.world_t === 30 && call.task));
    assert.equal(engine.outputError?.message,'UI observer failed');
    assert.equal(S.checkShape(S.seal(engine.save)),true);
});

for (const [axis,r,t] of [['t',1000,1_000_000],['r',2_700_000,30],['expired',960_000,30]]) {
  test(`R3 fix: active ${axis} clock limit is refused without changing the original session or source`,
    {timeout:5_000}, async () => {
      const source = await started();
      await S.addCommit(source.save,'checkpoint',{id:'ckpt/clock-edge'},r,t);
      S.seal(source.save);
      const input = await S.importCode(await S.exportCode(source.save));
      const original = JSON.stringify(input), target = await started();
      await target.feed('ls');
      const before = runtime(target), vfs = target.vfs;
      await assert.rejects(target.restore(input), S.CodeError);
      assert.deepEqual(runtime(target),before);
      assert.equal(target.vfs,vfs);
      assert.equal(JSON.stringify(input),original);
});
}

test('R3 fix: runtime world clock guard rejects excess no-commit commands without truncation or leaked output',
  {timeout:5_000}, async () => {
    const source = await started();
    await S.addCommit(source.save,'checkpoint',{id:'ckpt/clock-edge'},1000,999_970);
    const engine = await Engine.fromSave(S.seal(source.save));
    await engine.feed('help'); // Last permitted +30, without a new commit.
    assert.equal(engine.world_t,1_000_000);
    const before = runtime(engine), published = [];
    engine.onOutput = text => published.push(text);
    await assert.rejects(engine.feed('hint',.1), S.CodeError);
    assert.deepEqual(runtime(engine),before);
    assert.deepEqual(published,[]);
    await engine.advance(960-engine.now); // Timer-only ending does not add world seconds.
    assert.equal(engine.ended,true);
    assert.equal(S.checkShape(S.seal(engine.save)),true);
    await S.exportCode(engine.save);
});

test('R3 fix: ferry overflow rolls back its +30, +600, dialogue, flags and world replacement',
  {timeout:10_000}, async () => {
    const source = await started();
    await lamp(source);
    await source.feed('git checkout -b alt/sandbox');
    await source.feed('git abandon');
    await S.addCommit(source.save,'checkpoint',{id:'ckpt/clock-edge'},1000,999_970);
    const engine = await Engine.fromSave(S.seal(source.save)), before = runtime(engine);
    await assert.rejects(engine.feed('ssh logport',1), S.CodeError);
    assert.deepEqual(runtime(engine),before);
});

test('R3 fix: completed saves at both clock maxima remain readable and keep the exact chain',
  {timeout:5_000}, async () => {
    const source = await started();
    await S.addCommit(source.save,'end',{time_up:true},2_700_000,1_000_000);
    S.seal(source.save);
    const original = JSON.parse(JSON.stringify(source.save));
    const engine = await Engine.fromSave(source.save);
    await engine.feed('help',3600);
    assert.deepEqual(engine.save,original);
    const restored = await S.importCode(await S.exportCode(engine.save));
    assert.deepEqual(restored,original);
});

test('R3 fix: a long suspended active shift keeps elapsed wall time and ends at the original timer boundary',
  {timeout:5_000}, async () => {
    const engine = await started();
    await engine.advance(3600);
    assert.equal(engine.now,3600,'Do not truncate journal wall time to fit commit.r');
    assert.equal(engine.ended,true);
    assert.equal(engine.save.commits.at(-1).r,960_000);
    assert.equal(S.checkShape(S.seal(engine.save)),true);
    await S.exportCode(engine.save);
});

test('R3 fix: invalid clock values reject without advancing state or publishing output',
  {timeout:5_000}, async () => {
    const engine = await started(), before = runtime(engine);
    for (const dt of [-1,NaN,Infinity,'1']) {
      await assert.rejects(engine.advance(dt),RangeError);
      assert.deepEqual(runtime(engine),before);
    }
});

test('R3 fix: large prior stdout and file strings are not reserialized on every normal clock tick',
  {timeout:10_000}, async t => {
    const engine = await started(), text = 'L'.repeat(4_000_000);
    engine.vfs.writeFile('large.txt',text);
    await engine.feed('cat large.txt');
    assert.equal(engine.outputs.at(-1).text,text);
    const output = engine.outputs.at(-1), history = engine.history.at(-1), vfs = engine.vfs;
    const began = performance.now();
    for (let i=0;i<100;i++) await engine.advance(.25);
    const ms = performance.now()-began;
    assert.equal(engine.outputs.at(-1),output);
    assert.equal(engine.history.at(-1),history);
    assert.equal(engine.vfs,vfs,'Successful ticks do not gratuitously replace the active world');
    assert.equal(engine.now,25);
    assert.ok(ms<3000,`100 bounded ticks took ${ms.toFixed(2)}ms`);
    t.diagnostic(`4 MB prior stdout + file; 100 transactions: ${ms.toFixed(2)}ms`);
});

/** guard 案例呼叫；初始原字串 → 最小 storage 替身，方法讀/改閉包 text，不碰真實 localStorage。 */
function memoryStorage(initial=null) {
  let text=initial;
  return {getItem:() => text,setItem:(_key,value) => {text=value;},removeItem:() => {text=null;}};
}
/** guard 案例呼叫；輸入字串 → 固定同 head/不同 journal 的 envelope，證明所有權不能只看鏈尾。 */
const envelope = raw => ({version:1,save:{head:'samehead'},journal:[{type:'input',raw,dt:0}]});

test('R3 storage: writes and clears require an explicit successful load baseline', {timeout:5_000}, async () => {
  const storage = memoryStorage('old'), guard = createSessionStorage({storage});
  assert.equal((await guard.write(envelope('new'))).reason,'unloaded');
  assert.equal((await guard.clear()).reason,'unloaded');
  assert.equal(storage.getItem(),'old');
});

test('R3 storage: compare the complete envelope, latch stale ownership, and block reset/clear',
  {timeout:5_000}, async () => {
    const storage = memoryStorage(), older = createSessionStorage({storage}), newer = createSessionStorage({storage});
    assert.equal(older.load().ok,true);
    assert.equal((await older.write(envelope('ALPHA'))).ok,true);
    assert.equal(newer.load().value.journal[0].raw,'ALPHA');
    assert.equal((await newer.write(envelope('BETA'))).ok,true);
    const latest = storage.getItem();
    assert.equal((await older.write(envelope('ALPHA'))).reason,'conflict');
    assert.equal(older.conflicted,true);
    assert.equal((await older.clear()).reason,'conflict');
    assert.equal(storage.getItem(),latest);
    assert.equal((await newer.clear()).ok,true);
    assert.equal((await older.write(envelope('resurrect'))).reason,'conflict');
});

test('R3 storage: load binds the version used by replay, not the version present after an async gap',
  {timeout:5_000}, async () => {
    const storage = memoryStorage(JSON.stringify(envelope('initial')));
    const guard = createSessionStorage({storage}), candidate = guard.load().value;
    await Promise.resolve();
    storage.setItem('save',JSON.stringify(envelope('other tab during replay')));
    assert.equal(candidate.journal[0].raw,'initial');
    assert.equal((await guard.write(candidate)).reason,'conflict');
    assert.equal(JSON.parse(storage.getItem()).journal[0].raw,'other tab during replay');
});

test('R3 storage: stringify occurs before the synchronous final compare and set', {timeout:5_000}, async () => {
  const storage = memoryStorage(), guard = createSessionStorage({storage});
  guard.load();
  const value = {toJSON() { storage.setItem('save','newer'); return envelope('old'); }};
  assert.equal((await guard.write(value)).reason,'conflict');
  assert.equal(storage.getItem(),'newer');
});

test('R3 storage: storage-event invalidation detects ABA and cannot silently reacquire ownership',
  {timeout:5_000}, async () => {
    const storage = memoryStorage(), guard = createSessionStorage({storage,key:'test-save'});
    guard.load();
    await guard.write(envelope('owned'));
    const owned = storage.getItem();
    assert.equal(guard.observe({key:'preferences',newValue:'irrelevant'}).ok,true);
    storage.setItem('save',owned); // Current bytes can already have returned to the old value.
    assert.equal(guard.observe({key:'test-save',newValue:'intervening writer'}).reason,'conflict');
    assert.equal((await guard.clear()).reason,'conflict');
    assert.equal(storage.getItem(),owned);
    assert.equal(guard.load().ok,true,'Only an explicit new load/user decision may reacquire a baseline');
    assert.equal((await guard.clear()).ok,true);
});

test('R3 storage: denied access, malformed reads, quota and size failures never advance the baseline',
  {timeout:5_000}, async () => {
    const storage = memoryStorage(), guard = createSessionStorage({storage,maxChars:200});
    const set = storage.setItem;
    guard.load();
    storage.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.equal((await guard.write(envelope('new'))).reason,'unavailable');
    storage.setItem = set;
    assert.equal((await guard.write(envelope('retry'))).ok,true);
    const previous = storage.getItem();
    assert.equal((await guard.write(envelope('x'.repeat(201)))).reason,'too_large');
    assert.equal(storage.getItem(),previous);
    storage.getItem = () => { throw new Error('SecurityError'); };
    assert.equal((await guard.clear()).reason,'unavailable');
    const unreadable = createSessionStorage({storage});
    assert.equal(unreadable.load().reason,'unavailable');
    assert.equal((await unreadable.write(envelope('unsafe'))).reason,'unloaded');
    const malformed = createSessionStorage({storage:memoryStorage('{')});
    assert.equal(malformed.load().reason,'invalid');
});

test('R3 storage: cooperating simultaneous writers compare inside the same exclusive Web Lock',
  {timeout:5_000}, async () => {
    let serial=Promise.resolve(), inside=false;
    const requests=[], storage=memoryStorage();
    const locks={request(name,options,callback) {
      requests.push({name,options});
      const next=serial.then(async () => {
        assert.equal(inside,false);
        inside=true;
        try { return await callback(); } finally { inside=false; }
      });
      serial=next.catch(() => {});
      return next;
    }};
    const set=storage.setItem, remove=storage.removeItem;
    storage.setItem=(...args) => { assert.equal(inside,true); return set(...args); };
    storage.removeItem=(...args) => { assert.equal(inside,true); return remove(...args); };
    const first=createSessionStorage({storage,locks}), second=createSessionStorage({storage,locks});
    first.load(); second.load();
    const results=await Promise.all([first.write(envelope('first')),second.write(envelope('second'))]);
    assert.deepEqual(results.map(result => result.ok),[true,false]);
    assert.equal(results[1].reason,'conflict');
    assert.ok(results.every(result => result.protection === 'web-lock'));
    assert.equal((await second.clear()).reason,'conflict');
    assert.equal((await first.clear()).ok,true);
    assert.ok(requests.every(request => request.name === requests[0].name && request.options.mode === 'exclusive'));
});

test('R3 storage: fallback is explicitly best-effort and a lock failure does not silently downgrade',
  {timeout:5_000}, async () => {
    const storage=memoryStorage(), fallback=createSessionStorage({storage,locks:null});
    fallback.load();
    assert.equal((await fallback.write(envelope('fallback'))).protection,'best-effort');
    const previous=storage.getItem();
    const denied=createSessionStorage({storage,locks:{request() { throw new Error('lock denied'); }}});
    denied.load();
    const result=await denied.clear();
    assert.equal(result.reason,'unavailable');
    assert.equal(result.protection,'web-lock');
    assert.equal(storage.getItem(),previous);
});
test('R3 storage: recovery cleanup rechecks primary ownership inside its acquired lock', {timeout:5_000}, async()=>{
  const storage=memoryStorage('"private recovery"');let inside=false,primaryOwned=true;
  const locks={async request(_name,_options,run){await Promise.resolve();primaryOwned=false;inside=true;try{return run();}finally{inside=false;}}};
  const recovery=createSessionStorage({storage,locks});recovery.load();
  const result=await recovery.clear({precondition:()=>{assert.equal(inside,true);return primaryOwned;}});
  assert.equal(result.reason,'conflict');assert.equal(storage.getItem(),'"private recovery"');
});
