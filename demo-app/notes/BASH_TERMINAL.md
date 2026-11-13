# Bash 終端模式：實作與驗收紀錄

## 操作契約

- 模式名稱為 **Bash 終端（模擬）**。目前採固定 **just-bash 3.6.0 + xterm 6.0.0 / fit 0.11.0**，語法由成熟 interpreter 執行；遊戲 VFS、特定工具的格式／讀檔事件與故事引擎仍保留。
- `game …` 是遊戲控制層：開始、續玩、任務、狀態、匯入、匯出、偏好與返回入口。故事效果命令需要獨立提交；嵌入函式、替換或複合腳本時明確報錯。`systemctl status` 可作只讀查詢；腳本中的 `help` 是 Bash builtin。
- 遊戲啟動器使用 `archipelago$`；兩種風格開始後均依真實工作目錄顯示 `op-暱稱@主機:路徑$`。暱稱、口令及投票用冒號標示遊戲問答；`>` 只用於 Bash 的未完成指令續行（PS2），不是主命令提示符。
- 輸出與 live prompt 在同一個捲動區內。命令執行時提示符退場，結束／取消後才恢復；終端模式沒有任務側欄、指令按鈕或匯出 dialog。
- 輸出立即顯示；錯誤保留原始文字。主題與字級只是顯示偏好，不負責決定命令語法。

## 實作入口

| 檔案 | 職責 |
| --- | --- |
| `src/ui/xterm-console.js` | 真字元格／ANSI、游標、選取、IME 接橋、歷史焦點與 resize |
| `src/ui/console-line-editor.js` | Readline 風格編輯、歷史搜尋、貼上與 PS2 完整性檢測 |
| `src/ui/script-submissions.js` | 多行控制結構／heredoc 保持一筆提交，保留遊戲互動邊界 |
| `src/ui/console-view.js` | 舊 journal 的多行分段、共用補全字詞解析 |
| `src/ui/terminal.js` | 共用 log 呈現；可指定 scrollback viewport、立即輸出與原始 stderr |
| `src/main.js` | 模式切換、`game` 派送、提示符狀態、文字匯出、共享 Engine／journal |
| `src/ui/shell-job.js` | Worker 啟動、結果提交、取消與資源清理 |
| `src/shell/worker.js` | 按明確 runtime tag，用隔離 VFS 呼叫新／舊引擎 |
| `src/shell/bash-runtime.js` / `bash-vfs.js` | Bash session、決定性時鐘／PRNG、VFS 與精確 inode 事件 |
| `src/shell/browser-zlib.js` | 以既有 pako 提供有界 gzip browser 接口 |
| `src/engine/index.js` | 單次 feed 固定 executor／分派版本／取消訊號，交易回復 |
| `src/ui/server.css` | Bash 終端版面；保留舊檔名與偏好值以接續既有設定 |
| `build.mjs` | 嵌入 Worker／CSS／授權；固定版本 source hooks、CSP hash＋style nonce |

## 取消與資料一致性

Worker 完成後才把 VFS 結果套回 live world。Ctrl+C 終止 Worker 並讓 Engine 交易回復，取消的指令保留在畫面／命令歷史，但不加入可重播 journal。這是遊戲採用的原子取消；真 Bash 並不會自動復原已完成的檔案寫入。

群島與終端風格的新遊戲、事件匯入及續玩後的新輸入一律使用 Bash；不必先切換風格才取得新語意。每筆 journal 記錄 `shell`；缺 tag 的舊紀錄仍使用原 parser 與原 Engine 分派。envelope 另記目前 backend。F2 只改呈現方式，不能改寫任何正在執行或重播的步驟。

一般風格保留原任務面板、按鈕與 DOM 輸出，同時共用 Bash 完整性 scanner／腳本分段。Enter 不會提前執行未閉合的 for／if／function／heredoc，Bash 指令可補全，Ctrl+C 可取消未提交草稿或正在執行的 Worker。

