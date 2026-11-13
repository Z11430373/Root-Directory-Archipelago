# 原始碼閱讀與註解指南

本輪針對自有 JavaScript、Python、CSS 與測試補繁體中文註解，不調整演算法、規則、台詞或測試斷言。
閱讀時先看模組開頭，再沿函式的「呼叫者 → 輸入／輸出 → 副作用／清理」追蹤。
短小的格式器與 callback 以相鄰區塊合併說明；不逐行重述賦值、迴圈或 import 語法。

## 1. 系統入口與依賴

| 系統 | 入口／檔案 | 責任與來源 |
| --- | --- | --- |
| 劇本與規格 | `world/`、`chapters/`、`dialogue/`、`quests/`、`branches/`、`cards/`、`text/` | 引擎的來源資料；試玩行為以 `demo/flow.yaml` 為主，範圍看 `demo/demo.yaml` |
| 資料與單檔建置 | `demo-app/build.mjs` | 讀 YAML/text、檢查引用與 B0 文案，產生資料常數並嵌入 JS/CSS/CSP |
| 瀏覽器整合 | `demo-app/src/main.js` | 歡迎頁、表單、任務面板、匯入／匯出、本機重播與 kiosk |
| 流程 | `demo-app/src/engine/index.js` | 規則、對話、任務、提示、虛擬時間、分支、事件預算與交易回復 |
| 條件運算式 | `demo-app/src/expr.js` | 受限文法，僅允許環境明示的函式；對照 `demo/tools/flowexpr.py` |
| 世界 | `demo-app/src/vfs.js`、`loggen.js`、`quests.js` | 記憶體檔案／硬連結、決定性日誌與只讀題目判定 |
| 模擬 Shell | `demo-app/src/shell/{parse,exec,commands,bre,stream}.js` | 引號、展開、管線、文字指令、讀取快照與 iterator 清理 |
| 可攜存檔 | `demo-app/src/save/index.js` 與同目錄模組 | canonical、雜湊鏈、RA1、硬規則、分級、計分、值班證及正式版投影 |
| 本機資料 | `demo-app/src/storage.js`、`ui/session-storage.js` | 操作 journal 與完整 envelope 的所有權；不擴充 RA1 |
| UI 原語 | `demo-app/src/ui/{dom,terminal,preferences}.js` | 文字節點、複製備援、動畫／捲動、偏好正規化 |
| Bash 終端模式 | `demo-app/src/ui/console-view.js`、`main.js` 的 console 流程 | 獨立的連續輸出／提示符介面、行編輯、歷史搜尋、`game` 工作階段命令；模式切換共用原 Engine |
| 可中斷 Shell | `demo-app/src/ui/shell-job.js`、`src/shell/worker.js` | 在 Worker 的隔離 VFS 執行原 Shell；成功才提交，取消走 Engine 交易回復；終端模式的本機重播也可取消 |
| 樣式 | `demo-app/src/ui/{theme,server}.css` | 群島版面與 Bash 終端版面；`server.css` 名稱保留，但不再是同一 DOM 的外觀覆寫 |
| Python 參考／驗證 | `tools/*.py`、`demo/tools/*.py` | 生成日誌／劇本／測資，驗證規格，建立跨語言答案與活動統計 |
| 工單解答 | `tickets/*/ref/*.py` | stdin/stdout 子程序；`wrong_*` 是刻意保留、供測資攔截的錯解 |
| 回歸測試 | `demo-app/test/*.test.mjs` | T1–T12、找碴與第三輪硬化；helper 註解另說明暫存、替身與瀏覽器清理 |

## 2. 一次輸入的資料流

```text
表單／快捷按鈕
  → main.enqueue（與時鐘序列化）
  → syncClock → Engine.advance
  → main.feedInput → Engine.feed → transaction
  → input／choice 模式，或 feedCommand
  → shell.parse → expand → runCommand → VFS／文字串流
  → file.read（讀取當下的 inode 別名）→ cmd
  → flow 規則／旗標連鎖／state 固定點／題目判定
  → 存檔 commit／狀態檢查成功 → 發布 onOutput
  → Terminal.write → journal 加入成功輸入 → persist → refresh
```

- Engine 失敗回復 runtime、VFS、flags、save 與待發布輸出；UI 不記錄失敗操作。
- `transaction` 不是並行互斥鎖，呼叫者仍需逐一 await。內部步驟方法不可當並行入口。
- 改事件或時鐘順序會改 commit ID；需核對 T10 四條走法，不只比較最後分數。

## 3. 三種不同的狀態保存

1. **記憶體世界**：檔案 node 指向 inode，硬連結共用內容；分支複製檔案圖，但 flags 全域共享。
   離開分支回到原 main VFS，不把分支任意檔案帶回。
2. **可攜 RA1／JSON 存檔**：只保留事件，不保存任意 Shell 檔案、cwd 或未記錄輸入。
   匯入重建已知 durable 狀態，不重新播放對話效果。
3. **本機 envelope**：`save + baseSave + journal + runMode`，重播輸入與時間才可恢復任意檔案／cwd。
   所有權比較整份原始字串，不能只比較 head；衝突後停止自動保存，不暗自認領新版。

RA1 匯入依序檢查 CRC、base64url、有界 zlib、嚴格 JSON、事件形狀；雜湊／合理性分級另做。
「完整」只表示資料一致且未命中合理性警示，不是防偽或真實遊玩證明。

