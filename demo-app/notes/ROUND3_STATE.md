# 第三輪獨立審查：狀態／存檔

日期：2026-10-30。審查基準 HEAD：`089d39b4897b1a90a60bca5ad15357e5548c0e75`。

## 結論

**3 個已重現的新問題，4 個正常紅測試；不重開 CRIT-01–06。建議修正後再驗收。**

| 編號 | 優先級 | 問題 | 證據 |
| --- | --- | --- | --- |
| R3-STATE-01 | P1 | 狀態動作失敗後，下一個 tick 會把不可回放 journal 覆寫成「已自動存檔」 | Chrome 真 UI＋直接 Engine 探查 |
| R3-STATE-03 | P1 | 閒置舊分頁無提示覆寫另一分頁已保存的新任務與檔案紀錄 | Chrome 同 context、兩個真分頁 |
| R3-STATE-02 | P2 | restore 只保留事件數預算，未處理 r/t 硬上限；准入後一次 hint 即使存檔失效 | 兩個確定性 Engine／RA1 往返紅測試 |

僅新增 `demo-app/notes/ROUND3_STATE.md` 與 `demo-app/test/round3-state.test.mjs`。未修改實作、既有測試、來源資料／規則／測資、dist 或其他產物；未建置、未 commit、未派其他代理。同期出現的 `test/round3-shell.test.mjs` 不屬本代理修改，亦未介入 shell／無障礙／輸入 UX 審查。

已閱讀使用者指定的 AGENT_BUILD_PROMPT、REPORT、FINDINGS、CRITIQUE、engine-hardening、main、storage、Engine 與全部 `src/save/`；並查閱相關 VFS、flow、Python 參考與現有回歸。未找到 AGENTS.md。

## R3-STATE-01 — P1：失敗事件沒有交易回滾，autosave 會保存必定再次拋錯的 journal

**位置**：

- `src/main.js:177–181`：先把輸入加入 journal，再執行可能失敗的 `engine.feed`。
- `src/main.js:191–208,318–324`：tick 無條件嘗試持久化；僅檢查 shape 與 journal 靜態型別，沒有判斷先前交易失敗／可回放性。
- `src/engine/index.js:335–348`：state rule 在動作成功前即消耗 `once`。
- `src/engine/index.js:217–221,519–537`：Shell 變動之後再做 create_file，create_file 例外無回滾。
- `src/vfs.js:41–49,82–85`：父路徑若已是一般檔案，建立 `/lost+found/#0` 會拋錯。

**Chrome 重現**（file://；無注入 JS、無編輯 localStorage、無 mock VFS）：

1. 開始、暱稱 `atomicqa`。
2. 依序輸入 `ls`、`cat handbook.md`、`ls -a notes`、`grep lamp logs/lamp.log`、`grep -r KEY-FRAG ~`、`systemctl start lamp`、`lamp-before-sudo`。
3. 輸入 `echo BLOCK > /lost+found`、`git checkout -b alt/sandbox`。
4. 輸入 `rm -rf ~/notes`。Shell 刪除成功後，規則建立 lost0 時拋 `/lost+found: File exists`；UI 捕捉錯誤，仍可操作。
5. 推進 250ms 讓下一個正常 tick 自動存檔，刷新，再按繼續。

**預期**：失敗事件應保留／回復最後可回放快照，或以明確、可重播的失敗記錄表示；不能把正常續玩入口替換成必錯資料。不能只把錯誤文案隱藏。

**實際**：

- 直接 Engine 實測：`notesEmpty=true`、`once.has('r.notes_emptied')=true`，但 `flag.b0.lost0_created=false`；事件已半套用。
- 下一個 UI tick 仍顯示 `● 已自動存檔`，寫入包括失敗 `rm -rf ~/notes` 的 journal。
- 刷新續玩穩定拋出 `/lost+found: File exists`，進入 `#local-recovery`。原本可以重播的 envelope 已被較新的失敗紀錄覆寫；只還原事件不能精準保留任意檔案改動。

