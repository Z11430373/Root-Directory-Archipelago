/**
 * 世界系統的記憶體檔案系統：pathname 指向 node，file node 再指向可共享的 inode 內容。
 * 依賴 data.js 的章節/text 與 loggen.js；供 Engine、shell/*、quests.js 與 UI 補全使用。
 * 分支複製隔離 nodes/inodes，刻意共用 flags；不接觸宿主磁碟，丟棄 VFS 參照即可釋放。
 */
import { DATA } from './data.js';
import { generateLogs } from './loggen.js';

// 純路徑/大小輔助：輸入已正規化路徑或文字，回傳父目錄、檔名、UTF-8 位元組數。
const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const basename = path => path.slice(path.lastIndexOf('/') + 1);
const bytes = text => new TextEncoder().encode(text).length;

export class VFS {
  /** 由 createWorld/clone/測試建立；選項 → 空世界，保存傳入 flags 參照，建立 root 與 inode 計數。 */
  constructor({ chapter = 'ch0', home = '/home/op', cwd = '/home/op', flags = new Set() } = {}) {
    this.chapter = chapter;
    this.home = home;
    this.cwd = cwd;
    this.flags = flags;
    this.nodes = new Map([['/', { type: 'dir', inode: 1 }]]);
    this.inodes = new Map();
    this.nextInode = 2;
    this.manifest = null;
    this.shellState = null;
  }
  /** 由所有路徑 API 呼叫；相對/絕對/家目錄路徑 → 正規化絕對路徑，不查檔案也不改 cwd。 */
  resolve(path = '.') {
    path = String(path);
    if (path === '~' || path.startsWith('~/')) path = this.home + path.slice(1);
    if (path === '$HOME' || path.startsWith('$HOME/')) path = this.home + path.slice(5);
    if (!path.startsWith('/')) path = `${this.cwd}/${path}`;
    const parts = [];
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') parts.pop();
      else parts.push(part);
    }
    return '/' + parts.join('/');
  }
  /** 由 Shell/Engine 條件呼叫；路徑 → 是否存在，唯讀且不觸發 file.read。 */
  exists(path) { return this.nodes.has(this.resolve(path)); }
  /** 由 Shell 與 UI 補全呼叫；路徑 → 是否為目錄，無副作用。 */
  isDirectory(path) { return this.nodes.get(this.resolve(path))?.type === 'dir'; }
  /** 由指令來源與題目檢查呼叫；路徑 → 是否為一般檔案，無副作用。 */
  isFile(path) { return this.nodes.get(this.resolve(path))?.type === 'file'; }
  /** 由分支狀態規則呼叫；路徑 → 缺席或含隱藏項目也完全為空的目錄才為 true；不刪資料。 */
  empty(path) {
    const absolute = this.resolve(path);
    if (!this.nodes.has(absolute)) return true;
    if (!this.isDirectory(absolute)) return false;
    return ![...this.nodes.keys()].some(p => p !== absolute && parentOf(p) === absolute);
  }
  /** 由載入/寫檔/ln 呼叫；路徑與 recursive → 絕對目錄路徑，原地新增節點，衝突拋錯。 */
  mkdir(path, { recursive = true } = {}) {
    const absolute = this.resolve(path);
    if (this.exists(absolute)) {
      if (!this.isDirectory(absolute)) throw new Error(`${path}: File exists`);
      return absolute;
    }
    const parent = parentOf(absolute);
    if (!this.exists(parent) && recursive) this.mkdir(parent);
    if (!this.isDirectory(parent)) throw new Error(`${path}: No such file or directory`);
    this.nodes.set(absolute, { type: 'dir', inode: this.nextInode++ });
    return absolute;
  }
  /** 由 Shell/題目檢查呼叫；檔案路徑 → 當下旗標對應的文字；唯讀，讀取事件由 Shell 額外登記。 */
  readFile(path) {
    const absolute = this.resolve(path);
    const node = this.nodes.get(absolute);
    if (!node) throw new Error(`${path}: No such file or directory`);
    if (node.type !== 'file') throw new Error(`${path}: Is a directory`);
    const inode = this.inodes.get(node.inode);
    if (inode.variants) {
      for (const variant of inode.variants) {
        const match = /^(not\s+)?(flag\.[A-Za-z0-9_.]+)$/.exec(variant.if.trim());
        if (!match) throw new Error(`Unsupported file variant: ${variant.if}`);
        const set = this.flags.has(match[2]);
        if (match[1] ? !set : set) return DATA.text[variant.content_ref];
      }
    }
    return inode.text;
  }
  /** 由串流指令呼叫；路徑 → 每塊至多 16K UTF-16 code units 的 iterator；消費端提早 return 即停止。 */
  *iterChunks(path) {
    const text = this.readFile(path);
    for (let i = 0; i < text.length; i += 16384) yield text.slice(i, i + 16384);
  }
  /** 由 tail 的直接檔案路徑呼叫；路徑/行數 → 尾端文字塊 iterator，逆尋換行避免整檔 split。 */
  *iterTailLines(path, count) {
    // Direct tail seeks backward instead of streaming the whole file. The
    // demo's generated log is already materialized; do not split/copy it.
    const text = this.readFile(path);
    if (count <= 0 || !text.length) return;
    let start = text.length;
    for (let i = 0; i < count && start > 0; i++) start = (start < 2 ? -1 : text.lastIndexOf('\n', start - 2)) + 1;
    for (let i = start; i < text.length; i += 16384) yield text.slice(i, i + 16384);
  }
  /**
   * 由載入、重導向與流程 create_file 呼叫；路徑/文字/選項 → 絕對檔案路徑。
   * 原地改共享 inode，所有硬連結可見；玩家寫入移除 variants，回復由 Engine 交易或分支快照負責。
   */
  writeFile(path, text, { append = false, parents = true, original = false, metadata = {} } = {}) {
    const absolute = this.resolve(path);
    if (parents) this.mkdir(parentOf(absolute));
    if (!this.isDirectory(parentOf(absolute))) throw new Error(`${path}: No such file or directory`);
    let node = this.nodes.get(absolute);
    if (node?.type === 'dir') throw new Error(`${path}: Is a directory`);
    if (node && this.inodes.get(node.inode).readonly) throw new Error(`${path}: Permission denied`);
    if (!node) {
      node = { type: 'file', inode: this.nextInode++ };
      this.nodes.set(absolute, node);
      this.inodes.set(node.inode, { text: '', original, perms: '0644', ...metadata });
    }
    const inode = this.inodes.get(node.inode);
    inode.text = (append ? this.readFile(absolute) : '') + String(text);
    // A user write changes the inode, not just this pathname, including variants.
    if (!original) delete inode.variants;
    return absolute;
  }
  /** 由 ls/補全/題目檢查呼叫；目錄/all → 排序後的直接子項名稱陣列，錯誤路徑拋錯；唯讀。 */
  list(path = this.cwd, { all = false } = {}) {
    const absolute = this.resolve(path);
    if (!this.isDirectory(absolute)) throw new Error(`${path}: Not a directory`);
    return [...this.nodes.keys()].filter(p => p !== absolute && parentOf(p) === absolute).map(basename).filter(n => all || !n.startsWith('.')).sort();
  }
  /** 由測試及世界掃描呼叫；無參數 → 所有一般檔案絕對路徑的新陣列，不遍歷 inode 內容。 */
  filePaths() { return [...this.nodes].filter(([, n]) => n.type === 'file').map(([p]) => p); }
  /** 由世界修剪與遞迴搜尋呼叫；無參數 → 所有目錄絕對路徑的新陣列，不修改世界。 */
  dirPaths() { return [...this.nodes].filter(([, n]) => n.type === 'dir').map(([p]) => p); }
  /** 由 grep -r 呼叫；起點 → 含隱藏檔的遞迴檔案 iterator；順序須符合 Python 一致性測資。 */
  *walkFiles(path) {
    const absolute = this.resolve(path);
    if (this.isFile(absolute)) { yield absolute; return; }
    if (!this.isDirectory(absolute)) throw new Error(`${path}: No such file or directory`);
    // Match the reference's recursive grep traversal: files in byte order,
    // then directories in materialization order, including hidden entries.
    for (const name of this.list(absolute, { all: true })) {
      const p = this.resolve(`${absolute}/${name}`);
      if (this.isFile(p)) yield p;
    }
    for (const p of this.dirPaths()) if (p !== absolute && parentOf(p) === absolute) yield* this.walkFiles(p);
  }
  /** 由 ls/wc/題目檢查呼叫；路徑 → 節點、UTF-8 大小、連結數等快照，缺席拋錯；唯讀。 */
  stat(path) {
    const absolute = this.resolve(path);
    const node = this.nodes.get(absolute);
    if (!node) throw new Error(`${path}: No such file or directory`);
    const inode = this.inodes.get(node.inode);
    return { ...node, path: absolute, size: node.type === 'file' ? bytes(this.readFile(absolute)) : 4096, nlink: this.sameInodePaths(absolute).length, perms: inode?.perms || '0755', mtime: inode?.mtime || '2031-12-07 07:30', original: inode?.original || false };
  }
  /** 由 stat/讀取事件呼叫；路徑 → 當下共享 inode 的路徑陣列，供讀取時快照，無修改。 */
  sameInodePaths(path) {
    const node = this.nodes.get(this.resolve(path));
    return node ? [...this.nodes].filter(([, n]) => n.inode === node.inode).map(([p]) => p) : [];
  }
  /** 由 ln 呼叫；來源/目的 → 新連結絕對路徑，新增 node 但共用 inode；remove 負責解鏈與回收。 */
  link(source, dest) {
    const src = this.resolve(source);
    const node = this.nodes.get(src);
    if (!node) throw new Error(`${source}: No such file or directory`);
    if (node.type !== 'file') throw new Error(`${source}: hard link not allowed for directory`);
    let destination = this.resolve(dest);
    if (String(dest).endsWith('/') && !this.exists(destination)) this.mkdir(destination, { recursive: false });
    if (this.isDirectory(destination)) destination = this.resolve(`${destination}/${basename(src)}`);
    if (this.exists(destination)) throw new Error(`${dest}: File exists`);
    if (!this.isDirectory(parentOf(destination))) throw new Error(`${dest}: No such file or directory`);
    this.nodes.set(destination, { ...node });
    return destination;
  }
  /**
   * 由 rm/ln -f 呼叫；路徑與刪除選項 → undefined，原地移除 pathname 並回收無連結 inode。
   * 可保留 home/root，cwd 被移除則退回 home 或 /；main 的整批危險操作保護另在 commands.js。
   */
  remove(path, { recursive = false, force = false, preserveHome = true } = {}) {
    const absolute = this.resolve(path);
    if (!this.exists(absolute)) {
      if (force) return;
      throw new Error(`${path}: No such file or directory`);
    }
    if (this.isDirectory(absolute) && !recursive) throw new Error(`${path}: Is a directory`);
    const prefix = absolute === '/' ? '/' : absolute + '/';
    for (const p of [...this.nodes.keys()]) {
      if (p === absolute || (recursive && p.startsWith(prefix))) {
        if (p === '/' || (preserveHome && (p === this.home || this.home.startsWith(p + '/')))) continue;
        this.nodes.delete(p);
      }
    }
    for (const inode of this.inodes.keys()) if (![...this.nodes.values()].some(n => n.inode === inode)) this.inodes.delete(inode);
    if (!this.isDirectory(this.cwd)) this.cwd = this.isDirectory(this.home) ? this.home : '/';
  }
  /** 由分支/交易回復呼叫；無參數 → 隔離 nodes/inodes/manifest 的新 VFS，flags 刻意共享；無宿主資源。 */
  clone() {
    const copy = new VFS({ chapter: this.chapter, home: this.home, cwd: this.cwd, flags: this.flags });
    copy.nodes = new Map([...this.nodes].map(([p, n]) => [p, { ...n }]));
    copy.inodes = new Map([...this.inodes].map(([id, n]) => [id, { ...n, ...(n.variants ? { variants: n.variants.map(v => ({ ...v })) } : {}) }]));
    copy.nextInode = this.nextInode;
    copy.manifest = this.manifest ? { ...this.manifest, top3: [...this.manifest.top3] } : null;
    copy.shellState = this.shellState === null ? null : structuredClone(this.shellState);
    return copy;
  }
}

