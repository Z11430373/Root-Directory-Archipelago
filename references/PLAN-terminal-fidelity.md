# 終端保真計畫：真 Links 驅動、指令保真、雙向模式切換

日期：2026-11-10。狀態：**計畫（使用者已要求先看計畫，尚未實作）**。本文件只寫計畫與已查證事實；文中任何能力都尚未宣稱通過。

## 0. 使用者要求（逐條對應，含一次修正）

| 要求 | 現況 | 本計畫對應 |
| --- | --- | --- |
| 兩種介面在一般瀏覽器用同一個檔案開啟、上方切換 | 已是：`dist/index.html` 單檔，群島／Bash 終端由頁首下拉或 F2 切換 | **維持不變**（§1） |
| 「用 Links 瀏覽器也能透過指令操作」 | 沒有任何非瀏覽器入口 | **新增 Links 驅動表面**（§2）：真 Links 文字瀏覽器可開啟遊戲、輸入指令、瀏覽世界檔案、切換模式 |
| 指令與排版不要假 | 部分指令為自製近似；`ls -l` 欄位與 GNU 不同；錯誤訊息格式不同 | **指令保真**（§3）：以原生 GNU Bash oracle 對照，版面與錯誤格式對齊 |
| Bash 模式也要能用指令切換模式 | 終端側只有 `game mode islands`；一般風格無任何指令可切到終端 | **雙向指令切換**（§4）：兩種介面都能用 `mode islands` / `mode terminal` |

**方向修正紀錄（2026-11-10）**：本計畫初稿曾誤讀為「在遊戲內實作一個 links 風格瀏覽器」。使用者更正為「用真的 Links 瀏覽器也能做」。初稿方向已作廢，**不做**遊戲內的 TUI 瀏覽器／分頁器／man；互動全螢幕程式改為「由真 Links 提供」，遊戲端只需提供可被 Links 操作的介面。

## 1. 現有兩種介面（維持）

- `demo-app/dist/index.html`：單一離線 HTML，正常瀏覽器開啟即可。
- 頁首「模式」下拉 ＋ `F2` 在 **群島模式**（任務面板／指令按鈕）與 **Bash 終端**（真 xterm 字元格）之間切換；進度、cwd、歷史、輸出、草稿與 shell 狀態皆保留。
- 兩者共用同一 Engine 與同一 shell 事件流，差異只在呈現層；2026-11-03 起兩者新輸入一律走 just-bash 3.6.0（舊 journal 仍逐筆依原版本重播）。
- 交付形式不變：無本機服務、無外部請求、`connect-src 'none'`、無安裝任何套件。

## 2. 新增：Links 驅動表面（真 Links 操作真遊戲）

### 2.1 為什麼需要一個本機 server（這是設計上的關鍵取捨）

已查證的 Links 事實（見 §7）：

- Links **不執行 JavaScript**（官方文件：JavaScript 支援「currently deactivated」）。
- Links 支援 HTML 4.0（無 CSS）、**表單**與 GET 送出；文字模式可用方向鍵移動到輸入欄位、輸入後按 Enter 送出。
- Links 可開 `http://` 與 `file://`。

因此**不可能**讓 Links 操作一個純前端、靠 JS 驅動的頁面：Links 只會看到一個不會動的空白畫面。要讓 Links 真的「用指令操作遊戲」，必須有一個**執行指令的端點**。這端點就是本機 server。

取捨明示：Links 表面需要 `npm run serve` 起一個僅綁 `127.0.0.1` 的本機服務；一般瀏覽器表面仍是單檔離線、零服務。兩者共用同一份引擎與存檔格式。

### 2.2 `demo-app/serve.mjs`（新增，零外部依賴）

只用 `node:http`、`node:fs`、`node:path` 與既有的 `src/engine`、`src/shell`、`src/save`；**不新增任何 npm 套件**（避免依賴與授權成本）。

