# 第三輪狀態修復與 main 整合契約

日期：2026-10-30。對應 `ROUND3_STATE.md` 的 R3-STATE-01／02／03。

## 本代理交付範圍

- 修改 `src/engine/index.js`：完整 Engine 交易／輸出緩衝、clock 准入與執行期上限防護。
- 新增 `src/ui/session-storage.js`：同步 read baseline、async Web Locks 優先的整份 envelope compare+write／clear。
- 新增 `test/round3-state-hardening.test.mjs`：21 項確定性測試。
- 新增本文件。不改原紅測試，不 commit、不建置、不跑 browser。
- **未修改 main.js、storage.js、既有 UI／CSS、既有測試、來源規則／測資或 dist。** 同期這些檔案的其他代理／主代理變更不是本代理修改。
- `feedCommand` 的 readEvents／read-time inode 接線由主代理修改；本代理原樣保留該區，只把指令的 `world_t += 30` 換成具上限檢查的 `advanceWorld(30)`。

## R3-STATE-01：Engine 交易

`start()`／`feed()`／`advance()` 以 `transaction()` 包裝；其內部步驟方法是 `startSession()`／`feedInput()`／`advanceClock()`。app 仍應序列化、逐一 await 公開入口，不要直接呼叫內部步驟或並行修改同一 Engine。

最外層操作只建一份快照，巢狀 `feed -> advance` 沿用交易。失敗時回復：

- flags／items／cards／finds、once、必要事件預算、提示階梯、任務、skip、延後事件與事件 queue；
- now／t0／last_input／world_t／commandCount、idle／timer 已觸發集合、INPUT／CHOICE；
- save 與原 commits／head、trace、outputs、history；
- 目前 VFS 與 main_snapshot，包括 cwd、nodes／inodes／硬連結圖、變體、nextInode；
- branch／world／ended／started。失敗時保留原公開 VFS、save、flags 物件身分；所有世界的 flags 仍指向同一個 Set。

成功前不呼叫 `onOutput`；整筆成功後依原順序發送。不深拷貝不會變動的舊 stdout／history／trace 字串；快照以長度還原 append-only transcript，以 VFS metadata clone 保存共享不可變檔案字串，避免每個 250ms tick 重新序列化大型歷史。

**UI observer 例外政策**：輸出發布已在交易提交後；如果 `onOutput` 自身拋錯，不能撤回已顯示的文字。因此隔離該 observer 錯誤於 `engine.outputError`，不使已提交的 feed 假裝失敗，避免 main 拒寫成功交易的 journal。這不是忽略 Engine 執行錯誤；執行錯誤仍完整 rollback 並 reject。

主代理已接的 staging 必須保留：feed 成功才 append input journal；advance 前建立候選 journal、成功才發布。**不要只刪 journal step 而保留該次 Engine 變更。** 失敗後 Engine 與 journal 都應維持各自最後已提交狀態，之後的 autosave 才可安全寫入。

測試包含原 `/lost+found` 檔案衝突、37 秒巢狀 advance 中已發生的 hint／commit 回滾、end 動作完成後注入錯誤、branch enter／exit 中途失敗、VFS／flags 身分關聯與重試後相同 ID；失敗操作沒有 callback 輸出外流。

## R3-STATE-02：時間上限

- 不改 integrity 的 `max_t=1000000`／`max_r_ms=2700000`，不截斷時間、不改既有 hash 或移除 commit。
- 活動中 restore 使用獨立候選；若 `t > max_t - 30`、已達 960 秒，或已達 900 秒卻不在投票狀態，明確 CodeError 拒絕後才不發布候選。這是保守的「可安全續玩」准入，不是改變正規存檔的 shape／可信度判定。已結束的合法極限存檔仍可匯入、help、匯出。
- 每次有效指令 +30、渡海 +600，都先檢查世界時間，不會先溢出再靠匯出拒絕。即使一直執行無 commit 的 help，也不能把 runtime 推到非法 t；到達世界上界後會拒絕下一筆需要加世界時間的指令，保留原狀，timer-only 結尾及直接存檔 API 仍可執行。
- commit 前檢查 r/t 上限及不可倒退，交易結束再檢查 runtime 界線。中途不安全的 ferry／hint／任務操作與輸出都一併回復。
- 一小時休眠仍保留 now=3600 的真實 elapsed wall time，於原 960 秒保險邊界寫 end；不把 journal 牆鐘時間錯當成 commit.r 上限。

