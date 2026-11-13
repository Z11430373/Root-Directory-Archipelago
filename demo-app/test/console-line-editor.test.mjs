import test from 'node:test';
import assert from 'node:assert/strict';
import {ConsoleLineEditor,needsContinuation} from '../src/ui/console-line-editor.js';

function editor(options={}) {
  const submitted=[],cancelled=[];
  const line=new ConsoleLineEditor({submit:text=>submitted.push(text),cancel:()=>cancelled.push(line.getDraft().text),...options});
  return {line,submitted,cancelled};
}

test('editing uses grapheme boundaries and preserves text after the cursor',()=>{
  const {line}=editor();line.input('echo 中文e\u0301👩‍💻!');
  line.input('\x1b[D');line.input('\x7f');
  assert.equal(line.getDraft().text,'echo 中文e\u0301!');
  line.input('\x7f');assert.equal(line.getDraft().text,'echo 中文!');
  line.input('\x1b[D');line.input('新');assert.equal(line.getDraft().text,'echo 中新文!');
  line.setDraft('a😀b',2);assert.equal(line.getDraft().start,1);
  line.setDraft('abcdef',2,4);line.input('中');assert.deepEqual(line.getDraft(),{text:'ab中ef',start:3,end:3});
});

test('readline movement, kill/yank, delete and transpose',()=>{
  const {line}=editor();line.setDraft('echo one two');line.input('\x17');assert.equal(line.text,'echo one ');
  line.input('\x19');assert.equal(line.text,'echo one two');
  line.input('\x01');line.input('\x1b[3~');assert.equal(line.text,'cho one two');
  line.input('\x05');line.input('\x14');assert.equal(line.text,'cho one tow');
  line.input('\x15');assert.equal(line.text,'');
  line.setDraft('first\nsecond',8);line.input('\x01');assert.equal(line.start,6);line.input('\x0b');assert.equal(line.text,'first\n');
});

test('history restores the draft and original selection; editing a recalled command creates a new draft',()=>{
  const {line}=editor({history:()=>['pwd','ls']});line.setDraft('echo draft',3,5);
  line.input('\x1b[A');assert.equal(line.text,'ls');line.input('\x1b[A');assert.equal(line.text,'pwd');
  line.input('\x1b[B');line.input('\x1b[B');assert.deepEqual(line.getDraft(),{text:'echo draft',start:3,end:5});
  line.input('\x1b[A');line.input(' -a');line.input('\x1b[A');line.input('\x1b[B');assert.equal(line.text,'ls -a');
});

test('reverse history search cycles without executing, Escape restores draft',()=>{
  const {line,submitted}=editor({history:()=>['echo old','pwd','echo new']});line.setDraft('draft');
  line.input('\x12');line.input('echo');assert.equal(line.search.match,'echo new');
  line.input('\x12');assert.equal(line.search.match,'echo old');line.input('\r');assert.equal(line.text,'echo old');assert.deepEqual(submitted,[]);
  line.input('\x12');line.input('pwd');line.escape();assert.equal(line.text,'echo old');
  line.input('\r');assert.deepEqual(submitted,['echo old']);
});

test('bracketed paste accepts split framing and never executes pasted lines or control bytes',()=>{
  const {line,submitted,cancelled}=editor();
  for(const part of ['\x1b[20','0~echo first\r\n','echo second\x03','\x1b[20','1~'])line.input(part);
  assert.equal(line.text,'echo first\necho second');assert.deepEqual(submitted,[]);assert.deepEqual(cancelled,[]);
  line.input('\r');assert.deepEqual(submitted,['echo first\necho second']);
  line.input('echo direct\necho paste\r');assert.equal(submitted.length,1);assert.equal(line.text,'echo direct\necho paste\n');
  line.setDraft('');line.input('\x1b[200~echo safe\x1b[201~\recho pasted\x1b[201~');assert.equal(submitted.length,1);assert.equal(line.text,'echo safe[201~\necho pasted');
});

test('PS2 continuation handles quotes, escaping, groups, substitutions, comments and pipes',()=>{
  for(const text of ["echo 'open",'echo "open','echo a\\','(echo ok','{ echo ok;','echo $(pwd','echo "$(pwd)','echo ${HOME','echo ok |','echo ok &&'])assert.equal(needsContinuation(text),true,text);
  for(const text of ['echo "closed"',"echo 'a\\'",'echo \\"','(echo ok)','{ echo ok; }','echo "$(pwd)"','echo ${HOME}','echo *.txt','echo hi # "(','echo a\\\nb'])assert.equal(needsContinuation(text),false,text);
  const {line,submitted}=editor();line.input("echo 'open");line.input('\r');assert.equal(line.text,"echo 'open\n");assert.deepEqual(submitted,[]);
  line.input("close'");line.input('\r');assert.deepEqual(submitted,["echo 'open\nclose'"]);
});