**紅測試**：`R3-STATE-01 browser: a handled state-rule failure cannot autosave an unreplayable journal`（`test/round3-state.test.mjs:136–157`），預期 welcome error 為空，實際為上述 File exists。沒有 uncaught pageerror／console error；這是已捕捉錯誤後的資料問題，不是測試工具錯誤。

**來源歸屬**：來源參考 `demo/tools/flow_sim.py:207–210,354–368` 同樣先標 once、再做可能失敗的 mkdir/copy，具有相同半交易結構；此項為靜態查核，**未在 Python 執行重現**。瀏覽器 journal／後續 autosave／救援則是本 app 的整合層，來源參考沒有這部分。未更改來源行為或測資。

**修正方向**：對 feed／advance 及 journal 寫入建立一致的交易邊界；出錯時不得讓下一個 tick 默認該交易已提交。不要只刪除失敗 journal step，卻保留它已造成的 VFS／once／flags／clock 變更，否則同樣不可能精準回放。

## R3-STATE-03 — P1：另一個分頁的 idle autosave 會回滾較新進度

**位置**：`src/main.js:24,195–208,318–324`；`src/storage.js:2,17–23`。

**重現**：

1. 同一 browser context 開分頁 A，暱稱 `twotabs`，輸入 `echo ALPHA > notes/a.txt`。
2. 開相同 file:// URL 的分頁 B，按「繼續上次的存檔」。
3. B 輸入 `ls` 完成 Q0-1，再輸入 `echo BETA > notes/b.txt`。確認顯示已自動存檔，storage 內確有 BETA step。
4. 不再操作 A；只讓 A 的計時器跑 250ms。

**預期**：已過時的分頁應停寫／提示衝突或保留另一份快照，不能無提示覆蓋另一分頁已確認保存的資料。偵測不可只看 head：任意檔案修改可能不產生新 commit。

**實際**：A 每次 tick 都用自己的記憶體內容覆寫固定 `ra.demo.save.v1`，沒有所有權、版本／revision、衝突檢查或 storage change 處理。探查快照：

| 時點 | storage head | journal 筆數 | 包含 BETA 檔案步驟 |
| --- | --- | ---: | --- |
| B 顯示已自動存檔後 | `b1965153` | 5 | 是 |
| A 無任何輸入的下一個 tick | `e10de7e4` | 3 | 否 |

新任務與新檔案的唯一保存版本被回滾；B 若緊接著刷新，將讀到 A 的舊版。這不需要競速到 sub-ms，也不需要手改存檔、假造 metadata 或停用 Storage。測試只使用假時鐘決定哪個分頁先跑下一個正常 tick，瀏覽器儲存與 DOM 皆為真實實作。

**紅測試**：`R3-STATE-03 browser: an idle older tab must not overwrite a newer continued shift`（`test/round3-state.test.mjs:159–181`），BETA step 存在斷言由 true 變 false。

**來源歸屬**：app 的多分頁持久化整合問題；Python 來源沒有 localStorage／多分頁層，不是來源測資錯誤。

**修正方向**：明確定義並落實寫入所有權／過期 session 的衝突處理，保護整份 envelope（包含無 commit 的檔案紀錄），而非每個 tick 都搶寫同一 key。所有權政策也應一致套用於 restart／kiosk clear；後兩者跨分頁刪除行為本輪**未實測，不另列發現**。

## R3-STATE-02 — P2：r/t 沒有續玩准入／執行端界線

**位置**：

- `src/save/validate.js:42–44`、來源 `demo/integrity.yaml:15–16`：`r <= 2700000`、`t <= 1000000`，不可倒退。
- `src/engine/index.js:661–674`：從最後 commit 恢復 now/world_t，把已過的所有 timer 標為 fired；准入只看 commit 數量預算。
- `src/engine/index.js:121,155–168,519–520`：新指令推進 world_t，寫 commit 時不保護 r/t 上界。

**確定性重現**：

1. 正常 Engine.start＋合法暱稱，保留 `flag.demo.started` 首筆 `r=0,t=0`。
2. 用公開 save API 追加一筆合法 `checkpoint {id:'ckpt/clock-edge'}`；分別令 `(r,t)=(1000,1000000)` 與 `(2700000,30)`。
3. 兩份都通過 checkShape、level=`intact`、exportCode→importCode；沒有修改來源規則或原始測資。
4. Engine.restore 皆成功；兩份只有 2 commits、剩餘事件保留 122，**不是已關閉的事件數過滿案例**。
5. 呼叫 `feed('hint', .001)`。

