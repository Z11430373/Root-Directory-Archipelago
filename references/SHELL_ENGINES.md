# Bash／Shell 引擎：實際 clone、靜態研究與清理紀錄

查證日期：**2026-11-02**。工作根目錄：`C:\Users\user\Documents\《根目錄群島》`。

## 結論

本輪已成功 `git clone --depth 1` **兩個**公開上游：`vercel-labs/just-bash`、`bahamas10/bash-wasm`，並從本機 checkout 閱讀原始碼、授權與 Git metadata。依使用者其後要求，**兩份 clone 及空父目錄均已刪除，`Test-Path` 驗證為 `False`**；本報告保留固定版本證據與復現方法，詳見 §5。

- **最推薦作整合候選：just-bash。** 有成熟度較高的 TS parser／interpreter、常用命令、browser entry、可注入 VFS 與自訂命令；可以明顯擴充 Bash 語法，但它是模擬器，**不是 GNU Bash**。阻礙是跨行 shell state、非串流管線、現有同步 API／精確讀檔事件、離線單檔封裝。
- **真正 Bash/WASM 參考：bahamas10/bash-wasm。** 包含 GNU Bash 5.3 C 原始碼與 Emscripten 建置方式，但上游明訂 **沒有 fork／exec／wait，故沒有可用管線**；也不能執行一般外部 coreutils。這版不適合直接取代本案 shell。
- **重要下載內容發現：** bash-wasm 的 `web/bash.js`、`web/bash.wasm` 是 Git symlink，指向沒有收錄的 `build/` 產物。原始碼 clone 成功，不等於取得可直接載入的 Bash WASM binary。

本輪只做下載與靜態閱讀；未執行上游 scripts、npm／pnpm install、build、測試或互動 demo，未複製程式到 app。以下「支援」指上游文件／原始碼證據，**不是本機實跑驗證**。

## 1. 下載清單與身份／維護證據

| 項目 | just-bash | bash-wasm |
|---|---|---|
| 官方 repo | https://github.com/vercel-labs/just-bash | https://github.com/bahamas10/bash-wasm |
| clone URL | `https://github.com/vercel-labs/just-bash.git` | `https://github.com/bahamas10/bash-wasm.git` |
| 本輪確切建立位置 | `C:\Users\user\Documents\《根目錄群島》\references\upstream\shell-engines\just-bash` | `C:\Users\user\Documents\《根目錄群島》\references\upstream\shell-engines\bash-wasm` |
| 下載結果 | 成功，1873 個 tracked files | 成功，1584 個 tracked files |
| 本機 HEAD | `7a2a7a57d46095bf6cc8195680a13f76f784681b` | `c30e352e4ff54f048ec093b26d4aa3c1def880e1` |
| `git log -1` committer date | `2026-10-22T08:52:03+09:00`，即 UTC 2026-10-21 23:52:03 | `2026-04-04T20:22:43-04:00`，即 UTC 2026-04-05 00:22:43 |
| HEAD subject | `docs: define issue priority and pull request triage (#655)` | `Merge branch 'main' of github.com:bahamas10/bash-wasm` |
| GitHub API `pushed_at` | `2026-10-27T21:38:22Z` | `2026-04-05T00:22:45Z` |
| GitHub API archived | `false` | `false` |
| 授權檔 | `packages/just-bash/LICENSE`：Apache-2.0，Vercel Inc. copyright | `bash-5.3/COPYING`：完整 GPLv3；`shell.c`、`builtins/web.def` 指定 GPL-3.0-or-later；根 README 宣告 GPLv3 |
| 是否真 Bash | 否，TypeScript Bash 相容解譯器 | 是，GNU Bash 5.3 的第三方 WASM 移植；不是 GNU 官方維護的 browser 發行版 |

維護日期以本機固定 commit 為主要證據；API 的 `pushed_at` 是 repo 層級，不能當成 main HEAD 的日期。兩個 repo 的 API `license` 都回 `null`，因此本輪**實讀授權檔**，沒有用 API 空值推斷無授權。just-bash 套件版本欄為 `3.6.0`，但 main snapshot 不等於 npm 同版發行包；README 仍標示 beta。

身份交叉確認：websearch 先找到 repo；just-bash 的 `package.json` 指向上述 repo、GitHub API homepage 指向 https://justbash.dev/；https://bash-wasm.ysap.sh/ 的 Source Code 連結指向上述 bahamas10 repo，repo README 亦反向連回該網站。

