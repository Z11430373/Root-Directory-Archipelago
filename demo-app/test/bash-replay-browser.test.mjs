/**
 * M1/M3/M5 replay regressions against the real built page and browser Workers.
 * Fixed historical legacy envelopes are independent of the current Engine.
 * Init scripts only seed isolated storage, delay native digest, and observe
 * Worker/storage boundaries; app instances and xterm buffers are never exposed.
 * Run after build with RA_PLAYWRIGHT/RA_CHROME, or skip without optional tools.
 */
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {SAVE_KEY,PREFS_KEY,RECOVERY_KEY} from '../src/storage.js';
import {send,typeDraft,ready,expectPrompt,screenText,freezeGameTime,advanceGameTime,eventually} from './helpers/xterm.mjs';

// Complete optional loading before registering hooks/tests, as in console.test.
let chromium,browser;
try{({chromium}=await import(process.env.RA_PLAYWRIGHT||'playwright'));}catch{/* Optional external tooling. */}
const skip=!chromium||!process.env.RA_CHROME?'Optional browser tools unavailable':false;
const html=new URL('../dist/index.html',import.meta.url).href;
const replayRaw='printf replay-race > leaked.txt';
const probeRaw='printf next > next.txt; cat leaked.txt; cat next.txt';
before(async()=>{if(!skip)browser=await chromium.launch({executablePath:process.env.RA_CHROME,headless:true});});
after(async()=>{await browser?.close();});

/** Old legacy oracle: printf returns 127 after opening an empty redirect file. */
function fixture(phase) {
  const base=phase==='baseSave',head=base?'88133529':'5bc164f4';
  const save={
    schema:1,game:'root-archipelago',demo:true,demo_id:'demo-first-night',
    pack:'root-archipelago-ch01@0.1.0',nick:'reviewqa',seed:5,event:'demo-event-1',
    commits:[
      {branch:'main',chapter:'ch0',kind:'flag',data:{name:'flag.demo.started'},t:0,r:0,parent:null,id:'e10de7e4'},
      {branch:'main',chapter:'ch0',kind:'hint',data:{n:1,full:false},t:base?30:0,r:base?0:30000,parent:'e10de7e4',id:head},
    ],head,
  };
  return {
    version:1,runMode:'self',shell:'legacy',save,baseSave:base?structuredClone(save):null,
    journal:[
      ...base?[]:[{type:'input',raw:'reviewqa',dt:0,shell:'legacy'}],
      {type:'input',raw:replayRaw,dt:base?0:31,shell:'legacy'},
    ],
  };
}

/** The gate changes scheduling only: the original digest still computes every hash. */
async function pausedReplay(t,{phase='feed',from='islands',untagged=false}={}) {
  const envelope=fixture(phase);
  if(untagged){delete envelope.shell;for(const step of envelope.journal)delete step.shell;}
  const serialized=JSON.stringify(envelope);
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'});
  const errors=[],requests=[];
  t.after(async()=>{
    try{await context.close();}
    finally{assert.deepEqual(errors,[],'No browser/CSP errors');assert.deepEqual(requests,[],'No external resources');}
  });
  await context.addInitScript(({serialized,phase,from,saveKey,prefsKey,recoveryKey})=>{
    localStorage.setItem(saveKey,serialized);
    localStorage.setItem(prefsKey,JSON.stringify({style:from}));
    const observation=window.__replayReview={paused:false,released:false,digestText:'',posts:[],replies:[],storage:[],csp:[]};
    for(const method of ['setItem','removeItem','clear']) {
      const original=Storage.prototype[method];
      Storage.prototype[method]=function(...args) {
        if(this===localStorage&&(method==='clear'||[saveKey,recoveryKey].includes(args[0])))observation.storage.push({method,key:args[0]??null});
        return original.apply(this,args);
      };
    }
    const file=(state,path)=>{const node=state?.nodes?.get(path);return node?state.inodes.get(node.inode).text:null;};
    const OriginalWorker=window.Worker;
    window.Worker=class extends OriginalWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',({data})=>observation.replies.push({
          raw:this.reviewRaw,result:data.result,error:data.error,
          leaked:file(data.state,'/home/op/leaked.txt'),next:file(data.state,'/home/op/next.txt'),
        }));
      }
      postMessage(data,...rest) {
        this.reviewRaw=data.raw;
        observation.posts.push({raw:data.raw,shell:data.options?.shell,leaked:file(data.state,'/home/op/leaked.txt')});
        return super.postMessage(data,...rest);
      }
    };
    const digest=crypto.subtle.digest.bind(crypto.subtle);
    const needle=phase==='baseSave'?'"kind":"flag"':'"kind":"hint"';
    let armed=true;
    crypto.subtle.digest=async(algorithm,data)=>{
      const text=new TextDecoder().decode(data);
      if(armed&&text.includes(needle)) {
        armed=false;observation.digestText=text;observation.paused=true;
        await new Promise(resolve=>{observation.release=()=>{observation.released=true;resolve();};});
      }
      return digest(algorithm,data);
    };
    document.addEventListener('securitypolicyviolation',event=>observation.csp.push({directive:event.violatedDirective,blocked:event.blockedURI}));
  },{serialized,phase,from,saveKey:SAVE_KEY,prefsKey:PREFS_KEY,recoveryKey:RECOVERY_KEY});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  page.on('request',request=>{if(request.resourceType()!=='document'&&!request.url().startsWith('blob:'))requests.push(request.url());});
  await freezeGameTime(page,new Date('2026-11-02T12:00:00Z'));
  await page.goto(html);
  if(from==='server') {
    await typeDraft(page,'game resume');
    await page.keyboard.press('Enter'); // Do not wait for ready: replay is gated.
  } else await page.locator('#continue-game').click();
  await page.waitForFunction(()=>window.__replayReview.paused);
  const observed=await observations(page);
  assert.match(observed.digestText,phase==='baseSave'?/"name":"flag.demo.started"/:/"r":30000/,'The intended pre-dispatch hash boundary was reached');
  assert.deepEqual(observed.posts,[],'The gate is before any shell Worker');
  assert.deepEqual(observed.storage,[],'Preparing replay must not write the original save');
  return {page,envelope,serialized};
}