- **綁定**：`127.0.0.1`，隨機 port；啟動時印出 `links http://127.0.0.1:<port>/` 與啟動 token。
- **工作階段**：session id 放在 URL 路徑（`/s/<id>/…`），**不依賴 cookie**（Links 的 cookie 行為需額外旗標，會增加不確定性）。每個 session 各自持有 Engine、journal、指令歷史與 shell 狀態。
- **認證**：啟動時產生的隨機 token 必須出現在第一個 URL；後續以 session id 綁定。不設 cookie、不寫宿主全域狀態、不讀取玩家其他檔案（世界資料唯讀自專案）。
- **路由（皆為 server-rendered、Links 友善標記）**：
  - `/` 歡迎頁：連結到「開始值班」「繼續本機紀錄」「切換模式」。
  - `/s/<id>/` 終端頁：目前提示符、最近輸出（`<pre>`）、**指令輸入表單**。
  - `GET /s/<id>/cmd?q=<指令>`：執行一筆指令後回同一終端頁（Links 的 GET 表單送出即走這條路）。
  - `GET /s/<id>/file?p=<世界路徑>`：把世界檔案以純文字呈現（可含指向其他檔案的連結），並記錄讀檔事件（既有 inode／alias 語意不變）。
  - `GET /s/<id>/status`、`/s/<id>/save`：狀態與 RA1 代碼（純文字頁，方便玩家複製後在瀏覽器介面匯入）。
- **指令表單**：`<form method="get" action="/s/<id>/cmd"><input name="q" …></form>`。Links 在文字模式會把輸入欄位畫成底線欄位，方向鍵移到欄位、輸入、Enter 送出；送出後網址含 `?q=…`，伺服器執行並回傳新頁面。
- **呈現限制（誠實揭露）**：Links 不跑 JS，所以此表面**無 ANSI 顏色、無即時重繪**，只有純文字逐頁。xterm 的互動（alternate screen、真色彩）仍只存在於瀏覽器表面。這是 Links 本身的限制，不是實作取巧。
- **模式切換**：同一個 `mode islands` / `mode terminal` 指令在兩種介面都可用（§4），因此在 Links 內也能切到「群島」呈現（任務面板以文字與連結呈現）。

### 2.3 與瀏覽器表面共用什麼

- 同一 `Engine`（含 `feed`／`advance`／`summary`、交易回復、決定性時鐘與 PRNG）。
- 同一 journal 形狀（`{type:'input',raw,dt,shell}`）與同一 RA1／存檔編解碼（`src/save`）。
- 同一 shell 執行路徑：Node 端直接使用 `src/shell/bash-runtime.js`（需套用與 build 相同的 pinned source hook；Node 測試已有 `test/helpers/register-bash.mjs` 可沿用同一機制）。
- 因此玩家可以在 Links 玩一局、拿到 RA1 代碼，再在一般瀏覽器介面匯入繼續，兩邊進度一致。

## 3. 指令與排版保真（不要假）

目標：**可見行為與退出碼對齊原生 GNU Bash 5.3.15**，不追求位元級複製 GNU。

