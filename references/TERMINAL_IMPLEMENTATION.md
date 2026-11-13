# 真 xterm 終端／編輯層實作與交接

日期：2026-11-02。此代理只新增 `demo-app/src/ui/{xterm-console.js,console-line-editor.js,xterm-console.css}`、`demo-app/test/console-line-editor.test.mjs` 與本文；主代理負責 main／package／build，其他代理負責既有瀏覽器測試。

## 版本與接線

- 固定 `@xterm/xterm@6.0.0` + `@xterm/addon-fit@0.11.0`，兩者 npm 版本已實際查證，並在 Chrome 實跑相容。沒有加入 xterm-pty：此 app 的 JS Bash runtime 收完整 script，不是 PTY 程序。
- `XtermConsoleView` 使用真 `Terminal`、`FitAddon`、buffer marker／實際 cursorX/Y、VT escape 控制、selection、composition helper。沒有額外 textarea 假裝 shell buffer，沒有假 `.log`／`.prompt`。
- `constructor({submit,cancel,complete,history,leave})`；先 append `.node`，再 `.mount()`，之後 `.input` 就是 `view.xterm.textarea`。可用 `.focus()` 聚焦。
- `complete({text,cursor}) → {text,cursor,candidates?} | undefined` **同步**，UTF-16 offset。text 為完整替換後草稿；candidates 由 view 印在 scrollback。callback 亦可自行 `setDraft` 後不回傳。
- `submit(raw)` 只交出完整草稿並切 busy，**不永久回顯**；主 controller 的 echoInput 是唯一命令回顯來源。controller 完成後呼叫 `setBusy(false)`。
- `cancel()` 在非 busy 時可先 `getDraft()` 取得取消前內容；controller 負責 `^C` 與 secret 流程，編輯層隨後清草稿。busy 時 callback 只負責取消工作。
- `setPrompt(text,label)`、`setBusy(value)`、`setSecret(value)`、`setPreferences({theme,font})`、`resize()`、`resetHistory()`、`getDraft() → {text,start,end}`、`setDraft(text,start?,end?)`、`hasSelection()`、`getSelection()`、`destroy()` 均已實作。
- `.terminal` 提供 `write(text,kind,instant)`、`finish()`（回傳目前寫入 queue Promise）、`follow()`、`scroll()`、`clear()`、`destroy()`、`snapshot()`、`restore(entries)`。entries 為獨立複製的 `{text,kind}[]`，最多 1200 則；scrollback 是 xterm 的 1200 列。這是 app 輸出事件的回放格式，不是任意時刻 VT buffer 的二進位序列化。
- `destroy` 可重複呼叫，會解除 observer、全頁 busy-Ctrl+C、各 DOM 事件、xterm subscriptions、composition timer、markers 與終端。

## 編輯與鍵盤