## 4. 資源與安全邊界

| 資源／風險 | 所有者與清理方式 |
| --- | --- |
| Terminal 動畫 interval、捲動／點擊／媒體監聽 | `Terminal.destroy()`；`createGame/resetWelcome` 替換前呼叫 |
| ConsoleView 編輯器、ResizeObserver、全頁中斷鍵 | `ConsoleView.destroy()`；切換模式／重開工作階段前解除 |
| Shell Worker 與其 Blob URL | `ShellJob` 在成功、失敗、Ctrl+C 時 terminate／revoke；未成功的指令不加入 journal |
| 全頁 resize/storage/互動監聽與 250ms 排程 | main.js 只註冊一次，生命週期隨整頁卸載，不隨每次新遊戲再註冊 |
| 管線 iterator | `shell/exec.js` 的 finally 逆序 return；提早結束不能把所有來源強制讀完 |
| 下載 Blob URL | `downloadJSON` 移除暫時 anchor，延遲 revoke URL |
| 保存 dialog | 開新 dialog 先移除舊者；返回終端機時移除並還焦點；結束畫面禁止原生取消 |
| Web Lock | `request` callback 完成自動釋放；無 API 僅 best-effort，同鍵保護不等於跨鍵原子交易 |
| Python 暫存世界 | `finally`／`TemporaryDirectory`／`Sim.close()`；`run_walk` 成功回傳後仍由呼叫端 close |
| Python 真 Bash | 僅供可信規格與固定案例，不是 chroot 或安全沙箱，不能接玩家任意輸入 |
| 瀏覽器測試 | before/after 管 browser，t.after／finally 管 context、替身 descriptor 與暫存副本 |

Python 是語意參考，不代表每個安全細節與 JS 相同；例如 JS 的 JSON 詞法／串流尾料檢查更嚴格。
試玩日誌與 sort 仍會在記憶體實體化，不宣稱已達正式版百萬行惰性／外部排序需求。

## 5. 維護與驗證

- 原始碼註解應描述**目前實作**；規格願景與未實作行為分開，疑義見 `demo-app/FINDINGS.md`。
- 生成的 `demo-app/src/data.js`、`demo-app/dist/index.html`、`SCRIPT.md`、測資 JSON 不手改。
- `demo-app/vendor/` 為第三方程式／授權，不加入專案自訂註解；來源 YAML/text 不插入程式維護說明。
- 更新註解後以 Python AST 比對、JS/CSS 移除註解後的正規化輸出比對，確認沒有改可執行內容。
- 在 `demo-app/` 執行 `npm.cmd test`（非 Windows 可用 `npm test`），pretest 會重建 HTML 與 CSP。
- 根目錄的 `tools/validate.py`、`demo/tools/validate_demo.py` 需要 PyYAML 與可用的 Bash/coreutils；
  Windows 還須留意子程序 UTF-8 與 POSIX 路徑環境，缺少工具不能當成驗證通過。

### 註解整理驗證（2026-11-02，Bash 模式整合前）

- 70 個自有程式／樣式／測試檔均已補註解；第三方程式與劇本／對照資料未改。
- 17 個 Python 檔的 160 個函式定義均有相鄰註解，AST 與修改前相同。
- 53 個 JS／MJS／CSS 檔經 esbuild 移除註解並正規化，輸出與修改前相同。
  重建 HTML 的 JavaScript 逐字相同，CSS 規則相同，只有樣式註解與對應 CSP 雜湊更新。
- 最後一次 `npm.cmd test`：366 項中 **323 通過、0 失敗、43 跳過**，28.23 秒。
  43 項缺選用瀏覽器工具，不把歷史 Chrome 驗收當成本輪已執行。
- 較早同時執行多組驗證時，一項 Python 互通子程序回傳 `status=null`；單項重跑與最後全套均通過，未改斷言或時限。
- `demo/tools/testvectors.py check`：0 錯誤；`SCRIPT.md` 只讀重建比對一致；`git diff --check` 通過。
- Python 全套驗證仍未完成：加入既有 Git Bash 路徑後，`tools/validate.py` 的快題檢查通過，工單遇既有混合編碼問題（見 `demo-app/FINDINGS.md` F-08）；
  `demo/tools/validate_demo.py` 在 120 秒上限內未完成。未為註解工作修改工具行為或提高上限。

### Bash 模式完整專案整合

- 群島與 Bash 終端共用同一套 Engine、存檔與資料；代理成果已整合進本資料夾。
- 操作模式整合時 `npm.cmd test` 為 390/390；原生 Bash 對照後修正 stderr，最新完整執行 **391/391 通過，0 失敗、0 跳過**（77.68 秒），包含實際 Chrome、離線與 HTTPS。
- 操作契約與驗收見 `demo-app/notes/BASH_TERMINAL.md`；兩次原始輸出分別為 `demo-app/notes/test-results-bash-integrated.txt`、`test-results-bash-research-fix.txt`。
- 原始碼、劇本、測資、文件與建置產物均整合在原專案資料夾，維持既有相對路徑。
- 根目錄資料 validator 已修復 Windows UTF-8 與搜尋路徑，0 錯誤／0 警告；demo validator 仍有 8 項未解問題，詳見 `demo-app/notes/test-results-project-data.txt`。
- Bash 行為缺口、開源來源研究與臨時副本清理紀錄集中在 `references/README.md`；遊戲測試通過不代表完整 Bash 相容。
