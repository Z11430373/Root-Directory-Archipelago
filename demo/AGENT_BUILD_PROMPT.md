# 給實作代理的提示詞：〈根目錄群島〉試玩版〈第一夜〉前端

> 使用方式：把這份文件連同整個資料包（`root-archipelago-ch01.zip`）一起交給代理。
> 代理只需要這份文件與資料包，不需要之前的對話。
> 真相的優先順序：**資料包內的檔案 > 本文件 > 其他說明文件**。若發現矛盾，不要自行裁決：記錄到 `FINDINGS.md`，用最保守的解讀繼續，並在回報裡列出。

---

## 0. 任務一句話

做一個**瀏覽器裡的模擬 Linux 終端機小遊戲**（約 15 分鐘、可存檔、可離線、單一 HTML 檔），內容與規則已經全部寫在資料包裡。你的工作是**實作引擎與介面**，並用資料包附的測資證明你的實作與參考實作一致。**你不需要也不應該創作劇情、改資料或改規則。**

## 1. 先讀這些（依序）

| 檔案 | 為什麼 |
|---|---|
| `demo/DEMO_DESIGN.md` | 這個試玩版是什麼、為什麼（10 分鐘） |
| `demo/flow.yaml` | **引擎行為的規格**：事件→動作規則、引導階梯、運算式、對話執行期、世界與 commit 規則 |
| `demo/demo.yaml` | 段落、指令白名單、發現、分數、稱號、存檔設定、黃金路徑 |
| `demo/integrity.yaml` | 匯入的安全規則與可信度分級（硬規則） |
| `demo/tools/savelib.py` | 存檔格式的**參考實作**（Python）。格式以它為準 |
| `demo/tools/flow_sim.py` | 流程的**參考實作**（Python，headless）。行為以它為準 |
| `docs/ENGINE_REQS.md` | 指令語意與快題 check 型別 |
| `demo/DESIGN_DECISIONS.md` | 已定的預設值（D1–D14）與誠實的極限 |
| `demo/testvectors/*.json` | 對照答案（見 §8） |

資料來源檔案（引擎要讀的）：`chapters/ch0_lighthouse.yaml`、`chapters/ch1_logport.yaml`、`quests/ch0.yaml`、`quests/ch1.yaml`、`dialogue/*.yaml`、`demo/dialogue/init_demo.yaml`、`branches/B0.yaml`、`cards/K0.yaml`、`text/**`、`tools/gen_logs.py`（日誌產生器規格）。

## 2. 範圍

**要做**
1. 模擬 shell：白名單 29 個指令（`demo.yaml` → `command_whitelist`），管線、`>`／`>>`、`&&`、`;`。
2. 虛擬檔案系統（Ch0 與 Ch1 縮小版）＋分支世界（深複製）。
3. 日誌產生器（移植 `tools/gen_logs.py`；試玩規模：seed 5、每天 100 行、30 天、`--npc`）。
4. 流程引擎：照 `flow.yaml` 實作事件、規則、快題、引導階梯、計時、對話執行期。
5. 存檔：commit 紀錄、雜湊鏈、匯出（檔案／代碼／值班證）、匯入（含安全規則與可信度）、`localStorage` 自動存檔。
6. 介面：終端機、任務面板、指令按鈕、結尾畫面（見 §6）。
7. 三種跑法：自助（預設）、kiosk（`?mode=kiosk`）、主持人帶（`?mode=host`）。
8. 測試：`node --test` 套件，重現 §8 的所有對照。

**不做**
- 不做 OJ 工單、鑰匙幣、多人、Ch1 完整版、B1 分支、正式版的匯入端（只做試玩版端的「匯出」與「匯入自己的存檔以繼續」）。
- 不加音效、不加外部資源（字型、CDN、分析、遙測）。
- 不改資料包檔案。要改就寫在 `FINDINGS.md`。
- 不用框架（React 等）。要用什麼函式庫，限於 §3 列的。

## 3. 技術決定（已定，不要重新討論）

