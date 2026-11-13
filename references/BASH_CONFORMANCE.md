# Bash session 獨立契約驗證

## 範圍與執行

新測試：`demo-app/test/bash-session-conformance.test.mjs`。只呼叫公開的
`executeBash(raw, vfs, options = {})`，驗證 `stdout`、`stderr`、`rc`、`readEvents`
及既有 VFS API；不讀 runtime 私有欄位，也不以舊 `execute` 或 just-bash 本身充當 oracle。
正式依賴由主代理固定為 `just-bash@3.6.0`；本測試不安裝依賴。
依整合契約，持續工作階段存放於可序列化的 `vfs.shellState`，交易測試會直接驗證其快照。

**最終獨立結果（2026-11-02）**：修正 oracle 的 TEMP/TMP 生命週期後，正式 loader 執行
**63/63 tests 通過，0 失敗、0 skip、0 cancelled，4.20 秒**。24 組 native oracle 與所有
adapter／clone／交易案例均通過；先前 runtime 差異與 oracle 環境阻礙已完成本檔回歸驗證。
此結論限以下固定案例與專案契約，不代表全 Bash 相容率。

從 `demo-app` 執行，**不用 `npm test`**，以免觸發 `pretest` build：

```powershell
node --check test/bash-session-conformance.test.mjs
node --test --test-name-pattern="Bash native oracle" test/bash-session-conformance.test.mjs
node --import ./test/helpers/register-bash.mjs --test test/bash-session-conformance.test.mjs
```

runtime 檔案不存在時，adapter 案例明確標記 `Pending` skip；不建立替身實作。
存在但匯入失敗、缺 export 或執行失敗均為測試失敗。模組只在 adapter callback
內匯入，原生 oracle-only 指令可以在 runtime 開發中獨立執行。
完整 adapter 測試必須用主線的 `register-bash.mjs` loader，套用與正式 build 共用的
`patchBashBrowserSource` hook；直接 raw import 的拒絕不當作 Bash 語意不相容。

## Oracle 隔離與持續工作階段

- 固定 executable：`C:/Program Files/Git/bin/bash.exe`；不從玩家輸入、環境變數或
  CLI 接收 script。案例是測試檔內的固定白名單，包含輸出與退出碼的獨立預期值。
- 每個案例一個原生 Bash process。多次 adapter 呼叫對應同一 process 內分次 `eval`
  固定字串；這提供 alias 所需的新 parser boundary。兩端 alias 案例都明確執行
  `shopt -s expand_aliases`，避免把 non-interactive Bash 預設禁用 alias 誤認為差異。
- stdout/stderr 以 NUL 邊界與每步 rc 分框；框架輸出後以只做 `exit` 的 subshell 恢復
  上一步 rc。因此下一步的 `$?` 不會誤讀測試框架 `printf` 的成功狀態。
- stdout、穩定 stderr、檔案內容逐 UTF-8 byte 比較，不 trim、不轉換 CR/LF。未知命令、
  parser、cd、redirect 等錯誤另驗 stderr 的語意與 rc，允許 executable／line 前綴不同。
- 原生以 `--noprofile --norc -s` 啟動，執行環境採小型 allowlist、空 `BASH_ENV`／`ENV`、
  固定 `/usr/bin:/bin` PATH 與 C locale；不繼承使用者 functions／shell options。
- 每個子程序的 `TEMP`／`TMP` 固定為已批准的穩定 `%LOCALAPPDATA%/Temp/opencode` base；
  `HOME`／cwd 仍是每案唯一 fixture。這只改 `spawn` 的 env，不改宿主全域環境或 `/tmp`。
- Node 在 `%LOCALAPPDATA%/Temp/opencode/ra-bash-session-*` 建立固定 fixtures。Bash 只操作
  該目錄內固定相對路徑，所有 native redirect／ln／rm 都限測試自有檔案；不將遊戲 VFS
  路徑映射到宿主專案或玩家資料。遊戲的危險 rm 案例絕不送進原生 Bash。
- 每個 process 有 10 秒 timeout 與 1 MiB 輸出上限。`finally` 由 Node 刪除整個 owned
  目錄並斷言已不存在；不安裝依賴、不啟動背景程序、不執行上游 scripts。

## 測試矩陣

