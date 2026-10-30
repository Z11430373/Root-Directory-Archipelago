# 根目錄群島 · 試玩版〈第一夜〉

產物為 `dist/index.html`。直接以瀏覽器開啟即可；遊玩不需要 Node、Python、伺服器或網路。不會收集或上傳資料。

## 介面風格

右上角「風格」可隨時切換：

- **群島介面**：保留原先的面板與卡片設計，也是既有玩家的預設。
- **Server 終端**：參考伺服器文字主控台；等寬文字、黑底低彩度、方角／文字按鈕、緊湊輸出，提示符跟在輸出後，不模仿桌面 Ubuntu 的紫色視窗。

風格、深色／高對比主題、字級分開記住。切換不重開遊戲、不清空輸入、不改 commit，也不寫進 RA1 代碼；仍是模擬 Shell，不是真實 Ubuntu 系統。

如舊版本的本機紀錄無法重播，歡迎畫面會提供原始操作紀錄／已保存 JSON 的備份入口。選「只還原已保存事件」會先另存救援備份，並清楚標示任意檔案修改與 cwd 無法由事件存檔還原；不會悄悄忽略鏈尾差異。

## 開發與測試

```text
npm install
npm run data
npm run build
npm test
```

Windows 若 PowerShell 阻擋 npm.ps1，改用 `npm.cmd`。Node 18+；Python 互通測試需要 Python 3 與 PyYAML。

`npm test` 的 pretest 會重新編譯資料及 HTML，避免測到過期產物。

測試檔並行數固定為 2，避免多個 Chrome 加上 Python 互通測試同時爭用資源；沒有放寬測試斷言或子程序時限。

來源資料在本目錄的上一層，維持唯讀。建置會檢查全部 `content_ref`、`text_ref` 與 B0 固定文案，再將原始資料、JavaScript 與 CSS 嵌入一個 HTML。正式產物不包含測資或測試工具。

## 介面驗收（選用 Playwright）

Playwright 不屬於正式產物，亦不必加入 app 的依賴。環境有 Chrome / Chromium 時，可用外部安裝的 Playwright 執行：

- `RA_PLAYWRIGHT`：Playwright 的 `index.mjs` 檔案 URL。
- `RA_CHROME`：Chrome / Chromium 執行檔絕對路徑。
- `RA_TLS_KEY`、`RA_TLS_CERT`：僅供 localhost HTTPS 測試的私鑰／憑證路徑。
- 執行 `npm run test:browser`，或設好變數後執行 `npm test`（同時驗收全部核心）。

未提供瀏覽器工具時，T12 會明確標記為跳過，而非宣稱通過。TLS 測試使用隔離的瀏覽器 context 容許 localhost 自簽憑證，不變更系統安全設定。

0.2.0 完整驗收：292/292 通過，0 失敗、0 跳過；逐項紀錄在 `notes/test-results-v0.2.txt`，包含獨立找碴後的回歸測試。首版 262 項紀錄另保留於 `notes/test-results.txt`。跨瀏覽器／真人驗證邊界見 `REPORT.md`。

## 三種跑法

- 預設：個人自助。
- 在網址後加 `?mode=kiosk`：攤位模式，閒置 120 秒返回歡迎畫面。
- 加 `?mode=host`：主持人帶領，放大字級，點燈後直接進投票；共享紀錄不作個人正式版匯入用途。

詳見 `ARCHITECTURE.md`、`FINDINGS.md` 與驗收結論 `REPORT.md`。

## 外部專案參考（僅研究，未移植）

- [主架構師取捨摘要](notes/REFERENCE_DECISIONS.md)
- [just-bash／PocketTerm：官方來源、授權與整合成本](notes/ENGINE_REFERENCES.md)
- [10 款終端遊戲：執行路線與可借鑑互動](notes/GAME_REFERENCES.md)

結論是先借鑑教學／鍵盤 UX，不直接換引擎或增加依賴。這些外部專案沒有在本案安裝或實跑。
