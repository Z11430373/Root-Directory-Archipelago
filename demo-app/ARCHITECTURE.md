# 第一夜：整合契約

劇本資料包為唯讀來源，不修改現有 YAML、text 或黃金測資。整合驗證曾修正 `tools/validate.py` 的 Windows 子程序編碼與路徑處理，範圍與結果記於 `notes/logs/test-results-project-data.txt`。

## 分工
- 主架構師：package.json、build.mjs、src/data.js（產生）、src/main.js、src/ui/、整合與 REPORT.md / FINDINGS.md。
- 存檔代理：src/save/、vendor/pako*、test/save.test.mjs、notes/save.md。
- 世界代理：src/vfs.js、src/loggen.js、src/shell/、src/quests.js、test/world.test.mjs、notes/world.md。
- 流程代理：src/expr.js、src/engine/、test/engine.test.mjs、notes/engine.md。

## 共用資料
`src/data.js` 匯出 `DATA`：`{yaml: {'demo/demo.yaml': parsedObject, ...}, text: {'text/ch0/xxx.txt': exactUtf8Text, ...}}`。
build.mjs 從資料包根目錄讀取並產生此檔；測試前先 `npm run data`。

## 存檔 API（src/save/index.js）
- canonical(value), crc32(text), async commitId(parent,body)
- newSave(nick,seed,pack?,event?), async addCommit(save,kind,data,r,t=0,chapter='ch0',branch='main')
- seal(save), pack(save), async unpack(object), async exportCode(save), async importCode(code)
- checkShape(save), async verifyChain(save), async level(save) => [level,reasons]
- fold(save), score(save), async toFullgame(save), async card(save), async importFile(jsonText)
- 保持 Python 參考的 camelCase 對應語意；fold 的 flags 使用 Set。

## 世界 API
- `createWorld(chapter='ch0', seed=5, flags=new Set())` 從 src/vfs.js 匯出，回傳 VFS。VFS 包含 cwd/home、resolve(path)、exists(path)、empty(path)、readFile(path)、writeFile(path,text)、clone()；可加方法。
- `execute(raw,vfs,{flags,branch,...}={})` 從 src/shell/exec.js 匯出，回傳 `{stdout,stderr,rc,reads,readEvents}`；reads 是去重的絕對路徑陣列，readEvents 是每次真讀取的 `{path,same_inode}` 快照。Engine優先採快照，不在腳本結束後解析重綁pathname。同步執行，單命令cd更新VFS.cwd；pipeline採共享檔案／局部cwd的決定性模擬。敘事／hint／skip／git 等由 Engine 處理；Shell 對其回空輸出（lamp status/mail 例外）。
- `generateLogs({seed=5,linesPerDay=100,days=30,npc=true}={})` 從 src/loggen.js 匯出 `{accessLog,errorLog,manifest}`。
- `checkQuest(check,raw,output,manifest,vfs?)` 從 src/quests.js 匯出 boolean。
- 請世界代理自行在 notes/world.md 記錄補充介面，流程代理可直接讀其檔案。

## 流程 API（src/engine/index.js）
- `new Engine({seed=5,event='demo-event-1',mode='self',onOutput?}={})`
- async start()：發 session.start
- async feed(raw,dt=0)：先推進 dt 秒再送出輸入
- async advance(dt)：虛擬時鐘；瀏覽器由主程式換算 wall clock 秒數呼叫
- 屬性：save, flags(Set), active, quests, mode(input/choice/null 或可辨識 tuple), nick, world, branch, vfs, now, t0, ended, trace, ladders
- `onOutput(text,kind='dialogue')` 供介面；trace 含 ['say',ref]；async summary() 供 T10
- start／feed／advance是序列化的交易入口，成功後才發布onOutput；失敗回復完整runtime／VFS／flags／save。內部step方法不是並行API；UI自己的journal也要成功才發布。observer錯誤記在outputError，不把已提交操作假裝成失敗。
- 流程以 Python 行為與 walk 測資為準；超出測資但規格要求的顯示、延遲對話等也要實作。衝突記入個人 notes，不改來源。

## Bash 終端操作模式
- `main.js` 選擇群島表單或 `XtermConsoleView`；切換沿用 Engine、歷史、輸出與一般草稿。口令草稿清空；Engine 尚未建立的 replay 準備階段也保留 renderer。
- `XtermConsoleView` 用真字元格／ANSI／游標呈現；`ConsoleLineEditor` 管理草稿、PS2、history 與 onData。原始 `{text,kind}` transcript 作 renderer handoff，不把 xterm textarea 當完整草稿。
- `game …` 是介面層的工作階段命令，不屬於 Bash 模擬器。既有劇本指令仍交給 Engine；本機 journal 記錄可重播的 Engine 輸入。
- 群島／終端新 session、事件匯入與續玩後的新輸入一律使用固定 just-bash 3.6.0 與隔離 Worker；呈現風格不決定 Shell 語意。每筆歷史 journal 固定 runtime/Engine dispatch；缺 tag 仍以 legacy 重播，不改舊檔。`feed` 在任何 await 前固定 executor/dialect/signal，切畫面不能改正在執行的歷史步驟。headless Engine 保留 legacy 預設供歷史參考，瀏覽器明確注入 Bash runner。
- 主命令提示符採 `$`；遊戲問答採冒號，`>` 僅作 Bash PS2。一般風格的 Enter 與終端共用 `needsContinuation`，未完整的控制結構不提前提交；補全亦包含 Bash 指令。兩者保留各自的 DOM／xterm 呈現器。
- Worker 使用 structured clone 的 VFS（Map／inode 關係保留）；結果成功才套回原 VFS，保留原 flags 身份。Ctrl+C 終止 Worker、拒絕目前 feed，Engine 回復整次交易，UI 不記錄失敗 journal。
- 這是遊戲的原子取消語意；真 Bash 的中斷不會自動撤回先前檔案寫入。
- `vfs.shellState` 保存可 structuredClone 的 interpreter state／PRNG；不靠重跑副作用恢復。渡海 reconcile 新 cwd；branch exit 同時回復檔案與 shell 狀態。時鐘／隨機值使用決定性遊戲資料。
- replay operation 的 AbortController 覆蓋 baseSave 驗鏈、Engine 建立、feed 與 Worker 等階段；取消回入口且原 envelope 不變。
- Worker／xterm／CSS／授權由 build 嵌入同一 HTML。CSP 授權 `worker-src blob:` 與 scoped style nonce；固定 Bash source hook、xterm CSSOM hook 都採唯一 marker 驗證。兩個 clipboard feature probes 各加局部 try/catch，封鎖 getter 時回 false；不開放網路、unsafe-inline 或 unsafe-eval。Node loader 與 browser 共用相同 Bash hook。

## 驗收
先寫測試；T1–T4 / T5–T9 / T10 依序作為整合閘門。代理不要 commit；主架構師統一里程碑提交。不得測試通過就誇大成完整驗收。

## 本機儲存所有權
- 正規RA1不含任意Shell檔案／cwd；本機完整envelope包含journal，以獨立session-storage guard保護。
- 同步load固定整份待重播字串；write／clear必須await並於同一Web Lock內compare+mutation。失去baseline停止自動保存，不在每次tick暗自認領新版。
- primary與recovery各自guard；主primary衝突時禁止用restart／kiosk繞過所有權刪除。無Web Locks時只有明示best-effort CAS，不宣稱跨process或跨key原子性。