| 類別 | 驗證方式／重點 |
| --- | --- |
| persistent session | 跨呼叫保存變數、function、alias、cwd、`$?`；刪除 state 後不復活 |
| 引用與 expansion | 空參數、單／雙引號、標點、空白檔名、command substitution 去尾端換行、算術、brace、parameter default |
| 控制流程 | `&&`、`||`、`if/elif/else`、`for`、`while`、迴圈變數保存 |
| 輸出／串流 | printf UTF-8／tab／padding／無尾換行、stdin redirect、stderr redirect、descriptor 順序、pipeline 最後階段 rc |
| 子執行環境 | pipeline／command substitution 的 cwd 與變數不污染 parent |
| 狀態保存副作用 | command substitution／直接 append／function 只執行一次；保存、後續呼叫與 clone 不重跑歷史 |
| hardlink | 原 inode 不被 serialization 置換；兩路徑共用 overwrite／append；clone 分支資料隔離 |
| readEvents | 只為實際讀取發事件；stdin／substitution 讀取歸屬；unlink／同路徑 rebind 保留讀取當時 aliases |
| 錯誤 | unknown command 127、失敗 cd／redirect 1、parse error 2；錯誤走 stderr、後續工作階段可用 |
| 非零完成 | 完成的寫入與 assignment 保留，下一步可見 rc；不把一般失敗當取消交易 |
| clone／隔離 | `Object.assign(new VFS(), structuredClone(world))` 後繼續執行；`VFS.clone()` 保存 state 且隔離；不同 VFS 可交錯 |
| 交易回復 | 真 runtime 已改 state 後注入 executor failure，驗初始／已建立 shellState 回復；真 ShellJob.cancel 拋 AbortError 後丟棄完成但未接受的隔離 state |
| 遊戲政策 | main 危險 rm 阻擋、branch 可刪 home 內容但保留 home 節點；此列不與 native 比較 |

其中 24 組固定 oracle 案例覆蓋 `BASH_GAPS.json` 原先 12 個探針的語意範圍，
另加入跨次呼叫與錯誤復原。重點 persistent 案例會再於每一步之間 structuredClone。
這是指定能力的契約驗證，並非完整 GNU Bash conformance 認證。

### 來源身份與計數限制

- 案例由本專案獨立契約驗證工作撰寫，依使用者指定能力、`BASH_GAPS.json` 與既有
  VFS／Engine／worker 契約建立；不是 GNU 官方測試集，也不是 upstream just-bash 的測試集。
- 行為 oracle 是固定 executable 的 **GNU Bash 5.3.15(2)-release，x86_64-pc-cygwin**；
  受測對象是本專案 adapter 加正式 loader hook 後的 **just-bash@3.6.0 browser runtime**，
  不把這個結果冒充未修改 upstream 套件本身的認證。
- Node 的 63 tests 包含：24 個 native 子案例、1 個外層測試、24 個 adapter 對照、
  7 個逐步 structuredClone 重跑、7 個隔離／遊戲政策／交易案例。不是 63 個互相獨立的
  Bash 語法種類，亦不以通過數推算「全部 Bash 相容率」。
- 主代理回報的 headless 427 全過（含此 63 案）是主線整合結果；本報告本次只獨立執行
  此單一檔案，明確保留自己的命令結果與環境阻礙，不將主線回報替代本次實測。

## 原生語意與遊戲 intentional 差異

1. **取消交易**：原生 Bash 不會因 Ctrl+C 復原早已完成的檔案寫入。遊戲會終止隔離 Worker、
   丟棄回覆並回復 Engine transaction。新測試不以 native signal 測試假裝驗過遊戲取消。
   新案例用受控 Worker transport 對 structuredClone 的 VFS 執行真 `executeBash`，
   在完成、接受回覆之前呼叫真 `ShellJob.cancel()`，驗 Engine 回復以及下一次命令行為。
   這不等同真背景 Worker 中止驗收；真正 worker 取消、idle／clock／output／journal 回復
   由 `console-worker.test.mjs` 與 `round3-state-hardening.test.mjs` 覆蓋，新 runtime 接上後
   仍須跑那些整合測試。
2. **一般非零 rc**：不是取消；已完成寫入與 shell state 應提交，這一點直接與 native 比較。
3. **rm 與 VFS 政策**：main 的保護與 branch 保留 home 均為遊戲既有契約。原生 rm 不作
   這些政策的正確性裁判，也不在宿主執行 `rm -rf /`、`~` 或 `$HOME/*`。
4. **readEvents／動態內容**：GNU Bash 沒有遊戲任務事件；別名快照由既有 VFS 契約指定，
   不是要求 native 產生 readEvents。測試比較 hardlink 共享關係，不比較兩系統的 inode 數字。
5. **錯誤後續命令**：oracle 每步 `eval` 固定字串，讓 parser error 回傳 rc 2 後仍能接收下一步，
   對應逐次呼叫 API；不宣稱非互動 `bash -c` 遇語法錯誤後仍會繼續同一原始 script。

## 已修復差異（保留先前證據）

