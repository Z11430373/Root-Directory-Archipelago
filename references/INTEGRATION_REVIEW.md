# 整合反方審查：just-bash／xterm 與遊戲狀態契約

日期：2026-11-02。最新狀態：**M1–M5 已結案，9/9 真瀏覽器回歸通過；最後 F2／clipboard 修正獲支持。** 詳見 §12–13；以下保留各輪當時的發現與反例，舊 Request Changes 不代表最新結論。

2026-11-03 主線補充：新輸入政策已改為兩種風格一律 Bash；下列「切終端升級」是當時歷史策略。舊紀錄逐筆 runtime／dispatch 固定與取消不改原檔的契約不變；主線新增「完全不切風格」與缺 tag 重播回歸，不將它們冒稱本反方代理當時的獨立驗收。

第一輪只讀 app／測試，僅寫入本文件；後續獲准新增 `demo-app/test/bash-replay-browser.test.mjs` 固化反例。已閱讀 `SHELL_ENGINES.md`、`TERMINAL_UI.md`、`LEARNING_GAMES.md`、`ADR-001-bash-runtime.md`，以及 Engine、VFS、Worker、controller、存檔與相關回歸測試。下列「已證實」和「待驗收」分開，未把研究報告的靜態能力當作整合通過。

## 給主代理的先行結論

支持 **just-bash 3.6.0 browser + 遊戲 VFS adapter + xterm 6.0.0 / fit 0.11.0** 作目前路線；反對以「可執行一次腳本」代替「可恢復的互動 session」。優先順序：

1. **P0：完整 shell state 的擷取／還原**，不能只帶回 `result.env`、重用 Bash instance，或每次重跑先前輸入。
2. **P0：VFS 與 shell state 同一交易**；clone、Worker、取消、分支、模式切換、渡海都要有明確所有權。
3. **P0：讀檔事件保留既有語意**；recursive grep 掃描未命中不能給發現。
4. **P0：舊 journal 按舊 runtime 重播**，新輸入使用已選定 runtime；視覺模式不能決定重播語意。
5. **P1：多行交給 parser；特殊遊戲命令不能在複合腳本中靜默成功；main rm 規則不能只靠 regex。**
6. **P1：xterm 使用顯式 draft／transcript 介面**，不保留 textarea/DOM 逐列假設；實測 CSP、組字、寬字、切換中執行／取消。

## 1. 已實驗：`exec()` 不提供互動 session

測試依賴是 npm 發行包 `just-bash@3.6.0` 的 `dist/bundle/browser.js`，以 Node 載入 browser entry，`defenseInDepth:false`，只用記憶體 FS；不是瀏覽器驗證，也不是 Node main entry。npm integrity：

`sha512-2COjEgcHdqKXeQSiNfPAHmpwQx4S8wATaIwog83g2t645U5tom6FED4CBBdr3M+0ioX4xZ26eODw3/nD6RQ6xw==`

### 實際輸出

| 實驗 | 實際結果 | 判斷 |
|---|---|---|
| 同一 Bash：第一次 `X=kept; f(){ echo function; }; shopt -s expand_aliases; alias ll="echo alias"; cd /; false`，第二次讀 X／呼叫 f、ll | 第一筆 env 有 X、PWD=/、rc=1；`getEnv().X` 不存在，`getCwd()` 仍 /home/op；第二筆 X unset、f/ll rc127 | instance 與 getters 不是執行後 state |
| 第一次 `LOCAL=private; export EXPORTED=visible; false`；第二次把前次 `env` 當 `exec(...,{env})`，執行 `echo "previous=$?"; env` | `previous=0`，且 `env` 顯示 `LOCAL=private` | 退出碼丟失；注意 `env` 的顯示本身不能證明 export 屬性，後續 child-shell 探針見 §9 |
| `X=changed; echo one >> journal.txt; exit 7` | rc=7，檔案為 `one\n`，回傳 env 沒有 X | 異常／exit 路徑的 result.env 甚至不是最終變數值 |

上游固定來源 `Bash.ts`（研究 SHA `7a2a7a57d46095bf6cc8195680a13f76f784681b`）的 `execInScope` 建立局部 `execState`；錯誤處理多處從 `this.state.env` 回結果，與上述實跑一致。公開 API 沒有 export/import session；npm `.d.ts` 的 state 標成 private。

### 必修契約與建議

- `executeBash(raw,vfs,options)` 需在**執行前**從 `vfs.shellState` 復原，在**同一次真實執行後**保存 top-level interpreter state；不能藉重跑歷史恢復。`echo x >> tally` 在兩次普通提交後只能寫一次。
- 建議固定版本的窄幅 upstream session hook：在 top-level 執行的 finally 擷取實際 `execState`，明確區分完成的非零 rc、`exit`／`errexit`、parser error、宿主 AbortError。使用私有內部結構時也要有版本 assertion 與契約測試。
- 只用 `result.env` 不合格；末尾追加 `declare -p`／`alias` 等 dump 也會被 `exit`、`set -e`、語法錯誤跳過，並可能污染 stdout、`$?`、`$_`。
- 至少保存：scalar env、exported/readonly 屬性、indexed/associative arrays、function AST、aliases 與 expand_aliases、set/shopt options、lastExitCode、`$_`、cwd/previousDir、位置參數／directory stack（凡 UI 宣稱支援者）。不能將所有 scalar 都當環境變數。
- 不能整包 clone interpreter context：AbortSignal、FS facade、closure、executionScope、FD streaming handle 不屬於可持久化 state。儲存格式應有 `schema`／runtime revision；Maps/Sets/AST 可 structuredClone，但 JSON journal／snapshot 若要保存須另有 codec。
- 每個 job 的 execution counters/budgets 應重設；不能把 commandCount／callDepth 當使用者 session 累積到無法執行。Shell 的 `$?`／export attrs 則不可重設。
- 使用 `rawScript:true`，保留 heredoc／多行文字縮排，不讓 SDK 的 script normalization 改使用者原文。

**驗收：** 分成至少兩次提交驗 `X=...`、`unset`、function、alias、array、`export -n`、`readonly`、`set -o pipefail`、`false`→`echo $?`、`cd`→`cd -`。另驗 `X=changed; exit 7` 和非零 rc 已完成寫檔仍保留；取消才回復整筆遊戲交易。

## 2. 已證實：把 session 放 `vfs.shellState` 需修 clone 與 rollback

目前 `src/vfs.js:192–198` 僅列舉既有欄位；`Engine.snapshotTransaction():201–206` 用 `world.clone()` 回復。已用記憶體實例實跑：

```text
vfs.shellState = {env:{X:'kept'}}; vfs.clone().shellState → undefined
交易前 {env:{X:'before'}} → 交易內改為 after 再 throw → rollback 後仍 after
```

問題不只是「忘記複製」：`Object.assign(world,snapshot)` 不會刪掉 snapshot 原本沒有的新增欄位。若初始 VFS 沒 shellState，第一個 Bash job 已寫入 shellState 後故事規則 throw，回復也可能殘留它。

**建議最小契約：**

- VFS 建構時一律 `shellState=null`；clone 對它 deep clone，確保 functions/arrays/maps 不共享可變參照。不要 shallow copy nested env。
- 不需要快照的暫存 adapter cache 放別處，不把含函式的 Bash instance 存進 VFS。
- Worker 收 `{raw,state,options}`，只在成功接收單一完成訊息時原子套用 VFS＋shellState；`flags` 維持 Engine 的同一 Set 參照。`exitCode !== 0` 不是宿主交易失敗。
- `finish` 必須 once-only／job id guarded；晚到的 message/error 不得在 cancel 後提交，也不得清除後一個 job 的 pending。
- 分支 clone 帶入 session；若採與檔案同樣的分支隔離，branch abandon/knowledge merge 回復 main 的 env/functions/aliases/cwd。這是合理遊戲政策，但需寫成測例。
- 渡海 `createWorld()` 會建立新 VFS；需明定是重新登入的新 shell，或顯式搬移 shellState 再 reconcile HOME/PWD。不能只因實作換物件而意外清掉變數。
- UI 模式切換只換 surface，不換 runtime 狀態；`vfs.cwd`、state.cwd/PWD 的權威來源要一致。legacy 的 `cd`、刪除目前目錄 fallback 之後，下次 Bash 不可跳回舊 cwd。
- generic Engine snapshot 對一般物件只是 shallow；若改把 shellState 放 Engine 本身，仍須專門深拷貝，不能以為換欄位位置自動修好。

