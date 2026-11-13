/**
 * ============================================================================
 * 模組：ui/script-submissions.js — 腳本提交分割器
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 依賴：ui/console-view.js（commandLines）、ui/console-line-editor.js（needsContinuation）
 *   - 被：main.js（scriptSubmissions）
 * 職責：
 *   1. scriptSubmissions()：將貼上的多行文字拆分為完整 Bash 建構的提交陣列。
 *   2. 保留完整 Bash 建構（if/for/while/函式）的邊界。
 *   3. 在 game 提示符之間保留提交邊界。
 * 設計原則：
 *   - import 命令整體作為單一提交。
 *   - 非 Bash 模式使用 commandLines 拆分。
 * ============================================================================
 */

import {commandLines} from './console-view.js';
import {needsContinuation} from './console-line-editor.js';

/**
 * 將貼上的多行文字拆分為完整 Bash 建構的提交陣列。
 *
 * @param {string} text - 貼上的文字
 * @param {boolean} [bash=true] - 是否為 Bash 模式
 * @returns {string[]} 提交陣列
 */
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