/**
 * 由 Engine 建立/渡海/還原呼叫；章節/種子/flags → 已載入內容與日誌的 VFS。
 * 依 demo 設定裁切 Ch1 與空目錄；只建立記憶體狀態，變更裁切會影響 T6/7 及路徑補全。
 */
export function createWorld(chapter = 'ch0', seed = 5, flags = new Set()) {
  const sourcePath = chapter === 'ch0' ? 'chapters/ch0_lighthouse.yaml' : chapter === 'ch1' ? 'chapters/ch1_logport.yaml' : null;
  const source = DATA.yaml[sourcePath];
  if (!source) throw new Error(`Unknown chapter: ${chapter}`);
  const start = source.player_start;
  const world = new VFS({ chapter, home: start.home, cwd: start.home, flags });
  const cfg = DATA.yaml['demo/demo.yaml'].content.chapters.ch1_teaser;
  const logs = generateLogs({ seed, ...cfg.generate_override });
  world.manifest = logs.manifest;
  const files = chapter === 'ch1' ? source.files.filter(f => cfg.include_files.includes(f.path)) : source.files;
  for (const file of files) {
    if (file.dir || file.path.endsWith('/')) { world.mkdir(file.path); continue; }
    const text = file.generate ? logs.accessLog : file.content_ref ? DATA.text[file.content_ref] : '';
    if (text === undefined) throw new Error(`Missing content: ${file.content_ref}`);
    world.writeFile(file.path, text, { original: true, metadata: { perms: file.perms || '0644', mtime: file.mtime, readonly: !!file.readonly, variants: file.variants } });
  }
  for (const path of source.dirs || []) world.mkdir(path);
  world.mkdir(world.home);
  // make_conformance.py prunes *both* chapters' empty directories.
  for (const path of world.dirPaths().reverse()) {
    if (path !== '/' && path !== world.home && !world.home.startsWith(path + '/') && world.empty(path)) world.nodes.delete(path);
  }
  world.cwd = world.resolve(start.cwd);
  return world;
}