- 產物：`dist/index.html`，**單一檔案**，用 `file://` 開、用 `https://` 開都要能跑，**整個過程零網路請求**。
- 語言：原生 JavaScript（ES2020）。允許 devDependency：`esbuild`、`js-yaml`（只在建置時把資料編譯進 HTML）。允許 vendored：`pako`（zlib，解壓時要能設上限）、選配 `qrcode-generator`。其他一律不要。
- 資料編譯：建置腳本把 yaml／text 讀進來，輸出一個 JSON 常數嵌入 HTML。**編譯腳本要檢查**每個 `content_ref`、`text_ref` 檔案存在。
- 瀏覽器：最新兩版的 Chrome、Safari（含 iOS 16.4+）、Firefox、Edge。手機寬度 360px 要可用。
- 測試：Node 18+，`node --test`。可選 Playwright（若環境有 Chromium）。
- 安全：見 §7。

建議檔案配置（可微調，但要說明）：

```
demo-app/
  package.json
  build.mjs                  # 資料編譯 + esbuild + 內嵌，輸出 dist/index.html
  src/
    data.js                  # （建置產生）編譯後的資料
    save/{canonical,crc32,hash,codec,validate,integrity,fold,score,card,import}.js
    expr.js                  # flow 的運算式解析器（不得用 eval／new Function）
    vfs.js  shell/{parse,exec,commands/*}.js  loggen.js
    engine/{state,events,rules,dialogue,quests,ladder,timers,branch}.js
    ui/{terminal,panel,chips,endscreen,kiosk,a11y,theme}.js
    main.js
  test/*.test.mjs
  FINDINGS.md  REPORT.md
```

## 4. 存檔格式（正規；細節以 `savelib.py` 為準）

- **規範化 JSON**：鍵依 Unicode 排序、無空白、整數、字串全部是 ASCII（形狀規則保證）。**JavaScript 的 `JSON.stringify` 不排序鍵**，要自己寫。
- **commit**：`{id, parent, branch, chapter, kind, data, t, r}`；`id = sha256_hex(utf8((parent ?? '') + canonical({branch, chapter, kind, data, t, r})))` 取前 8 碼。`sha256` 用 `crypto.subtle.digest`（非同步）；Node 測試用 `crypto.webcrypto`。
- **代碼**：`RA1-` + base64url（不補 `=`）(zlib(utf8(canonical(pack(save))))) + `-` + CRC32 的 8 碼小寫十六進位（CRC 的輸入是 `"RA1-" + base64 部分`）。zlib 要是 RFC 1950 格式（有 header，`pako.deflate`／`CompressionStream('deflate')`），壓縮等級不拘。
- **pack**：`{m: 存檔去掉 commits（含 head）, c: [[kind, data, dt, dr, branch|0, chapter|0], …]}`；`flag` 的 data 縮成不含 `flag.` 前綴的字串；`dt`、`dr` 是相對上一個 commit 的差；`branch` 為 main 時寫 0、`chapter` 為 ch0 時寫 0。匯入時重建 id 與 parent，最後用 `head` 對帳。
- **匯入的順序**（每一步失敗都拒絕，訊息見 `savelib.py`）：去空白 → 長度 ≤ 8000 → 前綴 → CRC → 字元集 → base64url 解碼 → **帶上限的解壓**（≤ 262,144 bytes，超過就中止，**不可以先全解再量**）→ JSON 解析（拒絕浮點數與 NaN）→ unpack → `check_shape`（`integrity.yaml` 的每一條）→ 計算可信度。
- **三級**：完整／可疑／損毀（定義在 `integrity.yaml`）。文案**不得**出現「已驗證」「防偽」。

匯出前必須**自我檢查**：把剛匯出的代碼立刻匯入一次，鏈尾 id 必須相同；不同就顯示警告並提供原始 JSON 下載。

## 5. 流程引擎（`flow.yaml` 的實作要點）

下列是容易做錯的地方；完整規格在 `flow.yaml`，行為以 `tools/flow_sim.py` 為準。

