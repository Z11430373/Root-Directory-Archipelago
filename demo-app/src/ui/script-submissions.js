/** Preserve complete Bash constructs while retaining game-prompt boundaries between submissions. */
import {commandLines} from './console-view.js';
import {needsContinuation} from './console-line-editor.js';

export function scriptSubmissions(text,bash=true) {
  if(/^(?:game\s+|:)?import\s/.test(text.trimStart()))return [text];
  if(!bash)return commandLines(text);
  const submissions=[];
  let pending='';
  for(const line of text.split('\n')) {
    pending+=(pending?'\n':'')+line;
    if(!needsContinuation(pending)) {
      if(pending.trim())submissions.push(pending);
      pending='';
    }
  }
  if(pending.trim())submissions.push(pending);
  return submissions;
}