**驗收：** 初次 Bash 成功後在 `drain` 注入失敗，shellState 恢復 null；已有 env/function/array 時注入故障或 Ctrl+C，深層值完全回復；Worker→Worker 與 direct→Worker 結果一致；分支改 X、解鏈、cd 後退出能回復 main；取消後下一個 job 能成功且舊回覆不覆蓋它。

## 3. 讀檔事件不是 FS I/O 計數，也不完全等於可見 stdout

既有契約在 `src/shell/commands.js:139–176`、`test/world.test.mjs:132–142`。已實跑：

| 命令 | 既有 reads |
|---|---|
| `grep -r NO_SUCH_KEY ~` | `[]` |
| `grep absent handbook.md` | `['/home/op/handbook.md']`（具名檔即使未命中也算） |
| `grep -rq KEY-FRAG ~` | 僅 `/home/op/notes/.draft.txt`（沒有 stdout 仍算命中） |
| `grep -rc NO_SUCH_KEY ~` | `[]`（印出 0 不能當該檔匹配） |

因此「FS.readFile 一律發事件」與「有 stdout 才發事件」**兩者都錯**。`stat()` 為計算 size 也可能讀文字；`cp`、source、展開或新工具的內部讀取不應默認成故事發現。先保住既有契約，新指令另定事件政策。

**建議：** 維持舊讀檔工具 adapter 的明確事件接點，或在真正命令執行中回報 `{path,same_inode,reason}`；recursive grep 要直接拿每檔是否匹配，不從混合 stdout 猜路徑、也不二次執行 grep。於讀取／匹配當下保存 hard-link 別名，不能在腳本結尾再 `sameInodePaths(path)`。不要將整個自製 parser 作為所有指令 fallback；可重用 command handler 而交 just-bash 處理語法。

**驗收：** 上表、`-h/-H/-l/-q/-c/-v/-m0`、stdin、檔名含冒號／換行、redirect、pipeline，以及 `test/round3-shell-hardening.test.mjs:233–270` 的同名 unlink/relink 雙讀事件；僅 `ls -l` 不應產生發現。針對舊 golden path 比較完整 commit 序列，不只 summary。

## 4. 遊戲指令、main rm 與多行輸入

### 遊戲指令

`Engine.execute():743–758` 依整行第一個 whitespace token 攔特殊命令；`flow.yaml` 規則多用 `^...$`。`echo prefix; systemctl start lamp` 送入 shell 後，Engine 的整行 cmd 規則不會開口令提示。`help ; echo tail` 又可能整行被 help 吃掉。`git checkout ...; echo tail` 不能假裝真的建立可繼續執行的虛擬分支。

必須選明確政策：**目前以遊戲命令為完整 top-level 提交邊界最容易保留 journal／時間／互動契約。** 在複合腳本、function、command substitution、source 裡遇到這些命令應明確回不支援，不得 no-op rc0。若要支援，需 ordered command events＋Worker↔Engine 協定；只在腳本跑完後排一批 events，無法讓 `ssh`／branch／口令正確影響同腳本後半段。

### main rm

`Engine.execute():764–765` 的 regex 只是劇情入口；真正批次防護在 `commands.js:377–395` 與 `exec.js:115–120`（展開前 glob 意圖）。新 runtime 直接用 upstream rm 會漏此規則。

- 應在 rm dispatch 層整批 canonicalize、先檢查再刪；含 `/`、home、祖先、`.`／`..` 與 `~/*`／`$HOME/*` 的既有 main 保護都要保留。
- glob 展開後只看 argv，會失去 `$HOME/*` 是危險整批展開的資訊。要保留 AST／word 的來源資訊，或採覆蓋此規則的明確策略。
- 測 `echo ok; rm -rf ~`、`x=$HOME; rm -rf "$x"`、function 裡 rm、`command rm`、`env rm`、`/bin/rm`、引用／跳脫的 rm 名稱、root/home symlink；任一路徑不得避過同一模擬政策。
- branch 仍可刪檔，保留 root/home 節點；main 與 branch 共享 flags 但不共享可變 inode graph。

### 多行

實跑既有 `commandLines()`：`for x in a b; do\necho "$x"\ndone` 被拆三筆；heredoc 亦被拆三筆。新 parser 再好也無法修前端先拆壞的語法。

新 Bash 提交要保存完整 script 為**一筆** journal/input transaction（保留新行和縮排）；或以真正 parser 的完整 statement 邊界切分，不能繼續只掃 quotes。舊 journal 的 raw 邊界原樣重播；不能在升級時重新切一次。

## 5. 主代理新提案：每筆 `shell:'legacy'|'bash'`

**支持，且是必要相容條件。** 當前 `main.js:159–160` 由 UI style 選 executor、`:283–288` 在 replay 用同一 configureRunner，會令完全相同舊紀錄改用新語意。RA1 不含任意檔案與 shell，不能靠 RA1 修復。

最小正確契約：

1. `input` 缺 `shell` 視為 legacy；明確的未知值拒絕，不 silently 當 bash。`checkJournal()` 與所有 append 分支同步；hint/skip/secret cancel 等特殊路徑也須一致。
2. replay 按該 step 指定 executor，不按畫面；新 live input 用目前產品選定 backend。輸入屬 nickname/choice/game command 時仍交原 Engine 分派，不應另重播成 shell。
3. legacy executor 必須保留既有 `vfs.shellState`，不可不小心覆寫 null；legacy 改 cwd 後要 reconcile Bash state。模式切換不能造成 Bash 變數「等切回終端才復活」。
4. `baseSave` 匯入從沒有 shell state 的明確初態開始；journal 的 Bash steps 從那裡逐筆真實重建一次。只在續玩時重播到**新建候選世界**；普通 exec 絕不能為了恢復 state 重播舊腳本到當前 FS。
5. 只 seal/head 相等不夠：無發現、無任務的 `echo text > private.txt` 或 `X=value` 不會改鏈尾。新測試須比較 VFS nodes/inodes、cwd、shellState、flags 和完整 commits。
6. `bash` 應代表固定 adapter 語意版本；依賴或讀檔政策日後改版時新增 runtime revision（如 bash-v1），不能讓同一 tag 永遠漂移。至少本次鎖依賴＋adapter schema 並記此升級規則。
7. `date`、`$RANDOM`、`SECONDS`、隨機工具／mtime 若可影響寫檔或任務，就要固定 seed／虛擬時間或記錄決定性資料；只有 runtime tag 無法保證純 raw replay。`sleep` 不能偷偷成為真實 wall-clock 故事時間來源。

**必測混合紀錄：** legacy 舊記錄→Bash 設 X/function→模式切換→新輸入→reload；direct/Worker replay 各一次，結果完全一致。保留未知 runtime／重播取消／鏈尾不符時的原始 envelope 與既有救援流程。

## 6. xterm 新介面的盲點與驗收

支持 `XtermConsoleView.getDraft/setDraft`、`terminal.snapshot/restore`、純 `complete({text,cursor})`，controller 唯一負責 Enter 後的 echo。至少要補明確定義：