const observations=page=>page.evaluate(()=>{
  const {release,...data}=window.__replayReview;return data;
});
const stored=page=>page.evaluate(({save,recovery})=>({raw:localStorage.getItem(save),recovery:localStorage.getItem(recovery)}),{save:SAVE_KEY,recovery:RECOVERY_KEY});
const release=page=>page.evaluate(()=>window.__replayReview.release());

/** F2 upgrades from islands; the existing select handler performs the return. */
async function switchWhilePaused(page,{from='islands',to='server',roundtrip=false}={}) {
  if(from==='islands'&&to==='server') {
    await page.keyboard.press('F2');
    await page.waitForFunction(()=>document.documentElement.dataset.style==='server');
  }
  if(from==='server'&&to==='islands'||roundtrip) {
    // The console hides the masthead; force only bypasses visibility, not its native change handler.
    await page.locator('#visual-style').selectOption('islands',{force:true});
    await page.waitForFunction(()=>document.documentElement.dataset.style==='islands');
  }
  const style=await page.locator('html').getAttribute('data-style');
  assert.equal(style,roundtrip?'islands':to);
  assert.equal(await page.locator('#game').isVisible(),true,'A pending replay keeps its game renderer, even before Engine publication');
  assert.equal(await page.locator('#command-input').count(),1,'Switching must not clear the pending replay editor');
  if(style==='server')assert.equal(await page.locator('.console-session').getAttribute('data-state'),'running');
  else assert.equal(await page.locator('#command-input').isDisabled(),true);
}

async function assertSuccessfulReplay({page,envelope}) {
  await release(page);
  await page.waitForFunction(head=>document.querySelector('#welcome-error')?.textContent||document.querySelector('#save-status')?.dataset.head===head,envelope.save.head);
  assert.equal(await page.locator('#welcome-error').textContent(),'','Valid replay must not enter recovery');
  assert.equal(await page.locator('#local-recovery').count(),0);
  await ready(page);
  const replay=await observations(page);
  for(const post of replay.posts)assert.equal(post.shell,'legacy','The historical step must not inherit the newly selected backend');
  for(const reply of replay.replies) {
    assert.equal(reply.raw,replayRaw);assert.equal(reply.error,undefined);
    assert.equal(reply.result.rc,127);assert.equal(reply.leaked,'');
  }
  await send(page,probeRaw);
  await page.waitForFunction(({key,raw})=>JSON.parse(localStorage.getItem(key)).journal.some(step=>step.raw===raw),{key:SAVE_KEY,raw:probeRaw});
  const observed=await observations(page),post=observed.posts.find(entry=>entry.raw===probeRaw),reply=observed.replies.find(entry=>entry.raw===probeRaw);
  assert.ok(post&&reply,'The next live input must execute in a real Worker');
  assert.equal(post.shell,'bash','Every subsequent input uses Bash, independent of the renderer');
  assert.equal(post.leaked,'','The legacy replay produced an empty file, not Bash printf output');
  assert.equal(reply.error,undefined);assert.equal(reply.result.rc,0);
  assert.equal(reply.result.stdout,'next');assert.equal(reply.result.stderr,'');
  assert.equal(reply.leaked,'');assert.equal(reply.next,'next');
  await eventually(async()=>await page.locator('.xterm-helper-textarea').count()?screenText(page):page.locator('#terminal .stdout').allTextContents().then(lines=>lines.join('\n')),text=>/^next$/m.test(text),'The real command output is rendered, independently of its echo');
  const saved=JSON.parse((await stored(page)).raw);
  assert.equal(saved.shell,'bash');
  assert.deepEqual(saved.journal.filter(step=>step.type==='input'),[...envelope.journal,{type:'input',raw:probeRaw,dt:0,shell:'bash'}]);
  assert.deepEqual(saved.baseSave,envelope.baseSave);
  assert.deepEqual(saved.save.commits,envelope.save.commits,'No file-only action may masquerade as replay integrity via a changed head');
  assert.equal(saved.save.head,envelope.save.head);
  assert.deepEqual(observed.csp,[]);
}