`vfs.shellState` 保存變數、函式、alias、選項、上一個退出碼與 PRNG，經 structuredClone 跨一次性 Worker；普通提交不靠重跑歷史恢復。渡海保留 session 並同步新 cwd；沙盒離開回復 main 的檔案和 shell 狀態。日期／隨機值取決定性模擬時鐘／種子，重播不取宿主當下時間。

續玩取消涵蓋 Worker 啟動前的非同步等待；取消返回入口且不回寫原 envelope。RA1／JSON 只保存事件，任意檔案、cwd 與 shell 狀態依賴本機 journal。模式切換不重播遊戲、不改 commit；口令草稿切換時清空，避免轉到另一呈現器後顯露。

此為 Bash 相容模擬，沒有 GNU Bash 程序／TTY／作業控制模型。VFS 儲存 Unicode 文字，不宣稱任意二進位或 symlink 支援。just-bash 管線會先物化輸出；PS2 scanner 只判完整性，特殊語法邊界見 `references/TERMINAL_IMPLEMENTATION.md`。

固定 source hooks（Bash session/determinism、xterm CSSOM 與 clipboard probes）僅在載入／build 套用，不改 node_modules。任何 upstream marker 不符會停止；升級套件時須重審並跑對照。Node 測試與 browser build 共用同一 Bash hook：`node --import ./test/helpers/register-bash.mjs --test …`。

## 驗收項目

- `test/console.test.mjs`：鍵盤工作階段、行編輯／補全、IME 事件保護、多行輸入、中斷、回捲、手機幾何與四條 golden path 的逐筆 commit ID。
- `test/console-worker.test.mjs`：Worker 的 VFS／硬連結提交、失敗與取消回復、四條 golden path，以及真瀏覽器續玩中斷後原始存檔與 timer 一致性。
- `test/styles.test.mjs`：依新操作模式契約驗收切換、草稿、進度、主題、儲存不可用與純文字結尾。
- 既有測試：群島模式、流程、存檔互通、Shell、資料建置、CSP 與跨分頁所有權。
- `bash-runtime.test.mjs`、`bash-session-conformance.test.mjs`：原生 Bash oracle、跨提交／Worker、子 Shell 隔離、決定性重播、讀事件與重導向。
- `bash-engine.test.mjs`：確實注入 Bash 的四條 golden、混合 journal、分支／渡海，以及切換 executor／pre-dispatch 取消競態。
- `bash-islands-browser.test.mjs`：不先切換風格的一般遊戲，驗 Bash 狀態、重導向、逐行續行、heredoc、補全、草稿取消、匯入及 reload；涵蓋 320／768／1280px。
- `bash-replay-browser.test.mjs`：含留在一般風格、明確 legacy／缺 tag 的舊紀錄重播後接 Bash 新輸入；原有 digest 閘切換與取消斷言保留。

自動化 IME 事件檢查不等於真人輸入法驗收；Chrome 測試不等於所有瀏覽器或輔助科技皆已驗證。

## 並行整合順序

1. 共用前置：完成 Bash 操作、Worker 取消及續玩修正，建置同一份 `dist/index.html`。
2. 獨立工作並行：修正並重跑 `styles.test.mjs` 的離線資源辨識；執行 `console-worker.test.mjs` 的取消續玩驗收；主線檢查畫面、差異與文件。
3. 收斂：彙整互不重複的測試結果，檢查 `git diff --check`；兩項新增終端測試檔均納入 `npm run test:browser`。

桌機 1280×800、手機 360×640 的實際遊玩截圖已檢視；兩者皆無橫向溢出，輸出與目前提示符保持在同一捲動區。自動化另涵蓋 320px、360px、768px 版面與低高度輸入欄。

新 xterm 產物另以真 Chrome `file://`、真鍵盤路徑執行跨提交變數、多行 for 與 ANSI truecolor，確認 page／console errors 為 0、360px 無橫向溢出，並檢視 [桌機](screenshots/xterm-desktop.png)／[手機](screenshots/xterm-mobile.png) 截圖。此處是瀏覽器尺寸模擬，不是手機實機或原生 OS IME 驗收。