**實際新 commit**：

| 起始邊界 | 新 hint 的 r | 新 hint 的 t | 新 hint id |
| --- | ---: | ---: | --- |
| t 上界 | 1001 | **1000030** | `b98cbdd0` |
| r 上界 | **2700001** | 60 | `c8d2183c` |

兩份的 checkShape 都變成 `CodeError: commit #2 的時間欄位不合規則`。r 案例還有 now=2700、840/900/960 全被標 fired 的問題，後續不會補跑原本的結尾保險。

**預期**：如果已准入為可續玩的存檔，下一個支援操作不可產生自己必拒的新資料；也可像事件預算一樣，在獨立候選上明確拒絕不安全的活動存檔，保留目前 session／原鏈。不能增大來源硬上限、截斷舊時間或改 hash chain。已結束的合法邊界存檔仍應可讀。

**紅測試**：`R3-STATE-02 t/r: an admitted hard-limit clock cannot poison the next supported input`（`test/round3-state.test.mjs:28–59`）。兩個測試都確認合法鏈／RA1 往返後才測 restore 與下一次指令；保留原始輸入不變的斷言。亦允許無副作用、明確的 CodeError 准入拒絕，不強迫採用某個修正策略。

**驗證邊界**：這是經由實際 save／Engine API 重現的外部合法匯入邊界，不聲稱典型十五分鐘真人走法會自然產生這兩個極端時間，也**未將這兩份碼另走 UI 匯入**。UI 會走同一 Engine.fromSave，但其完整 UI 結果仍是靜態推論。來源 Python `flow_sim.py:134–138,552` 同樣沒有新增 commit 的時間上界保護（靜態），但沒有本 app 的 restore 准入邏輯；未在 Python 重現。

## 測試實錄與反向檢查

執行方式（不經 `npm test`，避免 pretest 建置）：

```powershell
$env:RA_PLAYWRIGHT = 'file:///C:/Users/user/AppData/Local/Temp/opencode/ra-browser-tools/node_modules/playwright/index.mjs'
$env:RA_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/round3-state.test.mjs
```

最後一次：**6 tests，2 pass、4 fail、0 skip、0 cancelled、0 todo，2.10 秒，exit 1**。

- 4 fail 全為上述明確不變量失敗，不使用 todo／expected-failure，不放寬問題斷言。
- 2 pass：已結束、同時達 r/t 上界的存檔仍可完整往返與讀取；writeLocal 字串容量失敗不覆寫舊值，checkJournal 接受恰好 20000 筆並拒絕 20001 筆。後者是單元邊界，不冒稱已驗證完整 UI 容量耗盡體驗。
- 初次測試檔試跑另發現本檔自己的 hook 參數順序錯誤，以及正向控制錯用 JSON 鍵順序作相等比較；已更正測試建置問題後重跑。未把這些誤報為 app bug，未修改上述 4 個真缺陷的斷言。
- optional Playwright 在登記 tests 前載入；每個測試與 hooks 有 timeout，所有迴圈固定上限，沒有無限 fuzz。
- Chrome 黑箱使用現有 dist，未重建；受測 dist SHA-256：`f670df727186839e3875231ffafe71cc9075dfb12ea7a728887fda28e7b8fa0f`。
- 已閱讀原模式／metadata／救援政策與其現有測試；本輪沒有確認第四個獨立、值得重報的新模式或救援缺陷，故不湊滿五項。不把已關閉 CRIT、RA1 缺任意檔案／cwd 的既有限制、容量告警本身重報成新問題。
- 未跑完整既有 292 項（其中既有測試會寫 notes/codes.txt，與本代理只可新增兩檔的限制不符）；未重新驗證 HTTPS、Safari／iOS／Firefox／Edge、真人節奏、無障礙／輸入 UX、來源 Python 完整走法。本文件不新增這些通過宣稱。