## R3-STATE-03：main 必須如何整合 helper

```js
import {createSessionStorage} from './ui/session-storage.js';
const sessionStore = createSessionStorage(); // 預設 ra.demo.save.v1

// 同步固定 expected 字串；後面的候選重播必須使用這一次讀到的 value。
const read = sessionStore.load();
if (!read.ok) { /* 顯示不可讀／格式錯誤；不要把失敗當成可覆寫的空存檔 */ }
const envelope = read.value;
// await 建立／重播候選 Engine ... 此期間別的分頁可能寫入。

// 所有 autosave 都 await；這裡不能再 load()，否則會暗自認領別人的新版本。
const result = await sessionStore.write({version:1,runMode,save,baseSave,journal});
if (!result.ok) { /* conflict: 停止寫入並提示；其他原因: 顯示未保存 */ }

// restart／kiosk 清除也必須走相同 guard，不能繞回 clearLocal()。
const removed = await sessionStore.clear();
if (!removed.ok) { /* 不得顯示已清除，更不得接著刪除他人的救援備份 */ }

// 主代理負責同 storage area 的事件接線及提示；事件不會自動 adopt。
window.addEventListener('storage', event => {
  const state = sessionStore.observe(event);
  if (!state.ok) { /* 提示另一個分頁已更新；保留目前記憶體進度供匯出 */ }
});
```

### API

| API | 同步／非同步 | 契約 |
| --- | --- | --- |
| `createSessionStorage({key,storage,locks,maxChars})` | 同步 | 都可省略；預設真實 localStorage、navigator.locks、2,000,000 字元。`locks:null` 明確選 fallback，測試可注入 fake storage／lock manager。 |
| `load()` | 同步 | 成功回 `{ok:true,value,text}`；固定**整份原始字串**，不是 head。明確重載可解除 conflict。讀取失敗不假設 storage 為空，後續拒寫 `unloaded`。非法 JSON／過大資料仍回原 text 供保全；main 必須檢查 ok、驗證內容，不能自動覆寫。 |
| `check()` | 同步 | 只檢查目前 bytes 是否仍相同，不採納新版本；不能把它當作稍後寫入的原子授權。 |
| `observe(event)` | 同步 | 相關 key（或 clear-all）的 newValue 不同即 latch conflict；不重新 load，不 adopt。即使目前 bytes 已回到舊值，仍能保守處理已觀察到的 ABA 事件。其他 key 忽略。main 應只傳同一 storage area 的事件。 |
| `write(value)` | async | 先快照 JSON，再在 exclusive lock 內最後 compare+set。只有 set 成功才更新 expected。 |
| `clear()` | async | exclusive lock 內 compare+remove，只有成功才把 expected 設為 null。stale writer 不可藉 restart／kiosk 刪除新資料。 |
| `.loaded`／`.conflicted` | 同步 getter | conflict 一旦發生，write／clear 持續拒絕，直到明確 load；不可在每個 tick 為了消掉錯誤而 load。 |

失敗 `reason`：`unloaded`／`conflict`／`unavailable`／`invalid`／`too_large`。只有真正進入寫入／清除保護區的結果帶 `protection: 'web-lock' | 'best-effort'`。

### 所有權與競態邊界

- 優先呼叫 `navigator.locks.request('root-archipelago:storage:' + key, {mode:'exclusive'}, ...)`，比較與 mutation 都在同一 lock callback，沒有 compare 與 set／remove 之間的 await。所有合作 writer／clearer 必須使用相同 helper／key。
- Locks 可用但 request 失敗時回 unavailable，**不悄悄降級**。Storage API 的 throw 在 lock callback 內轉成明確失敗，不留給 callback rejection 改變儲存 baseline。
- 沒有 Web Locks 時，只保證同一 JavaScript task 中同步 compare+mutation，結果明示 best-effort，**不聲稱跨 process 全域原子**。storage event 是額外的保守失效通知，不是跨瀏覽器鎖。
- `load()` 必須在讀取／開始候選重播的當下建立 expected，且只在明確的開始／匯入／續玩／重載決定時使用；不可先用 readLocal 取舊資料，等候選建好後才 load 新版來替舊候選背書。
- Primary save 發生 conflict 時，禁止繞過 guard 呼叫 writeLocal／clearLocal；不要把 stale tab 的 reset／kiosk idle 清除當成有權清掉新 primary 或 recovery。
- 若要寫／清 `RECOVERY_KEY`，對該 key 也建立 guard 並固定自己的 read baseline；primary ownership 失敗時不要繼續清 recovery。此 helper 不宣稱多個 key 的刪除是同一筆跨 key 原子交易。
- 跨分頁提示、保存記憶體版本的匯出、何時允許使用者明確 adopt 最新版，由主代理 main 接線。本輪未實跑 browser，也不宣稱所有瀏覽器競態已解。