## 最終驗收結果

### 2026-11-03：一般風格與提示符補齊

**重現／根因：** 前次只讓終端風格的新 session 預設 Bash；一般風格新遊戲、事件匯入與未切畫面的舊檔續玩仍可能保留 legacy。提示符還以 `>` 混用啟動器與遊戲問答，容易誤認為主 Shell 提示符。

**修復：** 所有瀏覽器新輸入固定 Bash，顯示風格不再選擇 interpreter；歷史重播仍逐筆依 tag，缺 tag 保留 legacy，並且不改寫原紀錄。一般風格 Enter 共用 Bash 完整性判斷，增加指令補全與 Ctrl+C 草稿取消，保留原任務面板／按鈕／DOM 輸出。主命令／啟動器使用 `$`，遊戲問答用冒號；真正 Bash 續行仍使用標準 PS2 `>`，重導向運算子 `>` 的語意亦保留。

**回歸：** 新增一般風格 6 案與無須切畫面的舊檔／缺 tag 重播 3 案。首次定向 18 案為 17 pass、1 fail；唯一失敗是測試 helper 的 `screenText` 會 trim 行尾空格，卻以 `^> ` 比較續行提示。改讀未 trim 的真實 cell rows，沒有改程式行為或移除 PS2 斷言。首次輸出保留於 [test-results-bash-normal-ui.txt](test-results-bash-normal-ui.txt)，修正後重跑見 [test-results-bash-normal-ui-verified.txt](test-results-bash-normal-ui-verified.txt)。

### 2026-11-10：雙風格全套失敗診斷與修復

一般風格新增案例與重播定向驗收為 **18/18 通過**；接續第一次雙風格全套為 **535 tests，531 pass、2 fail、2 cancelled、0 skipped**（494.59 秒），原始輸出保留於 [test-results-bash-both-styles-final.txt](test-results-bash-both-styles-final.txt)。四個案例均保留，未以這次結果宣稱全套通過。

- **T12 的本機 Worker 誤報：** 一般風格改用隔離 Worker 後，原測試把所有非 document 請求都當外部資源，因 `blob:null/...` 失敗。分類現在與既有終端測試一致，區分 CSP 允許的本機 Blob Worker 與外部請求；外部請求、console／page error、CSP 違規的零容忍斷言保留。
- **終端讀取成本：** 真 Chrome 逐步量測 golden edge，單是 `saveCode → terminalText` 的完整往返回捲花 **30,216 ms**，其中可及性同步約 29 秒。證據見 [test-results-bash-console-profile.txt](test-results-bash-console-profile.txt)。這是測試觀察成本，不是測到 Bash 指令執行 30 秒。改成從真字元格向前讀到最新完整 RA1 即停，不再讀無關舊故事；完整 transcript helper 仍讀取每一頁，返回底部時改用真歷史 End 鍵。原四條 golden 的完整 commit ID 比對未刪除，沒有加長測試時限。
- **行編輯觀察：** 同一個已完成的貼上輸出只取一次完整 snapshot，同時驗第一／第二行，避免重複回捲。新增真瀏覽器案例，驗代碼完整性與讀完後底部／中間回捲位置均精確還原；不暴露 app、xterm 或 interpreter 私有狀態。
- **跨分頁逾時：** 原案例單獨逐步重現未失敗；舊頁的兩次檔案指令及 save 均完成，存檔衝突警示有效，Web Locks 無 held／pending。原始觀察見 [test-results-bash-session-diagnosis.txt](test-results-bash-session-diagnosis.txt)，不能據先前逾時宣稱已證實 runtime 死鎖。測試操作前現在明確切至要輸入的分頁；背景 idle、storage event 與完整舊檔保護斷言不變。

首次修復後定向重跑 **5 案，4 pass、1 fail**，保留於 [test-results-bash-both-styles-repairs.txt](test-results-bash-both-styles-repairs.txt)：T12／HTTPS、golden edge、跨分頁保護與新增回捲位置案例均通過。edge 的完整遊戲與逐筆 commit ID 驗證為 **55.01 秒**，原 90 秒限時未變。

