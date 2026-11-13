# ADR-001：以成熟 Shell 引擎改善 Bash 語意

**Status:** Accepted（已整合 just-bash／xterm；驗收證據見主線紀錄）  
**Date:** 2026-11-02  
**Deciders:** 本專案使用者與實作代理

## Context

目前終端採自製 `ConsoleView`、29 指令白名單與約百行 parser。12 項針對性原生 Bash 探針只有 2 項逐字一致；變數、展開、控制流程等缺口不會靠字型／配色補齊。390 項既有驗收驗的是遊戲契約。

現有重要接面：

- `demo-app/src/engine/index.js` 的 `shellExecutor` 已可替換且可 await；命令結果包含 stdout、stderr、rc、讀檔事件。
- `src/ui/shell-job.js` 每個命令建立新 Worker，成功時提交 cloned VFS；因此新的 shell 變數／函式／cwd 狀態必須另行保存，不能只存在即將被終止的 Worker。
- `src/shell/exec.js` 會記錄讀取當下的路徑與 inode 別名；任務／發現依賴這個事件語意，不是只比較輸出文字。
- 應用程式目前可單檔離線遊玩，使用嚴格 CSP；原劇本、事件存檔與分支仍須可驗證。

## Decision

採用固定 **just-bash 3.6.0 browser entry＋本案 VFS／遊戲事件 adapter**，終端呈現採 **xterm 6.0.0＋FitAddon 0.11.0**。仍標示 Bash 相容模擬，不稱 GNU Bash。

終端呈現優先選 **xterm.js＋FitAddon**。`xterm-pty` 作為真正 TTY runtime 接合參考，未在 JS Shell 路線預設加入；它不供應 readline，且查核版本依賴 xterm 5.5，與本輪 xterm 6 HEAD 尚未驗證相容。xterm 動態樣式與目前 CSP 的接合工作詳見 [TERMINAL_UI.md](TERMINAL_UI.md)。

已實作跨次 session、Worker 交易、決定性 replay、真字元格與嚴格 CSP 接合；完整結果以 `demo-app/notes/BASH_TERMINAL.md` 為準。真正 GNU Bash 與完整程序／TTY 行為仍需另一種執行環境；本輪查到的單獨 Bash/WASM 移植不足以承擔核心管線玩法。

## Options Considered

### A：繼續擴寫現有 parser

| Dimension | Assessment |
| --- | --- |
| Complexity | 單一小修低；補齊 Bash 語法與狀態長期高 |
| Cost | 初期依賴不增加，維護與相容成本持續累積 |
| Scalability | 目前 iterator 管線可保留惰性消費；語法擴充成本高 |
| Team familiarity | 已有完整遊戲測試與讀檔事件接面 |

**Pros:** 容易保留既有遊戲規則、檔案身份與小型離線產物。  
**Cons:** 目前已實證常見 Bash 語法大量缺漏，零散補功能容易繼續產生自有方言。

### B：just-bash adapter

| Dimension | Assessment |
| --- | --- |
| Complexity | 中高：VFS、跨行狀態、事件與 Worker 封裝 |
| Cost | 增加第三方依賴與固定版本 hooks 維護；完整離線 HTML 約 2.31 MB |
| Scalability | 上游採完整字串管線，惰性／大型日誌須另驗 |
| Team familiarity | TypeScript／JavaScript，與目前技術棧相近 |

**Pros:** 已有 parser／interpreter、變數／控制流程、browser export、可注入 FS、自訂命令。Apache-2.0 授權。  
**Cons:** 不是 GNU Bash；每次 exec 重設 cwd／env／functions，不能直接當互動 session；browser 指令與完整 Node 版有差異。

固定版本與程式證據見 [SHELL_ENGINES.md](SHELL_ENGINES.md) 的 just-bash 章節。

### C：本輪查到的 GNU Bash/WASM 移植