### 本機授權檔 SHA-256

這是本輪 Windows checkout 檔案的 hash（可能受換行處理影響），不是 Git blob SHA：

- just-bash `packages/just-bash/LICENSE`：`B93A9AB54E653B0640F7CC6D69B419334ADD5E3E1DE83D08D79E4115ABDC8358`
- bash-wasm `bash-5.3/COPYING`：`0B383D5A63DA644F628D99C33976EA6487ED89AAA59F0B3257992DEAC1171E6B`

## 2. just-bash：最適合優先包裝的引擎

以下路徑相對其 `packages/just-bash/`；固定原始碼根網址：
https://github.com/vercel-labs/just-bash/tree/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash

### 語法與執行模型

- `README.md:119–132` 明列 `|`、`>`／`>>`／`2>`／`2>&1`／`<`、`&&`／`||`／`;`、變數與預設值、位置參數、globs、if／elif／else、函式、local、for／while／until；提供 hard link、symlink。
- `src/parser/` → `src/ast/` → `src/interpreter/` 是完整解析／執行路徑，不只是 lexer 或 shell-quote。`src/spec-tests/bash/spec.test.ts:40` 記載 `<(...)`／`>(...)` 的 process substitution 測例已加入；其他展開／array／heredoc 見相應測例，未在本輪執行。
- `README.md:85–115` 列 cat、ls、cp、mv、grep、sed、awk、find、wc、jq 等實作；shell 語法支援不等於所有 GNU utility 旗標都相容。例如 README 的 `rg` 預設 smart-case、所有 `--color` 值均輸出純文字，已明確偏離真正 ripgrep。
- `src/interpreter/pipeline-execution.ts:64–98,198–218`：每站 **await 完整結果**，再把 ByteString 交給下一站；有 `PIPESTATUS` 與 `pipefail`，但不是 OS 並行程序／背壓串流。無限 producer 接 `head` 等情境須另驗證，不能假定與 Bash pipe 完全相同。
- `src/interpreter/builtin-dispatch.ts:620–644`：`exec` 只是重派命令，`wait` 回傳成功的 no-op。`src/spec-tests/bash/spec.test.ts:21–39` 明確跳過 TTY、background、kill、trap 類整檔測試；不能宣稱完整 job control。
- `KNOWN_LIMITATIONS.md` **內部存在過時、互相矛盾條目**：前段稱 PIPESTATUS／mapfile／printf %q 完成，後段又稱未實作。實際 `spec.test.ts` 也已取消若干 skip。不能照抄該文件做現行缺陷清單；本報告的硬限制優先依當前程式碼與明確 skip。

### 瀏覽器／離線／Worker

- `package.json:19–34` 有 browser condition 及 `just-bash/browser` ESM 入口；`src/browser.ts` 匯出 `Bash`、`defineCommand`、`InMemoryFs`、`MountableFs`、`IFileSystem` 等。
- `src/commands/browser-excluded.ts:12–19` 排除 tar、yq、xan、sqlite3、python3／python；registry 的 `__BROWSER__` gate 另排除 js-exec／node stub。`src/browser.ts:9–10` 明言 gzip／gunzip／zcat 在 browser 會因 node:zlib 失敗。README 的「all built-in commands」不能獨立當成完整相容承諾。
- core 預設無網路，network／自訂 fetch 需 opt-in；若檔案及依賴已封裝，可作離線運算。**官方 browser build 仍 externalize diff、sprintf-js、turndown、guarded-fetch 等**，不是現成自包含單檔。Node 套件要求 `>=20.19`；本輪未建置、未量測 browser bundle，也未證實 file://、本案 CSP、ES2020 或 Safari 相容。
- 本次檢索 `src` 的 `new Worker` 主要是 Python／SQLite 的 **Node worker_threads**；examples 未找到 browser Worker 包裝。把核心放 Web Worker 可作整合設計，但需自行建立訊息協定、取消／終止、VFS 所有權；**這是建議，不是現成能力證明**。

### VFS 與宿主命令接點