剩餘失敗定位為 Ctrl+L 的觀察競態：xterm 清畫面仍在 write queue 時，測試開始掃舊 buffer，接著 buffer 被正常清空，舊回捲位置自然不能還原。現在先從實際字元格確認「畫面只剩目前提示符」，再斷言完整輸出已空、head 不變、歷史可重取及 Shift+Tab 可離開。不是放寬回捲還原斷言，也未更改正式 app 的 Ctrl+L 行為。

### 前輪單次全套（2026-11-02）：526/526 通過

2026-11-02，全部修復整合後執行 `npm.cmd test`，pretest 重新建置正式產物，再以並行度 2 執行全套：

| 項目 | 結果 |
| --- | --- |
| tests / pass | **526 / 526** |
| fail / cancelled / skipped / todo | **0 / 0 / 0 / 0** |
| 測試耗時 | **359.50 秒** |
| 正式產物 | `demo-app/dist/index.html`，**2,307,259 bytes** |
| SHA-256 | `a1f60bd2d1d5f0a5e6f4189940a3bb3367ca054d2294f6244692bfbc87b6c8bb` |

完整原始輸出：[test-results-bash-integration-final.txt](test-results-bash-integration-final.txt)。這是同一原專案、同一次完整執行的結果，包含原生對照、核心、真 Chrome／HTTPS、四條完整遊戲走法、CSP、取消及重播競態；不加總前輪或各代理的重複案例。第一次失敗全套與定向修復日誌仍保留於下方。

環境為 Windows、Node 24.19.0、既有 Git Bash 5.3.15、本機 Chrome 與外部 Playwright；`RA_PLAYWRIGHT`、`RA_CHROME`、`RA_TLS_KEY`、`RA_TLS_CERT` 僅在測試程序設定。正式 HTML 可離線開啟，沒有這些測試工具的執行期依賴。

Windows／既有 Linux 容器的兩套 Python validator 另皆為 **0 錯誤、0 警告**，83 檔資料 SHA-256 不變。它們是獨立驗證，沒有灌入上述 526 的計數。

全套後主線核對：原生對照的 `ra-bash-session-*`、`ra-bash-env-probe-*`、`ra-bash-env-parallel-*` 暫存目錄均無殘留。研究／PoC／容器清理證據見 `references/README.md` 與各實作報告；正式依賴、程式、測試、報告與截圖保留在原專案。

### 新引擎整合的失敗紀錄與修復

第一次全套結果保留於 [test-results-bash-integration.txt](test-results-bash-integration.txt)：525 tests，517 pass、6 fail、2 cancelled（案例逾時）、0 skipped。沒有刪除或跳過失敗案例。

#### 重現

- 真 xterm 按 F2 返回群島，卻又立即回到終端；後續群島控制項不可見。
- `report() { printf "state:%s:%s\\n" "$shared" "$((count + $1))"; }` 是完整函式，卻被判為需要 PS2。
- 封鎖 `navigator.clipboard` getter 時，xterm module-load feature probe 拋錯，整頁未啟動。

#### 根因與修復

- xterm 的 `leave()` 改變當前 view 後，事件仍冒泡到 document。主線忽略已 `defaultPrevented` 的事件，避免同一 F2 二次切換。
- expansion 結束後遺留 lexical/token scope；scanner 現在隔離並恢復外層狀態，完整／未完整函式與巢狀展開都納入回歸。
- 固定 xterm package 的兩個 clipboard feature probes 改為局部 try/catch 回 false；同樣驗唯一 marker，不改宿主 navigator 或放寬 CSP。
- 舊 T12 測試的 viewport resize 立即斷言有時早於 media-query 事件；改等待實際 panel 收合，保留原本結果斷言與時限。

#### 防止回歸