以下兩項是先前 3 個失敗 test 的來源。runtime owner 修復後，本次首輪獨立重跑中，
複合 pipeline 案例、單獨 pipeline cd 案例與 failed redirect 案例皆完整通過；
包括原先未跑到的下一次呼叫 cwd、`$?` 與未啟動 function 的狀態斷言。

### 1. Pipeline 的 cd 影響同次呼叫後續讀檔

固定 fixture：home 的 `cwd-marker.txt` 內容 `root\n`，`nested/cwd-marker.txt` 內容 `nested\n`。

```bash
cd nested | cat; cat cwd-marker.txt
```

- 原生：stdout `root\n`，stderr 空，rc 0。
- 修復前 adapter：stdout `nested\n`。同組複合案例亦失敗，所以對應兩個歷史失敗 test。
- 獨立的 `sub=$(cd nested; cat cwd-marker.txt); printf '%s\n' "$sub"; cat cwd-marker.txt`
  對照 **通過**（`nested\nroot\n`），將已觀察到的問題定位到 pipeline cd。
- 修復前斷言停在第一步 stdout，當時未據此宣稱下一次呼叫的 cwd 也錯；
  修復後同一案例已完整通過。此問題不是遊戲 intentional 政策差異。

### 2. Function redirect 的開檔失敗逸出成 Promise rejection

固定前提：`missing` 目錄不存在。失敗步驟中的核心固定指令：

```bash
value=before; bump() { value=changed; }; bump > missing/out.txt
```

- 原生：回傳 rc 1、stderr 有 `missing/out.txt: No such file or directory`；下次讀 `$?`
  是 1、`value` 仍為 `before`，表示 function 未啟動。
- 修復前 adapter：直接拋出 `/home/op/missing/out.txt: No such file or directory`，未產生契約要求的
  stdout／stderr／rc／readEvents result。當次 stack 從 `VFS.writeFile` 經 `BashVFS.writeFile`
  進入 upstream redirect 路徑。
- 一般 shell 開檔失敗應回傳非零結果，與 Engine 用 rejection 表示取消／交易失敗分開。
  此報告只描述邊界結果，不指定 runtime 的內部修法。

## 已排除的 oracle 環境阻礙

### 重現

修正前，原生 Bash 在案例執行前額外寫入以下 55 bytes（含換行），被既有 framing 收進第一步 stderr：

```text
bash.exe: warning: could not find /tmp, please create!
```

首輪僅最後兩組 native 案例受影響；它們的 native 子案例、外層測試，以及對應 adapter／clone
對照共產生 7 個失敗。原樣重跑後，21 個 native 子案例因同一警告失敗，外層與連帶對照合計
49 個失敗；這不是新觀察到的 49 個 runtime 語意缺陷。未過的比較在首步 stderr 即停止，
不得聲稱其後續步驟已通過。

### 原因與修正

原 setup 將 `TEMP`／`TMP` 指向每案執行後立即刪除的 fixture，讓可能跨程序存續的 MSYS
`/tmp` 映射依賴短命路徑。修正只將兩個變數改指既有穩定 base；`HOME`、cwd 與 fixture
清理方式不變。保留所有 stdout／stderr／rc 期望，不吞警告、不改 runtime、loader 或宿主 `/tmp`。

### 只讀探針與並行驗證

- 使用固定的 `cygpath -w /tmp`、`test -d /tmp`，並讀取 `$TMP`、`$HOME`、`$PWD` 的 Windows
  路徑。沒有 native redirect、mkdir、touch 或 rm，也不執行來源不明 script。
- 單程序結果：rc 0、stderr 空、`/tmp` 存在。此環境實際 `/tmp` 映射是
  `%LOCALAPPDATA%\Temp`，而設定的 `$TMP` 是 `%LOCALAPPDATA%\Temp\opencode`；兩者不可混稱。
  本次探針不宣稱重建了 MSYS 內部 shared mapping 的全部生命週期。
- 再啟動 **4 個同時存活的原生 Bash**：各自先輸出 ready，於 stdin read 等待；Node 確認
  四者都尚未退出後才同時放行固定只讀探針。四者皆 rc 0、stderr 空、`/tmp` 存在，
  `$TMP` 為穩定 base、HOME／cwd 分別為四個唯一 fixtures。
- Node 只建立／刪除新產生的 `ra-bash-env-probe-*`（1 個）與
  `ra-bash-env-parallel-*`（4 個）目錄。並行探針後四個 fixture 仍全空；清理後 base 的
  直接目錄項與執行前完全一致。未開啟或改寫 base 下其他使用者檔案；五個自有探針目錄全清理。
- 上述證據成立後才執行正式 loader 的 63 案：**63/63 通過，4.20 秒**。該輪 24 個 owned
  oracle fixtures 全部經原有 `finally` 清理並斷言不存在；沒有新增 conformance 案例。

### 防止再發