- 真 xterm `onData` 驅動編輯；游標位置取 xterm 解析完成後的字元格，因此不是 CSS 猜中文字寬。UTF-16 草稿位置以 `Intl.Segmenter` grapheme boundary 移動／刪除（保留結合字、ZWJ emoji）。
- Enter、Shift+Enter、Home/End、左右鍵、Ctrl+A/E/B/F、Ctrl+P/N、↑↓、Ctrl+U/K/W/Y/T、Delete／Ctrl+D、Alt+B/F/D/Backspace、Alt+`<`／`>`、Tab、Ctrl+R、Ctrl+C、Ctrl+L、F2。
- ↑↓ 在多行草稿內先移動邏輯行；到邊界再進歷史。歷史往返回復原草稿和選取 offset，修改舊歷史形成新草稿。Ctrl+R 支援增量搜尋與再按循環，Enter 採用而不執行，Esc／Ctrl+C 回原草稿。
- bracketed paste（含分段 framing）、未啟用 2004 前的 plain multiline packet 都只插入；內含 CR、LF 或控制字元不自動提交。完整 browser paste 的外層終止符優先，貼入字面 ESC[201~ 不會讓後面的換行變成執行。
- Secret 無字元回顯、停用歷史／搜尋／補全、清 kill buffer；不在編輯層自增 history。controller 仍須避免 secret echo／history／journal 洩漏。
- 超出可視高度的巨大草稿，只裁切顯示窗口並以 `…` 標記，完整草稿保留。游標與相鄰文字始終由真字元格渲染。
- `#terminal[role=region][tabindex=0]` 是真正可聚焦的歷史區。Shift+Tab 由 helper textarea 離開到它；有可見 outline，PageUp/Down、Home/End、↑↓ 回捲，Enter 返回輸入。使用者回捲時新輸出不強制拉到底。

### xterm 6 的 accessibility／insertText 接合

上游 `CoreBrowserTerminal._inputEvent` 在 `screenReaderMode:true` 時明確忽略 `insertText` input event，因此單純啟用會丟失手機／語音／瀏覽器 insertText 路徑。此實作用真 DOM 事件追蹤 keydown／keypress 是否已由 xterm 發出字元，僅將尚未處理、非 composition 的 `insertText` 交給公開 `Terminal.input(data,true)`，再走同一 `onData` 編輯路徑。

保留 `screenReaderMode:true` 與上游 `.xterm-accessibility-tree`，不複製一份假 DOM transcript。ASCII keyboard.type、insertText、中英文中間插入、合成 composition 事件已測不重複。**原生 OS 中文輸入法候選視窗、NVDA／VoiceOver／手機實機尚未人工驗證**，不將合成事件測試當作實機通過。

## 共用 PS2／script 分段

`console-line-editor.js` export `needsContinuation(text): boolean`，main 應逐行累積，只有回傳 false 才將那段 script 交 runtime；JSON import 仍保持完整單塊。Enter 使用同一函式。

已覆蓋：單／雙／反引號、尾端 escape、`()`／`$()`／`${}`、brace group、`[[ ]]`、管線與 `&&/||`、`for/select/while/until … done`、`if/elif/else … fi`、`case … esac`、`name()`／`function name` 加 body、巢狀 compound commands。

Heredoc：支援 `<<EOF`、`<<'EOF'`、混合引號 delimiter、`<<-` 去前導 tab、多個 heredoc；body 視為不透明，內容的引號／括號／`fi` 不影響掃描，delimiter 須整行相等。`<<<` here-string 不當 heredoc。

這是**完整性檢測，不是第二套 Bash parser**。既有 `src/shell/parse.js` 只接受舊模擬語法，just-bash 3.6.0 `/browser` 的公開 exports 也沒有 parser API，因此未為此依賴不穩定的 minified 私有 parser。非法語法照常提交給 interpreter 回報。邊界限制包括 alias 展開導入控制結構、ANSI-C `$'…'` heredoc delimiter 轉義、未引用 heredoc body 的反斜線換行合併，以及複雜巢狀 case pattern／替換語法；沒有宣稱完整 GNU Bash grammar 等價。

## 嚴格 CSP：兩個必要接點

### 1. 動態 style 元素 nonce

build 必須定義 `__XTERM_STYLE_NONCE__` 為隨機 build-time nonce，`style-src` 允許該 nonce，靜態 CSS／script hash 繼續保留；不需 unsafe-inline／unsafe-eval。CSS 載入包含上游 `@xterm/xterm/css/xterm.css`，最後加入 `xterm-console.css` 覆蓋原 `.terminal`／`#command-input` 衝突。

`openWithNonce` 只在同步 `term.open()` 的 try/finally 範圍暫借該 Document 的 `createElement`，為新增 style 設 nonce，finally 精確還原原 own-property descriptor（原無 own property 則刪除）。後續 font/theme/resize 修改同一批已授權 style。沒有永久改全域 DOM prototype。

不用僅靠 documentOverride 的原因：6.0.0 `CoreBrowserTerminal.ts` 建立 `CoreBrowserService` 的 `this._document ?? (typeof window !== 'undefined') ? window.document : null` 運算優先序會使 Viewport 的 mainDocument 仍成為原 document；DomRendererRowFactory 也直接接全域 document。只 proxy override 會漏掉上游 style 路徑。

### 2. DOM renderer truecolor／selection 的 CSSOM 補丁

**只有 nonce 不足夠。** 上游 `DomRendererRowFactory._addStyle` 使用 `setAttribute('style', …)`，真彩色與選取背景會觸發 style-src-attr 違規。PoC 已實際重現（不是靜態推測）。主代理 build 應只對固定版本 bundle 做精確替換，命中數必須為 1，否則 fail closed。

`lib/xterm.mjs`：

```js
// 原始固定字串
_addStyle(t,e){t.setAttribute("style",`${t.getAttribute("style")||""}${e};`)}
// 等價 CSSOM 寫入
_addStyle(t,e){t.style.cssText+=`${e};`}
```

若打包器使用 `lib/xterm.js`，原字串為：

```js
_addStyle(e,t){e.setAttribute("style",`${e.getAttribute("style")||""}${t};`)}
// 替換為
_addStyle(e,t){e.style.cssText+=`${t};`}
```

補丁不改套件磁碟檔案，只改 esbuild onLoad 的本次輸入；保留上游 MIT LICENSE。nonce + 此 CSSOM 補丁已一起在 file://、嚴格 CSP 下通過真彩色、持續選取、font/theme/resize 重繪，無 CSP 錯誤。

## 已執行驗證

1. `node --test demo-app/test/console-line-editor.test.mjs`：**11/11 通過**。包含 grapheme 編輯、kill/yank、history draft、Ctrl+R、分段 paste／內嵌終止符、PS2、compound commands、heredoc、補全協定、busy/cancel、secret。
2. 專用暫存 PoC 使用 esbuild 0.25.0、playwright-core 1.51.1、本機 `C:/Program Files/Google/Chrome/Application/chrome.exe`，生成內嵌 JS/CSS 單 HTML，以 **file://** 開啟。
3. 真 helper focus／aria-label、insertText 與 keyboard.type、中間 CJK 插入（實際 cursorX=11）、合成 composition 不提前提交／不重複、補全、paste、PS2、CR／BS／ANSI indexed／RGB truecolor、resize 草稿保持、theme/font、nonce 還原、選取複製／busy 取消、歷史焦點與不搶回捲、snapshot/restore、F2 均通過。
4. 最終 PoC console/page errors **0**；非 file 資源 request **0**。可及性 row metadata 是上游延遲渲染，測試須等實際 `[aria-posinset]` 出現，不能把 write callback 當作 screen-reader DOM 已完成。
5. 未修改或執行其他代理持有的測試；主線完整 build／遊戲 walkthrough 由整合代理驗收。

## 暫存操作與清理

本代理在主代理通知正式 node_modules 安裝完成前，已自行建立唯一目錄：

`C:\Users\user\AppData\Local\Temp\opencode\ra-xterm-poc-fd35a03a751e4c1397330f73f616adb3`

以 `npm.cmd install --prefix <該目錄> --no-audit --no-fund --ignore-scripts --save-exact @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0 esbuild@0.25.0 playwright-core@1.51.1` 安裝 PoC 依賴；沒有全域安裝、沒有改 PATH／PowerShell execution policy。`npm` 直接呼叫原先被 ps1 policy 阻擋，改用 `npm.cmd`，未放寬 policy。

目錄含此次 npm 產物、`poc.mjs`、`poc.html`、`poc.png`；僅刪除此明確由本代理建立的根目錄。npm 正常下載快取不作全機清理；不宣稱其他 session 或全機檔案均還原。

**已清理並驗證不存在。** 刪除前核對根內 `node_modules/@xterm/xterm/package.json` 的 name/version 為 `@xterm/xterm`／`6.0.0`，且本代理 `poc.mjs` 存在；`Remove-Item -LiteralPath <上述唯一根> -Recurse -Force` 成功，`Test-Path` 回傳 **False**。PoC 依賴／腳本／HTML／截圖均隨專用根移除，主專案正式 node_modules 與其他代理暫存目錄未動。

## 追加：連續 PageUp 回捲修復

整合回報後，先用現有 `test/helpers/xterm.mjs` 與真 Chrome 檢查：`console.test.mjs` 的 320／1280px stable-scrollback 案例（helper 當時使用 **Shift+PageUp**）各自通過；再直接於真 app 輸入 `game start`、暱稱、兩次 `help` 與 `echo keep draft`，每次普通 **PageUp** 後等待兩個 animation frames 並讀真 accessibility row，得到 **76 → 50 → 50 → 50 → 50 → 50**，確實只能回捲一頁。

原因：普通 PageUp 產生 CSI onData，xterm `CoreService.triggerDataEvent` 的 `scrollOnUserInput:true` 會先拉到底，再由編輯層捲一頁。Shift+PageUp 原先是 xterm 的 viewport 動作，不走同一路徑，因此 helper 的案例沒有重現普通按鍵問題。

修復：在正式 `attachCustomKeyEventHandler` 中直接處理普通／Shift PageUp、PageDown，呼叫公開 `scrollPages` 並回傳 false，不讓 viewport 導覽發成 shell input。其他打字仍保留上游 scrollOnUserInput。

修後將目前真 `XtermConsoleView` 打包成嚴格 CSP 的 file:// PoC，以真 helper textarea 接收鍵盤，在 100 列輸出後保留草稿，實際結果：

| 寬度 | 普通 PageUp 起始列 | 普通 PageDown 起始列 | Shift+PageUp 起始列 |
|---|---|---|---|
| 320px | 76 → 51 → 26 → 1 → 1 → 1 | 1 → 26 → 51 → 76 → 77 → 77 | 77 → 52 → 27 → 2 → 1 → 1 |
| 1280px | 75 → 49 → 23 → 1 → 1 → 1 | 1 → 27 → 53 → 76 → 76 → 76 | 76 → 50 → 24 → 1 → 1 → 1 |

同時斷言翻頁 onData 次數為 0、草稿／游標 offset 不變、回捲中新輸出保持第 1 列、重新 insertText 自動回到底部且只插入一次、Shift+Tab 歷史焦點及 Home/End 正常。兩種寬度 console/page errors 均為 0。沒有修改既有測試、main、package 或 build；完整 app 修後重跑交整合代理。

追加 PoC 只借用現有正式 esbuild 與既有 `ra-browser-tools` 的 Playwright，未再安裝依賴。唯一新建根：`C:\Users\user\AppData\Local\Temp\opencode\ra-xterm-scroll-176d2f3c71c54e7b8dae34fcd747088b`，內含 `scroll.mjs`／生成 `scroll.html`；清理結果如下。

**已刪除上述追加 PoC 根並驗證 `Test-Path=False`**；共用 Playwright／正式 node_modules 未動。

## 追加：引號內算術展開污染函式結尾 token

browser53 回報的確切案例：

```bash
report() { printf "state:%s:%s\n" "$shared" "$((count + $1))"; }
```

修前 `needsContinuation` 錯誤回傳 true。先新增 regression test 並實跑確認失敗，再在 Node 記憶體中加入 scanner trace（未改 production 匯出介面）定位：算術展開內層 `)` 呼叫 `finish()` 清掉 `started`；外層 expansion 的 `)` 寫入 `word` 卻未恢復 `started`。後續 `;` 因 `started=false` 未清 accumulator，結尾 `}` 被拼成 **`")}"` token**，函式 block 永遠未關閉。

修復為 expansion lexical scope：進入時保存外層 word／quoted／delimiter／token 邊界／待處理 heredoc，內部獨立掃描；退出時丟棄內部 shell tokens，恢復完整 expansion 所屬的外層 word 並明確設 `started=true`。同時區分 command、arithmetic、parameter expansion，避免算術 `<<` 當 heredoc、`${#name}` 當註解。

修後同一 trace：展開為 `{value:"$((count + $1))",quoted:true,type:"word"}`，分號後的 `}` 是獨立未引用 word；`needsContinuation` 回傳 **false**。

`node --test demo-app/test/console-line-editor.test.mjs`：**12/12 通過**。新增同一測試中多組完整／未完整函式、引號內巢狀 command substitution／算術／parameter expansion、內外 heredoc scope、算術位移與 parameter 長度語法；另實際斷言完整函式 Enter 立即 submit，缺 `}` 時 Enter 只追加 PS2 換行，補 `}` 才提交。

本次只改 `console-line-editor.js`、其自有 unit test、本文。未 build、未更動 main 或 xterm handler；統一 rebuild／full browser 驗收由主代理執行。