- draft 是 `{text,cursor}` 還是也含 selection anchor/end、history draft／reverse-search state？cursor 統一採 UTF-16 offset 與 JS slice 相容，但移動／Backspace 要按 grapheme，繪製按 xterm 同一 Unicode width provider 計欄，不能用 `.length` 或 `codePoint>255`。
- `setDraft()` 不執行、不新增 history，不把 xterm 內部 IME textarea 當文字權威來源。中文 compositionend 的字串只進 line editor 一次；Enter 確認候選不送出命令。
- completion 的 candidates 顯示會插入輸出；必須 erase editor→write candidates→redraw，不能覆寫 prompt 或令 cursor 偏移。quoted path／cursor 中間插入後，cursor 不可落在 surrogate pair 中間。
- prompt/editor 裝飾不屬 transcript；submit 時 editor 清除畫面，controller echo 一次。secret draft 在 mode switch、snapshot、history、錯誤 echo 中均不能被還原為明文。
- transcript snapshot 是原始輸出事件還是畫面序列化需講清楚。xterm 的 `buffer.translateToString()` 會混入軟換行／裁切，不能用來保存原始 RA1 字串；也不能拿 DOM 子節點還原 ANSI buffer。跨模式最小可用的是共用有界 `{text,kind}` 輸出紀錄，xterm 可重放 ANSI，群島模式有明確純文字呈現政策。
- `main.js:147–151,232–234,621–622` 的 childNodes 搬移／`lastElementChild.id` 均須改資料介面。存檔碼保存原始值與獨立複製入口，不依 xterm 視覺折行或 DOM 列識別。
- xterm.write 非同步：snapshot／dispose 前要定義 flush 或以 controller transcript 為權威。避免寫入 callback 在 dispose 後重畫 editor；restore 不重觸發 Engine、history、journal。
- 切換途中若 job 執行中，busy 狀態、取消功能和 draft 要延續；old view dispose 不能把仍執行的 Engine/job 清掉，也不能留第二個 onData／ResizeObserver。
- CSP 必須在**最終 file:// HTML** 驗，xterm 動態 style 不在單一 CSS hash 內。不要為方便開放 script unsafe-eval／network；若調 style CSP，需確認實際 style element/attribute 機制與 scope。新增 CSS 檔不等於動態樣式已授權。
- 使用 xterm `hasSelection()` 判 Ctrl+C copy vs cancel；busy 仍需可送 Ctrl+C；F2/Shift+Tab 可離開，不能只有 onData 但吞掉原生焦點操作。

**瀏覽器條件：** 0 外部請求／0 CSP violation；ANSI CR/BS/SGR/CSI；窄視窗長行＋中英／emoji／combining marks 中間刪改；真實 CJK IME（合成 keydown 只能驗 guard）；theme/font/resize；貼上不立即執行；模式往返保留 text/cursor/transcript/head/cwd/state；save 原字串可複製匯入；執行中切換後 Ctrl+C 回復整筆。

## 7. 宿主邊界與替代 runtime 的裁決

browser entry、記憶體 VFS、未提供 fetch/network/JS/python／宿主命令 callback 是可支持的隔離基礎。未知外部名稱／ELF／Windows exe 回明確 127/126；不得接 host `child_process`、PowerShell、node-pty 或真磁碟以補相容性。VFS 內 shell script 經 interpreter 執行是另一種允許能力，不能同未知實體程式混淆。

`commands` allowlist 只約束 registry 命令，不等於禁止 shell builtins／source／eval／bash -c，也不保證所有別名路徑受限；應檢查 VFS 路徑、custom command 串接、命令 wrapper。同時驗證有限輸出／展開／loop／FS 容量與可終止 Worker；不要在主 thread 跑不可中斷 loop。

目前**沒有更適合本專案的替代品實跑證據**。既有 bahamas10/bash-wasm 來源證據明確缺管線／fork/exec；GameShell 依賴主機 shell 與真 FS；termgame 無 Bash parser。它們沒有同時解決離線單 HTML、目前 VFS inode/旗標、精確事件與 journal 重播，因此不足以推翻 just-bash 候選。支持此路線的條件是上述 session／事件／重播測試過關，不是名稱像 Bash。

## 8. 執行／暫存紀錄

- 唯一研究目錄：`C:\Users\user\AppData\Local\Temp\opencode\ra-integration-review-aa909a94fd4549b589a3ee75fff65c7b`。
- 首次 `npm` 被本機 PowerShell 的 npm.ps1 execution policy 擋下；沒有更改 policy。改呼叫 `npm.cmd install --prefix <study> --cache <study>\npm-cache --ignore-scripts --no-audit --no-fund --omit=optional just-bash@3.6.0` 成功，37 packages。
- 沒有全域安裝／PATH 或 Git config 變更；npm cache 同樣在自己的研究根。依賴 lifecycle scripts 未執行。
- 自寫探針透過 stdin 傳 Node，只 import 本案來源或上述 browser entry，修改各自記憶體 VFS；沒有寫 app、build、package、dist、測試。
- 依賴副本清理：**已完成。** 先核對根目錄僅有 `node_modules,npm-cache,package-lock.json,package.json,runtime-review.mjs` 且套件身份 `just-bash@3.6.0`。PowerShell `Remove-Item` 在 npm cache 的長檔名發生 DirectoryNotFoundException，改用 Node `fs.rmSync(root,{recursive:true,force:true})` 僅刪同一研究根，`fs.existsSync(root)` 回 `false`。依賴、專用 npm cache 與實驗 bundle 均已移除。
- 新 engine／xterm 模組：等待主代理完成通知再交叉審查；本文件目前不是新程式核准。

## 9. 新模組首輪交叉探針（實作仍在變動）

主代理通知的策略已納入審查：VFS constructor `shellState=null`、clone deep copy；每筆 journal runtime tag，envelope 另保存 session backend；新群島 session legacy、切終端後單向升級 Bash；跨畫面維持已升級 session。

### 執行方式／快照

在自己的 §8 Temp 目錄，以 esbuild `write` 僅輸出 `runtime-review.mjs`，套用 agent 提供的 `patchBashBrowserSource`，再 import 實際 `executeBash`。app 所有來源保持唯讀。建置來源 `src/shell/bash-runtime.js` 當時 SHA-256：`4acdddca98f559f02223baee0dc93c3c436678b47f3993cf22c04ecd3ced3177`。觀察到 agent 同時加入 stdin-redirection command frame hook，因此以本次 bundle 的實際輸出為準，不把稍早讀到的檔案行號當固定版本。

### P0：還原 base state 令 nested shell 繼承不應繼承的狀態（已重現）

第一筆：

```bash
LOCAL=old; a=(secret); f(){ echo function-leaked; }; alias aa="echo alias-leaked"; set -o pipefail
```

第二筆：

```bash
bash -c 'echo ${LOCAL-unset}:${a[0]-unset}; f; aa; set -o | grep pipefail'
```

實際輸出：

```text
old:secret
function-leaked
alias-leaked
pipefail        on
```

未 export 的 scalar、array、function、alias 和未 export SHELLOPTS 的 pipefail 都洩入 child shell。`snapshot.state.exportedVars` **沒有 LOCAL**；不能只修 export Set。另測第一筆保存 LOCAL=old 後，第二筆 `unset LOCAL; bash -c 'echo ${LOCAL-unset}'` 仍印 `old`；`env -i bash -c 'echo ${LOCAL-unset}; f'` 印 `unset` 後仍執行 `f`。

**因果判斷：** adapter 將持久狀態填入 Bash 的 base `.state`；上游遞迴 exec 的初始化仍從此 base 拷貝資料，使 child env 過濾／unset 被 base 覆蓋。不能用「只有 depth0 保存」證明 child 隔離正確。

**建議：** session 注入只作用於 top-level exec 的局部 state，child `bash/sh` 依上游 child-shell 起始契約建立乾淨 defaults、只接 exports 與允許的 exported functions；同 shell 的 `source/eval` 則保留當前 state。不要把所有 recursive exec 一律 reset，否則會破壞 env/time/timeout wrapper。新增上述跨提交 child 測試，以及同一提交內新賦值、unset、function/array 隔離。

**校正首輪推論：** 先前以 `env` 印出 LOCAL 推斷 naive result.env 匯回會造成 export 洩漏不夠精確。後續直接 upstream `exec(...,{env:structuredClone(result.env)})` 的 child 探針是 `unset:visible`；真正已證實的洩漏是**新 adapter 恢復 `.state` 後的 child shell**。因此問題定位以此節為準。

### P0：journal 仍非決定性（已重現）

相同初態分別跑一次 `echo $RANDOM > random.txt`，產物為 `17560\n` 與 `28851\n`。沒有故事事件的寫檔不改 commit head，因此既有 head 比對抓不到此差異。純 upstream 三個新實例的 `$RANDOM` 也不同；`date +%s` 來自 wall clock。

