# 回報：試玩版〈第一夜〉前端

版本：0.1.0 / 2026-10-30（核心與介面：`75281fe`）
產物：`dist/index.html`（319,200 bytes，319.2 KB／311.7 KiB，單一離線檔案）

**驗收結果：T1–T11 全數通過，T12 在現有 Chrome 環境通過。最終 262 tests、262 pass、0 fail、0 skip，11.06 秒。**
完整逐項名稱與耗時：`notes/test-results.txt`。Safari／iOS／Firefox／Edge 與真人節奏未驗證，不推稱全平台或真人試玩完成。

## 測試

- M0：通過。`test/build.test.mjs`：31 個引用存在、B0 文案、125,269-byte 資料常數、單檔 CSP 雜湊；另用隔離副本證明缺檔／改文案會中止建置。
- T1：通過，`T1 canonical and commit id`、`T1 CRC32` 全部一致。
- T2：通過，`T2 <case>: every expect field including fullgame`，9 accept + 3 suspicious 所有 expect 一致。
- T3：通過，`T3 <case>: clean CodeError rejection`，30 案均拒絕；最終 zip_bomb 13.88ms，另測提前中止與上限邊界。
- T4：通過，`T4 tampered JSON file: broken, unverified, no badge`。
- 存檔補充：`test/save.test.mjs` 共 129/129 通過；12 份 JS 匯出與 Python 的資料及值班證逐字一致。
- T5：通過，`T5: expression cases and errors match the Python reference`（25 一致＋6 必錯）。
- T6：通過，`T6 ch0/ch1: exact files, directories, UTF-8 hashes`。
- T7：通過，`T7 c0/c1/c1L-*` 全 71 案 stdout／rc 逐字一致，沒有略過日誌案例。
- T8：通過，`T8: complete Python log SHA-256, manifest, first/last lines`；完整日誌與 manifest 相同，另驗證三組 seed。SHA-256：`09a7fd1fbbabd2d78c49da7c3dc4d6c7cd052ac22af1a9e800f49041aaefdd4c`。
- T9：通過，`T9 <quest> pass/fail` 七題全部既有樣本；含其他 check 型別補測。
- T10：通過，`T10: digger/newbie/edge/timeup says, every commit including id, and summary`。
- T11：通過，`T11: four JS codes import intact in JS and in Python check_codes.py`；四份代碼在 `notes/codes.txt`。
- T12：通過，`T12: offline file + HTTPS, safety, keyboard, mobile, resume, kiosk, exports and themes`，Chrome 156.0.8078.74，最終 9.69 秒：完整走法零額外網路請求／console error／CSP 違規；XSS 暱稱與存檔拒絕；360px 無水平溢出；鍵盤、停用 Storage／Clipboard、head 相同的續玩、kiosk 120 秒重置／預設清除／不下載、結尾代碼自檢、主題／字級。
- 無障礙補充：`T12 accessibility: both themes have at least 4.5:1 text contrast`，兩套實際 CSS 文字色／背景色全部達標。
- 獨立 QA：`test/ui-extra.test.mjs` 九項最終全過，包括真正的鍵盤／Tab 執行、兩次刷新保留無 commit 檔案修改及 cwd、分支硬連結隔離續玩、跨 context 貼碼、host 直投票／save 不破壞 CHOICE、動畫與全頁點擊補完、reduced-motion。

最終執行方式（在 `demo-app/`，先設定 README 的四個瀏覽器／TLS 環境變數）：

```text
npm.cmd test -- --test-reporter=spec --test-reporter-destination=notes/test-results.txt
python -X utf8 ../demo/tools/check_codes.py notes/codes.txt
```

`npm test` 會先重新建置。沒有外部 Playwright／Chrome 環境變數時，10 個瀏覽器測試明確跳過，不算通過。

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

## FINDINGS

詳見 `FINDINGS.md`：F-01–F-08、F-S01–S09、F-W01–W05、F-E01–E09；附各代理筆記與精準位置。

關鍵限制：RA1 只有事件，不包含任意 Shell 檔案修改／cwd／未記錄輸入；貼碼復原可推知的事件進度，本機 journal 才能精準續玩。原資料保持原樣：以 `git diff --exit-code b2d742a -- <原始資料目錄>` 確認無變更。

## 沒能驗證的

- Safari／iOS、Firefox、Edge、Chrome 前一版的實機相容性；本次只實跑現有 Chrome。
- 真實手機軟鍵盤、螢幕閱讀器；360px／鍵盤／對比／ARIA 為自動檢查，不等於輔助科技實測。
- Node 18 實機；程式目標 ES2020／Node 18+，實測為 Node 24.19.0。
- 真人十五分鐘節奏；沒有真人參與，代理不可代稱真人試玩紀錄。
- 正式版 120 萬行惰性日誌與 2 秒效能：不屬試玩版範圍，未實作／未驗證。
- 真正公開託管服務的 HTTPS；已驗本機隔離的自簽 HTTPS，沒有替使用者部署網站。

## 自己走一遍的節奏

- 真人實測：沒有。
- 自動完整 digger：單次 headless 實耗 **76.23ms**，虛擬遊戲時間 **6:21**；最終瀏覽器主 T12 多條走法合計 9.69 秒，並非真人閱讀時間。
- 自動驗收實際遇到的卡點：全頁點擊未補完文字、縮屏任務列更新延後；均已修正並保留回歸斷言。Tab 多候選不擅自替玩家選第一個，需多打一字；口令模式仍可用指令離開查手冊。這些觀察不代表真人節奏評估，沒有為了湊 15 分鐘修改資料或規則。

## 已知問題

- 來源 `tools/validate.py` 在 Windows 有混合子程序編碼問題：兩種編碼執行分別通過快題／工單，但單次完整驗證未綠；未改工具。這不是 T1–T12 的失敗。
- BRE 是必要子集，不是完整 GNU grep；重複群組保守拒絕。存檔完整性不是遊玩真實性的證明，純前端不能防作弊。
- QA-01 與手機任務列回歸已關閉；沒有未列入 FINDINGS 的已知阻塞問題。