test('PS2 and script boundaries retain for/while/if/case/function bodies',()=>{
  const incomplete=['for n in a b','for x in a b; do','if true; then','for n in a b\ndo\necho "$n"','while true; do echo yes','if true; then echo yes','if true; then\nif false; then :; fi','case "$x" in\na) echo A;;','hello()','hello() {\necho hi','function hello','function hello()','function hello { echo hi;','[[ x == y'];
  for(const text of incomplete)assert.equal(needsContinuation(text),true,text);
  const complete=['for n in a b\ndo\necho "$n"\ndone','while true; do echo yes; done','if true; then echo yes; else echo no; fi','if true; then\nif false; then :; fi\nfi','case "$x" in\na) echo A;;\nif) echo keyword;;\nesac','hello() {\necho hi\n}','function hello() { echo hi; }','echo if for function done','echo {','echo "if"','echo "a|"','echo hi # ||','[[ x == y ]]','echo [['];
  for(const text of complete)assert.equal(needsContinuation(text),false,text);
});

test('quoted arithmetic and nested substitutions keep function terminators in their own token scope',()=>{
  const exact='report() { printf "state:%s:%s\\n" "$shared" "$((count + $1))"; }';
  const complete=[
    exact,
    'report() { printf "%s" $((count + $1)); }',
    'report() { printf "%s\\n" "$((count + $(printf 2)))"; }',
    'report() { printf "%s\\n" "$(printf "%s" "$((count + 1))")"; }',
    'report() { printf "%s\\n" "${shared:-$(printf "%s" "$((count + 1))")}"; }',
    'report() { printf "%s" "$(if true; then printf "%s" "$((1 + 2))"; fi)"; }',
    'report() { printf "%s" "$(printf "%s" "$(printf "$shared")")"; }',
    'if true; then printf "%s" "$(printf \'fi; }\')"; fi',
    'printf "%s" "$((1 << 2))"; printf "%s" "${#shared}"',
    'printf "%s" "$(printf value)"tail; if true; then :; fi',
    'report() { cat <<OUT "$(printf one\nprintf two)"\nbody\nOUT\n}',
    'report() { printf "%s" "$(cat <<EOF\nbody\nEOF\n)"; }'
  ];
  for(const text of complete)assert.equal(needsContinuation(text),false,text);
  const incomplete=[
    exact.slice(0,-1),
    'report() { printf "%s" "$((count + $1)',
    'report() { printf "%s" "$((count + $1))',
    'report() { printf "%s" "$(printf "%s" "$((count + 1))")";',
    'report() { printf "%s" "$(printf "%s" "$((count + 1))"',
    'report() { printf "%s" "${shared:-$(printf value)}'
  ];
  for(const text of incomplete)assert.equal(needsContinuation(text),true,text);
  const {line,submitted}=editor();line.setDraft(exact);line.input('\r');assert.deepEqual(submitted,[exact]);
  line.setDraft(exact.slice(0,-1));line.input('\r');assert.equal(submitted.length,1);
  assert.equal(line.text,exact.slice(0,-1)+'\n');line.input('}');line.input('\r');
  assert.deepEqual(submitted,[exact,exact.slice(0,-1)+'\n}']);
});

test('heredoc bodies are opaque, support quoted delimiters, tabs and multiple documents',()=>{
  for(const text of ['cat <<EOF','cat <<EOF\nbody','cat <<EOF\nbody\n EOF','cat <<A <<B\none\nA\ntwo'])assert.equal(needsContinuation(text),true,text);
  for(const text of ['cat <<EOF\n"open ( if for\nEOF',"cat <<'END'\n$not_expanded\nEND",'cat <<E"OF"\nbody\nEOF','cat <<-EOF\n\tbody\n\tEOF','cat <<A <<B\none\nA\ntwo\nB','cat <<< "hello"'])assert.equal(needsContinuation(text),false,text);
  assert.equal(needsContinuation('if true; then\ncat <<EOF\nfi\nEOF'),true);
  assert.equal(needsContinuation('if true; then\ncat <<EOF\nfi\nEOF\nfi'),false);
});

test('completion gets complete text and UTF-16 cursor and returns draft plus candidates',()=>{
  const calls=[];const {line}=editor({complete:request=>{calls.push(request);return {text:'cat 中文.txt ',cursor:11,candidates:['中文.txt','中文2.txt']};}});
  line.setDraft('cat 中 tail',5);const list=line.input('\t');
  assert.deepEqual(calls,[{text:'cat 中 tail',cursor:5}]);assert.deepEqual(list,['中文.txt','中文2.txt']);assert.equal(line.text,'cat 中文.txt ');assert.equal(line.end,11);
});

test('cancel callback can read the original draft; busy input cannot edit or submit',()=>{
  const {line,submitted,cancelled}=editor();line.setDraft('cancel me');line.input('\x03');assert.deepEqual(cancelled,['cancel me']);assert.equal(line.text,'');
  line.setBusy(true);line.input('ignored');line.input('\r');line.input('\x03');assert.equal(line.text,'');assert.deepEqual(submitted,[]);assert.equal(cancelled.length,2);
});

test('secret mode suppresses history/search/completion and accepts literal unmatched quotes',()=>{
  let completed=0;const {line,submitted}=editor({history:()=>['SECRET SHOULD NOT APPEAR'],complete:()=>completed++});
  line.setSecret(true);line.input('\x1b[A');line.input('\x12');line.input('\t');assert.equal(line.text,'');assert.equal(line.search,null);assert.equal(completed,0);
  line.input("secret'");line.input('\r');assert.deepEqual(submitted,["secret'"]);
});
