# 根目錄群島 · 試玩版〈第一夜〉

產物為 `dist/index.html`。直接以瀏覽器開啟即可；遊玩不需要 Node、Python、伺服器或網路。不會收集或上傳資料。

閱讀原始碼可先看 [原始碼與註解指南](../SOURCE_GUIDE.md)，再沿各模組開頭與函式註解追蹤資料流。

## 操作模式

在群島模式右上角的「模式」選擇 **Bash 終端**：

- **群島模式**：任務面板、指令按鈕與值班證介面，也是既有玩家的預設。
- **Bash 終端（模擬）**：獨立的命令操作流程。輸出和提示符位於同一個捲動區，沒有任務側欄、指令按鈕或存檔彈窗。命令結果立即顯示，回捲閱讀時新輸出不強拉到底。

模式、深色／高對比主題、字級分開記住。切換保留遊戲進度、cwd、歷史、輸出與一般草稿；口令草稿會清空。舊的 `style: server` 偏好仍進入終端。終端現在採 **just-bash 3.6.0＋真 xterm 6.0.0**，支援變數、函式、alias、控制流程、替換與重導向；屬 Bash 相容模擬，並非 GNU Bash。

一般群島與終端風格的新遊戲、匯入及續玩後的新輸入，**一律使用相同的 Bash 相容引擎**；切換只改介面，不改 Shell 語意。舊 journal 仍依每筆原版本重播，避免改壞舊存檔。RA1 只含事件，完整檔案／cwd／變數等由本機操作紀錄重建。

兩種風格的命令提示符均為 `op-暱稱@主機:路徑$`；啟動器為 `archipelago$`。暱稱／口令／投票是遊戲問答，用冒號區分；`>` 僅保留為真正 Bash 未完成指令的預設續行提示（PS2），不是主提示符。一般風格也支援未完成語法按 Enter 續行、Bash 指令補全與 Ctrl+C 中斷草稿。

### Bash 終端操作

```text
game start             開始值班，再輸入暱稱
game resume            續玩本機紀錄（含檔案修改與 cwd）
ls / pwd / cd / cat …   遊戲支援的 Bash 風格指令
game task              查詢目前任務
game status            查詢時間、分支、發現與存檔狀態
hint / skip            劇本的提示與跳題命令
game save              在終端印出值班證及 RA1 代碼
game download          下載 JSON（攤位模式使用代碼）
game exit              保存本機紀錄並返回遊戲啟動器
game import RA1-…      匯入事件存檔；也可貼上完整 JSON
game theme contrast    高對比；dark 切回深色
game font large        字級 small / medium / large
game mode islands      返回群島模式；F2 可保留草稿切換
game help              完整說明
```

`game` 是遊戲工作階段命令；不是 Bash 內建。既有 `save`、`help` 等快捷仍可用。在暱稱、口令或投票提示中，使用 `game …` 可避免將操作誤當作回答。

- ↑↓ 歷史並保留草稿、Tab 命令／路徑補全（支援引號與空白檔名）、Ctrl+R 反向搜尋。
- Ctrl+A/E 行首／行尾、Ctrl+U/K 刪前／後段、Ctrl+W 刪前一字、Ctrl+L 清畫面；清畫面不清命令歷史或進度。
- Ctrl+C 取消目前輸入或中斷運算。兩種風格的 Bash 都在內嵌 Worker 執行，完成後才提交結果；中斷會撤回**本次指令**的檔案與遊戲狀態變更。這是遊戲的交易語意，不是假裝真 Bash 會撤回已寫入的檔案。
- 兩種風格的本機續玩都可 Ctrl+C 中斷；返回啟動器，保留原始存檔。
- 選取文字時 Ctrl+C 保留原生複製；中文輸入的組字 Enter 不送出指令。
- 貼上多行不直接執行；未完成的引號、for／if／function／heredoc 以 `>` 續行。完整控制結構一次提交，遇到遊戲互動提示時暫停並留下後續草稿。Shift+Enter 可編輯換行。
- PageUp/PageDown 回捲；Shift+Tab 離開輸入欄。軟鍵盤／低高度視窗仍使用同一捲動區。

