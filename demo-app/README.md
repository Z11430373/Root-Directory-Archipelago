# 根目錄群島 · 試玩版〈第一夜〉

產物為 `dist/index.html`。直接以瀏覽器開啟即可；遊玩不需要 Node、Python、伺服器或網路。不會收集或上傳資料。

## 開發與測試

```text
npm install
npm run data
npm run build
npm test
```

Windows 若 PowerShell 阻擋 npm.ps1，改用 `npm.cmd`。Node 18+；Python 互通測試需要 Python 3 與 PyYAML。

來源資料在本目錄的上一層，維持唯讀。建置會檢查全部 `content_ref`、`text_ref` 與 B0 固定文案，再將原始資料、JavaScript 與 CSS 嵌入一個 HTML。正式產物不包含測資或測試工具。

## 介面驗收（選用 Playwright）

Playwright 不屬於正式產物，亦不必加入 app 的依賴。環境有 Chrome / Chromium 時，可用外部安裝的 Playwright 執行：

- `RA_PLAYWRIGHT`：Playwright 的 `index.mjs` 檔案 URL。
- `RA_CHROME`：Chrome / Chromium 執行檔絕對路徑。
- `RA_TLS_KEY`、`RA_TLS_CERT`：僅供 localhost HTTPS 測試的私鑰／憑證路徑。
- 執行 `node --test test/browser.test.mjs`。

未提供瀏覽器工具時，T12 會明確標記為跳過，而非宣稱通過。TLS 測試使用隔離的瀏覽器 context 容許 localhost 自簽憑證，不變更系統安全設定。

## 三種跑法

- 預設：個人自助。
- 在網址後加 `?mode=kiosk`：攤位模式，閒置 120 秒返回歡迎畫面。
- 加 `?mode=host`：主持人帶領，放大字級，點燈後直接進投票；共享紀錄不作個人正式版匯入用途。

詳見 `ARCHITECTURE.md`、`FINDINGS.md` 與驗收結論 `REPORT.md`。