需 host-selected deterministic clock/PRNG state，在 transaction/branch/Worker/restore 一起保存；或明確拒絕尚不能決定性重播的命令／展開。只加入 journal runtime tag 不能結案。

### P1：遊戲命令仍 silently no-op（已重現）

實際 Engine 注入新 executor 後，`echo before; systemctl start lamp; echo after` 回 rc0、stdout=`before\nafter\n`、`engine.inputMode=null`。應明確拒絕非 top-level 遊戲命令，或實作可依序暫停的遊戲 bridge。這不是原生 Bash 要求，而是本案 UI 宣稱可輸入這些命令後不能偽成功。

### P1：多行互動未交給完整 parser（已重現）

`needsContinuation('for x in a b; do')`、`needsContinuation('if true; then')`、`needsContinuation('cat <<EOF')` 均 false；`ConsoleLineEditor.setDraft('for x in a b; do'); input('\r')` 立即呼叫 submit。當時 main `submitConsole` 仍有 `commandLines(raw)`。完整 script 貼上與逐行 Enter 都須驗，不能只跑單行 `for ...; done`。

### 已通過的窄範圍探針

- VFS 新版 clone 深複製 nested Map：branch 改 env，main 保持原值。
- `cat < handbook.md` 回正確具名讀事件；recursive grep 未命中 `[]`，直接具名 grep 未命中仍有事件。
- main `rm -rf ~` 經 `command rm`、`env rm`、`bash -c`、function 皆 rc1、節點數無減少；`/bin/rm` rc127。
- `readonly`、associative array、前次 rc 和 `set -e` 提前退出保存的變數通過。
- UTF-8 `printf '中文🙂' | wc -c` 為 `10\n`。先前直接 PowerShell stdin 含非 ASCII 字面值會受主機管道編碼影響，改用 JS Unicode escapes 建立相同 script 後才採信結果。
- 新 adapter `head -n 0 handbook.md` 不發事件，**這是相對 legacy 的刻意語意變更**。legacy journal 應繼續用原 executor，bash revision 的事件契約需明記，勿稱所有既有讀事件完全未變。

### 主代理接合提案的剩餘條件

- 已看到 main 保存 `envelope.shell`，重播逐筆選 executor，支持此修正。必須驗「終端建 function→切群島→reload 群島→呼叫 function」；只按目前畫面恢復 executor 會退回 legacy。
- 渡海保留 session 可接受；`PWD`／cwd 要以新章權威值 reconcile。保留舊 `OLDPWD`、`cd -` 在前章路徑缺席時明確失敗也是可接受政策。`HOME` 與 directoryStack 若跨章不同需同樣決策。
- runtime patch 使用固定來源 needle 且 mismatch 先拒絕執行，方向可支持；應確認 browser Worker 和所有 headless replay 都走同一 patch。新加 command frame hook 也需更新 pinned hook 文字／失敗條件說明。

## 10. 主線增量唯讀審查（2026-11-02）

**當時結論：Request changes。** 本輪新增三項 P1 接合缺陷、一項 P2 測試接線缺陷。**後續 M1–M4 原重現條件已修正並獨立複驗通過（§11）；前置階段 M5 亦已修正，正式瀏覽器回歸與最終狀態見 §12。** §9 已交引擎／終端 owner 的 child、PRNG、pipeline、redirect、multiline、focus 問題不在本輪重新判定；舊節是當時快照，不能當作目前修正狀態。

### 10.1 新發現摘要

| ID | 等級 | 位置（本輪來源行號） | 已證實的問題 |
|---|---|---|---|
| M1 | P1 | `demo-app/src/main.js:163–183,319–326`；`src/engine/index.js:641–642,770` | 重播已選定的 per-step executor 可被 F2 的 `configureRunner()` 覆寫；實跑 Bash、journal 仍 legacy、head 卻相同 |
| M2 | P1 | `demo-app/src/engine/index.js:744–762` | `legacy` tag 只恢復 shell executor，沒有恢復舊 Engine 的故事前綴分派；同一舊 journal 產生不同檔案但驗鏈通過 |
| M3 | P1 | `demo-app/src/main.js:153,300–333,652–657` | 群島按「繼續」未建立跨畫面 busy／取消狀態；重播中切終端顯示 ready，pre-Worker Ctrl+C 未取消，仍完成並寫回 envelope |
| M4 | P2 | `demo-app/test/bash-engine.test.mjs:13`；`src/engine/index.js:42–50` | 四條 Bash golden 的 constructor injection 被忽略，測試其實跑 legacy；真正注入 Bash 的獨立探針則四條全過 |

### 10.2 M1：per-step runtime 在 async feed 中被切畫面改寫

**合法 fixture／預期：** 在 headless Engine 依序 `start()`、`feed('reviewqa')`、`feed('printf replay-race > leaked.txt',31)`，最後 `S.seal(engine.save)`。建 envelope：

```js
{
  version: 1, runMode: 'self', shell: 'legacy',
  save: engine.save, baseSave: null,
  journal: [
    {type:'input', raw:'reviewqa', dt:0, shell:'legacy'},
    {type:'input', raw:'printf replay-race > leaked.txt', dt:31, shell:'legacy'}
  ]
}
```

此 fixture 通過現有 shape/journal 契約。legacy 不支援 `printf`，但先建立重導向目的檔，所以預期 rc127、`leaked.txt === ''`；30 秒 idle hint 形成 head **`5bc164f4`**。這是為精準觸發合法 async 邊界製作的 envelope，不宣稱目前 UI 自動產生的每筆 input 都帶 `dt:31`。

**重現步驟：**

1. 隔離瀏覽器 context，init script 將 fixture 存入 `ra.demo.save.v1`，preferences 設 islands。
2. 包裝 `crypto.subtle.digest`：第一次輸入 bytes 包含 `"kind":"hint"` 時，先 await 一個由探針控制的 Promise，再呼叫原 digest。此閘只延長原本存在的非同步等待，不改 digest 結果。
3. 點「繼續」，等此閘啟動。此時 replay 已 `configureRunner('legacy')`，正停在該步 `engine.feed(raw,31)` 的 `advance → idle hint → commit`，尚未進 shell。
4. 按 F2 切終端，再釋放 digest。旁觀 Worker `postMessage` 及成功回覆。

**實測：**

```text
Worker request: {raw:"printf replay-race > leaked.txt", shell:"bash"}
Worker result:  rc=0, file="replay-race"
UI head:        5bc164f4
stored journal: 第二筆仍 shell:"legacy"
stored backend: bash
page errors / CSP violations: [] / []
```

新檔內容已和 legacy 預期不同，恢復流程仍通過 head 比對並由後續 tick 自動存檔。`feedInput()` 先保存 `mode` 只能固定記錄欄位，不能固定 Engine 稍後才讀的可變 `shellExecutor`。

**修正方向／驗收：** executor 與 runtime/dispatch revision 應是單次 feed 的不可變 context，在任何 await 前綁定並一路傳入；畫面切換只改後續提交的 session backend。不能只在 `engine.feed()` 呼叫前再 assign 一次。以相同閘驗證 F2 前後該步仍 legacy、rc127、空檔、journal 與實跑一致；下一筆新輸入才用已升級 Bash。另驗中途切入終端又回群島不會在 replay 結束時意外把 session backend 降回 legacy。

### 10.3 M2：legacy executor 未版本化 Engine dispatch

將 Git HEAD 的舊 Engine 原始碼載入記憶體（只將相對 import 改為目前模組的絕對 URL），和工作樹 Engine 各執行：

```js
await engine.start();
await engine.feed('reviewqa');
await engine.feed('help ; echo surprise > unexpected.txt');
```

兩者均使用 legacy executor。結果：

| Engine dispatch | `unexpected.txt` | head | commits |
|---|---|---|---|
| 舊 HEAD | 不存在 | `e10de7e4` | 與新者完全相同 |
| 新 standalone 分派 | 存在 | `e10de7e4` | 與舊者完全相同 |