Worker、xterm、樣式與授權都嵌入同一 HTML，無執行期網路或額外下載。CSP 保留 SHA-256、`worker-src blob:`；xterm 動態樣式使用專用 nonce 與固定版本 CSSOM 接合，不開放 `unsafe-inline`／`unsafe-eval`。

如舊版本的本機紀錄無法重播，歡迎畫面會提供原始操作紀錄／已保存 JSON 的備份入口。選「只還原已保存事件」會先另存救援備份，並清楚標示任意檔案修改與 cwd 無法由事件存檔還原；不會悄悄忽略鏈尾差異。

0.3.0 改善歷史閱讀／PageUp、手機操作尺寸與低高度輸入欄、口令／投票的輸入名稱，以及匯入錯誤焦點。Tab 補全、↑↓ 歷史；**Shift+Tab 可離開輸入欄**。手機任務摘要可點擊或用鍵盤開合。

同一存檔在另一分頁被更新時，舊頁停止自動寫入並提示；可先用 `save` 匯出本頁進度，再重新載入。保護涵蓋沒有產生 commit 的檔案修改，不只比對鏈尾；RA1 仍不包含任意 Shell 檔案。優先使用 Web Locks，沒有該 API 時是 best-effort，不宣稱所有跨瀏覽器競態皆已解決。

## 開發與測試

```text
npm install
npm run data
npm run build
npm test
```

Windows 若 PowerShell 阻擋 npm.ps1，改用 `npm.cmd`。Node **20.19+**；Python 互通測試需要 Python 3 與 PyYAML。

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

0.3.0 完整驗收：**366/366 通過，0 失敗、0 跳過**；逐項紀錄在 `notes/test-results-v0.3.txt`，包含第三輪獨立找碴與交叉review的回歸。0.2.0的292項及首版262項另留歷史紀錄，三次本輪失敗輸出也保留。原始資料、既有測試與四條T10 commit ID不變。跨瀏覽器／真人／無障礙驗證邊界見 `REPORT.md`。

相同條件再次全套重跑仍為366/366，見`notes/test-results-v0.3-repeat.txt`；不代表未測瀏覽器或真人體驗已通過。

2026-11-02 前輪單次 `npm.cmd test`：**526/526 通過，0 失敗、0 取消、0 跳過**（359.50 秒）；當次 pretest 重建 `dist/index.html` 為 **2,307,259 bytes**。2026-11-03 的一般風格補齊與提示符修正另見 [Bash 終端驗收](notes/BASH_TERMINAL.md)；獨立原生 Bash 對照與多代理辯論見 [研究及實作紀錄](../references/README.md)。前述版本結果是歷史紀錄，不與本次加總。

## 三種跑法

- 預設：個人自助。
- 在網址後加 `?mode=kiosk`：攤位模式，閒置 120 秒返回歡迎畫面。
- 加 `?mode=host`：主持人帶領，放大字級，點燈後直接進投票；共享紀錄不作個人正式版匯入用途。

詳見 `ARCHITECTURE.md`、`FINDINGS.md` 與驗收結論 `REPORT.md`。

## 早期外部專案參考（歷史決策）

- [主架構師取捨摘要](notes/REFERENCE_DECISIONS.md)
- [just-bash／PocketTerm：官方來源、授權與整合成本](notes/ENGINE_REFERENCES.md)
- [10 款終端遊戲：執行路線與可借鑑互動](notes/GAME_REFERENCES.md)

上述是初期只借鑑 UX 的決策。後續已實際研究並整合 just-bash／xterm；版本、授權、暫存清理與升級注意事項以最新 [研究紀錄](../references/README.md) 為準。
