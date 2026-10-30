# 回報：試玩版〈第一夜〉前端

版本：0.3.0 / 2026-10-30（保留原始資料包與既有四走法）
產物：`dist/index.html`（343,097 bytes，343.1 KB／335.1 KiB，單一離線檔案）

**驗收結果：T1–T11 全數通過，T12 在現有 Chrome 環境通過。完整 366 tests、366 pass、0 fail、0 skip，33.58 秒。**
完整逐項名稱與耗時：`notes/test-results-v0.3.txt`。0.2.0 的292項與首版262項另保留於`notes/test-results-v0.2.txt`／`notes/test-results.txt`，不能代替新找碴案例。Safari／iOS／Firefox／Edge、真人與讀屏器仍未驗證，不推稱全平台、完整WCAG符合性或「完美」。

同一環境、相同產物再次完整重跑：**366/366、0 fail、0 skip，33.08秒**，見`notes/test-results-v0.3-repeat.txt`。兩次通過不是全平台穩定性的證明；兩次皆保留原T12，沒有放寬時限或斷言。

## 本輪更新：第三輪找碴、修復與交叉否證

- 使用者要求持續修正／代理打臉。兩位獨立代理分查Shell與狀態，主代理負責UI／整合；後續再交叉review，**保留所有既有測試與原紅斷言**，沒有改原始資料、規則、測資、Python工具、400 commits上限或四條T10答案。
- **Shell 5項**：無效glob例外、管線上游副作用／重導向、read-time inode歸屬、sort／cut多檔未換行邊界、Unicode空白；9項原找碴＋16項補充控制全過。重綁後未讀不給發現，確實再讀則不遺漏；head仍可提早停止。不是完整Bash／process／fd相容實作。
- **狀態3項**：失敗feed／advance完整回滾且成功才發布輸出／journal；r/t安全准入與執行期界線；完整envelope的跨分頁防覆寫／防誤刪。原6項＋22項控制全過，另有4項真瀏覽器跨分頁／重試控制。
- **UI 9項＋控制**：PageUp連續閱讀、閒置輸出不拉走歷史位置、details輸入機制一致、控制邊界對比、手機推薦44px、動態reduced-motion、輸入名稱與鍵盤說明、匯入錯誤焦點／ARIA；交叉review再抓到低高度Server輸入欄裁切並保留紅→綠測試。12項UI與5項Terminal控制全過。
- 第一次全套363項只剩kiosk清除舊救援副本；修成primary ownership確認後的一次性privacy cleanup，已觀察另一頁recovery變更時拒清。第二次364項抓到斷點通知排程；第三次366項發現主代理新控制把CDP返回誤當原生resize已送達。獨立代理以未mock clock時序否證此oracle，只校正新控制的事件屏障，**不改原T12或八項原UI斷言、不在產品加入輪詢**。三次失敗逐項輸出保留於`notes/test-results-v0.3-first.txt`／`-second.txt`／`-third.txt`。
- 實作與證據：`notes/ROUND3_SHELL.md`／`ROUND3_SHELL_FIX.md`、`ROUND3_STATE.md`／`ROUND3_STATE_FIX.md`、單一整合`ROUND3_UI_A11Y.md`，彙總於`FINDINGS.md` F-13–F-15。
- Web Locks優先；fallback只有best-effort同步CAS，多key清除不是跨key交易。WCAG 2.2 AA只是本輪局部檢視目標；44px是額外推薦／AAA，固定15／16分鐘規則的2.2.1例外尚未確認。

## 0.2.0歷史更新：風格與獨立找碴

- 右上新增「風格」：群島介面（原樣保留、預設）／Server 終端（等寬、黑底低彩度、方角文字控制、無卡片裝飾）。與深色／高對比、字級獨立記憶；即時切換不清除輸入／cwd／進度，不修改 RA1。
- `test/styles.test.mjs` **10/10**：新舊偏好正規化、切換／持久化／代碼不變、320／360／768px、兩種主題、Server 色彩對比、停用 Storage、舊偏好型別、Server 手機結尾畫面。
- 獨立代理發現 5 個真缺陷，交付 6 個原紅測試。**6/6 已轉綠，原斷言保留**：浮點 journal 精確回放、長休眠後續玩、跨題 skip、重複 hint 導致超出存檔上限、暱稱階段快捷誤註冊。
- 另修正跨 host URL 續玩時改變原流程的問題；貼碼同樣沿用原流程。新加入 `test/session-hardening.test.mjs` **7/7**，含舊浮點紀錄救援／不覆寫、過滿舊碼匯入拒絕的交易性、kiosk 救援備份清除。
- `test/engine-hardening.test.mjs` **7/7**：預留必要事件額度，405 hints 後仍能做完七題／分支／投票／結尾；重複分支不會耗掉退出空間，舊過滿活動存檔無副作用拒絕續玩。
- 原始資料、規格、測資與 Python 工具未修改。T10 四走法的對話序列、每筆 commit、ID、summary 全部保持原答案。
- 詳細證據：`notes/CRITIQUE.md`、`notes/engine-hardening.md`、`FINDINGS.md` F-09–F-11。

