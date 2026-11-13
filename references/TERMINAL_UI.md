# 真終端呈現／輸入研究：xterm.js + 瀏覽器內 PTY

研究日期：2026-11-02。範圍：只抓取兩個上游 GitHub repo、靜態閱讀與撰寫本報告。

## 結論

- **兩個 repo 均已實際 `git clone --depth 1` 成功**，不是只有搜尋連結。固定 commit、來源證據與操作紀錄如下。
- **推薦 xterm.js 接手目前的文字列輸出、ANSI、終端游標、字元格、選取及 IME；以 xterm-pty 作為瀏覽器端 termios／Emscripten TTY 接層參考。**
- 完整的 Bash 操作感需要三層：`xterm.js（終端）↔ PTY／TTY（終端 I/O）↔ shell + readline（命令與編輯）`。xterm.js 不解析 Bash；xterm-pty 也沒有附帶 Bash 或 GNU Readline。
- 現有 Worker 是「一條完整指令進、整份結果與 VFS 出」的模擬器，不能直接當作互動 PTY。只換渲染器能改善呈現，但歷史、補全、逐鍵編輯仍須有明確的編輯層。
- 使用者追加「研究後還原」要求後，副本已移到專用暫存目錄；**最終清理結果見第 7 節**。原專案只保留此報告，來源以固定 SHA 的 GitHub 連結與復現指引追溯。

## 1. 來源、版本與授權

| 項目 | xterm.js | xterm-pty |
|---|---|---|
| 官方／作者 repo | <https://github.com/xtermjs/xterm.js> | <https://github.com/mame/xterm-pty> |
| clone URL | `https://github.com/xtermjs/xterm.js.git` | `https://github.com/mame/xterm-pty.git` |
| 固定 HEAD | `08829c7eb6279dda2a9e86df901353a1a89858ca` | `05ed1ad11003254bdea32e37032402b068fffca5` |
| HEAD 日期（`git log --format=%cs`） | 2026-10-29 | 2026-04-07 |
| HEAD 主旨 | `fix(unicode-graphemes): read the trie header at the view's byteOffset (#6080)` | `0.12.0` |
| package.json 版本 | `@xterm/xterm` 6.0.0 | `xterm-pty` 0.12.0 |
| 授權檔 | `LICENSE`，MIT | `LICENSE.txt`，MIT |
| repo 定位 | 真正的瀏覽器終端模擬器 | xterm.js 的 JavaScript PTY addon，含 Emscripten 接合範例 |
| 本次取得形式 | depth 1 Git working tree | depth 1 Git working tree |

官方來源核對依據：搜尋結果直接連到上列 repo；GitHub README／About 與本地 `package.json.repository` 一致；clone 後 `git remote -v` 的 origin fetch/push 均為表中的 URL。

固定版授權：

- [xterm.js LICENSE][x-license]：保留 xterm.js authors／SourceLair／Christopher Jeffrey 的著作權與 MIT 許可文字。這份 LICENSE 的年份與 README 年份不同，發佈時應保留檔案原文。
- [xterm-pty LICENSE.txt][p-license]：Copyright 2022 Yusuke Endoh，MIT。
- 兩個 repo 的 MIT 不等於未來另加入的 Bash、Readline、WASM runtime 或 demo 外部下載程式也採 MIT；那些是另外的來源與授權項目，本輪未下載。

**版本接合尚未驗證：** xterm-pty 的 `package.json:32–34` 宣告 `@xterm/xterm: ^5.5.0`，不涵蓋這次抓到的 6.0.0。應先選定相容的 xterm／fit／PTY 版本組合，再做整合；不能把本次兩份 HEAD 當作已驗證套件組合。

## 2. 能力究竟由誰提供

以下「有」指靜態原始碼／API 有實作證據，**不代表本輪已在瀏覽器測試**。