舊 Engine 見第一個字 `help` 即處理整筆；新 Engine 因 `;` 把整筆交給 legacy shell，因而多執行寫檔。這與 §9 的 Bash 複合故事命令問題不同：**即使新 Bash 的行為全部修好，舊 journal 仍被新的 Engine 分派重新解讀。**

**驗收：** legacy／缺 tag 的歷史輸入須涵蓋舊 Engine dispatch 的結果，不只舊 parser/executor。可採與 input revision 綁定的 dispatch，或明確版本化舊紀錄並拒絕無法相容的重播，保留原 envelope；不得以相同 head 宣告完整還原。上述寫檔反例的 VFS、對話及 commits 都須對齊舊版 oracle。

### 10.4 M3：群島續玩不在 operation busy／取消生命週期內

沿用 M1 的合法 fixture 與 digest 閘。在群島點繼續、閘內按 F2，觀察：

```text
.console-session[data-state] = ready
Worker requests             = []
```

接著 Ctrl+C，再釋放閘。**仍收到該步 Worker request/reply，head 變為 `5bc164f4`，原 envelope 的 backend 由 legacy 寫成 bash，journal 追加 advance。** 本次與不按 Ctrl+C 的結果相同。

原因分成兩層：

- welcome button 直接 enqueue `resumeLocal()`，不設 `islandSubmitting`；F2 mount 只看 `consoleSubmitting || islandSubmitting`，故標 ready。這不是 xterm focus／multiline 問題。
- `cancelConsole()` 在上述旗標均 false 且尚無 `shellJob.pending` 時，只當作清草稿；replay 的取消檢查也被 `consoleSubmitting` 條件限制。僅 Worker 可取消不足以涵蓋 replay 的 digest／fromSave 等等待階段。

**驗收：** 用獨立 replay/import operation token 或統一 busy state 覆蓋整個操作；任何入口、任何畫面都可取消。對此同一 pre-Worker 閘按 Ctrl+C 後不得再派該步 Worker、不得發布候選 Engine／寫回原 envelope，並回到可操作入口；至少在 await 返回後、派 Worker 前、重播成功發布前檢查取消。另驗 Worker 已派出時、兩步之間及晚到回覆。

**已通過的對照，不應回退：** 一般 Bash 提交 `TOKEN=cancelled; printf written > cancelled.txt`，攔住真正 Worker 的成功 message 不交給 ShellJob：

- 群島發起 → F2 到終端：state=`running`，Ctrl+C 後回 ready。
- 終端發起 → 透過現有模式 select 的 change handler 切群島：textarea disabled，Ctrl+C 後恢復可輸入。此方向專驗 main 切畫面接合，未把 F2/focus owner 工作納入核准。
- 兩方向取消皆 terminate=1、revokeObjectURL=1，journal 不含取消輸入。
- 再手動呼叫已捕獲的晚到 `onmessage` callback，沒有二次提交；後續 `printf "%s\n" "${TOKEN-unset}"; cat cancelled.txt` 為 stdout=`unset\n`、rc1、檔案不存在。證明本輪 ShellJob settled guard 與一般 Engine rollback 接合有效。

### 10.5 M4：golden 測試的 executor 未注入

```js
new Engine({shellExecutor: executeBash}).shellExecutor === executeBash
// false
```

constructor 只接 `seed/event/mode/onOutput`，再固定 `this.shellExecutor=executeShell`。四條 golden 的通過原本只能證明 legacy；world/rollback/branch 測試中直接呼叫 `executeBash()` 的部分不受此問題影響，mixed 測試則有明確指派 executor，亦不受影響。

**本輪補做真實對照（僅暫時探針，未改 test）：** 每個 Engine 建立後明確指派包裝 `executeBash` 的 executor 並計數，再執行原 walkthrough、比較原測試的 says／commits／summary。

| walkthrough | 實際 Bash executor 呼叫數 | says／commits／summary |
|---|---:|---|
| digger | 21 | 全過 |
| newbie | 11 | 全過 |
| edge | 21 | 全過 |
| timeup | 9 | 全過 |

**驗收：** 修正測試接線或 constructor 契約，加入確實執行 executor 的斷言；不可讓未接受的 option 再造成假覆蓋。這是 P2 驗證缺口，**不是宣稱真正 Bash golden 已失敗**。

### 10.6 已驗證：共用 hook、shim 與動態 CSP

**browser／Node hook：**

- `build.mjs:87–93` 的 Worker/main esbuild 與 `test/helpers/bash-loader.mjs:11–15` 都呼叫 `patchBashBrowserSource()`；Node URL regex 在本機 Windows file URL 下實際命中。
- browser `node:zlib` alias 指向 `src/shell/browser-zlib.js`；Node loader 僅對 just-bash/browser 的同名 import 指向相同檔案。Node 測試檔自己 import 原生 zlib 作 oracle 是刻意的，不代表 just-bash import 漏接。
- 另用當下來源、production 相同參數將 Worker 建於記憶體；瀏覽器每筆重新建 Worker、structured-clone 回傳 state，Node 則透過 `--import ./test/helpers/register-bash.mjs`。兩端同初態與 options，執行 `KEEP=retained; f(){ printf "%s\n" "$KEEP"; }; false`，再 `printf "previous:%s\n" "$?"; f; printf "%s\n" "$PWD"`。
- 兩端第一筆 rc1，第二筆皆 rc0、stdout=`previous:1\nretained\n/home/op\n`，完整 `{stdout,stderr,rc,reads,readEvents}` deepEqual；browser state version=`3.6.0`、KEEP=`retained`。來源 hash 在探針前後相同。這是 entry/session-hook 的窄範圍同路徑證據，未重新審 owner 的全部 Bash 語意。

直接跑 Node、跳過會寫 build 產物的 npm pretest：

```text
node --import ./test/helpers/register-bash.mjs --test --test-name-pattern="mixed legacy|sandbox restores|Browser gzip" test/bash-engine.test.mjs test/browser-zlib.test.mjs
tests 3 / pass 3 / fail 0
```

這三項涵蓋 mixed replay、branch session 還原，以及 shim 的 concatenated gzip／輸出上限／損毀與截斷／三種壓縮等級。它們沒有 UI async 切換，因此不能否證 M1/M3。

**動態 CSP（真實 Chrome）：**

- 操作 `game font large`、`game theme contrast`、resize 到 700×650，透過模式偏好切換重建 xterm，再 `game theme dark`、`game font small`、resize 到 1100×800。
- 正常操作 CSP violations=0、console/page errors=0；請求只有本次 file HTML，沒有外部網路請求。
- 存在一個 hash 授權的靜態 style（無 nonce），及三個位於 `.xterm-screen` 的 nonce style；切換後未累積舊 xterm style。
- `document.createElement` 的函式身份與 own-property 狀態都恢復為啟動前值。CSP 保持 script hash、style hash+nonce、worker-src blob、connect-src none，沒有 unsafe-inline／unsafe-eval。
- **負對照：** xterm open 完成後用 `document.createElement('style')` 加入無 nonce 的 `#review-csp-probe{color:rgb(1,2,3)!important}`。nonce 空、sheet 不存在、computed color 未變為目標色，產生預期唯一 `style-src-elem / inline` violation。證明 factory 沒有永久替一般 style 發 nonce。
- 授權範圍準確描述為「同步 `term.open()` 期間建立的 style」，不是任意未來節點。未將焦點／F2 可達性混作 CSP 結論。

### 10.7 來源身份、方法邊界與清理

