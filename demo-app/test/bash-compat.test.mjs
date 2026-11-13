/** Bash compatibility regressions reproduced against native Bash by references/bash-gap-probe.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {VFS} from '../src/vfs.js';
import {execute} from '../src/shell/exec.js';

test('Bash: command-not-found stays on stderr through redirection and pipelines',()=>{
  const vfs=new VFS();vfs.mkdir(vfs.home);
  const command='ra_nonexistent_probe_command';
  const message=`bash: ${command}: command not found\n`;

  const direct=execute(command,vfs);
  assert.equal(direct.rc,127);
  assert.equal(direct.stdout,'');
  assert.equal(direct.stderr,message);

  const redirected=execute(`${command} > result.txt`,vfs);
  assert.equal(redirected.rc,127);
  assert.equal(redirected.stdout,'');
  assert.equal(redirected.stderr,message);
  assert.equal(vfs.readFile('result.txt'),'','stdout redirection must not capture diagnostics');

  const pipeline=execute(`${command} | wc -c`,vfs);
  assert.equal(pipeline.rc,0,'without pipefail, the last stage determines pipeline status');
  assert.equal(pipeline.stdout,'0\n','the pipe must receive no diagnostic bytes');
  assert.equal(pipeline.stderr,message);

  const status=execute(`${command}; echo $?`,vfs);
  assert.equal(status.rc,0);
  assert.equal(status.stdout,'127\n');
  assert.equal(status.stderr,message);
});
