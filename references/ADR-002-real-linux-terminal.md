# ADR-002：讓真實 Links 瀏覽器能操作本遊戲

**Status:** Proposed（計畫已寫，使用者尚未確認實作；未安裝、未啟動服務、未改程式）  
**Date:** 2026-11-10  
**Deciders:** 專案使用者

## Context

使用者的要求（2026-11-10 原文與其後更正）：

- 兩種介面（群島／Bash 終端）都要能在**一般瀏覽器**用**同一個檔案**開啟，並像現在一樣在上方切換。
- **同時用真的 Links 瀏覽器也能透過指令操作**這個遊戲。
- 「指令與排版不要假」。
- Bash 模式也要能**用指令切換模式**。

「用 Links 瀏覽器操作」的意義是指玩家自己機器上的 Links 文字瀏覽器，而不是在遊戲內做一個像 Links 的畫面。（本 ADR 初稿曾誤讀為後者，使用者已更正，該方向作廢。）

已查證的關鍵技術事實（見「查證來源」）：Links 不執行 JavaScript，但支援 HTML 4.0（無 CSS）、**表單**與 GET 送出，且可開 `http://`；因此一個純前端、靠 JS 驅動的頁面無法被 Links 操作——Links 只會看到不會動的畫面。要讓 Links 真的能「用指令操作遊戲」，必須有一個**會執行指令的端點**。

## Decision（待使用者確認）

1. **維持**現有交付：單一離線 `dist/index.html`、一般瀏覽器開啟、兩種介面由頁首下拉／F2 切換、零外部請求、`connect-src 'none'`。此部分不變。
2. **新增**一個零外部依賴的本機 server（`demo-app/serve.mjs`，只用 `node:http` 等內建模組與既有 `src/engine`、`src/shell`、`src/save`），僅綁 `127.0.0.1`，以 server-rendered、無 JS 的頁面提供：
   - 指令輸入表單（GET 送出 → 伺服器執行 → 回同一頁面）；
   - 世界檔案瀏覽頁（純文字，可互相連結）；
   - 狀態／RA1 代碼頁；
   - session 以 URL 路徑隔離，啟動 token 保護，不依賴 cookie，不寫宿主全域狀態。
   真 Links 使用者以 `links http://127.0.0.1:<port>/` 即可用方向鍵與 Enter 操作遊戲。
3. **指令保真**以原生 GNU Bash 5.3.15 為 oracle 逐項對照（可見行為與退出碼），並把版面（`ls -l` 欄位、著色、引號）對齊 GNU。
4. **雙向指令切換**：兩種介面都支援 `mode islands` / `mode terminal`；切換屬呈現層，不改 Engine／journal／存檔。
5. Links 表面無 ANSI 顏色與即時重繪（Links 本身限制）；xterm 的互動仍只在瀏覽器表面。此限制需在使用者介面上誠實標示。
6. **不採用**在遊戲內實作 links 風格瀏覽器／分頁器／vi／man（方向已作廢）；**不採用** v86／WebVM 等把真 Linux 塞進瀏覽器的路線（見 Options，保留為未來可選）。

## Options Considered

| 方案 | 優點 | 代價／限制 |
| --- | --- | --- |
| **A：本機 server + 無 JS 表單介面（本 ADR 採用的方向）** | 真 Links 真的能下指令；與既有 Engine／存檔共用；零新依賴；容器實測容易 | 需要 `npm run serve`；Links 表面純文字無色彩；不是單檔離線（但瀏覽器表面仍是） |
| B：遊戲內實作 links 風格 TUI 瀏覽器 | 單檔離線內即可操作；可在遊戲世界內瀏覽文件 | 使用者已明確更正為「用真的 Links」；且仍不是真 Links，容易再被視為「假」 |
| C：本機 Linux 容器／PTY 讓遊戲跑在真 shell | 可執行真 GNU Bash 與真 `links` 二進位 | 需要本機服務＋容器＋權限；Windows 需 ConPTY／WSL；不再是單檔；安全面變大 |
| D：v86／WebVM 在瀏覽器內跑 Linux | 客戶端即可跑真 Linux 與真 links | 需外部 BIOS／映像檔與 WASM 資源，無法維持單一離線檔；WebVM 的 CheerpX 引擎另有自託管／商業授權條件 |
| E：維持 just-bash 模擬 | 現有成果與離線交付不動 | 無法滿足 Links 操作與「不要假」的要求；不作替代方案 |

## Trade-off Analysis

關鍵取捨是「真實」與「單檔離線」兩者不能同時最大化：

- A 讓 **Links 這個真實程式**操作**真實引擎**，代價是 Links 表面需要一個本機端點；但一般瀏覽器表面仍維持原本的單檔離線承諾，玩家的主要路徑不受影響。
- C／D 能連**真 GNU links 二進位**一起提供，但會放棄單檔離線並擴大安全面；使用者已確認「兩種介面在一般瀏覽器用同一個檔案開啟」，故不採為主線。
- B 最省事，但正是使用者指出「太假」的方向，已作廢。

