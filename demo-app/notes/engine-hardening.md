# Engine 硬化：CRIT-03／04

日期：2026-10-30。只修改 `src/engine/index.js`，新增 `test/engine-hardening.test.mjs` 與本文件；未改來源規格、測資、既有測試斷言、storage、main 或實際時鐘取整方式，未 commit。

## CRIT-03：確認只屬於同一題

- `skip_pending` 改存 `{ questId, at }`。第二次 skip 必須符合目前題號，而且相距不超過 10 秒。
- 完成／跳過題目、啟用下一題或沒有啟用題目時清除確認；匯入不恢復非持久的確認。
- 10 秒整仍接受；超過 10 秒重新詢問。
- **保守偏離參考**：Python 只存時間，會把上一題的確認沿用到下一題。這裡修正題目邊界，不修改來源或對照資料。

## CRIT-04：先保留必要事件，不靠事後 throw 或修剪鏈

硬上限仍讀來源 `integrity.yaml` 的 **400**，沒有放寬存檔匯入限制。

### 明確預算

在目前資料包，初始保留 **123 筆**：

| 類別 | 保留數量 |
| --- | ---: |
| flag（含兩種投票旗標） | 47 |
| task／skip（同題共用一格） | 7 |
| item／card／find | 2／1／12 |
| checkpoint | 4 |
| choice／end | 1／1 |
| 小計：一次性事件 | **75** |
| 15 個 ladder，每個前 3 階 | **45** |
| 首次故事分支 enter＋最長退出（merge＋exit） | **3** |

一次性事件集合從已掛載對話（含 variants、choices）、快題 on_done、flow actions 建立，不靠任意固定猜測值。刻意連 demo 未走到的已掛載對話效果也保留；不會因可達性分析漏算而犧牲必要紀錄。一次性事件寫入後才移除對應保留項；task 與 skip 共用題號槽。前 3 階提示即使對話文字相同，也各保留一筆以持久化原有階梯數值。

穩定狀態維持：`既有 commits + 剩餘必要保留 <= 400`。

- **重複 hint**：前 3 階一定記錄；之後只在 `commits + reserve + 1 <= 400` 時新增紀錄。不是全面刪掉第 4 次 hint。飽和後仍播相同提示、仍執行必要的一次性旗標效果，第一次停止新增時明確說明正在保留任務／投票／結尾空間。
- **分支**：首次故事往返已有 3 筆保留，不能被先前的重複提示擋住。身在分支中一律保留 **2** 筆給 merge＋exit。`flag.b0.done` 後，再開分支須額外有 **3** 筆餘額；在複製 VFS、改 branch／main_snapshot、寫 enter **之前**判斷。不足就明確拒絕這次重複開分支，不印成功訊息；已准入的分支退出不會被截斷。abandon 只用掉退出的一格，另一格回到餘額。
- **重複 checkpoint**：首次仍受保護；重複相同 id 沒有新狀態，只能使用可選餘額，耗盡時明確提示而不新增重複紀錄。
- **必要記錄**：從未默默略過首次 flag、task、skip、item、card、find、checkpoint、choice 或 end；未刪除／重排／重算既有鏈。沒有在 commit 數已超限、狀態已改動時才 throw 的補救邏輯。

例：暱稱後每秒一次 hint 共 405 次，仍在正常時限內。存檔為 **282** 筆、保留 **118** 筆，合計正好 400；後續七題、初次分支與合併、所有新階梯前 3 階、投票及 end 都仍有空間。直接等到 960 秒（不另外輸入投票提示）的 time-up 路徑為 **286** 筆。

### 舊存檔接近上限的政策

- `checkShape`、`importCode`、`importFile` 接受規則不變。**格式合法不等於還有安全續玩的事件空間**。
- Engine.restore 先在獨立候選引擎中恢復狀態、重建剩餘保留預算；若活動中存檔已花掉必要保留，明確拒絕續玩，直到全部檢查通過才 `Object.assign` 發布。既有 Engine 的 save／flags／VFS／active 與呼叫者傳入的原始鏈均不改動；不假稱已修復舊的過滿存檔。
- 已結束的合法 400 筆存檔不需再保留後續事件，仍能正常匯入與使用 save／help，不新增 commit。
- 這是保守的 **Engine 續玩准入條件**，不是放寬或改寫 RA1 格式；不保證每一份來源舊版、任意構造的活動中 399 筆存檔可繼續。必要預算缺口不能在禁止修剪鏈／禁止遺失必要紀錄的條件下憑空補回。

### 對參考的偏離與界線

來源規定每次顯示 hint 都記錄，且不限制重複 branch round trip；若無限照做就違反來源自身 400 上限。這裡僅在可選餘額耗盡時停止新增無新資訊的重複紀錄，或拒絕下一次可選分支，保護必要進度；因此極端重複輸入的 commits／ID／branch admission 與參考不同。一般對照四走法完全不變。

停止新增重複 hint 紀錄時，即時引擎的 real／world clock 仍照既有規則前進；可攜 RA1 只帶最後 commit 的時間，因此這段無新 commit 的尾端時間與其他未記錄的 Shell 指令一樣，不能由 RA1 精準還原。未新增不合 schema 的時間欄位、未改 clock；本機完整 journal 的重播另由主代理處理。

未處理 CRIT-01／02 的 storage／journal 問題、UI 操作禁用、任意 Shell 狀態不包含在 RA1 的既有限制；也不聲稱為任意外部構造的時戳／世界狀態提供額外恢復能力。本預算是目前資料驅動 Engine 的合法 feed／advance 流程，不是對外部任意呼叫 `setFlag`／`commit` 塞入新規則的 API 授權。

## 驗證

在 `demo-app/` 執行（不建置）：

```powershell
node --test test/engine.test.mjs test/engine-hardening.test.mjs
node --test --test-name-pattern "CRIT-0[34]:" test/critique.test.mjs
```

- **18/18 通過**（既有 11＋新增 7），含 T10 四走法的所有 says、每筆 commit 與 ID，以及 T11 的 JS／Python 互通。
- **CRIT-03／04 2/2 通過**，無 skip／todo，未改其斷言。
- 新測試包括：skip 換題／逾時／匯入；405 次提示後完成七題及投票；405 次後 time-up 保險結尾；host＋全 skip 效果；405 回重複分支嘗試；分支中提示耗盡後匯入再 merge／exit；399 筆活動中舊存檔無副作用拒絕、400 筆已結束存檔正常讀取。
- 壓力操作逐次執行 `checkShape` 與保留預算斷言；各關鍵階段驗證整條雜湊鏈、RA1 匯出再匯入、JSON 匯入與 Engine.fromSave，確認原鏈不被改寫。