async function assertCancelledReplay({page,serialized}) {
  await page.keyboard.press('Control+C');
  await release(page);
  await page.waitForFunction(()=>document.documentElement.dataset.style==='server'
    ?document.querySelector('.console-session')?.dataset.state==='ready'&&!document.querySelector('#save-status')?.dataset.head
    :!document.querySelector('#welcome').hidden&&document.querySelector('#game').hidden);
  if(await page.locator('html').getAttribute('data-style')==='server')await expectPrompt(page,'archipelago$ ');
  else assert.equal(await page.locator('#continue-game').isVisible(),true,'Cancellation returns to a usable launcher');
  assert.equal(await page.locator('#welcome-error').textContent(),'');
  assert.equal(await page.locator('#local-recovery').count(),0);
  const expected={raw:serialized,recovery:null};
  assert.deepEqual(await stored(page),expected,'Cancel preserves the original envelope byte-for-byte without creating recovery');
  await advanceGameTime(page,1000); // A later production autosave tick must not publish the abandoned replay.
  assert.deepEqual(await stored(page),expected);
  const observed=await observations(page);
  assert.deepEqual(observed.posts,[],'Cancel before dispatch must never launch a shell Worker');
  assert.deepEqual(observed.replies,[]);
  assert.deepEqual(observed.storage,[],'No transient overwrite/delete is allowed, even if the original bytes are later restored');
  assert.deepEqual(observed.csp,[]);
}

for(const phase of ['feed','baseSave'])for(const roundtrip of [false,true]) {
  const issue=phase==='feed'?'M1 feed waiting in idle commit':'M5 baseSave waiting in verifyChain';
  test(`Bash replay browser: ${issue}, F2${roundtrip?' then back to islands':''} preserves legacy replay and upgrades the next input`,{skip,timeout:45000},async t=>{
    const run=await pausedReplay(t,{phase});
    await switchWhilePaused(run.page,{roundtrip});
    await assertSuccessfulReplay(run);
  });
}

for(const phase of ['feed','baseSave'])test(`Bash replay browser: ${phase} stays in normal style, replays legacy and uses Bash for new inputs`,{skip,timeout:45000},async t=>{
  const run=await pausedReplay(t,{phase});
  await assertSuccessfulReplay(run);
  assert.equal(await run.page.locator('html').getAttribute('data-style'),'islands');
});

test('Bash replay browser: untagged old journal stays legacy, then normal input uses Bash',{skip,timeout:45000},async t=>{
  const run=await pausedReplay(t,{untagged:true});
  await assertSuccessfulReplay(run);
  assert.equal(await run.page.locator('html').getAttribute('data-style'),'islands');
});

for(const scenario of [
  {name:'M3 islands to terminal',phase:'feed',from:'islands',to:'server'},
  {name:'M3 stays in islands',phase:'feed',from:'islands',to:'islands'},
  {name:'M3 console resume to islands',phase:'feed',from:'server',to:'islands'},
  {name:'M5 early baseSave F2',phase:'baseSave',from:'islands',to:'server'},
  {name:'M5 early baseSave roundtrip',phase:'baseSave',from:'islands',to:'server',roundtrip:true},
])test(`Bash replay browser: ${scenario.name}, Ctrl+C before Worker preserves exact storage`,{skip,timeout:45000},async t=>{
  const run=await pausedReplay(t,scenario);
  await switchWhilePaused(run.page,scenario);
  await assertCancelledReplay(run);
});