| 能力 | xterm.js | xterm-pty |
|---|---|---|
| 字元格與字寬 | `CellData` 保存文字、width、fg/bg、combinedData；buffer 配合 DOM／可選 WebGL renderer | 不渲染字元格；使用 xterm.js |
| ANSI／VT | `InputHandler` 註冊 CSI/OSC/ESC：SGR 顏色、清行／清畫面、插刪字元、捲動、alternate buffer 等 | 傳遞輸出；termios 可做 CR/LF 後處理，不是 ANSI parser |
| 游標 | 接受 CSI A/B/C/D/H、save/restore、cursor style 等；終端狀態與畫面游標由 xterm 管 | 不維護 shell 的編輯游標；只接通雙向 I/O |
| resize | `Terminal.resize(cols, rows)`、`onResize`；FitAddon 根據實測 cell 大小計算行列 | master 訂閱 `onResize`，slave 更新 winsize，發 `SIGWINCH`；`ioctl('TIOCGWINSZ')` 回 `[cols, rows]` |
| selection／copy | `SelectionService` 按 buffer 座標選取；公開 `hasSelection/getSelection/selectAll`；copy handler 輸出純文字 | 沒有自己的選取／剪貼簿功能 |
| IME／中文 | `CompositionHelper` 處理 compositionstart/update/end、229、組字 overlay 與結果送出；內部仍使用 textarea 接瀏覽器輸入 | 接收 xterm 提交的字串，轉 UTF-8；不處理組字 UI |
| 貼上 | 正規化換行；應用啟用 bracketed paste 時送 `ESC[200~…ESC[201~` | 依 termios 傳遞；不懂「這段貼上是 Bash 語法」 |
| 行編輯／歷史／Tab／Ctrl+R | 將鍵盤／貼上變成 `onData`，**沒有 Bash readline** | canonical mode 有 erase/kill/word erase/EOF/echo，**不是 readline 歷史／補全／中間插入編輯** |
| Ctrl+C | 產生輸入控制字元；不會自行中止 app 的 Worker | `ISIG` 開啟時轉為 `SIGINT` 事件；實際中止／取消由上層執行環境決定 |
| shell／本機 OS | 不建立程序、不提供檔案系統或命令語意 | JS 模擬 PTY／line discipline，不建立 OS process，也不是 SSH client |

### xterm.js 的可核對來源

- [README:3–17、33–46][x-readme]：前端終端、明確說不是 Bash、`pty.onData → term.write` 與 `term.onData → pty.write`。
- [src/common/buffer/CellData.ts:12–94][x-cell]：cell 寬度、組合文字與屬性。
- [src/common/InputHandler.ts:205–345][x-input]：ANSI／游標註冊；同檔 2017 附近有 alternate buffer，2034 附近有 bracketed paste mode。
- [typings/xterm.d.ts:1043–1120][x-api]：`onBinary`、`onData`、`onResize`、`onSelectionChange`。`onBinary` 是 binary-string 協定，不能在自製 transport 中一律當 UTF-8 字串重編碼。
- [src/browser/input/CompositionHelper.ts:70–108、149–202、245–278][x-ime]：組字結束才送入資料流與候選位置處理。xterm 內部 textarea 是終端輸入橋樑，不是本專案目前的「可編輯命令列即整個 shell」模型。
- [src/browser/services/SelectionService.ts:191–203、366][x-selection]、[src/browser/Clipboard.ts:13–58][x-clipboard]：選取、複製與 bracketed paste。
- [addons/addon-fit/src/FitAddon.ts:47–94][x-fit]：`fit()` 不會自行觀察容器；由 app 的 `ResizeObserver`／視窗尺寸變更呼叫。

### xterm-pty 的可核對來源