1. **YAML 陷阱**：規則的事件欄位叫 `event`（不是 `on`；PyYAML 會把 `on` 變成布林）。你用 js-yaml（YAML 1.2）不會踩到，但不要改檔名或欄位。
2. **指令管線順序**（`command_pipeline.order`）：空行忽略 → INPUT／CHOICE 模式優先 → 解析執行 → 發 `file.read`（每檔一次）→ 發 `cmd` → 規則由上到下，`stop: true` 擋住後面的 `cmd` 規則（**不擋 `state` 規則與 `flag.set` 連鎖**）→ 快題評估 → 連鎖處理直到沒有新事件 → 寫 commit。
3. **file.read 的定義**在 `flow.yaml` → `file_read`。`mail` 內建指令視為讀了 `/var/mail/op`。
4. **快題**：依序啟用；啟用瞬間用最近 20 筆歷史補登；`skip` 要輸入兩次（10 秒內）；`skip` 寫 `skip` commit（不是 `task`），仍套用 `on_done` 的 sets／gives／checkpoint。
5. **引導階梯**：`guidance` 由上而下取第一個 `when` 為真者；idle 30／60／90 秒與 `hint` 指令共用同一個計數器（每個 ladder id 一個，持久，上限 3）；每顯示一階寫一個 `hint` commit（`full` = 該節點是否設 `flag.demo.used_full_hint`）。`g.none` 只回應 `hint` 指令，idle 不發。
6. **計時**：自 `flag.demo.started` 起算。14:00 預告、15:00 收尾；若 15:00 時正在投票，再給 60 秒，仍沒投就以未投票結束。INPUT 模式不累計閒置。
7. **分支 B0**：深複製世界；旗標全域；`rm -rf ~` 在 main 被攔下（不執行），在分支裡執行（家目錄保留為空）；`empty('~/notes') or empty('~')` 為真時建立 `/lost+found/#0` 並設 `flag.b0.lost0_created`；在分支內讀 `/lost+found/#0` 設 `flag.b0.read_lost0`；`merge --knowledge` 成功才給 K0。所有固定文字與 `B0.yaml` 一字不差（建置腳本要比對）。
8. **寬鬆行為**（`lenient_deviations`）：`ln` 目的以 `/` 結尾且不存在就建立；`rm -rf ~` 保留家目錄；`cd` 到不存在的地方不改變 cwd。
9. **口令輸入**：答錯留在輸入模式；輸入看起來像指令就自動離開並執行。
10. **運算式**（`flow.yaml` → `vocabulary.expressions`）：自己寫解析器。`testvectors/walkthrough.json` 的 `expr` 有 25 個案例與 6 個必須報錯的案例。
11. **commit 的時間**：`r` = 自 `flag.demo.started` 起的毫秒；`t` = 世界秒（每個有效指令 +30、渡海 +600）。headless 測試用虛擬時鐘，兩者都必須與測資逐位元相同。

## 6. 介面規格

**版面**（桌機）

```
┌──────────────────────────────────────────────┬─────────────────┐
│ ROOT ARCHIPELAGO  試玩版〈第一夜〉   ⏱ 07:42 │ 目前任務         │
│ ──────────────────────────────────────────── │ Q0-2 讀手冊      │
│  （終端機輸出，可捲動）                       │ （quests 的 prompt）│
│                                              │ 提示 ○○○        │
│ op-zien@lighthouse:~$ █                      │ 發現 3 / 12      │
│                                              │ 存檔 ● 已自動存  │
├──────────────────────────────────────────────┴─────────────────┤
│ [ls] [ls -a] [cat] [grep] [grep -r] [cd] [git] [hint] [save]    │
└─────────────────────────────────────────────────────────────────┘
```

- 手機：任務面板收成頂端可展開的一列；指令按鈕列固定在鍵盤上方；輸入框 `autocapitalize=off autocorrect=off spellcheck=false`。
- 按鈕：點一下把文字填進輸入列（不自動送出）；`hint`、`save` 例外（直接執行）。
- Tab 補全：指令名稱與目前資料夾的檔名。上下鍵叫出歷史。
- 提示符：`op-<暱稱>@<主機>:<路徑>$ `；在分支裡改為 `op-<暱稱>@<主機>(alt/sandbox):<路徑>$ `。主機是 `lighthouse` 或 `logport`。
- 輸出逐字顯示（每字 12 ms，可按任意鍵或點一下立即顯示完；`prefers-reduced-motion` 時直接顯示）。
- 計時顯示在右上，不閃爍；14:00 之後變色**並**附文字（不只靠顏色）。
- 「發現 n / 12」只顯示數量，不顯示內容。
- 主題：深色、高對比兩種；字級可調（小／中／大）；`prefers-color-scheme` 預設。
- **結尾畫面**：值班證（**DOM 卡片**，欄位同 `savelib.card()`；另提供「複製成純文字」）、存檔代碼（唯讀文字區＋「複製」按鈕，複製失敗時選取全文並提示手動複製）、下載 `{nick}.rasave.json`、「這份代碼包含什麼」說明（暱稱、種子、事件、時間；不含真實姓名、IP、裝置資訊）、重新開始。
- **kiosk**（`?mode=kiosk`）：閒置 120 秒自動回歡迎畫面；結尾畫面顯示代碼與值班證，並詢問是否清除本機存檔，預設清除；不顯示下載。
- **host**（`?mode=host`）：大字級、只走 seg1–seg4 + seg7（`demo.yaml` → `run_modes.host_led`；做法建議：Q0 全做，`flag.lamp_lit` 之後略過分支與 Ch1，直接播 `demo_vote` 再結尾；host 模式的存檔不供匯入正式版（共用螢幕，沒有個人暱稱的意義）。請在 FINDINGS 裡寫你實際怎麼做）。
- 歡迎畫面：標題、一句話賣點（`demo.yaml` → `pitch`）、「繼續上次的存檔」（若 localStorage 有）、「貼上存檔代碼」。
- **無障礙**：全程可用鍵盤；終端機區域 `role="log" aria-live="polite"`；對比至少 4.5:1；不依賴顏色表達狀態；按鈕有可讀標籤。