| Dimension | Assessment |
| --- | --- |
| Complexity | 高：Emscripten、程序模型與 JS／VFS bridge |
| Cost | 額外工具鏈與 GPL 原始碼交付要求 |
| Scalability | 此移植缺 fork／exec／wait，不能提供現有管線玩法 |
| Team familiarity | 新增 C／WASM／Emscripten 維護面 |

**Pros:** 確實包含 GNU Bash 5.3 原始碼，可研究真正 parser／builtins。  
**Cons:** 缺管線與一般外部工具；repo 的 wasm 是指向未收錄 build 產物的 symlink，clone 後不能直接載入。

## Trade-off Analysis

本案目前最可行的是 B 的隔離相容性實驗；A 適合立即修復已重現的小錯誤，不適合作為「已經像 Bash」的證明；C 只提供真 Bash 的部分移植，關鍵能力不完整。

終端字元格／ANSI 顯示與 shell parser 是不同責任。終端元件可以改善游標、換行、選取與控制序列，但變數、管線與 shell 語法仍需由執行引擎處理。教學遊戲的目標／完成檢查可獨立借鑑，不能把教學 UI 當成 Bash 相容層。

## Consequences

- 更容易取得成熟語法支援，減少本案自行重造 parser。
- 跨行環境、函式、別名及上一筆退出碼必須納入 session／重播設計；已有 Worker 終止策略不能把它們丟掉。
- 必須維持讀取時 inode 事件、分支隔離、虛擬時鐘與存檔 commit 一致性。
- 目前 Ctrl+C 的整筆遊戲交易回復仍是遊戲語意，不能宣稱等同真 Bash 的副作用行為。
- browser bundle、CSP、file://、手機 IME、長管線效能須各自列出實驗證據或未驗邊界，來源靜態研究不能視為通過。

### 實作後補充

- 用唯一 pinned hook 擷取／注入 top-level interpreter state，不改 base state，不重播副作用；child shell 依 exports／defaults 初始化。
- 字串管線與文字 VFS 的邊界保留。主線 rm 防護、read-time inode events 與四條 golden path 另驗。
- 每筆 journal runtime tag 同時版本化 Engine dispatch；缺 tag 視為 legacy。日後 adapter 語意變動須新增 revision／遷移策略，不可在原 `bash` tag 下默默改重播。
- `feed` 在任何 await 前固定 executor/dialect；replay operation token 涵蓋 Engine 建立前等待及取消。F2 只影響後續新輸入。
- Browser／Node 共用 Bash source hook，gzip 接既有 pako；xterm 動態 styles 用 scoped nonce、truecolor／selection 用固定 CSSOM patch。沒有開放 unsafe-inline／unsafe-eval。
- 原生 OS IME、輔助科技與手機實機未人工驗收。自動化鍵盤／合成 composition／尺寸模擬證據不可替代它們。

### 2026-11-03 一般風格補齊

呈現風格不再選擇新輸入的 runtime：群島／終端一律採 Bash；legacy 只保留為歷史 journal／headless 參考接面。舊 journal 仍逐筆原樣重播，重播後新提交使用 Bash 並寫明 tag，不默默重解舊命令。這修正了前次一般風格需先切入終端才取得新引擎的漏項。

主提示符用 `$`、遊戲問答用冒號，`>` 只保留真正 Bash PS2 與重導向語法。一般輸入與終端共用 `needsContinuation`，但保留其原任務面板／DOM 介面，並未強迫使用 xterm 風格。

## Action Items

1. [x] 實際 clone 候選，鎖 commit／授權並讀取關鍵程式；記錄及清除研究副本。
2. [x] 用原生 Bash 建立 12 項針對性缺口證據。
3. [x] 以固定版本 browser entry 做 adapter，驗證跨提交／Worker 的 env／cwd／函式保存。
4. [x] 連接 VFS／讀檔事件，跑原生 Bash 對照與確實注入新引擎的四條 golden path。
5. [x] 接入真終端，驗證 readline／PS2／游標／選取／合成 IME 事件／中斷。
6. [x] 整合回原專案、重建離線產物，研究副本清理證據保留於各實作與審查文件。