- [src/pty.ts:75–86][p-pty]：`loadAddon(master)` 後已訂閱 `onData/onBinary/onResize`，不可又重複加一條相同輸入轉送，否則會重複送字。
- [src/pty.ts:95–186][p-pty]：`slave.onReadable/read/write/onSignal/ioctl` 與 `openpty()`。master 輸出以 4096-byte chunks 和 `xterm.write(buf, callback)` 串接。
- [src/lineDiscipline.ts:125–160、258–363、415–480][p-ldisc]：canonical 行緩衝、erase/kill、非 canonical 即時送入、SIGINT／SIGQUIT／SIGTSTP。
- [src/termios.ts:106–122、139–156][p-termios]：預設 `ICANON/ECHO/ISIG`；`VMIN/VTIME` 等標示未支援。這不是完整 POSIX kernel TTY。
- CJK 的渲染可交給 xterm，但 xterm-pty 的 canonical erase 對字寬沒有完整 wcwidth 計算：`lineDiscipline.ts:235–237` 非 UTF-8 continuation byte 算一欄、`:348–353` 普通字元只做一組 `BS SP BS`。**寬字／emoji 刪除回顯需驗證**；不能僅由 UTF-8 支援推論寬字編輯完備。
- [examples/plain-example/index.html:14–31][p-plain]：純 JS 程式使用 slave 讀寫，不需要後端或 SSH；[examples/module-example/index.html:18–28][p-module]：`initEmscripten({ pty: slave })` 接合。
- [demo/build/example.c:18–34][p-example]：`fgets` 與 `tcsetattr` 關閉密碼 echo；不是 readline 範例。
- [emscripten-pty.js:69–100、174–220、281–365][p-emscripten]：signal、fd_read、termios、winsize、TTY read/write 與 poll 接合。它是 **emcc 的編譯期 `--js-library`**，含 `#if`／Emscripten 巨集，不可直接貼成網頁 `<script>`。
- [README:118–162][p-readme]：支援 Asyncify 與 PThread 兩條執行路線。README 的「已確認 Emscripten 3.1.47」和目前原始碼針對 5.0+ async poll 的分支並存；這是文件／實作證據，不是本輪實測相容承諾。
- [tests/signals.test.ts:4–18][p-signals] 有 Ctrl+C 與 resize 的上游測試案例；本輪只讀、沒有執行。

### 本機程序與 SSH 的邊界

xterm.js 自帶 [demo/server/server.ts:53–80、98–118、186–201][x-server] 已示範 **node-pty 啟動伺服器主機上的程序**：Unix 用 `bash`，Windows 用 `powershell.exe`，並以 WebSocket 搬運資料。它既不是 SSH shell 引擎，也不代表離線 HTML 可以直接啟動 Windows Bash。node-pty 沒有另行 clone／安裝；此處只是讀第一個 repo 已含的接線參考。

## 3. 對現有 app 的替換接點

以下路徑與行號為本輪唯讀檢查時的專案狀態；其他代理後續變更可能使行號移動。