- `src/Bash.ts:144–220`：可傳 `fs: IFileSystem`、`commands`、`customCommands`，自訂命令優先於同名 registry command；`sleep` 亦可注入。
- `src/fs/interface.ts:137–332`：非同步 `readFile`／`readFileBuffer`／可選 `readFileBytes`、write／append／stat／readdir／link／symlink／lstat／realpath／utimes 等；`FsStat` 可帶 `ino`／`dev`／`identity`。適合寫 adapter 接本案 VFS，不需使用其預設記憶體 FS。
- `defineCommand` callback 能取得 `fs`、`cwd`、`env`、byte-shaped `stdin`、`exec`，回 `{stdout, stderr, exitCode}`。可接遊戲命令；一般 README 的 `decodeBytesToUtf8` 沒有在 `browser.ts` 匯出，不能盲搬 Node 範例 imports。
- `README.md:25`：每次 `exec()` 的 cwd／env／functions 重設，**只有 filesystem 共用**。本案互動式多行 shell 必須專門設計狀態保存；只重用 `new Bash()` 不足。
- `logger` 是 exec／輸出紀錄、`trace` 是效能 callback；lazy file provider 只在首讀載入後快取。它們均不等於遊戲的精確讀檔事件。

### 對本案的主要整合阻礙

目前 `demo-app/src/shell/exec.js:80–98` 是同步 `execute(raw,vfs,options)`，回 `{stdout,stderr,rc,reads,readEvents}`，並保存讀取時路徑與 `same_inode`；它的管線註解也寫 iterator 串接。改用 just-bash 是**非同步 API＋完整字串管線**，不能只替換 import。

建議優先研究的接面是：Worker 內持有引擎／VFS adapter → 自訂命令接故事事件 → 將 `exitCode` 轉 `rc` → 保存跨行 shell 狀態。檔案底層讀取需按命令／運算元／grep 是否輸出再判斷事件；FS wrapper 單獨不足。離線封裝、虛擬時鐘、分支／存檔、T7 逐字輸出及 T10 同 commit id 仍需實驗；本輪沒有宣稱任何測試通過。

授權採用需保留 Apache-2.0 LICENSE／適用 notice、修改標示，依賴與第三方測試素材另外辨識。本輪僅研究。

## 3. bash-wasm：真 GNU Bash，但程序模型缺口大

固定原始碼根網址：
https://github.com/bahamas10/bash-wasm/tree/c30e352e4ff54f048ec093b26d4aa3c1def880e1

### 真實內容與授權

- 有完整 `bash-5.3/`、原始 `bash-5.3.tar.gz`、GNU `shell.c`／parser／builtins，非僅把其他模擬器命名 Bash。
- `README.md:20–21` 用 Emscripten `--host wasm32-unknown-emscripten`，匯出 `FS,callMain`，設定 `MODULARIZE=1`／`EXPORT_NAME=createBashModule`。
- `bash-5.3/COPYING` 是完整 GPLv3；`shell.c:5–10` 與新增 `builtins/web.def:6–11` 指定 GPLv3-or-later。整合／散布 WASM 時要處理對應原始碼與 GPL 條件，不能按 MIT／Apache 專案處理；未對整棵來源中的每個附帶檔案做完整授權盤點。
- Git tree 證據：`git ls-tree -r HEAD -- web` 顯示 `web/bash.js`、`web/bash.wasm` mode **120000**。內容分別是 `../build/bash`、`../build/bash.wasm`；checkout 根目錄沒有 build。Windows clone 的 `core.symlinks=false` 將它們留下為文字檔。**本輪沒有下載到可執行 Bash WASM 產物，也沒有建置它。**

### 語法與限制

- GNU Bash 原生 parser／builtins 可作語法正確性參考；官方 `web/index.html:27–60,101–113` 的例子展示變數、brace expansion、for、`[[ ]]` pattern、`declare -A` associative array、`echo`／`printf`／`cd` 等 builtins，以及 `>/dev/null`。
- `web/index.html:57–60,80–86` 明確說外部 tools／forking 無法運作，且 **no fork/exec/wait → no pipes**。因而 `cat file | grep x` 這類本案核心用法不成立，不能因用了真 Bash parser 就宣稱可替換。
- 依賴 fork 的 command substitution／subshell／process substitution 等不得一概當成可用；本輪未逐項實測，也不把「JavaScript 永遠不能多執行緒」當作普遍結論，這是**此移植版本**的限制。
- 作者說會有 unimplemented syscall 訊息。`cache.txt` 帶作者 macOS／Homebrew Emscripten 5.0.4 路徑，且 job control／named pipes 被標成 missing；上游 README 亦稱 works on my machine。它不是可重現性已驗證的 Windows build 套件。