- 舊 Engine oracle：Git HEAD `fb551513e59503c0cb339dcc44e71630b6da64f9`；檔案 SHA-256 `d4139d67d403d216b2eb7e8a6b7ca3467cee8358d588c102ea97f4d42247a496`。
- 主線 main SHA-256（建置與結束核對相同）：`16a88ebb550111e0a4a62fa5ce531632c0fe4cfda08e019a25d5577bc01a8413`。
- 工作樹 Engine SHA-256：`c38c2ad1069109a2721d7ca0be18ee42dd6827ff3fe444a2ba21158bf2280f81`。
- 本輪 browser snapshot HTML SHA-256：`a1c209b53c1090449299633b521aa970f00bd03cd466fe49ab2124cd439c2f8d`。
- 另外當下新建的 hook parity Worker：SHA-256 `d88283aae8fb59bb4ff247984b460ef23172953a310c79c9b88ad6615ba28fd1`；runtime source `ab37e696e3c7a544155d22ade14fee77ba14575cbd00c1edeac3b8a5277116ce`；patched upstream `62f3396eeea3884a1d759a491652aa8679fefff1bf1d9556928ae7ba6c393dfc`；shim `1dcddf297bd8af057bc618db0b51f7a4a37d55ce25e3bd1d32b013d9a3943c0a`。
- 正式 `dist` 一度比 main 舊，不用它判定新 F2/replay 結果。自己的 Temp 以 esbuild `write:false`、同 production hook/alias/defines 打包新 Worker/main，沿用已有 dist CSS/nonce、替換 script 並重算 CSP script hash；只寫 Temp `review.html`。因此本輪 CSP 證據針對該 CSS＋新 JS 快照，並非宣稱正式 dist 已由本代理重建。
- Playwright `1.64.1` 唯讀使用既有 `ra-browser-tools`，Chrome 使用既有安裝；各探針均獨立 context，`finally` 關閉 browser。localStorage 注入、digest 閘與 Worker 回覆閘只存在於這些隔離測試頁。
- app／test／其他代理來源保持唯讀；沒有執行 npm install、npm pretest、build main()、commit 或 push。唯一專案寫入為本報告。
- 本輪自有 Temp：`C:\Users\user\AppData\Local\Temp\opencode\ra-main-review-FX3KHD`。**已清理。** 刪除前核對僅有 `review.html,browser-review.mjs,csp-review.mjs,cancel-review.mjs,hook-parity.mjs`；Node `fs.rmSync` 僅刪該根目錄，`existsSync` 回 `false`。既有 `ra-browser-tools` 未改動。報告 `git diff --check` 通過。

## 11. M1–M4 修正後獨立複驗（2026-11-02）

**當時結論：原 M1–M4 反例通過；發現一項 P1（M5）。後續 M5 已修正並經持久回歸複驗通過，見 §12。** M5 位於更早的 `baseSave` 驗鏈／Engine 尚未建立階段，並非原先 feed 內可變 executor 或 Ctrl+C 缺漏的重報。本節保留修正前證據。

### 11.1 修正複驗結果

| 項目 | 獨立檢查 | 結果 |
|---|---|---|
| M1 原 digest 閘 | `reviewqa` → legacy `printf replay-race > leaked.txt`、dt31；在 `hint` digest 閘按 F2 | 通過：重播維持原 in-process legacy，零 replay Worker；`leaked.txt` 空，head `5bc164f4`；後續新輸入實跑 Bash 且 tag/bash backend 正確 |
| M1 中途往返 | 同閘 F2 到終端，再以模式 select change 回群島才釋放 | 通過：群島輸入 disabled；重播仍 legacy，下一筆 Worker/bash，envelope 保留 bash，沒有降級 |
| M2 舊分派 | 舊固定 Git oracle vs 新預設 legacy Engine，原 `help ; echo surprise > unexpected.txt` 反例 | 通過：兩者檔案皆不存在，完整 outputs、commits、VFS nodes/inodes deepEqual |
| M3 原跨畫面取消 | 群島按繼續 → 原 hint digest 閘 → F2 → Ctrl+C → 釋放 | 通過：閘內終端 running；零 Worker、零主存檔 write，storage 原字串逐 byte 相同，回可操作入口 |
| M3 群島取消 | 同閘留在群島 Ctrl+C | 通過：輸入 disabled；零 Worker／write，原 envelope 不變 |
| M3 終端入口跨畫面 | `game resume` → 同閘 → 模式 change 回群島 → Ctrl+C | 通過：零 Worker／write，原 envelope 不變 |
| M4 golden 接線 | constructor 身份檢查；執行主線修正後的四 golden 及三新增回歸 | 通過：constructor 確實接收 executor；四 golden 的 `calls>0` 斷言與全部比較通過；共 7/7 |

M1 後續探針為 `printf next > next.txt; cat leaked.txt; cat next.txt`：request `shell:'bash'`、request 帶入的舊檔內容 `''`；reply stdout=`next`、rc0、新檔內容=`next`。保存的歷史步驟仍 `legacy`，新增這筆為 `bash`。這同時檢查實跑與 journal，不只檢查 head。

所有上述瀏覽器場景的 page errors／CSP violations 均為零。沿用原真實 `crypto.subtle.digest` 閘，沒有用替換 `engine.advance()` 的方式模擬主線 UI 修正。

執行命令（跳過會寫 app build 產物的 npm pretest）：

```text
node --import ./test/helpers/register-bash.mjs --test --test-name-pattern="retains golden|runtime remains immutable|cancellation before shell|legacy journals" test/bash-engine.test.mjs
tests 7 / pass 7 / fail 0
```

源碼核對：`Engine.commandContext()` 在任何 await 前 freeze executor/dialect/signal；feed → feedInput → feedCommand → execute 傳相同 context；signal 的 post-advance、dispatch 前後及 feed transaction 返回前檢查可攔住本次原反例。main 的 `replayController` 確實覆蓋上述群島／console 續玩入口，成功結束也不再重寫已升級 shellMode。

### 11.2 M5／P1：Engine 建立前的重播切畫面，仍被當作歡迎頁

**位置：** `demo-app/src/main.js:165–180`（`switchSurface`）、`318–325`（先 await baseSave 驗鏈／fromSave 才發布 engine）、`361–364`（echoInput）。

**兩個同源、已重現的結果：**

1. 在這個較早閘內 F2 到終端並留在終端：畫面為 Bash 終端，重播結束後的新輸入仍實跑 legacy，envelope/backend 和新 journal tag 也仍 legacy。
2. 在同閘內 F2 到終端，再經模式 select change 回群島：釋放閘後合法紀錄誤入救援畫面，顯示 **`Cannot read properties of null (reading 'write')`**。

**合法 fixture 建立方式：**

```js
const e = new Engine();
await e.start();
await e.feed('reviewqa');
await e.feed('hint');
S.seal(e.save);
const baseSave = structuredClone(e.save);
await e.feed('printf replay-race > leaked.txt'); // legacy，空檔、rc127
S.seal(e.save);
const envelope = {
  version:1, runMode:'self', shell:'legacy',
  save:e.save, baseSave,
  journal:[{type:'input',raw:'printf replay-race > leaked.txt',dt:0,shell:'legacy'}]
};
```

這代表先匯入事件基底再累積本機 journal 的合法續玩形式。本 fixture 的保存 head 為 `88133529`。

**精準重現：**

1. 新隔離 context，存入上述 envelope，preferences=islands；其他探針仍只旁觀 Worker 與主存檔寫入。
2. 這次將 digest 閘改在第一次 bytes 含 `"kind":"flag"` 時暫停，亦即 `S.level(baseSave)` 的 `verifyChain`，尚未執行 `engine=...`；digest 放行後仍呼叫原始函式。
3. 點繼續、等閘、按 F2。終端正確標 running，故新的 busy 修正本身有效。
4. A：留在終端後釋放，等重播完成，送 `printf next > next.txt; cat leaked.txt; cat next.txt`。
5. B：用同 fixture 的另一 context 重做，閘內 F2 後再把模式 select 改為 islands，然後釋放。

**A 實際紀錄：**

```text
replay Worker shell: legacy                 // 這筆正確
new input Worker shell: legacy              // 應為 bash，實際未升級
new input stdout: ""
new input stderr: "bash: printf: command not found\n"
new input rc: 0                             // 最後的 cat 成功，不能只看 rc
next.txt: ""                               // 應為 "next"
envelope.shell / new input tag: legacy / legacy
```

**B 實際紀錄：**

```text
welcome-error: Cannot read properties of null (reading 'write')
local-recovery: 已顯示
Worker requests: []
主存檔 writes: 0；原 storage 字串完全未變
```

錯誤被 app 捕獲並顯示，不是測試 timeout 或 pageerror；也不是 head 驗鏈拒絕。原紀錄安全保留，但正常續玩被誤判失敗。

