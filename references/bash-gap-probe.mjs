/** Compare a small, fixed set of Bash behaviors with the current game shell.
 * Usage: node references/bash-gap-probe.mjs "C:/Program Files/Git/bin/bash.exe"
 * This is a capability probe, not a replacement for the game's golden tests.
 */
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {VFS} from '../demo-app/src/vfs.js';
import {execute} from '../demo-app/src/shell/exec.js';

const bash=process.argv[2]||'bash';
const cases=[
  ['pipeline','echo one | wc -l'],
  ['quoted filename','cat "two words.txt"'],
  ['shell variable','answer=42; echo "$answer"'],
  ['command substitution','echo "$(echo ready)"'],
  ['arithmetic expansion','echo "$((2 + 3))"'],
  ['OR list','false || echo fallback'],
  ['for loop','for word in one two; do echo "$word"; done'],
  ['printf builtin',"printf '%s\\n' one two"],
  ['input redirection','cat < input.txt'],
  ['brace expansion','echo {one,two}'],
  ['parameter default','echo "${NOT_SET_IN_PROBE:-fallback}"'],
  ['unknown command stream','ra_nonexistent_probe_command'],
];
const env={...process.env,LC_ALL:'C',LANG:'C',BASH_ENV:''};
delete env.NOT_SET_IN_PROBE;
const version=spawnSync(bash,['--version'],{encoding:'utf8',env,timeout:10000});
if(version.error||version.status!==0)throw version.error||new Error(version.stderr||'Bash unavailable');
const base=process.platform==='win32'?path.join(process.env.LOCALAPPDATA,'Temp','opencode'):tmpdir();
await mkdir(base,{recursive:true});
const directory=await mkdtemp(path.join(base,'ra-bash-gap-'));
try {
  await writeFile(path.join(directory,'input.txt'),'fixture\n');
  await writeFile(path.join(directory,'two words.txt'),'quoted\n');
  const results=cases.map(([name,command])=>{
    const native=spawnSync(bash,['--noprofile','--norc','-c',command],{cwd:directory,encoding:'utf8',env,timeout:10000});
    if(native.error||native.signal)throw native.error||new Error(`Bash interrupted: ${name}`);
    const vfs=new VFS();vfs.mkdir(vfs.home);
    vfs.writeFile('input.txt','fixture\n');vfs.writeFile('two words.txt','quoted\n');
    const actual=execute(command,vfs);
    const expected={stdout:native.stdout,stderr:native.stderr,rc:native.status};
    const simulated={stdout:actual.stdout,stderr:actual.stderr,rc:actual.rc};
    return {name,command,bash:expected,gameShell:simulated,exactMatch:JSON.stringify(expected)===JSON.stringify(simulated)};
  });
  const report={bashVersion:version.stdout.split(/\r?\n/)[0],scope:'Twelve fixed capability probes; not a Bash conformance certification.',total:results.length,exactMatches:results.filter(result=>result.exactMatch).length,results};
  const output=new URL('./BASH_GAPS.json',import.meta.url);
  await writeFile(output,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({total:report.total,exactMatches:report.exactMatches,report:'references/BASH_GAPS.json'},null,2));
} finally {
  await rm(directory,{recursive:true,force:true});
}