### Browser、離線、Worker、VFS 接點

- `web/bash-loader.js:49–80`：`await createBashModule({noInitialRun:true, print, printErr})` → `FS.writeFile('/script', source+'\n')` → `callMain(['/script'])`。
- `print`／`printErr` 分開接收文字，但 loader 每段自行補 `\n`，不適合作精確 byte stream contract；`runBashScript` 沒回傳 exit code 物件。需要重新設計 stdout／stderr／rc bridge。
- 每次執行建立新 module，未見跨 exec 共享 shell 狀態或持久化；有 `module.FS` 的寫檔接點，但不是本案 JS `IFileSystem` adapter。若以檔案匯入／匯出橋接，hard-link identity、讀檔事件及分支快照都須再處理。
- `builtins/web.def:44–78` 的 `EM_JS` 將 argv 轉交 `globalThis.__bash_web_internal`，回整數狀態；這提供「新增 builtin → JS 宿主」的具體參考，但目前只實作 DOM 寫入／appendHTML／title。
- loader 直接用 `document.querySelector` 且在主頁呼叫 `callMain`，沒有現成 Web Worker 訊息包裝。移進 Worker 要移除／轉接 DOM builtin，並實作終止及輸出訊息；不能只換 Worker URL。
- 網站 HTML 用相對 JS／CSS；理論上產物可本地託管，但缺少 build 產物、沒有確認 file:// 載入、離線快取或單檔內嵌方案。不能將線上 demo 可讀視為本案離線要求已滿足。

## 4. 其他搜尋結果與未下載原因

這次最多選三個，實際選兩個，避免為數量而抓不對題的專案：

- https://github.com/0magnet/websh ：官方 README 確認是 mvdan/sh fork 的 **Go 解譯器編成 WASM**，有 IndexedDB／管線／大量 applets，但不是 GNU Bash，也不是成熟 TS/JS library 路線。本輪只閱讀公開 README，未 clone。
- https://github.com/replikativ/muschel ：Clojure(Script) interpreter，Apache-2.0＋BSD 測例，有 browser host；不是 GNU Bash，且新增另一套工具鏈。本輪只閱讀公開 README，未 clone，沒有將其宣稱為成熟度已驗證的替代品。
- 該 README 引用 `https://github.com/aaronpowell/webassembly-language-runtimes` 為 bash.wasm 來源；本輪 HTTP 查核回 **404**。故不採信該連結的可用性，也**沒有嘗試 clone**。
- 舊筆記 `demo-app/notes/ENGINE_REFERENCES.md` 已讀。PocketTerm 的 Bash 語法／完整授權材料不足問題已有記錄，故本路線未重複下載它。

**失敗分類：兩次實際 clone 均成功，沒有 clone 失敗。** 上述 404 是候選網址查核失敗；bash-wasm 缺 binary 是上游 tracked tree 的內容限制，並非傳輸失敗。

## 5. 實際操作與清理紀錄

### 5.1 建立前與建立結果

1. 先執行 `git --version`，結果 `git version 2.55.0.windows.5`。
2. 本輪開始時讀取 `references/` 回 File not found；讀取 `references/SHELL_ENGINES.md` 亦回 File not found，故本報告為新建。兩次 clone 各自先用 `Test-Path -LiteralPath $target` 檢查；均走不存在分支。不存在的父目錄由 clone 建立。
3. 實際執行的建立流程如下（每次分別設定一組 `$target`／URL）：