## Consequences

- 新增 `npm run serve` 與 `demo-app/serve.mjs`；server 只讀專案世界資料、只在記憶體保存 session、結束即停。
- Links 表面與瀏覽器表面共用 Engine、journal 形狀與 RA1 編解碼；玩家可在 Links 玩一局、取得 RA1，在瀏覽器介面匯入繼續。
- 指令保真會改動 `src/shell` 的錯誤格式與版面；既有 golden、conformance 與 golden path 斷言不得放寬，必要時以 oracle 更新期望值並留下紀錄。
- `mode` 切換指令不寫入 journal，避免重播出現假步驟；既有 M1–M5 重播契約不動。
- 交付物從「單一離線 HTML」變成「單一離線 HTML ＋ 選用的本機 Links 端點」；README／ADR／notes 必須如實揭露。

## Acceptance Gate

1. **真 Links 實測**：在 Linux 容器內以真 `links` 開啟本機端點，方向鍵移到輸入欄、輸入指令、Enter 送出，確認指令**確實被執行**；以 `links -dump` 做內容斷言。容器與暫存清理留證據。
2. **兩邊一致**：Links 與瀏覽器對同一 session 執行同一指令，結果一致；RA1 可在兩邊互換。
3. **世界檔案可讀**：`/file?p=/home/op/handbook.md` 顯示真檔案內容，讀檔事件與既有發現語意一致。
4. **模式切換**：Links 與瀏覽器兩側的 `mode islands`／`mode terminal` 都有效，進度、歷史、草稿、shell 狀態皆保留；頁首下拉與 F2 仍可用。
5. **指令保真**：新增／修改指令以原生 GNU Bash oracle 對照（擴充 `bash-session-conformance.test.mjs`），失敗不得放寬斷言。
6. **安全與離線**：一般瀏覽器表面仍零外部請求、無 CSP 違規；Links 端點僅綁 `127.0.0.1`、需 token、session 隔離、不寫宿主全域狀態。
7. **全套**：`npm.cmd test` 單次完整通過，失敗案例保留在日誌。

## Action Items

- [ ] 使用者確認本 ADR 方向與 [PLAN-terminal-fidelity.md](PLAN-terminal-fidelity.md) §9 的三個裁決點。
- [ ] P1：實作 `demo-app/serve.mjs` 與對應測試（零新依賴）。
- [ ] P2：指令保真（錯誤格式／退出碼／`ls -l` 版面／著色／man／補全／歷史展開）＋ oracle 對照擴充。
- [ ] P3：雙向指令切換（瀏覽器與 Links 兩側）。
- [ ] P4：容器內真 Links 驗收＋瀏覽器回歸＋全套＋文件更新。
- [ ] （未來可選，非本次範圍）真 Linux 路線（容器／PTY 或 v86），僅在使用者接受非單檔交付時才啟動。

## 查證來源與範圍

2026-11-10 讀取以下官方公開文件與已安裝套件內容；只有文件／靜態查證，**尚未實跑 links、未安裝套件、未啟動服務、未修改程式**。

- [Links user documentation](https://links.twibright.com/user_en.html)：文字模式互動、連結導覽、選單、狀態列。該頁為舊版（2.3）文件，細節以實測為準。
- [links(1) 官方選項](https://man.archlinux.org/man/core/links/links.1.en)：`-dump`、`-width`、`-g`／`-no-g`、`-html-numbered-links`、`-anonymous` 等。
- [Links features](https://links.twibright.com/features.php)：HTML 4.0（無 CSS）、表單、文字模式；文字模式支援色彩。
- Links 官方文件：JavaScript 支援「currently deactivated」→ 不執行 JS。
- Alpine edge community 套件索引：確有 `links`、`links-graphics`、`links-doc`（本輪實際讀取索引頁確認）。
- [just-bash browser bundle](https://www.npmjs.com/package/just-bash)：本輪自 `demo-app/node_modules/just-bash/dist/bundle/browser.js` 實際抽出內建指令清單；確認 `less`／`vi`／`man`／`links` 不在其中。
- [v86 README](https://github.com/copy/v86/blob/master/Readme.md) 與 [networking](https://github.com/copy/v86/blob/master/docs/networking.md)：32-bit Linux、serial console、網路後端限制、BSD 授權。
- [node-pty](https://github.com/microsoft/node-pty)：PTY 位元組／resize 接面與「對外服務的 PTY 應放進容器」警告。
- [WebVM README](https://github.com/leaningtech/webvm)：Linux ABI、磁碟映像、CheerpX 授權界線。

本機環境已確認：Docker 29.8.2 可用（供 P4 真 Links 驗收）、WSL 存在、Windows 上無 `links` 執行檔。未安裝任何套件、未改環境變數、未改 CSP。
