# FINDINGS：試玩版〈第一夜〉

來源資料包保持原樣；以下為整合期間的保守解讀與限制。

## F-01：既有資料與實作提示的優先順序
- 位置：AGENT_BUILD_PROMPT.md §0 / demo/flow.yaml / demo/tools/flow_sim.py。
- 解讀：資料包高於附件；可觀察的引擎行為優先依 Python 參考及既有測資，差異逐項補列於此，不修改來源。
- 影響：保留既有事件、任務與 commit ID。

## F-02：原始目錄沒有 Git 儲存庫
- 位置：工作目錄。
- 決定：初始化 Git，先保存來源基線，再依實際測試閘門提交里程碑。所有新增實作放在 demo-app/。

## F-03：真人節奏不可由代理宣稱量測
- 位置：附件 §8 / REPORT.md「自己走一遍的節奏」。
- 解讀：自動重播、瀏覽器操作的耗時不是真人試玩的實測，不將虛擬時間或代理操作當真人資料。
- 影響：如無真人參與，報告明列未驗證，另列自動重播實耗時間。

## F-04：跨平台換行必須穩定
- 位置：靜態 VFS 的 SHA-256／T6 與 Git 預設 autocrlf。
- 決定：新增 `.gitattributes` 指定文字檔以 LF 簽出；不重寫原始文字內容。
- 影響：避免 Windows 簽出時改變靜態檔案位元組，破壞對照雜湊。

## F-S01–F-S09：存檔參考實作的安全邊界
完整位置、解讀與影響見 `notes/save.md`「參考矛盾／保守解讀」。整合決定如下：

- F-S01：補齊 commit 多餘鍵與 hash／meta 型別檢查；合法格式但鏈不同仍接受為「損毀」。
- F-S02：嚴格區分 bool、int 與 packed 0 sentinel，不沿用 Python truthy 的隱性轉型。
- F-S03：JSON token 層拒絕浮點語法、重複鍵、原型鍵與不安全整數；所有匯入錯誤統一為 CodeError。
- F-S04：只接受一個 RFC1950 串流，拒絕壓縮尾隨垃圾與串接串流。
- F-S05：head 欄位只要存在就嚴格對帳，含 null／空鏈。
- F-S06：JSON 檔與代碼皆採 262144 UTF-8 bytes 上限；比 Python 檔案入口更保守。
- F-S07：損毀鏈不得藉壓縮重算洗白，匯出自檢失敗提供原始 JSON。
- F-S08：toFullgame 僅供 T2 的資料對照，不實作正式版入口；host-led 使用模式政策標示共享紀錄。
- F-S09：保持 addCommit 不更新 head 的參考契約，整合持久化與評估前明確 seal。

以上未改原始測資；T1–T4 與額外邊界測試 129/129 通過。

## F-W01–F-W05：虛擬世界的對照範圍
- W-01：T6 參考產生器會刪除 Ch0 空 `/lost+found`；遵循測資，分支 create_file 時重建父目錄。
- W-02：採嚴格 T8，日誌 SHA-256 與整份 manifest 完全一致，未降級不變量。
- W-03：只開放試玩版 29 個命令與 flow 明訂的 merge 別名；不開放正式版工單、fsck、B1。
- W-04：試玩版日誌以字串儲存，管線為惰性迭代；正式版 120 萬行惰性生成與 2 秒效能未實作／未驗證，不屬附件試玩範圍。
- W-05：實作必要 BRE 子集；非必要的重複群組保守拒絕，不宣稱完整 bash/GNU grep 相容或完整 ReDoS 防護。
- 詳細 API、位置與影響見 `notes/world.md`。

