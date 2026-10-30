# UI 與續玩整合計畫

此文件是規劃；實作與完成狀態以測試及 REPORT 為準。

- 桌機：單一終端視窗，右側任務面板、底部命令列；手機面板改為可展開 details，命令按鈕留在輸入框旁。
- 全程使用 createElement / textContent，沒有動態 HTML 插值。
- 實際輸入由單一 Promise queue 序列化；計時、送出、匯出不併發修改 Engine。
- 逐字機每字 12ms，任何鍵／點擊補完，prefers-reduced-motion 關閉動畫；指令送出不需等播放完成。
- localStorage `ra.demo.save.v1` 儲存 envelope：schema、原始 save 與操作 journal；journal 不匯入 RA1 正規格式。
- 本機續玩重播全部操作（包括無 commit 的檔案修改），核對 head 後才恢復互動。
- 外部 RA1 / JSON 續玩以 Engine.restore 復原事件狀態，明示原格式不包含 shell 檔案修改歷史；絕不悄悄捏造新 commit。
- 匯出只取正規 save，每次執行 export→import→head 自我檢查；失敗仍可下載原始 JSON。
- Clipboard、Storage 全部 try/catch；失敗提供手動複製與可攜存檔。
- T12 測試先寫於 test/browser.test.mjs；M4 四條走法全綠後才開始 UI。