## 測試

- M0：通過。`test/build.test.mjs`：31 個引用存在、B0 文案、125,269-byte 資料常數、單檔 CSP 雜湊；另用隔離副本證明缺檔／改文案會中止建置。
- T1：通過，`T1 canonical and commit id`、`T1 CRC32` 全部一致。
- T2：通過，`T2 <case>: every expect field including fullgame`，9 accept + 3 suspicious 所有 expect 一致。
- T3：通過，`T3 <case>: clean CodeError rejection`，30 案均拒絕；本輪 zip_bomb 5.58ms，另測提前中止與上限邊界。
- T4：通過，`T4 tampered JSON file: broken, unverified, no badge`。
- 存檔補充：`test/save.test.mjs` 共 129/129 通過；12 份 JS 匯出與 Python 的資料及值班證逐字一致。
- T5：通過，`T5: expression cases and errors match the Python reference`（25 一致＋6 必錯）。
- T6：通過，`T6 ch0/ch1: exact files, directories, UTF-8 hashes`。
- T7：通過，`T7 c0/c1/c1L-*` 全 71 案 stdout／rc 逐字一致，沒有略過日誌案例。
- T8：通過，`T8: complete Python log SHA-256, manifest, first/last lines`；完整日誌與 manifest 相同，另驗證三組 seed。SHA-256：`09a7fd1fbbabd2d78c49da7c3dc4d6c7cd052ac22af1a9e800f49041aaefdd4c`。
- T9：通過，`T9 <quest> pass/fail` 七題全部既有樣本；含其他 check 型別補測。
- T10：通過，`T10: digger/newbie/edge/timeup says, every commit including id, and summary`。
- T11：通過，`T11: four JS codes import intact in JS and in Python check_codes.py`；四份代碼在 `notes/codes.txt`。
- T12：通過，`T12: offline file + HTTPS, safety, keyboard, mobile, resume, kiosk, exports and themes`，Chrome 156.0.8078.74，本輪 7.61 秒：完整走法零額外網路請求／console error／CSP 違規；XSS 暱稱與存檔拒絕；360px 無水平溢出；鍵盤、停用 Storage／Clipboard、head 相同的續玩、kiosk 120 秒重置／預設清除／不下載、結尾代碼自檢、主題／字級。
- 無障礙補充：`T12 accessibility: both themes have at least 4.5:1 text contrast`，兩套實際 CSS 文字色／背景色全部達標。
- 獨立 QA：`test/ui-extra.test.mjs` 九項最終全過，包括真正的鍵盤／Tab 執行、兩次刷新保留無 commit 檔案修改及 cwd、分支硬連結隔離續玩、跨 context 貼碼、host 直投票／save 不破壞 CHOICE、動畫與全頁點擊補完、reduced-motion。

最終執行方式（在 `demo-app/`，先設定 README 的四個瀏覽器／TLS 環境變數）：

```text
npm.cmd test -- --test-reporter=spec --test-reporter-destination=notes/test-results-v0.3.txt
python -X utf8 ../demo/tools/check_codes.py notes/codes.txt
```

`npm test` 會先重新建置，測試檔最多並行 2 個。沒有外部 Playwright／Chrome 環境變數時，瀏覽器測試明確跳過，不算通過。首輪不限並行曾讓既有 Python 10 秒子程序超時；調整並行數後全綠，沒有修改其時限或斷言。

四條走法的 Python 結論：

| 走法 | commits | head | 分數 | 稱號 | 虛擬耗時 | 完整性 |
|---|---:|---|---:|---|---|---|
| digger | 57 | f894961f | 200 | 拆門者 | 6:21 | 完整 |
| newbie | 67 | 60ed4984 | 60 | 守夜人 | 14:56 | 完整 |
| edge | 50 | 7476db7c | 115 | 守夜人 | 3:59 | 完整 |
| timeup | 61 | be87be2e | 60 | 值班員 | 16:00 | 完整 |

timeup 的 16:00 是資料規定的投票寬限，不是改成 16 分鐘遊戲。

## 我做的決定（沒有寫在規格裡的）

