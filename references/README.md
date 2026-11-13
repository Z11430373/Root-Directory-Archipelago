# Bash 改進：原始碼研究與操作紀錄

本輪目標是找出能改善實際 Shell 語意與終端操作的開源實作，clone 閱讀後保留研究證據；研究副本完成後清除。原專案修改與本資料夾的報告是預期保留成果。

## 整合完成

已在原 `demo-app` 實作固定 just-bash 3.6.0、xterm 6.0.0／fit 0.11.0，保留 legacy journal 接面；以下初輪研究證據仍保留，不能用舊的 391 項結果代表新引擎驗收。

2026-11-03 補齊一般風格：所有瀏覽器新遊戲、事件匯入與續玩後的新輸入均採 Bash，兩種風格只改呈現器；legacy 僅供歷史重播。一般輸入也共用續行判斷、Bash 補全與草稿取消。主提示符改 `$`，遊戲問答用冒號，`>` 僅作真正 PS2 與重導向運算子；詳見主線紀錄。

2026-11-02 前輪 `npm.cmd test`：**526/526 通過，0 failed／cancelled／skipped**（359.50 秒），同次 pretest 重建正式離線 HTML **2,307,259 bytes**。原始輸出見 [前輪全套日誌](../demo-app/notes/logs/test-results-bash-integration-final.txt)。反方 M1–M5 已結案，原生對照暫存環境亦已修復；完整失敗與修復歷史保留，不將各輪測試數累加。

- [引擎實作／固定 hooks／狀態與決定性](ENGINE_IMPLEMENTATION.md)
- [真終端／行編輯／CSP／已知邊界](TERMINAL_IMPLEMENTATION.md)
- [獨立原生 Bash 對照](BASH_CONFORMANCE.md)
- [反方重現、辯論與增量複驗](SHELL_INTEGRATION_REVIEW.md)
- [Python 參考工具跨平台修復](VALIDATOR_PORTABILITY.md)
- [終端保真計畫：全螢幕程式、真指令、雙向模式切換](PLAN-terminal-fidelity.md)
- [真 Linux／真 links 執行環境取捨（ADR-002）](ADR-002-real-linux-terminal.md)
- [主線操作契約與最新整合結果](../demo-app/notes/BASH_TERMINAL.md)

## 初輪現況（歷史）：遊戲測試通過不等於 Bash 相容

`demo-app` 最初的完整 390 項測試涵蓋遊戲契約；本輪增加 stderr 回歸後為 391 項。現有 Shell 仍是 29 指令白名單的自製解析器。

以本機 GNU Bash 5.3.15 對照 12 個固定探針，只有管線與引號檔名兩項輸出／stderr／退出碼完全一致。這是針對缺口的抽樣，不是完整 Bash 相容率。

已重現缺口：

- `answer=42; echo "$answer"`：變數指定被當作指令名稱。
- `$(...)`、`$((...))`：被拒絕。
- `||`、`for … do … done`、`printf`、`<`：未支援。
- `{one,two}`、`${name:-default}`：維持字面文字，未依 Bash 展開。
- 未知指令錯誤原本寫到 stdout，與 Bash 的 stderr 不同；本輪已修正並新增管線／重導向／退出碼回歸案例。
- 畫面仍是 DOM 文字加 textarea，不是字元格／ANSI 終端；換成終端呈現器本身也不會補齊 Shell 語法。

逐項輸出見 [BASH_GAPS.json](BASH_GAPS.json)。可重現命令：

```powershell
node references/bash-gap-probe.mjs 'C:/Program Files/Git/bin/bash.exe'
```

探針僅執行寫死的測試命令，建立獨立暫存輸入檔；`finally` 刪除該次自建暫存目錄，不修改劇本或系統設定。程式與 JSON 保留供後續引擎比較。

`BASH_GAPS.json` 保留首次探針的修正前證據；未知指令的串流錯誤已另由 `demo-app/test/bash-compat.test.mjs` 驗證修正。之後重跑探針會覆寫 JSON 為當時版本；原生 Bash 的非互動錯誤前綴包含執行檔與行號，與遊戲文字仍不會逐字相等。

## 並行研究

| 路線 | 報告 | 目的 |
| --- | --- | --- |
| Bash／Shell 引擎 | `SHELL_ENGINES.md` | 判斷真 Bash、WASM 與相容模擬器的差異，找 Worker／VFS 接點 |
| 終端呈現與輸入 | `TERMINAL_UI.md` | 檢查字元格、ANSI、游標、IME，以及 readline／PTY 的責任 |
| 命令列教學遊戲 | `LEARNING_GAMES.md` | 檢查真實命令、任務判定、提示與進度如何接合 |

各報告須保留 repo URL、固定 commit、授權位置、讀過的關鍵檔案、操作命令與清理結果。研究中的候選尚不表示已加入正式應用程式。

### 已完成來源研究

三路合計 **6 次 clone 成功、0 次 clone 失敗**，完成本機靜態閱讀並清除這 6 份研究副本：