| 現況 | 可實作替換／保留方式 |
|---|---|
| `demo-app/src/ui/console-view.js:66–75` 的 log、prompt label、textarea、form | 換成單一 xterm mount；prompt 是輸出 buffer 中的文字，不再是獨立 label。仍可保留外層模式切換和狀態提示。 |
| 同檔 `112–118` 用字體大小與 `codePoint>255` 猜 rows | 用 FitAddon 的實測 cell 尺寸決定 `cols/rows`，並把 resize 送到 PTY／編輯層。 |
| 同檔 `123–178` history/search/key、`.setRangeText()` | 若仍接現有模擬 shell：抽出無 DOM 的 LineEditor，接 `onData`，透過 ANSI 重繪 prompt/line；若接真正 shell/readline：由它處理歷史、方向鍵、Tab、Ctrl+R，撤掉重複的前端編輯攔截。 |
| 同檔 `94–107` busy 時全域 Ctrl+C、隱藏輸入 | 互動 PTY 路線保持終端可接收輸入；Ctrl+C 走控制字元／signal。模擬 Worker 路線則在 adapter 對接現有 cancel，不能只隱藏輸入後等命令完成。 |
| `demo-app/src/ui/terminal.js:30–55` 一個輸出一個 DOM div、1200 DOM 列上限 | 終端模式改 `term.write` 原始串流和 `scrollback`；CR、BS、CSI 應被解譯，不再以 `textContent` 當可見字。遊戲的輸出 kind 可轉成 SGR，但不應破壞程式原始 ANSI。 |
| 同檔 `81–95` 捲動、clear、destroy | 對應 xterm scroll API、`clear()`、`dispose()`，另解除 app 的 observer/subscriptions；Ctrl+L 的 readline 重繪與 UI 清除 scrollback 是不同語意。 |
| `demo-app/src/main.js:434–449` completion | 將候選查詢（白名單、game 子命令、VFS 路徑）抽出為編輯層 callback；目前操作 `.value/selectionStart/setRangeText` 的部分必須改 adapter。xterm 沒有 `getEditableCommand()` API。 |
| `main.js:312–320` `echoInput`／history／journal | prompt／鍵入回顯只由一層負責，避免 PTY echo + `echoInput` 雙印。已提交遊戲命令的紀錄與持久化可保留在 controller。若新 runtime 是逐位元組 TTY，還需另外定義如何取得「完成的一條命令」供 journal 使用，不能把任意 chunk 當一條命令。 |
| `main.js:576–607` `submitConsole/commandLines/cancelConsole` | 模擬器仍可收 LineEditor 的完整字串；真 shell 路線不先分割貼上的腳本，讓 shell parser/readline 處理引號、續行與 bracketed paste。 |
| `main.js:455–456` secret 輸入 | 由 LineEditor echo policy 或 PTY 的 `ECHO` 控制，不再依賴 textarea 的 `-webkit-text-security`；沿用密碼不進 history 的業務規則。 |
| `main.js:621–622` `log.lastElementChild.id='console-save-code'` | xterm 的輸出不是每則訊息一個可標 ID 的 DOM；匯出代碼應保留資料值與既有下載流程，複製走 `term.getSelection()` 或獨立資料操作。 |
| `demo-app/src/ui/server.css:10–20` pre-wrap／overflow-wrap／textarea 欄位 | 用 xterm CSS 與有確定高度的 mount，避免外層再以 CSS 任意換行；字體／顏色設到 `Terminal.options`，不要覆蓋 `.xterm` 的字元格樣式。 |
| `demo-app/src/shell/worker.js:5–10`、`ui/shell-job.js:4–23` | 現有 `{raw,state,options} → {result,state}` 是一次性 job；每次完成或取消就 terminate。可供過渡 LineEditor 呼叫，但無持續 stdin、TTY ioctl、逐塊 stdout、SIGWINCH 或 job control。 |

**建議分界：** 先讓終端與業務 controller 之間有 `input(data)`、`output(bytes)`、`resize(cols,rows)`、`exit`、`dispose` 的 session adapter。現有模擬器的 adapter 另包 LineEditor／完整行提交；真正 runtime 的 adapter 接 PTY。這些是建議介面，不是現有已實作 API。

## 4. 離線、單 HTML 的具體路線

### 4.1 xterm.js + 既有模擬器

1. 未來整合時，將固定版本 `@xterm/xterm` 與 `@xterm/addon-fit` 編入現有 IIFE；把 `css/xterm.css` 併入 `build.mjs:88` 的最終 CSS，完整保留兩者授權。
2. 現有 `build.mjs:85–92` 已把 Worker 原始碼內嵌，執行時用 Blob URL，且 `connect-src 'none'`。xterm 前端本身不需要網路；移除上游範例的 CDN script/link，將資產全部內嵌即可維持這個離線資料流。
3. clone 是原始碼，不是可直接 `<script>` 的發佈包。本輪已檢查 `xterm.js/lib/xterm.js` 與 `xterm-pty/index.js` **皆不存在**，未因缺少產物而執行 build／install。
4. LineEditor 接 `term.onData`，不能只靠 `onKey` 或重綁每個 DOM keydown；IME 與貼上也會產生資料。既有純文字輸出要在 adapter 選擇 LF→CRLF，或選 `convertEol`；真 PTY 已做輸出後處理時避免重複轉換。

### 4.2 xterm.js + xterm-pty + 瀏覽器內 runtime

接線骨架（設計說明，**未執行、未打包**；`initEmscripten` 必須由另外準備的程式產物提供）：

```js
const term = new Terminal({ scrollback: 1200 });
term.open(mount);
const fit = new FitAddon();
term.loadAddon(fit);
const { master, slave } = openpty();
term.loadAddon(master); // 這裡已接 onData、onBinary、onResize
fit.fit();             // 讓實際 resize 傳到 slave
const observer = new ResizeObserver(() => fit.fit());
observer.observe(mount);

await initEmscripten({ pty: slave, wasmBinary: embeddedWasmBytes });
// app 解除畫面時：observer.disconnect()、term.dispose()；
// runtime 的中止／資源釋放依其生命週期另行處理。
```