原有 F2／不同寬度／儲存與剪貼簿禁用測試全部保留；另有函式 PS2 單元與真終端 state/reload 案例，以及 9 項真 digest 閘 replay 切換／取消案例。

修復後重建正式 HTML，針對 `browser.test.mjs`、`styles.test.mjs`、`console.test.mjs` 執行 **31/31 通過、0 failed／cancelled／skipped**（337.14 秒）。涵蓋 file／HTTPS、被封鎖的儲存／剪貼簿、F2、多行函式、完整四條遊戲走法與手機尺寸；原始輸出見 [test-results-bash-ui-fixes.txt](test-results-bash-ui-fixes.txt)。這是定向重跑，最終全套另列，不將重複案例加總。

### 原生對照環境修復

獨立原生對照另遇 Git Bash `could not find /tmp` 警告，原因涉及將 `TEMP/TMP` 指向立即刪除的案例目錄。兩者改為穩定批准 base，HOME／cwd 仍逐案隔離；保留 stderr 的逐 byte 斷言，沒有吞警告或修改宿主設定。單程序與四程序並行只讀探針通過後，正式 loader 獨立重跑 **63/63 通過、0 failed／cancelled／skipped**（4.20 秒）。詳細範圍、失敗歷史與清理見 [BASH_CONFORMANCE.md](../../references/BASH_CONFORMANCE.md)。

### 前輪基線：原生 Bash 對照後修正

原生 Bash 探針確認未知指令的錯誤輸出誤走 stdout，已修正為 stderr 並保留退出碼 127；新增 `test/bash-compat.test.mjs` 驗直接執行、重導向、管線及 `$?`。再次 `npm.cmd test` 重建產物為 **574,510 bytes**，單次全套 **391/391 通過，0 失敗、0 跳過**（77.68 秒），原始輸出見 [test-results-bash-research-fix.txt](test-results-bash-research-fix.txt)。

這仍是遊戲契約測試；一般 Bash 語法尚有缺口。原生對照、6 個 GitHub 專案的 clone 研究與清理紀錄見根目錄 `references/README.md`。

### 前次：操作模式完整整合

完整專案整合後執行 `npm.cmd test`，由 pretest 重新建置 574,508 bytes 的 `dist/index.html`，**單次完整測試 390/390 通過，0 失敗、0 跳過**，耗時 65.44 秒。原始輸出保存在 [test-results-bash-integrated.txt](test-results-bash-integrated.txt)。測試範圍如下：

| 範圍 | 通過數 | 結果 |
| --- | ---: | --- |
| 除下列兩檔外的整合測試 | 371 | 包含終端 15 項、四條 golden path 逐筆 commit ID、UI 12 項，以及離線／HTTPS／存檔／Shell 回歸 |
| `test/styles.test.mjs` | 10 | 模式切換、草稿、主題、儲存失效、純文字結尾；本地 Blob Worker 與外部請求分開辨識 |
| `test/console-worker.test.mjs` | 9 | Worker 交易與取消、重播第二個 Worker 中斷、原存檔字串不變、無 recovery、推進 timer 1000ms 仍未回寫 |

前一輪整合執行的 381 項中有 7 項失敗，均是 `styles.test.mjs` teardown 將本地 `blob:null/…` 當外部資源；功能斷言已通過。修正測試請求分類後只重跑該檔，並行補驗 Worker 檔，未將重跑案例重複加總。

回整原專案後另執行上述單次完整測試，確認各代理的結果已在同一專案一起通過。根目錄劇本／測資、`demo-app` 原始碼與建置產物、工具、文件及測試紀錄均保留在原專案資料夾。

已修正並覆蓋的邊界包括：多行草稿往返模式不丟換行、貼上切模式後保留後續指令、Ctrl+C 重設歷史游標、閉引號前補全不重複引號、終端續玩可取消，以及測試 hooks 次序造成瀏覽器未關閉。

建置已完成；`git diff --check` 通過。瀏覽器驗收使用外部 Playwright 與本機 Chrome，工具不包含在正式 HTML 內。
