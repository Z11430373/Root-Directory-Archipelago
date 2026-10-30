# Shell 引擎參考研究：just-bash / PocketTerm

查證日期：**2026-10-30**。用途：參考、成本評估，**不是替換引擎的提案或授權**。

- **官方證實**：由專案官方 repo、原始碼、npm 發布資料或官方 demo 的 HTTP 內容直接支持；原始碼觀察不等於已實跑驗證。
- **推測**：本案整合方式／成本判斷，尚未實作或測試。
- **查無可靠來源**：本次檢索未找到可支持該主張的官方資料，不等於證明永遠不可能。
- 已用 websearch 找候選，再用 webfetch／官方 GitHub、npm HTTP 資料核對；不沿用使用者提供的 `<cite>` 編號。
- 本次**沒有安裝、建置、執行任一外部引擎，沒有操作其互動 demo，也沒有重跑本案測試**。只新增本筆記；不改程式、依賴、測資或產物，不 commit。

## 1. 專案身份與可重現的查證版本

| 名稱 | 官方身份與入口 | 結論 |
|---|---|---|
| just-bash | [vercel-labs/just-bash](https://github.com/vercel-labs/just-bash)、[justbash.dev](https://justbash.dev/)、[npm](https://www.npmjs.com/package/just-bash) | **官方證實**：Vercel Labs 的 TypeScript 模擬 Bash 環境；不是 GNU Bash，也不是 Vercel Sandbox VM。現為 monorepo，套件在 `packages/just-bash`。[J1] |
| PocketTerm（本研究主體） | [edgarfurse/pocketterm](https://github.com/edgarfurse/pocketterm)、[官方 demo](https://edgarfurse.github.io/pocketterm/) | **官方證實**：Rocky Linux 9 教學模擬器。舊 repo `edgaraidev/pocketterm` 現重新導向此 repo；舊 demo `https://edgaraidev.github.io/pocketterm/` 本次 HTTP 404，新 demo 可取回 HTML。[P1][P9] |
| Pocket Term（同名異物） | [yumao233/PocketTerm](https://github.com/yumao233/PocketTerm) | **官方證實**：Go/Gin + WebSocket + SSH/PTY 後端，執行真正主機 shell；不是無後端 VFS 教學模擬器。不得把其架構或授權資料套給上列 PocketTerm。[N1] |

以下程式碼連結固定在本次查得的 main HEAD：just-bash `7a2a7a57d46095bf6cc8195680a13f76f784681b`；PocketTerm `0bb3c642daaf811b189a2cd0d7476dadb19eb0fe`。**main 快照與 npm 已發布版本不可視為完全相同**。

## 2. 精簡比較

| 面向 | just-bash | PocketTerm（edgarfurse） |
|---|---|---|
| 執行架構 | **官方證實**：TS parser → AST → JS interpreter，in-process，無 VM 隔離。CPython/SQLite/QuickJS 的 WASM 是另外的可選能力，不是 shell 本體。[J1][J7] | **官方證實**：README 稱自製 AST shell；程式實際有 lexer、`ParsedPipeline`／segments／redirections 與命令 registry。不是 Rocky Linux VM，也不執行原生 Bash。[P1][P3] |
| VFS／持久化 | **官方證實**：預設 `InMemoryFs`，可注入 `IFileSystem`；FS 跨 `exec()` 共用。**查無可靠來源**：套件內建 localStorage 自動持久化。[J1][J5] | **官方證實**：記憶體樹／Map，序列化 JSON 寫 localStorage；VFS、環境、服務、套件等另有持久化資料。[P2][P3][P5] |
| 擴充 API | **官方證實**：`new Bash`、`exec`、`defineCommand`、`customCommands`、`registerCommand`、`fs` 注入；每次 `exec()` 重設 cwd／環境／函式，FS 保留。[J1][J4] | **官方證實**：內部 `CommandDefinition`、匯出的 `commandRegistry: Map`、`Shell.execute` 及 UI callbacks。**查無可靠來源**：正式 npm 函式庫／穩定 plugin SDK／`defineCommand` API。[P2][P3][P4] |
| stdout／stderr | **官方證實**：結果分開 `{stdout, stderr, exitCode, env}`；管線 stdin 是 byte-shaped 字串，不能直接當 Unicode 文字操作。[J1][J7] | **官方證實**：命令 context 有 `out/err/rawOut`；公開 `execute()` 回 `Promise<void>`，正常終端出口共用 `onOutput`，附 CRLF。不是相同的結果物件 API。[P3][P4] |
| 管線與攔截 | **官方證實**：支援 `|`、重導向、`&&`、`;`；可自訂命令／FS，另有實驗性 AST transforms。管線目前逐階段 await／傳遞完整字串。[J1][J4][J5][J6][J7] | **官方證實**：`|/|&` 與尾端命令重導向；逐段收集字串陣列，再送下段。公開入口未分開回傳兩個 stream；管線執行方法為 private。[P3] |
| 瀏覽器直接使用 | **官方證實**：有 `just-bash/browser` ESM 入口與 browser build；不是所有 Node 能力可用，見下節。[J2][J3] | **官方證實**：React + xterm.js 的瀏覽器應用，官方 Pages 提供多檔靜態 demo；不是可直接貼入單檔的獨立引擎套件。[P2][P6][P9] |
| 單檔／file://／零網路 | **查無可靠來源**：符合本案全部條件的官方單檔、CSP、ES2020／指定 Safari 支援驗證。**推測**：重打包核心或有研究空間，不代表現成符合。 | **官方證實**：demo 使用外部 JS/CSS assets、modulepreload，Vite 設絕對 `/pocketterm/` base 與分塊；原樣不是本案單檔。**查無可靠來源**：符合本案 file://／零網路的版本。[P6][P9] |
| 授權／維護 | **官方證實**：套件完整 Apache-2.0 LICENSE；最新 npm `3.6.0` 發布於 2026-10-01，main 最新 commit 2026-10-21，README 仍標 beta。[J1][J8][J9][J10] | **官方證實**：README／package 宣告 MIT，但本次完整 tree 沒有 LICENSE 檔。package `0.12.2`；main 最後 commit 2026-04-19 僅 README 連結修正，上一筆 03-16 為 release commit；GitHub releases API 空陣列。[P1][P2][P7][P8] |

## 3. 容易誤判、會影響本案的細節

### just-bash

1. **官方證實｜瀏覽器限制比 README 的摘要更多。** README 列 `python/python3`、`sqlite3`、`js-exec`、`OverlayFs/ReadWriteFs` 不可用；`browser-excluded.ts` 與 bundle tests 另列 `tar/yq/xan` 排除；`browser.ts` 還明寫 `gzip/gunzip/zcat` 依賴 `node:zlib`，瀏覽器執行會失敗。不能以 README「all built-in commands」一句認定所有指令可用。[J1][J3]
2. **官方證實｜命令擴充與遊戲事件不是同一件事。** `defineCommand(name, async (args, ctx) => result)` 可收 `fs/cwd/env/stdin/exec`，且能參與管線與重導向；自訂命令可覆蓋同名已註冊命令，context 型別另有 `origCommand`。宿主命令預設 trusted，執行於 embedding process，不是隔離 VM。`commands` 可限制註冊命令，但不能僅憑此宣稱完整 shell 語法與所有 interpreter builtins 已限縮到本案白名單。另須注意：本快照 `browser.ts` 沒匯出一般 README 範例使用的 `decodeBytesToUtf8`，不可直接假定 Node 範例的全部 imports 適用瀏覽器。[J1][J3][J4][J7]
3. **官方證實｜可觀察性有邊界。** 可注入 `IFileSystem`，其讀取方法包含 `readFile/readFileBuffer/readFileBytes`；logger 是 exec／輸出紀錄，`trace` 是效能事件。lazy file provider 首讀後快取，**不是每次閱讀的事件**。[J1][J4][J5]
4. **官方證實｜AST transforms 並非現成遊戲 hook。** `TeePlugin` 插入 tee 記錄 pipeline stdout，`CommandCollectorPlugin` 靜態收集命令名稱，不證明命令真的執行或某檔符合遊戲閱讀定義；它們屬實驗性 API，且 `browser.ts` 未直接匯出這些 plugin 類別。[J3][J6]
5. **官方證實｜不是零依賴嵌入元件。** package 宣告 **16 個直接 dependencies、2 個 optionalDependencies**（例如 `diff/sprintf-js/turndown/re2js/guarded-fetch`；optional 為 zstd/lzma），Node engines 為 `>=20.19`，不同於本案 Node 18+。browser build 雖採 esbuild 單一 ESM outfile，仍明列多項 `--external`，不能視為所有依賴已內嵌。[J2]
6. **官方證實｜套件體積不可冒充瀏覽器成本。** npm registry 的 3.6.0 `dist.unpackedSize` 為 **21,648,775 bytes／970 files**，包含非瀏覽器內容；**查無可靠來源**：本案所需子集的最終 inline／gzip 大小。本次未建置或量測瀏覽器 bundle。[J9]
7. **推測｜包裝比重寫全引擎合理，但仍是高成本且目前未獲授權。** 需保存跨行 cwd／環境、轉接既有 VFS 與分支 clone、保留遊戲專用指令、收斂 syntax／白名單、重建事件順序與輸出。**官方證實**：網站文件區分本機執行的基本命令與會呼叫 `/api/agent` 的 AI 命令（production 預設關閉該 route）；不能把「基本命令不用網路」擴張成「整個 demo 符合本案零網路」。[J1][J11]
8. **官方證實｜Apache-2.0 並非不必保留授權。** 若日後獲准複製／再散布，需附 LICENSE、保留適用通知、標示修改；若適用的原作有 NOTICE 亦須處理。套件授權不代表其全部 dependencies 或測試素材都同一授權；本次沒有搬碼。[J8]

### PocketTerm

1. **官方證實｜README 的「AST／real-time」不等於完整 Bash 或串流程序。** 固定快照中 `tokenize/parsePipeline` 辨識 `|/|&/>/>>/2>/2>>/2>&1`；沒有 `&&` 或 `;` 的運算子／節點分派，重導向只允許尾端 pipeline command。`executeParsedPipeline` 收集 `capturedOut/capturedErr`，再把 payload 交下段，stdin 透過特殊 `__stdin__:` 參數傳遞。這些是靜態程式碼觀察，未實跑命令。[P3]
2. **官方證實｜本身刻意偏離 Unix。** README 的 Intentional Simulator Contracts 明訂：`wc -l/grep -c` 把沒有尾端換行的文字也算一行，管線必要時補尾端換行。這不是逐字輸出相容性的保證，反而是本案 T7 的比對風險。[P1]
3. **官方證實｜有 browser storage，但不保證禁用時繼續運作。** `safePersist` 捕捉寫入／配額錯誤；`FileSystem` constructor 的 `localStorage.getItem` 在 JSON parse 的 try/catch **外**，reset 等亦有直接 storage 呼叫。這與本案「所有 storage 呼叫容錯」不同；不是已實測會在哪些瀏覽器失敗。[P2][P5]
4. **官方證實｜網路與 UI 綁定不是本案需求。** 命令與 NetworkLogic 有 fetch-based probes，包含 public-IP hydration 的外部請求程式碼；不據此斷言每次開啟都會發出該請求。context 還含編輯器、確認、密碼、reboot、下載等 UI callbacks。**推測**：抽核心需切斷這些依賴與網路能力，不只是換 import。[P3][P4][P10]
5. **官方證實｜完整應用依賴／建置成本。** package 為 `private: true`，有 React 19、ReactDOM、xterm、fit addon、Tailwind／PostCSS 等 **9 個 dependencies**，另用 Vite／TS／Vitest。Vite 明確分出 react/xterm chunks；Pages HTML 引用 index、react、xterm JS 與 CSS。**查無可靠來源**：官方單檔 build、精簡 engine package、指定瀏覽器矩陣與本案 CSP 相容報告；未量測其最小核心 bundle。[P2][P6][P9]
6. **官方證實＋查無可靠來源｜MIT 宣告不是完整授權材料查核。** README 與 package 的 MIT 宣告已確認；完整 repo tree 未列任何 LICENSE，常見 `LICENSE`／`LICENSE.md` 路徑本次亦 404。未取得完整條文與著作權通知；不要直接把它描述成「授權材料已完備、可無條件搬碼」。**推測**：若未來確需複製，應先向維護者補確認，再處理依賴授權。[P1][P2][P8]
7. **官方證實＋查無可靠來源｜有可觀察的方法，沒有已確認的閱讀事件 SDK。** `FileSystem.readFile(path, user)` 只回傳內容／null，沒有事件 callback；命令也會使用 `getNode`。**推測**：可從命令 registry 或 FS 層自行包裝，但需自行區分玩家閱讀、內部讀取、grep 命中及 inode，不能聲稱攔截 `readFile` 就已符合本案。[P2][P3][P4]

## 4. 本案適配：借鑑／包裝／遷移成本

本案依據：`demo/AGENT_BUILD_PROMPT.md` §3／§5／§7／§8、`demo/flow.yaml` `command_pipeline/file_read`、`demo/demo.yaml` 白名單；現有接面可見 `demo-app/src/shell/exec.js` 與 `demo-app/src/shell/stream.js`。本次僅閱讀，不宣告目前測試結果。

- **官方證實（本案規格）**：原生 ES2020、單檔 HTML、file:// 與 https://、零網路、29 指令；本次任務限制不新增 `esbuild/js-yaml/pako` 以外依賴。T7 stdout／rc 逐字相同；T10 四條重播的 commit **連 id 都相同**，並須 Python 互通。不是「更接近真 Bash」就比較合格。
- **官方證實（本案規格）**：`file.read` 要按指定命令與檔案運算元判斷；recursive grep 要該檔有輸出才算；stdin／重導向目標不算；hard link 要保留被命名路徑及 `same_inode`；整行執行後先發各檔 read 再發 cmd。故「攔截所有 VFS read」或靜態 AST 收集均不足。
- **查無可靠來源**：任一外部引擎原生提供上述遊戲事件語意、RA1 存檔／hash chain、虛擬時鐘、分支世界或本案 T10 相容性。外部 localStorage snapshot 不能取代本案 commit 存檔格式。

| 路線 | 相對成本（**推測**，非工期承諾） | 本案判斷 |
|---|---|---|
| 借鑑 lexer／串流分層、stdout/stderr 分離、VFS 能力介面、回歸案例分類 | 低～中；只借概念、自己按規格實作，不加依賴 | 最適合；現有引擎已具管線／事件接面，無需為了借鑑而遷移 |
| 包裝 just-bash 為既有 shell contract 的另一實作 | 高；async、跨行狀態、byte/text、VFS／inode、白名單、遊戲事件與封裝全需驗證 | 只適合未來獲准後的隔離研究，不是目前 drop-in |
| 抽 PocketTerm 核心或遷移其整個應用 | 高～很高；除上述語意外，還有缺少的 chaining、持久化／UI 耦合、chunks／依賴與授權材料 | 作教學 UX／錯誤提示參考較合理；整體搬入與本案約束衝突 |

## 5. 僅三項建議

1. **保留現有引擎，以本案規格作唯一語意標準。** 只借鑑分層與測試分類；若後續另獲准改進，優先檢查引號／管線／重導向、stdout/stderr 分離與精確讀檔事件，不搬入外部執行碼或擴大指令範圍。
2. **先保留可替換接面的設計，而不是換實作。** 可把現有 `{stdout, stderr, rc, reads, readEvents}`／VFS／虛擬時鐘／分支／29 指令當書面 adapter contract；未來 library 候選以 just-bash 較合理，PocketTerm 主要作 UX 參考。事件需在命令層過濾與緩衝，不能把底層 read 或 AST 名單直接當發現。
3. **任何採用先取得依賴政策變更授權，再另開隔離 PoC。** 固定版本／commit、釐清授權、實測 browser inline bundle／ES2020／CSP／file://／斷網／storage 禁用；重跑 T1–T11，特別 T7、T10 同 id 與 Python `check_codes.py`，有瀏覽器環境再跑 T12。全部實跑前不得聲稱相容；這些工作本次未做。

**明確不建議立刻做**：替換 shell／VFS／存檔引擎；安裝或 vendor just-bash、PocketTerm、React、xterm、WASM runtime／新增 CDN；啟用網路探測；放寬 CSP／依賴白名單；為新引擎修改測資、Python oracle 或 T10 id；複製 PocketTerm 程式碼而跳過授權材料確認。

## 官方來源索引

### just-bash

- [J1] [套件 README：架構、API、shell state、VFS、網路、安全、瀏覽器](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/README.md)
- [J2] [package.json：exports、engines、dependencies、browser build](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/package.json)
- [J3] [browser.ts：exports 與 gzip 限制](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/browser.ts)；[browser-excluded.ts](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/commands/browser-excluded.ts)；[browser bundle tests（僅閱讀，未執行）](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/browser.bundle.test.ts)
- [J4] [BashOptions／ExecOptions／註冊命令／logger／trace](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/Bash.ts#L144-L279)
- [J5] [IFileSystem](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/fs/interface.ts#L139-L174)
- [J6] [實驗性 AST transforms 文件](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/transform/README.md)
- [J7] [結果／context／ByteString／origCommand 型別](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/types.ts)；[管線執行](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/interpreter/pipeline-execution.ts)；[browser registry gating](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/src/commands/registry.ts#L491-L539)
- [J8] [完整 Apache-2.0 LICENSE](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/packages/just-bash/LICENSE)
- [J9] [npm 官方 registry metadata：dist-tags／time／3.6.0 dist](https://registry.npmjs.org/just-bash)；[3.6.0 官方 GitHub release](https://github.com/vercel-labs/just-bash/releases/tag/just-bash%403.6.0)
- [J10] [最新 main commit，2026-10-21](https://github.com/vercel-labs/just-bash/commit/7a2a7a57d46095bf6cc8195680a13f76f784681b)；[repo API](https://api.github.com/repos/vercel-labs/just-bash)
- [J11] [官方網站 demo 架構文件：本機命令與 server agent 的區分](https://github.com/vercel-labs/just-bash/blob/7a2a7a57d46095bf6cc8195680a13f76f784681b/examples/website/README.md)

### PocketTerm

- [P1] [README：模擬定位、功能與刻意的 simulator contracts](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/README.md)
- [P2] [package.json](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/package.json)；[VFS constructor／persist](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/fileSystem.ts#L716-L739)；[readFile](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/fileSystem.ts#L822-L850)
- [P3] [shell parser](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/shell.ts#L130-L309)；[管線／公開 execute](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/shell.ts#L882-L1052)；[context 與命令執行](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/shell.ts#L1063-L1303)
- [P4] [CommandContext／CommandDefinition](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/commands/types.ts)；[commandRegistry](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/commands/index.ts)
- [P5] [storage.ts：持久化、匯出匯入、safePersist](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/storage.ts)
- [P6] [Vite 絕對 base 與 chunk 設定](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/vite.config.ts)
- [P7] [最新 commit，2026-04-19](https://github.com/edgarfurse/pocketterm/commit/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe)；[上一筆 release commit，2026-03-16](https://github.com/edgarfurse/pocketterm/commit/a0a4a9da8be008bda7006055b618dcd38e1c92ca)；[releases API](https://api.github.com/repos/edgarfurse/pocketterm/releases)
- [P8] [完整固定快照 tree API：無 LICENSE 路徑](https://api.github.com/repos/edgarfurse/pocketterm/git/trees/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe?recursive=1)
- [P9] [目前官方 demo HTML（只取回來源）](https://edgarfurse.github.io/pocketterm/)；[舊 repo 官方重新導向入口](https://github.com/edgaraidev/pocketterm)；[repo API 的 canonical homepage](https://api.github.com/repos/edgarfurse/pocketterm)
- [P10] [NetworkLogic：fetch 與 public-IP hydration](https://github.com/edgarfurse/pocketterm/blob/0bb3c642daaf811b189a2cd0d7476dadb19eb0fe/src/engine/networkLogic.ts#L165-L241)

### 同名辨識

- [N1] [yumao233/PocketTerm README：Go／SSH／PTY 架構](https://github.com/yumao233/PocketTerm/blob/957e0d9c946ac8604fcb8fa0aa30f78c9dd1d79b/README.md)。其 badge 與文末授權標示亦不一致，與本研究主體授權無關，未在此延伸查核。