| 專案 | 發現／用途 |
| --- | --- |
| [just-bash](https://github.com/vercel-labs/just-bash) | 優先實驗的 Bash 相容引擎；需跨行狀態、VFS 與遊戲事件 adapter |
| [bash-wasm](https://github.com/bahamas10/bash-wasm) | 真 GNU Bash 移植，但這版沒有 fork／exec／wait 與可用管線；不適合直接接替本案 |
| [xterm.js](https://github.com/xtermjs/xterm.js) | 優先終端呈現候選，處理字元格、ANSI、游標、選取與 IME；本身沒有 Shell／readline |
| [xterm-pty](https://github.com/mame/xterm-pty) | JS PTY／termios 接合參考；不是 Bash，且本輪版本與 xterm 6 的接合尚未驗證 |
| [GameShell](https://github.com/phyver/GameShell) | 真 Bash／Zsh 教學遊戲，參考任務結果判定、goal/check/reset 與 shell 整合 |
| [TermGame](https://github.com/saranormous/termgame) | 瀏覽器教學狀態與命令 registry 參考，不提供 Bash 語法相容 |

建議路線與依賴順序見 [ADR-001-bash-runtime.md](ADR-001-bash-runtime.md)。三份報告均記錄固定 SHA、授權、讀過的檔案與建立／搬移／刪除命令；只完成來源研究，未執行第三方 install/build 或移植其程式。

## 初輪主線操作與環境（歷史）

- 在原專案新增本資料夾的探針與報告；保留為任務成果。
- 探針使用既有 Git Bash；沒有安裝套件或修改全域設定。`LC_ALL`、`LANG`、`BASH_ENV` 僅傳給子程序。
- 探針暫存位於既有批准的 `Temp/opencode` 下，以 `mkdtemp` 產生唯一目錄；執行完成後已走完清理。
- 曾準備將研究 clone 放進 `references/upstream/`；依使用者後續要求，改為研究完成後清除副本。各代理的實際路徑與清理證據記在各自報告。
- 根專案沒有另外產生交付副本；先前另建資料夾的方案已撤回。
- 已取消包裝任務的清理已確認：`tools/package_project.py`、`DELIVERY.md` 均不存在；該代理的 `TemporaryDirectory` fixture 已刪除，批准暫存目錄下無 `package-fixtures-*` 殘留，沒有程序外環境變更。
- Python 資料驗證代理亦已清除本輪暫存快照並核對已知 fixture 路徑不存在；新 shell 未保留測試環境覆寫，未安裝套件或修改全域設定。詳見其結果文件第 7 節。
- 本輪 app 修正為未知指令的 stderr／退出碼／重導向語意；`npm.cmd test` 已重新建置並完成 **391/391 通過，0 失敗、0 跳過**，77.68 秒，輸出留在 `demo-app/notes/logs/test-results-bash-research-fix.txt`。PowerShell 的輸出編碼與 `RA_*` 只設於該執行程序。
- 主線收尾再次以 `Test-Path` 獨立核對 6 個原 clone 路徑與兩個搬移後暫存根目錄，8 項皆為 `false`；亦確認無 `ra-bash-gap-*` 探針目錄殘留，`git diff --check` 通過。此確認只涵蓋本輪列明路徑；平台管理的工具／會話紀錄予以保留。

## 其他驗證狀態

初輪 8 項 demo 跨平台問題保留在 `demo-app/notes/logs/test-results-project-data.txt`。後續已修正參考工具的 LF、POSIX／宿主路徑映射、空目錄與對照契約；Windows 與既有 Linux 容器的 root、demo validator 均為 **0 錯誤／0 警告**，83 個資料檔案雜湊未變。主線 Windows 原始輸出見 `demo-app/notes/logs/test-results-validators-current.txt`；Linux 版本、bind-mount 環境限制、通過方式與清理證據見 `VALIDATOR_PORTABILITY.md`。

## 正式依賴操作

主線於 `demo-app` 執行 `npm.cmd install --save-exact --ignore-scripts just-bash@3.6.0 @xterm/xterm@6.0.0 @xterm/addon-fit@0.11.0`。這些是正式成果，不屬研究副本；package／lockfile 保留。未全域安裝或執行套件 lifecycle scripts。

初次 audit 的 3 項問題來自 guarded-fetch 固定 undici 7.29.0。查核 registry 的 7.30.1 版本／Node 約束後，以 `guarded-fetch → undici:7.30.1` 的窄幅 override 再執行 `npm.cmd install --ignore-scripts`，結果 **0 vulnerabilities**；沒有使用 `audit fix --force` 或降級 Bash 引擎。

建置將三個新增直接依賴的完整 LICENSE 嵌入單 HTML，保留 upstream legal comments。Bash hook、xterm CSSOM hook 與 clipboard probe 防護在載入時計算，不覆寫 node_modules。實驗副本、命令與清理分別記在實作／審查文件；不清除共用 npm cache 或平台會話資料。

主線另以 `Test-Path` 獨立核對 12 個已列明的研究／PoC／審查／validator 暫存根目錄，結果全部 `False`。核對包括 runtime study、xterm 初次與 PageUp PoC、兩輪增量審查與四個 validator fixtures；不包含仍在執行的驗證工作或原有瀏覽器工具目錄。

最後全套完成後另以 Node `readdirSync` 核對批准 base：`ra-bash-session-*`、`ra-bash-env-probe-*`、`ra-bash-env-parallel-*` 自有目錄均無殘留。所有實作與驗證代理已收尾；沒有另建交付副本，變更尚未提交 Git。