- **指令來源分工**：just-bash 3.6.0 browser bundle 已內建 `ls cat grep sed awk find curl jq tar gzip base64 sha256sum tree xargs seq sort uniq cut paste tr wc head tail nl stat file date env which whoami hostname alias history read printf echo test cd pwd mkdir touch cp mv rm ln chmod sleep timeout tee rev tac split comm join paste expr diff od strings mktemp column fold expand unexpand yes zcat rsync?`（`rsync` 除外）等一批工具（已從已安裝套件實際抽出清單）。**一般工具優先交給上游實作**；`src/shell/commands.js` 只保留遊戲語意（遊戲權限／inode 的 `ls -l`、讀檔事件、`rm` 的 home 保護、分支規則、`mail`／`systemctl`／`git`／`ssh` 等故事命令）。
- **錯誤與退出碼**：`bash: foo: command not found`（127）、`ls: cannot access 'x': No such file or directory`（2）、`cat: x: No such file or directory`（1）、`cd: x: No such file or directory`（1）、`Permission denied`（126／1）。stdout／stderr 分流與退出碼全部以原生 oracle 對照。
- **版面**：`ls -l` 改成真欄位（權限字串、link count、owner group、大小、`Dec  7 07:30`、名稱）、真 `total N`；`ls` 對目錄／可執行檔著色（僅在真終端）；含特殊字元的檔名依 GNU 規則加引號。
- **輸出長度**：超長輸出改為分頁行為（瀏覽器表面可用真 xterm 的分頁呈現；Links 表面則由 server 以固定行數分段並附「下一頁」連結）。
- **遊戲命令有 man 頁**：`mail`、`systemctl`、`git`、`ssh`、`ask`、`finger`、`sudo`、`lamp-before-sudo` 等提供 `man` 說明（NAME／SYNOPSIS／DESCRIPTION／OPTIONS／SEE ALSO），這是「排版不要假」的一部分。
- **互動與輸入**：既有口令／投票提示維持；`read` 真正讀一行。
- **補全與歷史**：兩種介面共用真 bash 風格補全（檔名／目錄尾斜線、含空白檔名引用、共同前綴、連按兩次列候選）與 `history` 真格式、`!!`／`!$` 展開。
- **oracle 對照**：擴充 `demo-app/test/bash-session-conformance.test.mjs`（以 Git Bash 5.3.15 為 oracle），新增案例必須先有原生期望值；不得放寬既有斷言。

## 4. 雙向指令切換

- 指令表面：`mode islands` / `mode terminal`（等價 `game mode islands|terminal`）。
- 終端表面：`mode islands` 保留工作階段、shell 狀態、歷史與草稿。
- 群島表面：`mode terminal` 切到 xterm 終端，同樣保留狀態。
- 頁首下拉與 `F2` 維持可用，三者等價。
- 切換是**呈現層**動作：不改 Engine、不改 journal、不改存檔；切換本身不寫入 journal（否則重播會出現假步驟）。
- Links 表面同樣支援（server 端依 session 目前呈現模式回不同版面）。

## 5. 重播與存檔契約

- 既有 journal 步驟型別不變；舊紀錄仍逐筆原樣重播（已驗證的 M1–M5 契約不動）。
- Links 表面與瀏覽器表面寫入同一種 journal，因此兩邊的紀錄互換；RA1 只含事件，任意檔案／cwd／shell 狀態仍靠本機 journal 重建（既有語意）。
- `mode` 切換不進 journal（§4）。

## 6. 分階段實作（可並行，檔案邊界清楚）

| 階段 | 內容 | 主要檔案 |
| --- | --- | --- |
| P0 | 計畫與 ADR 定案（使用者確認） | `references/ADR-002-real-linux-terminal.md`、`references/PLAN-terminal-fidelity.md`（本檔） |
| P1 | `serve.mjs`：server、session、路由、Links 友善標記、指令表單 | `demo-app/serve.mjs`、`demo-app/test/serve.test.mjs` |
| P2 | 指令保真：錯誤格式、退出碼、`ls -l` 版面、著色、`man`、補全、歷史展開 | `demo-app/src/shell/*`、`demo-app/src/ui/console-line-editor.js`、oracle 對照擴充 |
| P3 | 雙向指令切換（瀏覽器 + Links 兩側） | `demo-app/src/main.js`、`demo-app/src/ui/preferences.js`、`demo-app/serve.mjs` |
| P4 | 真 Links 驗收（容器內 links）＋瀏覽器回歸＋全套 | `demo-app/notes/*`、`references/*` |

並行規則：每個代理只寫自己那一列的檔案；`main.js`、`build.mjs`、`package.json`、`serve.mjs` 的接合由主線統一處理，避免版本漂移。所有新增依賴必須固定版本並記錄來源與授權（`npm.cmd install --save-exact --ignore-scripts`）；不使用 `audit fix --force`。

## 7. 驗收閘

