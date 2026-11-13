/**
 * ============================================================================
 * 模組：ui/terminal.js — UI 終端輸出呈現器
 * 所屬系統：UI (User Interface)
 * 模組關聯：
 *   - 依賴：ui/dom.js（el）
 *   - 被：main.js（createGame 呼叫）
 * 職責：
 *   1. 管理文字動畫、aria-busy、歷史捲動與 1200 列上限。
 *   2. write()：加入待輸出文字，啟動動畫。
 *   3. finish()：立即完成動畫。
 *   4. destroy()：解除監聽與清理 interval。
 * 設計原則：
 *   - 不修改引擎/存檔，只負責呈現。
 *   - 建構會綁元素/媒體事件，動畫期間有 interval。
 *   - 替換畫面前必須 destroy，避免資源洩漏。
 * ============================================================================
 */

import { el } from './dom.js';

export class Terminal {
  /** main.createGame 呼叫；log DOM → 新實例，綁 scroll/click/reduced-motion 監聽，由 destroy 對稱解除。 */
  constructor(node, {viewport=node, instant=false, rawErrors=false}={}) {
    this.node = node;
    this.viewport = viewport;
    this.instant = instant;
    this.rawErrors = rawErrors;
    this.pending = [];
    this.timer = null;
    this.node.setAttribute('aria-busy','false');
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.last = performance.now();
    this.followOutput = true;
    // 三個閉包各處理使用者捲動/點擊/媒體變更；保存函式身份才能在 destroy 移除同一監聽。
    this.onScroll = () => { this.followOutput = this.atBottom(); };
    this.onClick = () => this.finish();
    this.onMotion = () => { if (this.reduced.matches) this.finish(); };
    this.viewport.addEventListener('scroll', this.onScroll, {passive:true});
    this.node.addEventListener('click', this.onClick);
    this.reduced.addEventListener('change', this.onMotion);
    if (this.reduced.matches) this.instant = true;
  }
  /** main/Engine 輸出呼叫；文字/種類 → undefined，加入待輸出佇列並啟動動畫；空文字忽略。 */
  write(text, kind='system') {
    if (!text) return;
    this.pending.push({ text, kind });
    this.node.setAttribute('aria-busy','true');
    if (!this.timer) this.timer = requestAnimationFrame(() => this.tick());
  }
  /** 動畫 tick；無參數 → undefined，逐字渲染並自動捲動；超過 1200 列時移除舊列。 */
  tick() {
    const now = performance.now();
    const dt = this.instant || this.reduced.matches ? Infinity : now - this.last;
    this.last = now;
    let budget = Math.max(1, Math.floor(dt / 8));
    while (budget > 0 && this.pending.length) {
      const item = this.pending[0];
      const chunk = item.text.slice(0, budget);
      item.text = item.text.slice(budget);
      budget -= chunk.length;
      const span = document.createElement('span');
      span.className = `line ${item.kind}`;
      span.textContent = chunk;
      this.node.append(span);
      if (!item.text) this.pending.shift();
    }
    // 1200 列上限：移除最舊的列，避免記憶體無限增長。
    while (this.node.childElementCount > 1200) this.node.removeChild(this.node.firstChild);
    if (this.pending.length) {
      this.timer = requestAnimationFrame(() => this.tick());
    } else {
      this.timer = null;
      this.node.setAttribute('aria-busy','false');
    }
    if (this.followOutput) this.viewport.scrollTop = this.viewport.scrollHeight;
  }
  /** 使用者點擊/媒體變更呼叫；無參數 → undefined，立即渲染所有待輸出文字。 */
  finish() {
    if (!this.pending.length) return;
    const remaining = this.pending.map(p => p.text).join('');
    this.pending = [];
    if (remaining) {
      const span = document.createElement('span');
      span.className = 'line system';
      span.textContent = remaining;
      this.node.append(span);
    }
    this.timer && cancelAnimationFrame(this.timer);
    this.timer = null;
    this.node.setAttribute('aria-busy','false');
    if (this.followOutput) this.viewport.scrollTop = this.viewport.scrollHeight;
  }
  /** atBottom 呼叫；無參數 → boolean，判斷是否捲動到底部。 */
  atBottom() {
    return this.viewport.scrollHeight - this.viewport.scrollTop - this.viewport.clientHeight < 40;
  }
  /** main.createGame/重建畫面呼叫；無參數 → undefined，解除所有監聽與 interval。 */
  destroy() {
    this.finish();
    this.viewport.removeEventListener('scroll', this.onScroll);
    this.node.removeEventListener('click', this.onClick);
    this.reduced.removeEventListener('change', this.onMotion);
    if (this.timer) cancelAnimationFrame(this.timer);
    this.timer = null;
  }
}