- `slave.ioctl('TIOCGWINSZ')` 在本版預設是 `[80,24]`，master.activate 沒有立即同步現有 term 尺寸；需確認首次 fit 確實觸發 resize，特別是非預設初始 cols/rows。
- 純 JS 程式可用 `slave.onReadable(() => slave.read())` 與 `slave.write()`；canonical mode 只能取得基本行編輯。若要 JS readline，須關閉 `ICANON/ECHO` 等由編輯器接管的模式，逐 chunk 解碼並自行處理 escape/paste 序列、歷史、補全與重繪。不要把一次 `onReadable` 當一條永遠完整的命令，或每個 UTF-8 chunk 都用無狀態 decode。
- 接移植的 shell/readline 時，由其 termios API 決定 canonical/raw/echo；不要前端再強制覆寫同一套設定。PTY 的 `SIGINT` 不等於 POSIX fork/process group/job control 已經存在。
- **Asyncify 路線**可不依賴 SharedArrayBuffer；JS/WASM/預載 FS 全部嵌入 HTML，透過 `wasmBinary` 等本地 bytes 載入，可作為離線單檔方向。這是整合推導，不是此 repo 已交付的 Bash 單檔。長時間運算還需主動 yield，否則 UI／Ctrl+C 無法及時處理。
- **PThread 路線**依賴 SharedArrayBuffer/Atomics 與 HTTP 的 COOP/COEP headers。一般雙擊 `file://` 單 HTML 無法靠 meta 偽造這些 response headers，因此不符合目前「雙擊即可離線」的交付方式。
- 加入 WASM 時，目前 `script-src` 只有 hash；還需針對目標瀏覽器處理 WebAssembly 編譯的 CSP（例如 `wasm-unsafe-eval`）並確認無隱性 fetch。這些未在本輪實作。

### 4.3 已在原始碼發現的 CSP 接合阻點

目前 `build.mjs:91` 只准許最終一份 CSS 的 SHA-256。xterm.js 會在執行時建立 `<style>`：

- [DomRenderer.ts:162–185、315][x-dom]：字元尺寸與可變 theme CSS。
- [Viewport.ts:83–97][x-viewport]：scrollbar theme CSS；因此只改用 WebGL 也不能直接推論不再有動態 style。

這些新增 style 不在既有 CSS hash 內，不能只把 `xterm.css` 串接就宣稱 CSP 相容。可實作的方向是把這些動態規則寫入既有獲授權樣式表的 CSSOM（需窄幅 adapter／vendor 調整，並保留版本差異紀錄）；或另訂與動態樣式匹配的 CSP 策略。需實測 theme/font/resize 後的樣式是否生效。此處是由原始碼判定的接合工作，不是本輪已重現的瀏覽器測試結果。

## 5. 後續最小驗收項目（本輪未執行）

1. `\r` 覆寫、`\b`、SGR、CSI 游標與清行，進出 alternate screen；不可只是印出 escape 文字。
2. resize 後 `cols/rows`、PTY winsize 與 prompt 重繪一致；中英混排、寬字與 emoji 不錯位。
3. 中文組字 Enter 不誤送出／不重複、手機鍵盤；一般貼上與 bracketed paste、引號內多行。
4. ↑↓ history、Ctrl+R、Tab、Home/End、中間插入與長行換行由同一編輯層處理；秘密輸入無回顯及 history。
5. Ctrl+C 在編輯與執行時各自生效；有選取時的 copy 與 signal 手勢有明確規則。xterm 選取應用 `term.hasSelection()`，不可沿用只看 `window.getSelection()`。
6. file://、斷網、CSP 下完成載入；切換模式可清掉 observer、事件與 runtime；存檔／journal／遊戲命令行為仍能核對。

## 6. 本輪實際操作紀錄

### 6.1 建立：新增要求之前

當時 `references/` 不存在的讀取結果已記錄；clone 前每個目標另以 `Test-Path` 檢查，不存在才 clone。兩個目標均走新建分支，沒有覆寫既有目錄。

