/**
 * ============================================================================
 * 模組：shell/bash-vfs.js — just-bash IFileSystem 非同步適配器
 * 所屬系統：Shell 子系統 (Shell Subsystem)
 * 模組關聯：
 *   - 依賴：../vfs.js（記憶體 VFS）
 *   - 被：bash-runtime.js（executeBash 建立 BashVFS 實例）
 * 職責：
 *   1. BashVFSError：自訂錯誤類別，用於 VFS 操作失敗。
 *   2. bytesToText()：Uint8Array → 文字解碼。
 *   3. BashVFS：實作 just-bash 的 IFileSystem 介面，所有操作委託給 game VFS。
 *   4. 路徑解析、讀寫、stat、mkdir、rm、cp、mv、link、chmod、utimes 等檔案系統操作。
 * 設計原則：
 *   - 所有操作停留在 game VFS（記憶體），不接觸宿主磁碟。
 *   - 路徑解析不二次展開引號字面值（tilde/variables 已由 just-bash 展開）。
 *   - /dev/null 視為空檔案，所有讀寫皆成功。
 * ============================================================================
 */
const encoder = new TextEncoder(), decoder = new TextDecoder();
const parent = path => path.slice(0, path.lastIndexOf('/')) || '/';
export class BashVFSError extends Error {
  constructor(message) { super(message); this.name = 'BashVFSError'; }
}

export function bytesToText(bytes) {
  return decoder.decode(Uint8Array.from(bytes, ch => ch.charCodeAt(0)));
}

function contentText(content, options) {
  if (content instanceof Uint8Array) return decoder.decode(content);
  const encoding = typeof options === 'string' ? options : options?.encoding;
  if (encoding === 'binary' || encoding === 'latin1') return bytesToText(content);
  if (encoding && !['utf8', 'utf-8', 'ascii'].includes(encoding)) throw new Error(`ENOTSUP: ${encoding} encoding`);
  return String(content);
}

