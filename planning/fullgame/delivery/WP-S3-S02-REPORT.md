# WP-S3 S-02 Python runtime 量測報告

包／規格版本：WP-S3 S-02 spike（解除兩大阻塞 §3）
執行日期：2026-11-16（下載量）、2026-11-18（瀏覽器實測）
環境：Windows 11 開發機（非平價筆電／非低階手機）；Node.js v24.19.0；Playwright 1.65.1；
Chromium headless shell 159.0.8154.6、Firefox 159.0 headless；本機靜態伺服器 `http://localhost:8765`。
候選版本：Pyodide **0.26.0**（npm 套件，非 314.0.8 草案值；此為實際 npm 上可安裝的版本，見「候選選定」）。

> 備註：本版報告的瀏覽器數字全部來自本次親自執行的量測，命令與腳本列於「量測方法」。
> 未取得真實低階裝置，故第 2 列只代表本開發機，不能外推到低階手機。

## S-02 問題表

| # | 問題 | 量測方式 | 提案門檻 | 實測值 | 達標？ |
|---|------|----------|----------|--------|--------|
| 1 | 第一次下載有多大、離線快取能不能減第二次 | 記錄瀏覽器實際請求位元組數，並比較同 context 第二次載入 | 提案：超過上限就改為「按需下載」 | 首次：Chrome 13,784,595 bytes（6 個請求）／Firefox 13,784,595 bytes（6 個請求）。第二次：Chrome 10,089,912 bytes（僅 `pyodide.asm.wasm` 重抓，其餘命中快取）；Firefox 0 bytes（全部命中快取）。npm tarball 6,487,361 bytes、解壓 13,876,577 bytes（14 檔） | 部分成立：第二次可減量，但非全零（Chrome 仍重抓 wasm 10 MB） |
| 2 | 冷啟動到第一個 `print` 的時間 | `loadPyodide()` 完成 → `runPython("print(...)")` 回傳 | 提案：筆電 ≤ 10 秒 | Chrome 1,059–1,373 ms（7 次：1059/1094/1126/1130/1197/1328/1373）；Firefox 2,226 ms（cold）／3,135 ms（warm reload）。第一個 `print` 本身 1–5 ms | 達標（本機；非平價筆電／低階手機，外推未量） |
| 3 | 無限迴圈能不能被殺掉 | 在專屬 Web Worker 內跑 `while True: pass`，觀察分頁反應與終止耗時 | 提案：≤ 2 秒，且不影響分頁其他部分 | 終止：呼叫 `worker.terminate()` 耗時 0 ms（<2 s）。分頁影響：無窮迴圈執行期間，主執行緒 50 ms 計時器延遲 0 ms（分頁完全不受影響）。相反地，把同一迴圈放在主執行緒會凍結整個分頁（設計上必須隔離到 worker） | 達標（以 worker 隔離為前提） |
| 4 | 記憶體炸彈 | `x = [0] * (10**9)` | 分頁不當掉，或至少可以偵測到並限制輸入規模 | 2–8 ms 內拋出 Python `MemoryError`；抛完後分頁仍可正常回應（pageAlive=true） | 達標 |
| 5 | 離線 | 載入過一次後設 `context.setOffline(true)`，再開同一頁 | 能跑就過 | 模組可從 HTTP 快取載入（stage=imported），但 `pyodide.asm.wasm` 抓不到（0 bytes 可供應），Python 未完成啟動（無 coldStart 值）。目前部署形態無 service worker | 未達標（需 SW 或將 wasm 一併打包；該形態未量） |
| 6 | `file://` | 用單檔 HTML（相對路徑 `./package/pyodide.mjs`）直接開啟 | 理解：大多數瀏覽器會擋下 `file://` 下的 Worker 與 WASM 載入 | Chromium：`Access to script at 'file:///...pyodide.mjs' from origin 'null' has been blocked by CORS policy` → module import 失敗，Python 未啟動 | 未通過（不可行） |
| 7 | 兩個目標瀏覽器 | Chrome＋Firefox 各跑一次冷啟動＋第一個 print | 都能跑 | Chromium：可跑（cold 1,059 ms，print 5 ms）。Firefox：可跑（cold 2,226 ms，print 1 ms；warm 3,135 ms 且 0 bytes） | 達標 |