工作目錄：`C:\Users\user\Documents\《根目錄群島》`。

```powershell
New-Item -ItemType Directory -Force -Path 'references/upstream/terminal-ui' | Out-Null
git clone --depth 1 https://github.com/xtermjs/xterm.js.git references/upstream/terminal-ui/xterm.js
git clone --depth 1 https://github.com/mame/xterm-pty.git references/upstream/terminal-ui/xterm-pty
```

以上列出實際建立指令；原呼叫另有 `Test-Path` 條件與失敗退出檢查。兩次結果皆成功；未重試、未拉第三個 repo。

| repo | 初始 clone 確切路徑 | 結果 |
|---|---|---|
| xterm.js | `C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui\xterm.js` | clone 成功，HEAD 為第 1 節 SHA；origin 核對成功 |
| xterm-pty | `C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui\xterm-pty` | clone 成功，HEAD 為第 1 節 SHA；origin 核對成功 |

唯讀驗證包括 `git rev-parse HEAD`、`git remote -v`、`git log -1 --format='%H%n%cs%n%s'`、`git --no-optional-locks status --short --untracked-files=no`；兩份 working tree 的 tracked 檔案檢查皆無輸出，兩份 `.git/shallow` 均存在。

### 6.2 搬移：收到使用者清理要求後

專用暫存根目錄：

`C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-879d93f282ab49af80341327dbeb3c62`

```powershell
$root = Join-Path 'C:\Users\user\AppData\Local\Temp\opencode' ('ra-upstream-terminal-ui-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -ErrorAction Stop | Out-Null
# 此次產生的 $root 即上列固定路徑；以下 foreach 對兩個名字各執行一次：
$source = Join-Path 'C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui' $name
$dest = Join-Path $root $name
Move-Item -LiteralPath $source -Destination $dest -ErrorAction Stop
git -C $dest rev-parse HEAD
Test-Path -LiteralPath $source
```

`$name` 依序為 `xterm.js`、`xterm-pty`。兩次搬移成功；搬移後 SHA 與原 clone 完全一致，兩個原路徑 `Test-Path` 均為 `False`。沒有重新 clone、沒有變更 checkout 內容。

| repo | 搬移後確切路徑 |
|---|---|
| xterm.js | `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-879d93f282ab49af80341327dbeb3c62\xterm.js` |
| xterm-pty | `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-879d93f282ab49af80341327dbeb3c62\xterm-pty` |

搬移後，檢查本輪建立的原 `references/upstream/terminal-ui` 已空，再執行 `Remove-Item -LiteralPath $oldParent` 成功移除該空目錄。未刪 `references/` 或 `references/upstream/`：其下已看到其他代理的資料。

### 6.3 執行與環境範圍

- 執行過的外部程式只有 Git clone 與上述 Git 唯讀查詢；檔案管理使用 PowerShell 內建指令。下載後只用 read/grep 等靜態閱讀。
- **未執行** npm install、npm build/test、emcc、第三方 scripts 或 demo server；未初始化 submodule。
- 未改 PATH、git global config、系統設定，也未安裝套件，因此本輪沒有這些設定的還原操作。
- 未修改 app 程式、build.mjs、package.json、lockfile、主專案 Git 設定或其他代理檔案。本文的整合骨架只是文件。
- 未做整台電腦／其他 session 的環境前後快照；清理結論僅限本輪明確建立的副本與暫存根目錄。

## 7. 清理結果

**已完成清理並逐項驗證。** 刪除前再核對兩份副本的 `HEAD`、`origin` 與 `git --no-optional-locks status --porcelain`；兩份 SHA／URL 均匹配第 1 節，且 working tree（含 untracked）皆為空白結果。只刪本輪建立的兩份副本。

實際刪除指令（原呼叫在此前有上述 identity／clean 檢查）：

```powershell
$root = 'C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-879d93f282ab49af80341327dbeb3c62'
# $repos 為第 1 節的 xterm.js、xterm-pty 名稱／URL／SHA 陣列。
foreach ($repo in $repos) {
  $path = Join-Path $root $repo.Name
  Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
  Write-Output ('DELETED=' + $path + '; EXISTS=' + (Test-Path -LiteralPath $path))
}
if (@(Get-ChildItem -LiteralPath $root -Force).Count -ne 0) {
  throw 'Temp root contains unexpected files; left intact'
}
Remove-Item -LiteralPath $root -ErrorAction Stop
```

