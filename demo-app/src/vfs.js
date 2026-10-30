import { DATA } from './data.js';
import { generateLogs } from './loggen.js';

const parentOf = path => path.slice(0, path.lastIndexOf('/')) || '/';
const basename = path => path.slice(path.lastIndexOf('/') + 1);
const bytes = text => new TextEncoder().encode(text).length;

export class VFS {
  constructor({ chapter = 'ch0', home = '/home/op', cwd = '/home/op', flags = new Set() } = {}) {
    this.chapter = chapter;
    this.home = home;
    this.cwd = cwd;
    this.flags = flags;
    this.nodes = new Map([['/', { type: 'dir', inode: 1 }]]);
    this.inodes = new Map();
    this.nextInode = 2;
    this.manifest = null;
  }
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
  exists(path) { return this.nodes.has(this.resolve(path)); }
  isDirectory(path) { return this.nodes.get(this.resolve(path))?.type === 'dir'; }
  isFile(path) { return this.nodes.get(this.resolve(path))?.type === 'file'; }
  empty(path) {
    const absolute = this.resolve(path);
    if (!this.nodes.has(absolute)) return true;
    if (!this.isDirectory(absolute)) return false;
    return ![...this.nodes.keys()].some(p => p !== absolute && parentOf(p) === absolute);
  }
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
  *iterChunks(path) {
    const text = this.readFile(path);
    for (let i = 0; i < text.length; i += 16384) yield text.slice(i, i + 16384);
  }
  *iterTailLines(path, count) {
    // Direct tail seeks backward instead of streaming the whole file. The
    // demo's generated log is already materialized; do not split/copy it.
    const text = this.readFile(path);
    if (count <= 0 || !text.length) return;
    let start = text.length;
    for (let i = 0; i < count && start > 0; i++) start = (start < 2 ? -1 : text.lastIndexOf('\n', start - 2)) + 1;
    for (let i = start; i < text.length; i += 16384) yield text.slice(i, i + 16384);
  }
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
  list(path = this.cwd, { all = false } = {}) {
    const absolute = this.resolve(path);
    if (!this.isDirectory(absolute)) throw new Error(`${path}: Not a directory`);
    return [...this.nodes.keys()].filter(p => p !== absolute && parentOf(p) === absolute).map(basename).filter(n => all || !n.startsWith('.')).sort();
  }
  filePaths() { return [...this.nodes].filter(([, n]) => n.type === 'file').map(([p]) => p); }
  dirPaths() { return [...this.nodes].filter(([, n]) => n.type === 'dir').map(([p]) => p); }
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
  stat(path) {
    const absolute = this.resolve(path);
    const node = this.nodes.get(absolute);
    if (!node) throw new Error(`${path}: No such file or directory`);
    const inode = this.inodes.get(node.inode);
    return { ...node, path: absolute, size: node.type === 'file' ? bytes(this.readFile(absolute)) : 4096, nlink: this.sameInodePaths(absolute).length, perms: inode?.perms || '0755', mtime: inode?.mtime || '2031-12-07 07:30', original: inode?.original || false };
  }
  sameInodePaths(path) {
    const node = this.nodes.get(this.resolve(path));
    return node ? [...this.nodes].filter(([, n]) => n.inode === node.inode).map(([p]) => p) : [];
  }
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
  clone() {
    const copy = new VFS({ chapter: this.chapter, home: this.home, cwd: this.cwd, flags: this.flags });
    copy.nodes = new Map([...this.nodes].map(([p, n]) => [p, { ...n }]));
    copy.inodes = new Map([...this.inodes].map(([id, n]) => [id, { ...n, ...(n.variants ? { variants: n.variants.map(v => ({ ...v })) } : {}) }]));
    copy.nextInode = this.nextInode;
    copy.manifest = this.manifest ? { ...this.manifest, top3: [...this.manifest.top3] } : null;
    return copy;
  }
}

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