## F-E01–F-E09：流程參考與字面規格的差異
- E-01：task/skip 先於 on_done 效果寫入，依 Python／測資。
- E-02：合併順序依實際 rules／測資為 card → flags → merge → branch.exit。
- E-03：CHOICE 與 INPUT 不發 idle 提示，依 Python；CHOICE 可手動 hint。
- E-04：補齊 Python headless 未顯示的台詞、條件、插值、延遲訊息，不改 says/commit 軌跡。
- E-05：離開分支恢復進分支前 cwd，依 Python；非字面固定回 ~。
- E-06：host 點燈完成 map／checkpoint 後直接投票，省略 branch_offer／B0／Ch1；event=host-led，介面明示共享紀錄不供正式版個人匯入。未新增存檔欄位，未捏造任務完成。
- E-07／E-08：RA1 原格式不含任意檔案修改、cwd、指令歷史、口令 INPUT、無 commit 指令時鐘及 skip/delayed 狀態。貼碼僅重建可推知事件狀態，保守重建分支 lost0；匯入後顯示限制。本機另存 journal 精準重播，不更改正規 save 格式。
- E-09：依 flow 開放 CHOICE 與結束後 save/help，避免 Python 的無效選項行為阻礙存檔；不額外推進世界時間。
- 詳細位置、影響與測試見 `notes/engine.md`。

## F-05：介面與本機儲存的實際策略
- 單一 Promise queue 序列化計時、輸入與匯出；以完整事件交易結束為自動存檔邊界，避免保存到只有半條事件連鎖的狀態。
- localStorage 的 `ra.demo.save.v1` 為正規 save 加私有 journal 的 envelope；RA1／下載 JSON 仍只有正規 save。本機操作紀錄不會隨代碼匯出。
- 手機任務面板預設收合，可鍵盤展開；依 viewport 高度縮排，輸入字級至少 16px，避免 iOS 自動放大輸入。
- visualViewport 變化透過受 CSP 授權樣式表的 CSSOM 更新高度，不新增 inline style，也不放寬 CSP；實機 iOS 鍵盤仍列為未驗證。
- kiosk 結尾預設立即清除本機存檔，代碼仍留在 DOM；取消勾選則重新存回。重新開始／120 秒閒置返回歡迎畫面。
- dark／高對比亮色兩主題；無既有偏好時依 prefers-color-scheme 選擇。未加入圖片、外部字型、QR 或網路服務。

## F-06：里程碑與時間盒
- 世界代理以同一組緊密相依 VFS／Shell／日誌測試交付，M2 與 M3 合為一個提交；驗收仍逐項對照 T5–T9，沒有省略日誌案例。
- 附件未指定各里程碑預期工時，無法客觀計算「超過預期兩倍」；不捏造工時計畫或時間盒超時結論。

## F-07：獨立 QA 回歸（已修正）
- 問題：點終端機外部未立即補完逐字輸出；縮小 viewport 後，收合列的任務文字要等下一個計時 tick 才更新。
- 修正：全頁 click capture 補完全部待播文字；跨 760px 斷點同步 refresh 任務列。
- 驗收：保留 `T12-extra: a click outside the terminal also instantly finishes animated text` 紅測試及主 T12 手機任務列斷言，最終重跑確認，不移除或放寬測試。
- 結果：最終 262/262、0 失敗、0 跳過；兩項回歸均通過，詳見 `notes/test-results.txt`。

## F-08：驗收環境邊界
- 實跑：Windows、Node 24.19.0、Python 3.12.10／PyYAML 6.0.3、Chrome 156.0.8078.74；file:// 與隔離 localhost 自簽 HTTPS。
- 未實跑：Safari／iOS、Firefox、Edge、各瀏覽器前一版本、Node 18 實機及輔助科技／真實軟鍵盤。這些不得由 Chrome 測試推稱通過。
- 原始 tools/validate.py 在 Windows 有混合子程序編碼問題：UTF-8 執行時快題通過、工單解碼失敗；系統編碼時工單通過、快題解碼失敗。這是來源工具跨平台問題，未修改工具，也不以它取代 T1–T12 的 JS 驗收。