- 初始化原本不存在的 Git 儲存庫，保留原始資料基線；新增程式全部置於 `demo-app/`。
- 跨代理共用 API 記於 `ARCHITECTURE.md`，每個代理有互斥的檔案責任區。
- 本機操作 journal 與正規 RA1 存檔分開，避免改變參考格式。
- Playwright 工具安裝於核准暫存目錄，不加入應用程式依賴、不打包進產物。
- 不使用框架、網路字型、音效、QR、CDN 或遙測；pako 2.1.0 隨檔嵌入並保留授權。
- host 保留點燈／地圖／checkpoint，省略分支與 Ch1，直接投票；event=host-led，顯示共享紀錄不供正式版個人匯入。
- 每個完整事件交易後自動存檔，確保不保存一半的事件連鎖；受限環境仍可匯出代碼。kiosk 結尾預設清除，取消勾選可存回。
- M2／M3 為同一份相依世界層交付，合併提交；其餘 M0／M1／M4／M5／M6／M7 分別記錄。未提供預期工時，因此無法客觀判定「超過預期兩倍」，未捏造時間盒。
- 第二輪只新增外觀選項、可攜格式不變的本機救援與安全預算。原版過滿的活動存檔不能在不丟棄必要記錄／不增加 400 硬上限的前提下憑空繼續；會明示拒絕並保留原始資料，不宣稱已修復舊鏈。

## FINDINGS

詳見 `FINDINGS.md`：F-01–F-15、F-S01–S09、F-W01–W05、F-E01–E09；附各代理筆記與精準位置。

關鍵限制：RA1 只有事件，不包含任意 Shell 檔案修改／cwd／未記錄輸入；貼碼復原可推知的事件進度，本機 journal 才能精準續玩。原資料保持原樣：以 `git diff --exit-code b2d742a -- <原始資料目錄>` 確認無變更。

## 沒能驗證的

- Safari／iOS、Firefox、Edge、Chrome 前一版的實機相容性；本次只實跑現有 Chrome。
- 真實手機軟鍵盤、螢幕閱讀器；360px／鍵盤／對比／ARIA 為自動檢查，不等於輔助科技實測。
- Node 18 實機；程式目標 ES2020／Node 18+，實測為 Node 24.19.0。
- 真人十五分鐘節奏；沒有真人參與，代理不可代稱真人試玩紀錄。
- 正式版 120 萬行惰性日誌與 2 秒效能：不屬試玩版範圍，未實作／未驗證。
- 真正公開託管服務的 HTTPS；已驗本機隔離的自簽 HTTPS，沒有替使用者部署網站。
- Web Locks不可用時的跨process全域原子性，以及不同storage key的原子清除；fallback與跨key政策不能冒充這些保證。
- 固定時間規則的WCAG 2.2.1例外／可調整方案、完整WCAG符合性、forced-colors與400%放大、NVDA／VoiceOver真實宣讀節奏。

## 自己走一遍的節奏

- 真人實測：沒有。
- 首版自動完整 digger：單次 headless 實耗 **76.23ms**，虛擬遊戲時間 **6:21**；本版瀏覽器主 T12 多條走法合計 7.61 秒，並非真人閱讀時間。
- 自動驗收實際遇到的卡點：全頁點擊未補完文字、縮屏任務列更新延後；均已修正並保留回歸斷言。Tab 多候選不擅自替玩家選第一個，需多打一字；口令模式仍可用指令離開查手冊。這些觀察不代表真人節奏評估，沒有為了湊 15 分鐘修改資料或規則。

## 已知問題

- 來源 `tools/validate.py` 在 Windows 有混合子程序編碼問題：兩種編碼執行分別通過快題／工單，但單次完整驗證未綠；未改工具。這不是 T1–T12 的失敗。
- BRE 是必要子集，不是完整 GNU grep；重複群組保守拒絕。存檔完整性不是遊玩真實性的證明，純前端不能防作弊。
- QA-01 與手機任務列回歸已關閉；第二輪 CRIT-01–05 及低優先模式邊界 CRIT-06 都已有通過的回歸斷言，沒有未列入 FINDINGS 的已知阻塞問題。
- 第三輪Shell／狀態／UI的已確認問題與交叉review修正皆有通過斷言；這只代表已確認案例關閉，不代表不存在新缺陷。跨平台／真人與完整無障礙驗收仍開放。

## 使用者補充的參考研究（不變更本輪程式）

- 兩位獨立研究代理已完成 just-bash／PocketTerm 與 10 款終端遊戲的官方來源查證；完整記錄在 `notes/ENGINE_REFERENCES.md`、`notes/GAME_REFERENCES.md`，主架構師取捨在 `notes/REFERENCE_DECISIONS.md`。
- just-bash 是未來可評估的 adapter 候選；PocketTerm 更適合作 UX 參考。兩者未經本案單檔、file://、CSP、T7／T10 同 ID 驗收，不當作立即替換品。
- 優先借鏡 Teach Terminal 的可收合教學、GameShell 的目標／檢查／復原分工、clmystery 的調查動機，以及 cmdchallenge 的鍵盤規則。不抄劇情、題庫或素材。
- Sudo Sanctuary 的真 Bash 未證實；免費遊玩、公開 repo、MIT 宣告／授權檔不完整等狀況皆分開記錄，不擅自推論可直接搬碼。
- 本輪僅查閱文件與少量原始碼，沒有安裝／執行外部引擎、移植程式或素材，沒有新增依賴或網路功能；研究候選不代表後續實作承諾。