```powershell
$target = 'references/upstream/shell-engines/just-bash'
if (Test-Path -LiteralPath $target) {
  Write-Output 'EXISTS; read-only remote check'
  git -C $target remote -v
} else {
  git -c credential.helper= -c core.hooksPath=NUL clone --depth 1 https://github.com/vercel-labs/just-bash.git $target
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$target = 'references/upstream/shell-engines/bash-wasm'
if (Test-Path -LiteralPath $target) {
  Write-Output 'EXISTS; read-only remote check'
  git -C $target remote -v
} else {
  git -c credential.helper= -c core.hooksPath=NUL clone --depth 1 https://github.com/bahamas10/bash-wasm.git $target
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

4. 兩次工具執行均成功。just-bash 顯示 `Updating files: 100% (1873/1873)` 及 5.70 MiB filtering content；`.gitattributes` 確認其 CPython `python.wasm` 使用 Git LFS，clone 自動下載了該靜態檔，`.git/lfs/` 有 objects／tmp／incomplete。沒有執行該 WASM。bash-wasm 顯示 `Updating files: 100% (1584/1584)`。
5. `git remote -v` 確認兩者 origin 與 §1 URL 一致；`git log -1 --format="commit=%H%nauthor_date=%aI%ncommit_date=%cI%nsubject=%s"` 取得 §1 證據；`git rev-parse --is-shallow-repository` 均為 `true`。
6. 刪除前 `git --no-optional-locks -C <repo> status --porcelain` 均無輸出。`Get-ChildItem -Recurse -Force -File | Measure-Object Length -Sum` 的檔案長度總和（含 `.git`，非壓縮下載量／非磁碟配置量）為：just-bash **44,750,824 bytes**、bash-wasm **70,827,536 bytes**。

### 5.2 使用者中途更正與清理狀態

使用者要求後續研究副本改放 `%LOCALAPPDATA%\Temp\opencode\ra-upstream-shell-engines-<唯一後綴>`，並明確允許**已 clone 進專案的本輪副本研究完直接刪除**。本輪採此例外，不再製造第二份 clone，也沒有新建該 Temp 目錄。

清理結果：**完成。** 重新核對兩份 clone 的 origin、HEAD、無修改／無 untracked files 後，刪除 §1 的兩個目錄；`shell-engines` 與 `upstream` 皆確認為空才移除。本報告及其他代理建立的檔案予以保留。以下清理命令先記入報告，再實際執行：

```powershell
$ErrorActionPreference = 'Stop'
$targets = @(
  @{
    Path = 'references/upstream/shell-engines/just-bash'
    Remote = 'https://github.com/vercel-labs/just-bash.git'
    Sha = '7a2a7a57d46095bf6cc8195680a13f76f784681b'
  },
  @{
    Path = 'references/upstream/shell-engines/bash-wasm'
    Remote = 'https://github.com/bahamas10/bash-wasm.git'
    Sha = 'c30e352e4ff54f048ec093b26d4aa3c1def880e1'
  }
)
foreach ($target in $targets) {
  if (-not (Test-Path -LiteralPath $target.Path -PathType Container)) { throw "Missing expected clone: $($target.Path)" }
  $remote = git -C $target.Path remote get-url origin
  if ($LASTEXITCODE -ne 0 -or $remote -ne $target.Remote) { throw 'Remote mismatch' }
  $sha = git -C $target.Path rev-parse HEAD
  if ($LASTEXITCODE -ne 0 -or $sha -ne $target.Sha) { throw 'Commit mismatch' }
  $status = @(git --no-optional-locks -C $target.Path status --porcelain --untracked-files=all)
  if ($LASTEXITCODE -ne 0 -or $status.Count -gt 0) { throw 'Unexpected work found; refuse deletion' }
  Write-Output "VERIFIED_OWN_CLONE=$($target.Path) origin=$remote commit=$sha clean=True"
}
foreach ($target in $targets) {
  Remove-Item -LiteralPath $target.Path -Recurse -Force
  Write-Output "DELETED=$($target.Path) EXISTS=$(Test-Path -LiteralPath $target.Path)"
}
$parent = 'references/upstream/shell-engines'
if ((Test-Path -LiteralPath $parent) -and @(Get-ChildItem -LiteralPath $parent -Force).Count -eq 0) {
  Remove-Item -LiteralPath $parent
  Write-Output "DELETED_EMPTY_PARENT=$parent EXISTS=$(Test-Path -LiteralPath $parent)"
}
```

實際輸出：

```text
VERIFIED_OWN_CLONE=references/upstream/shell-engines/just-bash origin=https://github.com/vercel-labs/just-bash.git commit=7a2a7a57d46095bf6cc8195680a13f76f784681b clean=True
VERIFIED_OWN_CLONE=references/upstream/shell-engines/bash-wasm origin=https://github.com/bahamas10/bash-wasm.git commit=c30e352e4ff54f048ec093b26d4aa3c1def880e1 clean=True
DELETED=references/upstream/shell-engines/just-bash EXISTS=False
DELETED=references/upstream/shell-engines/bash-wasm EXISTS=False
DELETED_EMPTY_PARENT=references/upstream/shell-engines EXISTS=False
```

之後目錄讀取確認 `references/upstream` 為空，另執行下列非遞迴刪除（若有其他內容就保留）：

```powershell
$parent = 'references/upstream'
if ((Test-Path -LiteralPath $parent) -and @(Get-ChildItem -LiteralPath $parent -Force).Count -eq 0) {
  Remove-Item -LiteralPath $parent -ErrorAction Stop
  Write-Output "DELETED_EMPTY_PARENT=$parent EXISTS=$(Test-Path -LiteralPath $parent)"
} else {
  Write-Output "PRESERVED_PARENT=$parent"
}
```

輸出：`DELETED_EMPTY_PARENT=references/upstream EXISTS=False`。`git --no-optional-locks status --short -- references/SHELL_ENGINES.md references/upstream/shell-engines` 僅列 `?? references/SHELL_ENGINES.md`。本輪 clone、其 `.git`／LFS 內容及兩個空父目錄已移除；未建立研究用 Temp 副本，因此沒有本輪此類 Temp 殘留可刪。

### 5.3 環境變更範圍

- 沒有 npm／pnpm／Go／Emscripten 安裝、套件安裝或 build；沒有執行上游腳本、啟動 server、修改 PATH／git global／系統設定。
- `git -c credential.helper= -c core.hooksPath=NUL` 僅作用於該次 clone 程序。clone 自己產生的 `.git/config`、LFS objects 與副本一起清除；沒有更改主專案 `.git` 設定。
- 有意保留：本報告。其他代理在 `references/` 的檔案不屬於本輪清理範圍。
- 驗證範圍是列出的工作副本／路徑；未做整台機器的前後快照，不宣稱瀏覽工具／作業系統快取或稽核紀錄均已抹除。

## 6. 復現指引（未執行，使用唯一 Temp 路徑）

下次若要重新研究，以官方公開 URL 建立獨立暫存，不要覆寫任何既存目錄：

```powershell
$study = Join-Path 'C:\Users\user\AppData\Local\Temp\opencode' ('ra-upstream-shell-engines-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $study) { throw 'Refuse existing directory' }
New-Item -ItemType Directory -Path $study | Out-Null

git -c credential.helper= -c core.hooksPath=NUL clone --depth 1 https://github.com/vercel-labs/just-bash.git (Join-Path $study 'just-bash')
git -c credential.helper= -c core.hooksPath=NUL clone --depth 1 https://github.com/bahamas10/bash-wasm.git (Join-Path $study 'bash-wasm')
```

每次確認 exit code、origin 與 HEAD。若 HEAD 已變，為重現本報告版本，可對該新建 clone 執行 `git -c credential.helper= -C <clone> fetch --depth 1 origin <§1 SHA>`，再 `git -c core.hooksPath=NUL -C <clone> checkout --detach <§1 SHA>`；如果上游不再供應該 SHA，應標示不能復現，勿冒稱仍是同版。只讀 README／LICENSE／上述原始碼，不執行專案 scripts。

記錄 `$study`、origin、SHA、建立／清理結果後，僅對本輪自己新建且沒有其他工作內容的 `$study` 使用 `Remove-Item -LiteralPath $study -Recurse -Force`，並以 `Test-Path -LiteralPath $study` 應為 `False` 驗證。若有不明新增內容，先停下調查。

## 7. 固定版本與官方查核連結

- just-bash commit：https://github.com/vercel-labs/just-bash/commit/7a2a7a57d46095bf6cc8195680a13f76f784681b
- just-bash LICENSE：https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/LICENSE
- just-bash repo API：https://api.github.com/repos/vercel-labs/just-bash
- bash-wasm commit：https://github.com/bahamas10/bash-wasm/commit/c30e352e4ff54f048ec093b26d4aa3c1def880e1
- bash-wasm COPYING：https://github.com/bahamas10/bash-wasm/blob/c30e352e4ff54f048ec093b26d4aa3c1def880e1/bash-5.3/COPYING
- bash-wasm loader：https://github.com/bahamas10/bash-wasm/blob/c30e352e4ff54f048ec093b26d4aa3c1def880e1/web/bash-loader.js
- bash-wasm 限制：https://github.com/bahamas10/bash-wasm/blob/c30e352e4ff54f048ec093b26d4aa3c1def880e1/web/index.html#L80-L86
- bash-wasm repo API：https://api.github.com/repos/bahamas10/bash-wasm