## 驗證

全部直接使用 `node --test`，沒有 npm pretest／build、沒有 browser。每個新測試有 5–10 秒 timeout，固定 100 次效率迴圈；每次整批命令 shell timeout 60 秒。

```powershell
node --test --test-concurrency=1 --test-skip-pattern="T11:" test/engine.test.mjs test/engine-hardening.test.mjs test/world.test.mjs test/round3-state-hardening.test.mjs
```

最後一次：**選中的 143 項，143 pass、0 fail、0 cancelled、0 skip、0 todo，12.20 秒**。命令刻意不選 T11，以免既有該測試重寫 notes/codes.txt；不是把缺陷測試跳過來湊綠。

- 新增硬化測試 **21/21**，包括 native API 形式的 Web Lock 串行 mock、同 head 不同 journal 的 stale 拒寫／拒刪、重播 async gap、ABA event、quota／SecurityError、fallback 標示與 lock request 失敗不降級。
- T10 四走法的 says、每筆 commit／ID、summary 仍完全一致；既有 Engine hardening 7 項壓測與 world T6–T9 通過。
- 4 MB 既有 stdout／檔案、100 次 .25 秒交易：最後一次 **3.58ms**，沒有每 tick 重序列化舊輸出或更換成功操作的 VFS 身分。此為本機微基準，不推稱所有裝置效能。
- 較早一輪 142 項（新增兩個反向控制前）也全過，包含 T11 JS／Python 互通；該既有測試自行寫出的 notes/codes.txt 與 Git 原內容相同，`git diff --exit-code -- demo-app/notes/codes.txt` 通過。後續使用明確 skip-pattern 避免再次寫該檔。
- 一次初跑揭露 lock callback 直接 throw 的收尾停滯（5 秒測試 timeout）；已將 storage throw 在 lock callback 內轉為 unavailable 後原斷言重跑通過，未提高 timeout。
- 原 `test/round3-state.test.mjs` 未改動；其中 browser 紅測試留給主代理接好 main／重建後原樣驗證。本輪未用舊 dist 的結果宣稱 UI 缺陷已修。

## 主代理整合補充

- main使用primary／recovery兩個guard，所有persist／reset clear皆await；storage事件只invalidate同一storage area，不採納新版。檔案無commit但journal不同仍會觸發保護。
- 額外瀏覽器控制驗證：相同head的檔案變動不被舊頁覆寫，舊頁仍可匯出；stale kiosk不清另一頁新primary；失敗state動作修掉阻擋檔後可重試且刷新續玩。
- 首次整套363項僅有既有kiosk私人副本清除失敗；原測試同一分頁直接寫recovery，不產生storage event，不能視為外部writer而永久拒清。修正為primary成功clear後，隱私cleanup**一次**固定當下recovery baseline；若已觀察外部recovery event或primary已失效，不重新load取得權限。後續idle autosave不反覆採納，勾選清除的明確新決定才開始下一次cleanup。
- 新增反向控制：另一分頁的recovery更新事件確實送達後，舊kiosk的reset保留該新副本。普通autosave／recovery寫入仍不因這項cleanup政策而重新load。
- primary／recovery仍不是跨key原子交易；在另一key的write與event送達之間沒有全域保證，不能把Chrome控制測試寫成全平台race已解。
- 最終完整驗收見`test-results-v0.3.txt`；第一次失敗輸出保留於`test-results-v0.3-first.txt`，不改寫為當時已通過。
- 清除helper補`clear({precondition})`：取得recovery lock後、真正remove前重新檢查primary；新增第22項確定性測試模擬等待鎖時primary失效，確認不刪recovery。成功cleanup保留完成狀態，之後不重新建立baseline；不宣稱不同key之間已原子化。
- 主代理整合後兩次完整驗收皆**366/366、0 fail、0 skip**（33.58／33.08秒），原6項狀態找碴、22項硬化、4項新瀏覽器控制及原kiosk清除斷言全過。證據為`test-results-v0.3.txt`與`test-results-v0.3-repeat.txt`；Python原四碼互通亦過。