## 候選選定

- **候選**：Pyodide **0.26.0**（npm 套件）。
- **版號說明**：前版報告草稿寫「314.0.8」，那是 `npm view pyodide versions` 流水號式的誤讀；`npm pack pyodide@0.26.0` 可實際取得並在本機解壓（169 個檔案，含 `package/`），故以 0.26.0 為準。
- **下載量**：tarball 6,487,361 bytes；解壓後 13,876,577 bytes（14 個檔案）。
- **來源**：`npm pack pyodide@0.26.0`（`https://registry.npmjs.org/pyodide/-/pyodide-0.26.0.tgz`）。

## 量測方法（可重現）

1. 解壓套件到 `<tmp>/package/`，以 Node 內建 `http` 起靜態伺服器（PORT 8765），並送
   `Cross-Origin-Opener-Policy: same-origin`、`Cross-Origin-Embedder-Policy: require-corp`、
   `Cache-Control: public, max-age=31536000, immutable`。COOP/COEP 為啟用 `SharedArrayBuffer`
   所需（第 3 列的中斷緩衝測試用到）。
2. Playwright 開 headless Chromium／Firefox，載入測試頁，以 `performance.now()` 量
   `await loadPyodide()` 完成到 `runPython("print('hello')")` 回傳的時間。
3. 無窮迴圈：另開一個 Web Worker 載入 Pyodide 並執行 `while True: pass`；在主頁面量
   (a) 迴圈執行期間 50 ms 計時器的實際延遲，(b) `worker.terminate()` 的回傳耗時。
4. 記憶體炸彈：`runPython("x = [0] * (10**9)")`，記錄是否拋錯與分頁可否繼續評估。
5. 快取：同 context 重載，統計伺服器端實際送出的位元組與 URL。
6. 離線：`context.setOffline(true)` 後重載（Playwright 會連 localhost 一起攔）。
7. `file://`：以 `file:///C:/.../filetest.html`（相對路徑）開啟，觀察 console 錯誤。

## 結論

- **已選定候選**：Pyodide 0.26.0；npm tarball 6.2 MiB、解壓 13.2 MiB，瀏覽器首次實載 13.78 MB。
- **有數字的結論**：第 1（部分）、2、3、4、6、7 列已在瀏覽器實測；第 5 列（離線）以現有形態實測為未達標。
- **需要作者／決策者知道的差距**：
  - 所有數字来自本開發機，**不是**門檻指定的平價筆電／低階手機。
  - 第 3 列成立的前提是「Python 一定要跑在 worker 裏」；主執行緒直跑會凍結分頁。
  - 第 5 列若要達標，需另量 service worker / 打包 wasm 的方案，本次未做。
- **退路**：S-02 若判定不採用，第 1 級（program-local）維持「未開放」，主線不受影響（D05：指令判題＋代辦）。
- 本報告不宣告「已完成技術驗證」，只報告上列量測值；未取得低階裝置與 CDN 形態前，不外推。

## 未執行／待補

- 未在平價筆電／低階手機量測（第 2 列門檻裝置）。
- 未以真實 CDN／service worker 量測離線與快取（第 1、5 列）。
- 未量第 3 列的「Pyodide `setInterruptBuffer` 中止」：本次另做的測試中，`while True: pass` 在
  設定 SharedArrayBuffer 中斷緩衝後 8 秒仍未中止，因此終止機制採 `worker.terminate()`，不依賴中斷緩衝。
- 未量第 7 列的行動版瀏覽器。