**定位：** `switchSurface()` 只有在 `if(engine)` 內才做 `shellMode='bash'` 與 preserve game surface。此時 replayController 已存在，但 engine 尚未由 `S.level/Engine.fromSave` 的 await 後發布：切終端走一般 `createConsoleWelcome()`，所以漏升級；再切群島走一般歡迎頁分支，直接把 `terminal/input` 清成 null。resume 後的 `echoInput()` 仍假定遊戲 renderer 存在。

**修正／驗收要求：**

- 以重播 operation 的存在與 session policy 決定畫面切換，不能把 `engine===null` 一律解讀成閒置歡迎頁。Engine 尚未就緒時的 F2 也須保存單向 Bash 升級。
- 重播準備期間保留可用輸出目標，或成功發布候選 Engine 時依目前 surface 完整重建 game renderer，再開始 echo/feed；不得沿用已清除的 renderer。
- 只把 `shellMode='bash'` 移到 `if(engine)` 外不足以修掉 B；須同時處理 renderer 生命週期。
- 以上 A/B 皆須正常續玩：歷史步驟維持 legacy、下一筆在終端或切回群島都 Bash、無 null dereference／假救援，保存 tag/backend 一致。閘應覆蓋 baseSave verifyChain 與 fromSave 等 Engine 發布前等待點。

**取消對照仍通過：** 同一早期 baseSave 閘 F2 後 Ctrl+C，再釋放，零 Worker／主存檔 writes、storage 原字串不變、回可操作入口。因此 M5 是升級與 renderer 接合殘餘，不應撤回已取得的 M3 取消修正證據。

### 11.3 快照、範圍與清理

- 全新自有 Temp bundle，未讀取或覆寫背景正式 build 的 dist。直接唯讀目前 main／Worker／CSS／依賴與 license，採 production 同一 esbuild 參數、pinned Bash hook、zlib alias、nonce/hash CSP。
- 同步納入 `build.mjs` 新增的精確 xterm `_addStyle` → CSSOM patch；本次 bundle needle 唯一命中 **1 次**。HTML 2,306,691 bytes。這些 recheck 場景 CSP violations 均零；PageUp 與 browser owner 的其他場景未重跑。
- 建置前後與全部複驗後，以下來源 hash 均一致：

| 來源／產物 | SHA-256 |
|---|---|
| `src/main.js` | `60e75dd4d5593d52e9cc3e1c265a84779d458ceccc364379ea74ed35bb54eb34` |
| `src/engine/index.js` | `2a9ae5e343f6b2a25228c7cc94e0f8b7867ca9ec66fd543bf57e4d27d9d49654` |
| `test/bash-engine.test.mjs` | `761692c94ed87d99c309af16cc274a47dfa205bcf4a0f319b08a895529fbb05f` |
| `build.mjs` | `0cb6d88fd31fdbaf54cb7b58466e8995ebb69331240bd2d5007a8915d1c3814b` |
| `src/ui/xterm-console.js` | `80ed484b944e92ca9f2c63b3e413fdcbe3e4e11a02eb69375cb68be9781f3006` |
| Temp `review.html` | `88a4513372917a04908cee370dabebd737b198f376fa91dc93cd37176a2c3b81` |

- runtime source `ab37e696e3c7a544155d22ade14fee77ba14575cbd00c1edeac3b8a5277116ce`、Worker bundle `d88283aae8fb59bb4ff247984b460ef23172953a310c79c9b88ad6615ba28fd1`、ShellJob `e02f070d1f4972d0babe88c0a5ea13131198b439c7d11656bfbb03b1de6adf05` 與上一輪相同；沒有重跑 owner 的 Bash 語意 blocker 或新增 app/test 檔案。
- 瀏覽器使用既有 Playwright／Chrome，各 scenario 為獨立 context，finally 關閉；只在隔離頁存 fixture／插入時序閘。所有專案來源唯讀，唯一專案寫入為本報告。
- 自有 Temp `C:\Users\user\AppData\Local\Temp\opencode\ra-review-recheck-5Zenkr`：**已清理**。先核對僅 `manifest.json,recheck.mjs,review.html`，再 Node `fs.rmSync` 刪該根，`existsSync=false`；既有 browser 工具未改動。報告 `git diff --check` 通過。

## 12. M5 結案與持久瀏覽器回歸（2026-11-02）

**本 owner 接合審查結論：M1–M5 均已有修正／獨立複驗證據，目前沒有本輪剩餘阻擋項。** 本節僅核准所列 replay／backend／取消／renderer 接合條件；其他 owner 的功能與主線 final 全套結果仍由各自驗收。

### 新增的正式回歸檔

依本輪擴大授權，新增唯一測試檔 **`demo-app/test/bash-replay-browser.test.mjs`**，共 9 個真瀏覽器 integration cases。專案寫入只有此新檔與本報告；沒有修改其他 tests、helpers、app source、package scripts 或 dist。

| 覆蓋目標 | 固化案例 | 結果 |
|---|---|---|
| M1 immutable feed/runtime | legacy feed 的 idle hint digest 閘內 F2；F2 後再回群島 | 2/2 通過 |
| M3 pre-Worker cancel／storage 原子性 | 群島→終端、留群島、console resume→群島，閘內 Ctrl+C | 3/3 通過 |
| M5 Engine 未發布時的 backend／renderer | baseSave verifyChain digest 閘內 F2（A）、再回群島（B） | 2/2 通過 |
| M5 early cancel | baseSave 閘內 F2 後取消、往返後取消 | 2/2 通過 |

**M5 A/B 的實際結案條件：** 閘內 game renderer／editor 保留；終端為 running、群島輸入 disabled；釋放後正常還原，沒有 null write／救援畫面。歷史 `printf replay-race > leaked.txt` 仍依 legacy 產生空檔；下一筆 `printf next > next.txt; cat leaked.txt; cat next.txt` 實際 Worker `shell:'bash'`、stdout=`next`、rc0、新檔=`next`，且畫面實際渲染輸出、envelope backend／新 input tag 都為 bash。回到群島同樣成立。

### 證據與測試邊界

- Fixture 為原反例的**固定舊 legacy JSON**，不由目前 Engine 動態生成預期值：feed head=`5bc164f4`、baseSave head=`88133529`，原 journal tags 均 legacy。避免 current Engine 和 oracle 同時漂移造成假通過。
- 唯一時序控制為包裝真實 `crypto.subtle.digest`：feed 匹配第一個 `kind:hint`（確認 r=30000），baseSave 匹配第一個 `kind:flag`（確認 `flag.demo.started`），等測試放行後仍由原生 digest 算 hash。
- 所有提交／F2／Ctrl+C 經真實鍵盤；返回群島使用既有模式 select 的 change handler。沒有 app 測試接口、Engine 私有狀態注入或 xterm buffer 存取。
- 使用既有 `test/helpers/xterm.mjs` 的輸入、ready、可見 prompt/output 與固定時鐘 helper。真實 Worker 不被替換成模擬器：subclass 僅旁觀 request/reply 的 runtime 與檔案結果，不改 payload、執行或回覆時序。
- 成功案例同時核對歷史空檔、下一筆 Bash 的實際結果、可見輸出、journal tags、session backend、baseSave、commits/head；不是只看 checksum 或 ready。
- 取消案例核對原 SAVE_KEY 完整字串及 RECOVERY_KEY 都不變、零 Worker request/reply、零主檔／救援檔 set/remove/clear；再跨過一個 production autosave tick 重查，排除取消後晚到自動寫回。取消後 launcher 可操作且不顯示救援。
- 每案例為獨立 context；teardown 關閉 context/browser 並檢查 page/console errors、外部請求；案例內另檢查 CSP violations。這次全部為零。

### 正式 dist 獨立執行結果

主線通知正式 build 固定後，直接讀 **2,306,718 bytes** 的 `demo-app/dist/index.html`，未再建 Temp bundle、未修改 dist。使用既有 Playwright 1.64.1／Chrome：