保留 test env 的穩定 TEMP/TMP 設定與原因註解；只將每案 HOME／cwd 用於隔離。原始 byte
比較與清理斷言繼續有效，未以 stderr normalization 掩蓋環境警告。

## 交叉驗證依據與執行紀錄

先讀取的獨立契約來源：`references/BASH_GAPS.json`、`demo-app/src/vfs.js`、
`demo-app/test/world.test.mjs`、`round3-shell-hardening.test.mjs`、
`round3-state-hardening.test.mjs`、`console-worker.test.mjs`，以及既有 worker 的
structuredClone 邊界。未依賴新 runtime 的實作細節。

- 2026-11-02：開始撰寫時 `src/shell/bash-runtime.js` 尚不存在；未生成假實作。
- 2026-11-02：`node --check` 通過；原生 oracle-only 執行通過 **21 組案例**
  （Node 顯示 22 tests，包含外層測試），0 失敗，2.39 秒。版本為
  `GNU bash, version 5.3.15(2)-release (x86_64-pc-cygwin)`。
- 該次原生執行建立 21 個 `ra-bash-session-*` 暫存 fixtures，全部於各案例 `finally`
  清理並斷言目錄不存在。未寫其他輸出檔、未 build。
- 2026-11-02：新增未知命令 stderr pipeline／redirect 案例，並將 redirect 失敗案例
  加強為 function 的 assignment 不得啟動後，重新 `node --check` 通過；原生 oracle
  **22 組全部通過**（Node 23 tests 含外層），0 失敗，2.25 秒。該次新建的 22 個
  owned Temp directories 亦全部清理。這是更新後單次結果，不與前次重複加總。
- 2026-11-02 主代理通知 runtime 與 loader 可用後，以指定 loader 首次執行完整測試：
  **59 tests，55 通過、4 失敗、0 skip，2.76 秒**。原生 22 組均通過。
  - 其中 2 個失敗為測試自身的相對路徑錯誤：persistent cwd 已正確切到 `nested`，測試卻以
    `world.stat('source.txt')` 檢查 home 的原 inode。修為建立 fixture 時記住絕對 `sourcePath`，
    不改 runtime、不降低 cwd／inode 斷言。
  - pipeline／substitution 組合案例：原生 `root\nouter:nested\nroot\n`；adapter
    `nested\nouter:nested\nnested\n`。新增兩組單獨的 pipeline cd／substitution cd 案例定位。
  - function 的失敗 redirect：原生回傳 `rc=1`、stderr 包含
    `missing/out.txt: No such file or directory`，後續 `$?` 為 1 且 `value=before`；adapter
    拋出 `/home/op/missing/out.txt: No such file or directory`，沒有回傳結果。
    當次 stack 經 `VFS.writeFile`、`BashVFS.writeFile`、just-bash 的 redirect 邏輯。
  - 首次執行已通過同 VFS persistent side effects、clone／hardlink／readEvents、initial／settled
    shellState 的失敗交易回復、ShellJob 取消回復。該次 22 個 owned Temp fixtures 全部清理。
- 修正測試絕對路徑並新增兩組定位 oracle 後，以相同 loader 指令重新執行完整檔案：
  **63 tests，60 通過、3 失敗、0 skip，3.01 秒**；24 組 native oracle 全通過。
  原先兩個測試自身的 cwd／inode 檢查失敗已消失；當時剩餘差異見上方歷史證據。
  24 個 owned Temp fixtures 全部清理。僅修改本測試與本文件，未改 runtime／loader／build，
  未另建 bundle，也未將前後兩輪測試數累加為驗收數。
- 2026-11-02，收到 runtime owner 修復通知後，獨立以正式 loader 原命令重跑未改動的 63 案：
  **56 通過、7 失敗、0 skip，3.89 秒**。先前 pipeline cwd／failed redirect 三案均通過；
  失敗來自上述 native `/tmp` 警告。
- 為確認環境警告是否仍存在，未修改程式再次執行完全相同指令：**14 通過、49 失敗、
  0 skip，3.50 秒**，同一警告仍在。兩輪的隔離、VFS.clone、遊戲 rm 政策及三個交易案例
  均通過；兩輪各 24 個 owned Temp fixtures 均清理。未再擴充案例、未 build。
- 2026-11-02，獲准診斷 oracle 環境後，完成上節單程序與四程序並行只讀探針，將 owner test
  的 native TEMP/TMP 改為穩定 base，再用原正式 loader 命令執行：**63/63 通過，0 失敗、
  0 skip、0 cancelled，4.20 秒**。此為最終單次結果，不累加前次執行數。僅修改 owner test
  的 env setup／註解與本報告，未 build、未修改 runtime／helper／其他測試或宿主全域設定。