1. **真 Links 可操作**：在 Linux 容器內以真 `links` 開啟 `http://127.0.0.1:<port>/`，方向鍵移到輸入欄、輸入指令、Enter 送出，看到指令確實被執行（不是只有頁面）。以 `links -dump` 做內容斷言（`-dump`／`-width` 為官方選項，已查證）。
2. **指令真的跑**：Links 送出 `ls -a`／`cat handbook.md` 等，輸出與瀏覽器介面同一 Engine 的結果一致。
3. **世界檔案可讀**：`/file?p=/home/op/handbook.md` 顯示真檔案內容，讀檔事件與既有發現語意一致。
4. **模式切換**：Links 內 `mode islands`／`mode terminal` 有效；瀏覽器兩側也有效；進度、歷史、草稿、shell 狀態皆保留。
5. **指令保真**：新增／修改的指令以原生 GNU Bash oracle 逐項比對（既有 conformance 檔擴充），失敗不得放寬斷言。
6. **離線與安全**：一般瀏覽器表面仍零外部請求、無 CSP 違規、`connect-src 'none'`；Links 表面僅綁 `127.0.0.1`、需啟動 token、session 隔離、結束即停、不寫宿主全域狀態。
7. **全套**：`npm.cmd test` 單次完整通過；失敗案例保留在日誌，不刪不跳；新增的 serve 測試納入 `npm test`。
8. **清理**：容器／暫存／代理自有目錄全部清掉並留下證據。

## 8. 已查證／未查證

**已查證（本輪讀取官方文件與套件內容）**

- Links 文字模式互動與選單（官方使用者文件 <https://links.twibright.com/user_en.html>）：↑↓ 選連結、Enter 進入、左箭頭／`z` 返回、Esc 選單、底部狀態列、`q` 離開。該頁為舊版（2.3）文件，細節以實測為準。
- Links 官方 `links(1)` 選項（Arch man page）：`-dump`（輸出格式化文件到 stdout）、`-width`（dump 寬度）、`-g`／`-no-g`、`-html-numbered-links`、`-http-*` 等；`-anonymous` 可關閉本機檔案瀏覽。
- Links 支援 HTML 4.0（無 CSS）、表單、GET 送出（第三方文字瀏覽器比較文與 links 文件）。
- Links **不執行 JavaScript**（官方文件）。
- Alpine edge community 官方套件索引確有 `links`、`links-graphics`、`links-doc`（本輪實際讀取索引頁確認）。
- just-bash 3.6.0 browser bundle 的內建指令清單（已從已安裝套件抽出）：含 `curl jq tar gzip find sed awk tree xargs seq sha256sum stat file date env which whoami hostname alias history read printf test chmod sleep timeout tee rev tac split comm join expr diff od strings mktemp column fold expand unexpand yes zcat` 等，**不含** `less`／`vi`／`man`／`links`。
- 本機環境：Docker 29.8.2 可用（供真 Links 驗收）；WSL 存在；Windows 上無 `links` 執行檔。

**未查證／不做**

- 未安裝 links、未啟動任何 server、未修改任何應用程式碼（依使用者「先給我計畫，不要動」）。
- 未在真 Links 內實測互動細節（須在 P4 以容器實測；本文件不宣稱已通過）。
- 不做遊戲內 TUI 瀏覽器／分頁器／vi／man（方向已修正）。
- 不做真 GNU `links` 二進位嵌入瀏覽器（v86／WebVM 路線）；見 ADR-002，保留為未來可選。
- 不承諾 GNU coreutils 位元級一致；承諾可見行為與退出碼符合原生對照。

## 9. 待使用者裁決

1. Links 表面是否為**必要交付**，或先只做瀏覽器內的指令保真與雙向切換（Links 表面可後補）。
2. Links 表面是否需要「群島模式」呈現（任務面板文字化），或只做終端介面即可。
3. `serve.mjs` 是否接受成為本專案的正式入口（新增 `npm run serve`），或限定為開發／展示用途。