export class BashVFS {
  constructor(vfs, { branch = 'main' } = {}) { this.vfs = vfs; this.branch = branch; }
  resolvePath(base, path) {
    // Tilde/variables have already been expanded by just-bash. Quoted literals
    // must never be expanded a second time by VFS.resolve().
    return this.vfs.resolve(String(path).startsWith('/') ? path : `${base}/${path}`);
  }
  absolute(path) { return this.resolvePath(this.vfs.cwd, path); }
  async readFile(path, options) {
    path = this.absolute(path);
    let text;
    try { text = path === '/dev/null' ? '' : this.vfs.readFile(path); }
    catch (error) { throw new BashVFSError(error.message); }
    const encoding = typeof options === 'string' ? options : options?.encoding;
    if (encoding === 'binary' || encoding === 'latin1') {
      let out = ''; for (const byte of encoder.encode(text)) out += String.fromCharCode(byte); return out;
    }
    if (encoding && !['utf8', 'utf-8', 'ascii'].includes(encoding)) throw new Error(`ENOTSUP: ${encoding} encoding`);
    return text;
  }
  async readFileBuffer(path) { return encoder.encode(await this.readFile(path)); }
  async readFileBytes(path) {
    const content = await this.readFile(path, 'binary');
    this.onReadBytes?.(this.absolute(path));
    return content;
  }
  async writeFile(path, content, options) {
    path = this.absolute(path);
    try { if (path !== '/dev/null') this.vfs.writeFile(path, contentText(content, options), { parents: false }); }
    catch (error) { throw new BashVFSError(error.message); }
  }
  async appendFile(path, content, options) {
    path = this.absolute(path);
    try { if (path !== '/dev/null') this.vfs.writeFile(path, contentText(content, options), { append: true, parents: false }); }
    catch (error) { throw new BashVFSError(error.message); }
  }
  async exists(path) { path = this.absolute(path); return path === '/dev/null' || this.vfs.exists(path); }
  async stat(path) {
    path = this.absolute(path);
    if (path === '/dev/null') return { isFile: true, isDirectory: false, isSymbolicLink: false, mode: 0o666, size: 0, mtime: new Date(0), dev: 1, ino: 0 };
    const s = this.vfs.stat(path);
    return { isFile: s.type === 'file', isDirectory: s.type === 'dir', isSymbolicLink: false,
      mode: parseInt(s.perms, 8), size: s.size, mtime: new Date(s.mtime.replace(' ', 'T') + (s.mtime.endsWith('Z') ? '' : 'Z')),
      dev: 1, ino: s.inode, identity: `game:${s.inode}`, nlink: s.nlink };
  }
  async lstat(path) { return this.stat(path); }
  async realpath(path) {
    path = this.absolute(path);
    if (!await this.exists(path)) throw new Error(`ENOENT: ${path}: No such file or directory`);
    return path;
  }
  async mkdir(path, options = {}) {
    path = this.absolute(path);
    if (this.vfs.exists(path) && !options.recursive) throw new Error(`EEXIST: ${path}: File exists`);
    this.vfs.mkdir(path, { recursive: !!options.recursive });
  }
  async createExclusive(path, options) {
    path = this.absolute(path);
    if (this.vfs.exists(path)) throw new Error(`EEXIST: ${path}: File exists`);
    if (options.directory) await this.mkdir(path); else await this.writeFile(path, '');
    await this.chmod(path, options.mode);
  }
  async readdir(path) { return this.vfs.list(this.absolute(path), { all: true }); }
  async readdirWithFileTypes(path) {
    const absolute = this.absolute(path);
    return (await this.readdir(absolute)).map(name => ({ name, isFile: this.vfs.isFile(`${absolute}/${name}`),
      isDirectory: this.vfs.isDirectory(`${absolute}/${name}`), isSymbolicLink: false }));
  }
  getAllPaths() { return [...this.vfs.nodes.keys()]; }
  async rm(path, options = {}) {
    path = this.absolute(path);
    if (options.recursive && this.branch === 'main' && (path === '/' || path === this.vfs.home || this.vfs.home.startsWith(path + '/'))) {
      throw new Error('main: recursive removal of root/home is blocked');
    }
    if (this.vfs.isDirectory(path) && !options.recursive) {
      if (!this.vfs.empty(path)) throw new Error(`ENOTEMPTY: ${path}: Directory not empty`);
      options = { ...options, recursive: true };
    }
    this.vfs.remove(path, { ...options, preserveHome: true });
  }
  async cp(source, destination, options = {}) {
    source = this.absolute(source); destination = this.absolute(destination);
    if (source === destination || destination.startsWith(source + '/')) throw new Error('EINVAL: cannot copy a directory into itself');
    if (this.vfs.isDirectory(source)) {
      if (!options.recursive) throw new Error(`EISDIR: ${source}: Is a directory`);
      await this.mkdir(destination, { recursive: true });
      for (const entry of await this.readdir(source)) await this.cp(`${source}/${entry}`, `${destination}/${entry}`, options);
    } else await this.writeFile(destination, await this.readFile(source));
  }
  async mv(source, destination) {
    source = this.absolute(source); destination = this.absolute(destination);
    if (source === destination) return;
    if (!this.vfs.exists(source)) throw new Error(`ENOENT: ${source}: No such file or directory`);
    if (destination.startsWith(source + '/') || source === '/' || source === this.vfs.home || this.vfs.home.startsWith(source + '/')) throw new Error('EINVAL: cannot move root/home or a directory into itself');
    if (!this.vfs.isDirectory(parent(destination))) throw new Error(`ENOENT: ${destination}: No such file or directory`);
    if (this.vfs.exists(destination)) await this.rm(destination);
    const entries = [...this.vfs.nodes].filter(([path]) => path === source || path.startsWith(source + '/'));
    for (const [path, node] of entries) { this.vfs.nodes.delete(path); this.vfs.nodes.set(destination + path.slice(source.length), node); }
  }
  async link(source, destination) { this.vfs.link(this.absolute(source), this.absolute(destination)); }
  async chmod(path, mode) {
    const node = this.vfs.nodes.get(this.absolute(path));
    if (!node) throw new Error(`ENOENT: ${path}: No such file or directory`);
    if (node.type === 'file') this.vfs.inodes.get(node.inode).perms = (mode & 0o7777).toString(8).padStart(4, '0');
  }
  async utimes(path, atime, mtime) {
    const node = this.vfs.nodes.get(this.absolute(path));
    if (!node) throw new Error(`ENOENT: ${path}: No such file or directory`);
    if (node.type === 'file') this.vfs.inodes.get(node.inode).mtime = mtime.toISOString();
  }
  async symlink() { throw new Error('ENOTSUP: symbolic links are not supported by the game VFS'); }
  async readlink(path) { throw new Error(`EINVAL: ${path}: not a symbolic link`); }
}
