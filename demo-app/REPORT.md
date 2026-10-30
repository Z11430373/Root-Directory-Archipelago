# 回報：試玩版〈第一夜〉前端

版本：開發中（2026-10-30）　產物：`dist/index.html`

## 測試

- M0：通過。`test/build.test.mjs` 兩項：引用存在、B0 文案、資料大小、單檔 CSP 雜湊。
- T1：通過，`T1 canonical and commit id`、`T1 CRC32` 全部一致。
- T2：通過，`T2 <case>: every expect field including fullgame`，9 accept + 3 suspicious 所有 expect 一致。
- T3：通過，`T3 <case>: clean CodeError rejection`，30 案均拒絕；本輪 zip_bomb 5.73ms。
- T4：通過，`T4 tampered JSON file: broken, unverified, no badge`。
- 存檔補充：`test/save.test.mjs` 共 129/129 通過；12 份 JS 匯出與 Python 的資料及值班證逐字一致。
- T5–T11：核心代理實作及整合中，尚未宣稱通過。
- T12：先建立測試腳本，等待核心閘門通過後實作／驗收介面。

## 我做的決定（沒有寫在規格裡的）

- 初始化原本不存在的 Git 儲存庫，保留原始資料基線；新增程式全部置於 `demo-app/`。
- 跨代理共用 API 記於 `ARCHITECTURE.md`，每個代理有互斥的檔案責任區。
- 本機操作 journal 與正規 RA1 存檔分開，避免改變參考格式。
- Playwright 工具安裝於核准暫存目錄，不加入應用程式依賴、不打包進產物。

## FINDINGS

詳見 `FINDINGS.md`；代理發現整合後逐項補列。

## 沒能驗證的

- 本報告仍在開發中，未列「通過」者皆未完成驗收。
- 跨瀏覽器實機（Safari / iOS / Firefox / Edge）相容性。
- 真人十五分鐘節奏；代理不可代稱真人試玩紀錄。

## 自己走一遍的節奏

- 真人實測：沒有。自動重播／瀏覽器走法的實際執行時間將另列，不當作真人遊玩時間。

## 已知問題

- 原始 `python tools/validate.py` 在 Windows 先因 bash 不在 PATH 失敗；加入現有 Git Bash 的 PATH 後，快題標準／錯解檢查通過，但非試玩版範圍的工單檢查遇到子程序輸出解碼錯誤。原工具沒有修改。