## 7. 安全與隱私（硬規則）

1. 所有來自玩家或存檔的字串（暱稱、代碼內容、指令）一律用 `textContent` 顯示；**不使用 `innerHTML`**（除了你自己寫死的靜態模板）。
2. `<meta http-equiv="Content-Security-Policy">`：`default-src 'none'; script-src 'sha256-…'（建置時計算）; style-src 'sha256-…' 或 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'`。頁面不得因 CSP 出現任何違規報告。
3. 不使用 `eval`、`new Function`、`setTimeout(字串)`。
4. 零網路請求：測試要用 Playwright（或等價方法）斷言整個走法期間沒有任何請求。
5. `localStorage`、`navigator.clipboard` 全部包 `try/catch`，失敗時頁面照常運作。
6. 匯入的所有硬規則見 `integrity.yaml`；測資有 30 個必拒案例。
7. 隱私：不收集、不上傳。匯出前顯示一次「這份代碼包含什麼」。

## 8. 驗收：你必須讓這些全部通過（這是你的測試套件）

資料包已附對照答案（`demo/testvectors/`）。**每一項都要有 `node --test` 測試**，測試名稱要對應下表的代號。

| 代號 | 內容 | 來源 | 通過條件 |
|---|---|---|---|
| T1 | 規範化、commit id、CRC32 | `vectors.json` → `canonical_and_id`、`crc32` | 全部相同 |
| T2 | 匯入：可接受（9）與可疑（3） | `vectors.json` → `accept`、`suspicious` | 每個都接受；`expect` 的每個欄位相同（nick、n_commits、head、level、score、title_id、tasks、finds、vote、fullgame…）；可疑的原因清單相同 |
| T3 | 匯入：必拒（30） | `vectors.json` → `reject` | 每個都被拒絕，**不丟出未捕捉的例外**，**不卡住**（zip_bomb 要在 1 秒內被拒） |
| T4 | 竄改的存檔檔案 | `vectors.json` → `file_tampered` | 接受、level=broken、不給徽章 |
| T5 | 運算式 | `walkthrough.json` → `expr` | 25 個案例結果相同；6 個錯誤案例都丟錯誤 |
| T6 | 虛擬檔案系統 | `conformance.json` → `vfs` | 靜態檔的 sha256 全部相同；目錄集合相同；沒有多餘檔案（含空資料夾） |
| T7 | 指令案例 | `conformance.json` → `cases` | `needs_identical_log: false` 的案例 stdout 與 rc 逐字相同；`true` 的案例見 T8 |
| T8 | 日誌 | `conformance.json` → `log` | **目標**：`access.log` 的 sha256 與 `manifest` 完全相同（移植 gen_logs.py，mulberry32 與整數運算要逐位元一致）。做不到 → 守不變量 I1–I7，並在 REPORT 明講；此時 `needs_identical_log: true` 的案例改成斷言 manifest 數值 |
| T9 | 快題判定 | `conformance.json` → `quests` | 每題的 `pass` 都通過 check、`fail` 都被擋下 |
| T10 | **走法重播（最重要）** | `walkthrough.json` → `walkthroughs`（digger、newbie、edge、timeup） | 用同樣的輸入與虛擬時鐘重播：①`says`（對話節點序列）相同；②`commits` 逐筆相同（kind、data、branch、chapter、t、r，**連 id 都相同**）；③`summary` 相同；④匯出的代碼用 Python 的 `check_codes.py` 全部「完整」 |
| T11 | 互通 | 你的 4 條走法匯出的代碼 → `python3 demo/tools/check_codes.py codes.txt` | 全部「完整」，結論與 T10 相同（壓縮位元組可以和 Python 不同） |
| T12 | 介面（Playwright，若環境有 Chromium） | 見下 | 全部通過 |