| 檢查路徑 | 操作結果 | 清理後 `Test-Path` |
|---|---|---|
| 暫存根下 `xterm.js`（完整路徑見 6.2） | `Remove-Item -Recurse -Force` 成功 | `False` |
| 暫存根下 `xterm-pty`（完整路徑見 6.2） | `Remove-Item -Recurse -Force` 成功 | `False` |
| `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-879d93f282ab49af80341327dbeb3c62` | 先確認無其餘檔案，再移除空根目錄成功 | `False` |
| `C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui\xterm.js` | 6.2 已搬走；再次確認原路徑 | `False` |
| `C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui\xterm-pty` | 6.2 已搬走；再次確認原路徑 | `False` |
| `C:\Users\user\Documents\《根目錄群島》\references\upstream\terminal-ui` | 6.2 已移除本輪空目錄；再次確認 | `False` |
| `C:\Users\user\Documents\《根目錄群島》\references\TERMINAL_UI.md` | 依使用者要求保留本報告 | `True` |

- **Clone 成功：2；clone 失敗：0；本輪研究副本殘留：0（以上明列路徑已驗證）。**
- **已清理：** 兩份 clone、專用暫存根目錄、原專案本輪新建的空 `terminal-ui` 目錄。
- **保留：** 本報告；`references/`、`references/upstream/` 及其中其他代理資料未作清理。
- **環境：** 本輪未變更 PATH／全域 Git／系統設定、未安裝依賴；未宣稱已驗證整台電腦或其他代理活動完全還原。

## 8. 日後復現（只取來源，不執行上游程式）

在新的、確定不存在的 `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-terminal-ui-<唯一後綴>` 目錄內，重做第 6.1 節的兩個 `git clone --depth 1`，將目的地改成這個暫存目錄。核對 origin 與完整 SHA。

因為 default branch 會前進，日後 depth-1 clone 不保證仍取得本報告版本；若 HEAD 不同，可在該新副本內用 `git fetch --depth 1 origin <第1節完整SHA>` 再 `git checkout --detach <完整SHA>` 取得固定來源。若遠端不提供該物件則記錄失敗，不以別的版本冒充。這些復現 fetch/checkout **本輪沒有執行**。

按第 2 節固定版連結的相對檔案路徑靜態閱讀；不要執行 README 中的安裝／建置指令。記錄自己建立的確切路徑，完成後只刪這些新副本，驗證不存在再刪自己的空暫存根目錄。clone 取得的原始碼不是可直接使用的瀏覽器 bundle。

[x-license]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/LICENSE
[x-readme]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/README.md
[x-cell]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/common/buffer/CellData.ts#L12-L94
[x-input]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/common/InputHandler.ts#L205-L345
[x-api]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/typings/xterm.d.ts#L1043-L1120
[x-ime]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/browser/input/CompositionHelper.ts
[x-selection]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/browser/services/SelectionService.ts
[x-clipboard]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/browser/Clipboard.ts#L13-L58
[x-fit]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/addons/addon-fit/src/FitAddon.ts#L47-L94
[x-server]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/demo/server/server.ts
[x-dom]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/browser/renderer/dom/DomRenderer.ts
[x-viewport]: https://github.com/xtermjs/xterm.js/blob/08829c7eb6279dda2a9e86df901353a1a89858ca/src/browser/Viewport.ts#L83-L97
[p-license]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/LICENSE.txt
[p-pty]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/src/pty.ts
[p-ldisc]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/src/lineDiscipline.ts
[p-termios]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/src/termios.ts
[p-plain]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/examples/plain-example/index.html
[p-module]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/examples/module-example/index.html
[p-example]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/demo/build/example.c
[p-emscripten]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/emscripten-pty.js
[p-readme]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/README.md
[p-signals]: https://github.com/mame/xterm-pty/blob/05ed1ad11003254bdea32e37032402b068fffca5/tests/signals.test.ts