```powershell
$env:RA_PLAYWRIGHT='file:///C:/Users/user/AppData/Local/Temp/opencode/ra-browser-tools/node_modules/playwright/index.mjs'
$env:RA_CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
node --import ./test/helpers/register-bash.mjs --test test/bash-replay-browser.test.mjs
```

```text
tests 9 / pass 9 / fail 0 / skipped 0 / cancelled 0
duration_ms 9523.0509
```

沿用既有 browser suite 慣例：未提供可用 Playwright／RA_CHROME 時明確 skip，**skip 不是驗收通過**。上述正式結果有實際執行全部九項。主線負責既有 `test:browser` 接線與後續 final npm test，本 owner 未代跑或宣稱全套已通過。

| 身份 | SHA-256 |
|---|---|
| 正式 `dist/index.html` | `7dbb98d16e61e00b2dcf83e8efd5900859335c1544ce7228feebf9036092d9f4` |
| M5 修正後 `src/main.js` | `027b2d3f6c67a164087b69b479f1b43c4f09fa468c1d9258f3627ea5bb6020b0` |
| 新 `test/bash-replay-browser.test.mjs` | `76fa3f56905e44090498f5a473c4cec48b314aaa885d973eb758a65965bbbaae` |

本輪沒有自建 Temp artifact，所有瀏覽器由 hooks 清理。執行後 dist／main／新測試的 SHA-256 均與上表一致；唯讀確認主線 `test:browser` 已列入新檔。對兩個未追蹤成果另以 `git diff --no-index --check -- NUL <file>` 檢查，沒有 whitespace diagnostics（exit 1 為新增檔差異）。

## 13. 最後兩項修正的窄幅覆核（2026-11-02）

**結論：支持兩項修正；本輪沒有反對／新增阻擋項。** 僅核對 F2 事件冒泡 guard 與 xterm clipboard capability probes；沒有跑全套／focused suite，也沒有擴掃功能。以下為唯讀來源核對及小型隔離頁觀察，不取代主線 browser/styles/console 的測試結果。

### 13.1 支持：先忽略 `event.defaultPrevented`，防止 F2 二次切換

- 位置：`demo-app/src/main.js:101–107`；`src/ui/xterm-console.js:107–123`。
- xterm 的 F2 handler 先 `preventDefault()`，再 `leave()` 同步銷毀 console view。事件仍會往 document 冒泡，因此只用 `consoleView` 是否存在當 guard 不足；新 `event.defaultPrevented` 判斷能在 view 已被清除後仍識別此事件已處理。
- 群島端原本未處理的 F2 仍以 `defaultPrevented=false` 抵達 document，故保留升級／切終端入口。這不需要改成全域 stopPropagation，也不依賴銷毀後的 view 身份。

**真實鍵盤觀察：** 在正式 dist 的隔離 Chrome 頁，以 MutationObserver 記錄 `data-style` 的所有實際轉換，並在 capture／最後 bubble 階段記錄同一 F2 的 defaultPrevented。

| 狀態 | 操作 | 實際 mode transitions | 結束 console view 數 |
|---|---|---|---:|
| 歡迎頁 | 終端 F2 → 群島 | 僅 `server → islands` 一次 | 0 |
| 歡迎頁 | 群島 F2 → 終端 | 僅 `islands → server` 一次 | 1 |
| 已開始遊戲 | 終端 F2 → 群島 | 僅 `server → islands` 一次 | 0 |
| 已開始遊戲 | 群島 F2 → 終端 | 僅 `islands → server` 一次 | 1 |

四次均觀察 capture=`false`、bubble=`true`，沒有 `server → islands → server` 雙切；遊戲畫面切完可恢復 ready。page/console errors=0、CSP violations=0。本結論針對雙向派送及一次性處理，不把草稿渲染／PageUp 等其他 owner 範圍納入此次驗收。

### 13.2 支持：兩個 clipboard getter probes 以局部 try/catch 降級

- 位置：`demo-app/build.mjs:90–101`。onLoad 的 `xterm\.m?js` filter 同時涵蓋 `.mjs` 與 `.js`；套件 `module` 為 `lib/xterm.mjs`，`main` 為 `lib/xterm.js`。
- 從目前 build 原始碼擷取實際 clipboard transform 於記憶體執行，不修改依賴檔。固定 `@xterm/xterm@6.0.0` 的兩個入口各**恰好 2 個 match**，且確認為 readText/writeText 各一，不只是總數符合：

| 入口 | 捕獲的 local binding | 命中 |
|---|---|---|
| `lib/xterm.mjs` | `ot` | writeText 1、readText 1 |
| `lib/xterm.js`（UMD/CJS） | `c` | writeText 1、readText 1 |

- regex 的 backreference 保證三處使用同一個 local binding；replacement 只把該 `!!(...)` 表達式包成 `(()=>{try{return ...}catch{return false}})()`。不是全域 navigator 替換，也沒有改變 module export 方式。match count 不為 2 時仍 fail closed。
- 兩入口、兩 expression 的獨立值對照均為：navigator 缺席／clipboard 缺席 → false；readText/writeText 可用 → true；clipboard getter 拋錯 → false。保留原有 `!!` 與短路語意。

**完整入口的隔離載入對照：** 在 Chrome 隔離頁中，MJS 經 module import、CJS 經標準 `module/exports` 分支執行。僅測試頁把 clipboard getter 設為拋出 `Error('blocked')`，並暫時讓 `document.queryCommandSupported('copy')` 回 false，以確保兩個 probe 都真的求值。

| 入口 | 原始 upstream | 套用目前 clipboard patch |
|---|---|---|
| MJS | getter 第一次拋錯即無法載入 | getter 觸發 2 次，成功匯出 `Terminal` function |
| CJS | getter 第一次拋錯即無法載入 | getter 觸發 2 次，`module.exports.Terminal` 為 function |

四個 context 的 navigator 及 getter descriptor 身份均保持測試安裝後的原值。修正範圍為載入時 feature detection，原 API 讀寫呼叫維持原樣。

**正式 dist 的 blocked context 對照：** 同 `browser.test.mjs` 的條件，讓 `window.localStorage` 與 `navigator.clipboard` getter 都拋 `blocked`。頁面仍能顯示開始按鈕，完成暱稱與 `ls` 到 Q0-2，再用 F2 掛載 xterm。page/console errors=0、CSP violations=0、請求只有本次本機 HTML。

該 Chrome 的 `document.queryCommandSupported('copy')===true`，所以 writeText 的 legacy-copy fallback 短路，正式頁面實際只有 **1 次** throwing getter 求值。這不等於漏 patch；前述抑制 fallback 的入口對照已確認兩個 probe 均被覆蓋。正式頁面上的 navigator 與 throwing getter 身份也未變。

### 13.3 CSP、身份與收尾

- build 的 CSP directive 集合維持 `default-src 'none'`、script hash、style hash＋nonce、`worker-src blob:`、`connect-src 'none'`、`base-uri/form-action/object-src 'none'`。沒有 unsafe-inline、unsafe-eval 或外部來源授權；此次變化為正常重建的 hash/nonce，並非為 clipboard 失敗放寬政策。
- 不存在新增的全域 navigator monkeypatch：production 只改套件內兩個 expression。實驗中的 throwing getter 與 copy fallback 控制只在隔離測試頁內。
- 本輪讀到的正式 dist 為 **2,307,259 bytes**：

| 身份 | SHA-256 |
|---|---|
| `src/main.js` | `092a0064bbf4722ff10a41dc7c170d72145af9f43edc94ccab0256c3200145b4` |
| `build.mjs` | `443cdf88562185756b4f7fbaabfec0bb0ae9caf4d77a331eeed54dc10b10bec1` |
| 正式 `dist/index.html` | `9dfdd2c365236a18f0dd08c607c5d2b6630f1dc91ad203d35717140b1927ba17` |

- 僅追加本報告，source/test/dist 均未寫入；沒有新增 Temp 檔案或建置產物。每個 browser/context 均於 finally 關閉，隔離 module import 的 Blob URL 亦於 finally revoke。工具沙箱早期缺少瀏覽器 globals 的失敗不作產品證據，最後入口結論以真實 Chrome 對照為準。