**T12 介面斷言**：①整個走法沒有任何網路請求、沒有 console error、沒有 CSP 違規；②暱稱 `<img src=x onerror=alert(1)>` 被格式規則擋下，且存檔裡塞這個字串的代碼被拒；③360px 寬度沒有水平捲軸、指令按鈕可點；④只用鍵盤走完 Ch0 的 Q0-1（含 Tab 補全）；⑤`localStorage` 禁用時整個流程照常；⑥重新整理後「繼續上次的存檔」還原到同一個狀態（`head` 相同）；⑦kiosk 閒置 120 秒重置（可用假時鐘）；⑧結尾畫面顯示的代碼匯入後鏈尾相同；⑨高對比主題可切換、字級可調。

**一個還沒有對照答案的東西**：真人節奏。請在 REPORT 裡附上你自己的一次完整走法的實際耗時與你覺得卡的地方，但**不要**為了達到 15 分鐘去改資料或規則。

## 9. 工作方式

- **先做測試再做功能**：M1 完成時 T1–T4 要綠；M3 完成時 T5–T9 要綠；M4 完成時 T10 要綠；然後才做 M5 以後的介面。
- 小步提交；每個里程碑一個提交，訊息寫通過了哪些 T。
- 遇到規格不清楚：選最保守的解讀，寫進 `FINDINGS.md`（編號、位置、你的解讀、影響），繼續。**不要停下來問**，除非阻塞到無法繼續。
- 發現資料 bug：寫進 `FINDINGS.md`，不要改資料。
- 不要為了通過測試去改測資或工具。測資與參考實作若看起來有錯，寫進 `FINDINGS.md`。
- 時間盒：每個里程碑超過預期兩倍就在 REPORT 裡說明原因。

## 10. 里程碑

| 里程碑 | 內容 | 結束條件 |
|---|---|---|
| M0 | 專案骨架、資料編譯腳本、`dist/index.html` 能開出空白頁；`content_ref` 檢查 | 建置成功；資料常數大小 < 1.5 MB |
| M1 | 存檔庫（§4）＋匯入安全規則＋可信度 | T1–T4 綠 |
| M2 | 運算式、虛擬檔案系統、shell（解析、管線、重導向）、指令白名單 | T5–T7 綠（日誌之外） |
| M3 | 日誌產生器、快題判定 | T6–T9 綠 |
| M4 | 流程引擎（事件、規則、快題、階梯、計時、分支、對話執行期） | **T10 四條走法全綠** |
| M5 | 介面、結尾畫面、存檔出入口 | T12 ①–⑥ 綠 |
| M6 | kiosk、host 模式、無障礙、主題 | T12 ⑦–⑨ 綠 |
| M7 | 打包、REPORT.md | 見 §11 |

## 11. 回報格式（`REPORT.md`，我會轉給需求方）

```
# 回報：試玩版〈第一夜〉前端
版本：<commit/日期>    產物：dist/index.html（<大小> KB）

## 測試（每項：通過／不通過＋一句話）
T1 … T12

## 我做的決定（沒有寫在規格裡的）
- …

## FINDINGS（規格不清、資料 bug、測資疑問）
F-xx …

## 沒能驗證的
- （例如：沒有 Chromium 所以 T12 沒跑；沒有 Python 所以 T11 沒跑，代碼附在 codes.txt 請需求方執行）

## 自己走一遍的節奏
- 實際耗時：…  卡住的地方：…

## 已知問題
- …
```

沒做、沒驗證的東西一律寫在「沒能驗證的」。**不要說「應該可以」**；說「通過」要附測試名稱。

## 12. 定義「完成」

T1–T11 全綠（T12 在有 Chromium 的環境也要綠）；`dist/index.html` 在 `file://` 與 `https://` 都能從頭玩到尾；REPORT.md 完整；沒有 `FINDINGS` 以外的懸而未決事項。
