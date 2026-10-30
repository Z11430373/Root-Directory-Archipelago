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

## F-09：新增 Server 終端風格
- 使用者要求保留原風格並新增更接近 Ubuntu Server 主控台的外觀。新增獨立 `data-style`（islands／server），不把風格與可及性主題混成同一個選項。
- islands 仍為預設；server 為低彩度、等寬、無卡片裝飾及方角文字控制。只有外觀變動，不新增假的 Ubuntu 開機訊息、不改來源劇情。
- 選項只存在 `ra.demo.preferences.v1`；舊偏好、無效型別與未知欄位先正規化。新 CSS 與原 CSS 一起內嵌，CSP 不放寬，沒有網路字型或外部資源。
- Server 的提示符隨輸出往下移，輸出過長後才由終端區捲動；小螢幕仍保留可收合任務列與鍵盤上方的操作。

## F-10：第二輪獨立找碴與本機紀錄修復
- 來源：`notes/CRITIQUE.md`，保留 6 項原紅測試斷言。先前 262 項通過沒有涵蓋這些新狀態邊界，不把舊結論當作新缺陷不存在的證明。
- CRIT-01：浮點相加改變分組會跨越 0.5ms 四捨五入邊界。journal 合併改以「和即時引擎完全相同的浮點端點」回推 delta，僅在可精準重建該端點時合併，否則保留原 tick；不放寬 head 比對。
- CRIT-02：journal 的牆鐘時間與 commit.r 是不同上限。合法長休眠可保留完整 elapsed time，仍按 15／16 分鐘規則收尾；不把一小時截成 45 分鐘，也不再寫出下一次入口必拒的 dt。persist 同時檢查 shape／journal，失敗不顯示已自動存檔。
- 舊浮點紀錄已丟失的分組無法憑空推回。失敗回放保留原檔，提供原始 journal 與正規 JSON 備份；明確選擇還原事件時先寫 `ra.demo.recovery.v1`，不暗改 hash 或宣稱任意檔案都已恢復。
- CRIT-05：暱稱階段的兩個 hint 控制與 save 快捷停用，快捷執行也有狀態守衛；玩家真正鍵入 hint 作為合法暱稱仍允許。
- CRIT-06：本機回放沿用 envelope 的原劇情模式、種子與 event，不以目前 host URL 改寫；貼碼依 event 的 host-led 標記判斷原流程。若目前網址不同，顯示沿用原自助流程的說明。
- CRIT-03：skip 確認綁定 `{questId,at}`；換題／完成／匯入不沿用確認。修正 Python 參考繼承的跨題殘留，不修改任何來源測資。
- CRIT-04：從掛載資料推導首次事件與階梯保留預算，初始保留 123 筆（75 一次性、45 提示階梯、3 首次分支）；重複提示／重複 checkpoint 只能使用餘額，重複分支需預付完整往返空間。不增加 400 上限、不刪鏈、不默默丟棄必要事件。
- 舊活動中存檔若已耗光必要預算，Engine 在獨立候選物件中拒絕續玩；UI 在候選成功前不取代頁面、進度或 journal。格式合法不等於還有續玩的事件空間，已結束的合法 400 筆存檔仍可讀取。
- 新增救援備份會在 kiosk 的預設清除／閒置重置時一併清除；原始紀錄包含當時輸入的指令及文字，介面明示此隱私邊界。
- 引擎詳細政策、參考偏離與壓測見 `notes/engine-hardening.md`；一般 T10 四走法的 says／commits／ID 保持完全一致。

## F-11：擴充測試後的執行環境調整
- 新增多組獨立 Chrome 測試後，不限檔案並行數的首輪有一項 Python 互通子程序達既有 10 秒時限；其餘 291 項通過。改為固定兩個測試檔並行，保留全部斷言、測試及子程序時限，不以 skip 或放寬 timeout 掩蓋失敗。
- 此環境若先登記測試，再於頂層 await 載入 Playwright，曾出現測試通過卻無法收尾；改成完成可選工具載入後再登記 hooks／tests。找碴測試只調整初始化順序，六項原始斷言未更動。

## F-12：外部參考不等於更換授權
- 使用者明示「僅供參考」並要求代理搜尋。已完成引擎與遊戲兩組調查，官方來源與不確定項目各自保留，主架構師採用界線見 `notes/REFERENCE_DECISIONS.md`。
- just-bash 是模擬 shell，PocketTerm 有同名 SSH 工具須排除；真命令名稱／作者宣傳不等於真 Bash 或 Linux VM。Sudo Sanctuary 的指令實作未證實，terrr 授權文字有矛盾，部分作品未查得完整重用授權。
- 研究只借鑑設計與架構概念，沒有加入外部程式／依賴、放寬 CSP、改資料或改測資；外部相容性未實跑，不宣稱已符合本案驗收。

## F-13：第三輪 Shell 語意與讀檔時間點
- 獨立找碴基線9項測試為5紅、4綠，保留原斷言。詳細輸入、GNU oracle、來源規則與實際結果見 `notes/ROUND3_SHELL.md`；修復／限制見 `notes/ROUND3_SHELL_FIX.md`。
- R3-S01：無效 glob 範圍是未匹配的 literal，不讓 JS RegExp SyntaxError 逸出。
- R3-S02：管線命令啟動不再完全依賴下游讀取；無輸出副作用與重導向 writer 得以完成，普通上游只預拉一個輸出 chunk，保留 head 提早停止與 iterator 清理。pipeline cwd 隔離但檔案系統共享；不宣稱模擬真 OS process／fd／SIGPIPE 或競態排程。
- R3-S03：Engine 使用 Shell 讀取當下的 `readEvents.same_inode`，不在整段命令結束後重新解析可能重綁的 pathname。每次真讀取均保留快照，legacy reads 仍去重；重綁後沒有再讀不得發現新檔，確實再讀則兩份發現都不遺漏。
- R3-S04：sort／cut 逐來源切行，不把第一檔的未換行末行黏到下一檔；cat 保留原始串接、不插入換行。
- R3-S05：以明確 ASCII 空白切 shell token，NBSP／全形空白等仍屬 word data；既有單行 parser 的貼上 newline 行為未在本輪擴充。
- 原105項 world、11項 engine、9項新找碴與16項補充控制的定向回歸141/141通過；最終全部測試另見0.3.0紀錄，T10同ID契約不放寬。

## F-14：第三輪 UI／無障礙局部修復
- 單一整合議題登錄與證據：`notes/ROUND3_UI_A11Y.md`。八個原紅斷言保留；額外控制驗證錯誤修正、檔案欄位、鍵盤離開、增量文字與資源清理。
- R3-UI01／02：空的 finish 不再捲動；讀歷史時新提示不強拉底部，送出新指令明確恢復跟隨。
- R3-UI03–08：原生 details 的滑鼠／鍵盤一致、控制邊界≥3:1、手機推薦44px hit area、動態 reduced-motion、分模式輸入名稱與 keyboard-help、錯誤欄位標記／描述／焦點。
- 目標為 WCAG 2.2 AA 局部檢視，44px／部分偏好改善屬額外推薦或AAA，不混稱AA必要條件。固定時間規則的2.2.1例外未確認；沒有讀屏／跨瀏覽器實測，不宣稱全站符合性認證。
- 交叉review再抓到R3-UI09：低至360×280的viewport切Server後輸入欄被workspace裁切，中心命中grep快捷鍵。新增未聚焦／未程式捲動輸入欄的真幾何紅測試，再加workspace最小高度與Server手機300px最小遊戲高度，容許低高度時垂直頁面捲動，不靠scrollIntoView在測試中掩蓋排版。
- 第二次完整候選的既有T12抓到斷點resize後details的open延遲；保留原即時斷言，除media change外也由resize更新，並用lastCompact避免高度改變／重複事件重設使用者開合。主代理新控制原以setViewportSize返回當作resize已送達，獨立探查證明未mock clock也不成立；僅校正新控制setup為原生resize事件屏障，事件microtask立即檢查相同斷言，不等DOM變成預期值、不改原T12。第三次失敗紀錄另存。

## F-15：第三輪狀態交易、時鐘准入與跨分頁保全
- 原始獨立證據：`notes/ROUND3_STATE.md`，6項測試為2綠、4紅；原斷言保留。修復API與21項控制證據：`notes/ROUND3_STATE_FIX.md`。
- R3-STATE-01：Engine start／feed／advance建立最外層完整交易；失敗回復VFS、共用flags、once、save／commits、時鐘、timers、branch與transcript，成功才發布輸出。UI在成功後發布候選journal，失敗不能被下一次autosave當已提交步驟。
- R3-STATE-02：活動存檔的極限r/t與已錯過結尾timer的狀態，在獨立候選中明確拒絕續玩；有效指令／渡海先檢查+30／+600世界時間。已結束的合法極限存檔仍可讀；長休眠仍保留完整elapsed與原960秒結尾，不增加上限、不截斷舊時間或改鏈。
- R3-STATE-03：`src/ui/session-storage.js`保護**完整envelope字串**而非只head；同步load固定待重播版本，autosave不得重新load替舊狀態背書。Web Locks內最後compare+write／clear，storage event僅失效、不自動採納。失去所有權的頁面停止寫入並提示，仍可匯出自己記憶體中的可攜紀錄。
- restart／kiosk清除也走guard；primary拒絕清除時不再刪recovery；recovery key另有自己的guard，保留其他分頁的新備份。kiosk勾選變化經queue序列化，不繞過await。
- Web Locks是合作中的同版頁面保護；無Web Locks時為同步compare+mutation的best-effort，不宣稱跨process全域原子，也不宣稱多個storage key的清除是跨key交易。仍需跨瀏覽器實測；舊版不合作writer或手動清除網站資料不在此鎖保證內。
- 首次完整候選363項362過／1敗（`notes/test-results-v0.3-first.txt`）：起始recovery baseline過早，擋住同分頁後來寫入的前次私人副本清除。保留原kiosk斷言，改為primary清除成功後、明確隱私cleanup的一次baseline；已觀察外部分頁recovery變更則不再採納，普通tick不反覆reload解衝突。補上外部分頁新recovery不可清除的反向控制；這不把多key操作誇稱原子交易。
- 清除recovery在取得自己的lock後，經precondition再次檢查primary ownership；新增等待鎖期間主存檔被換走的控制，原recovery bytes保持不變。一般clear的CAS沒有放寬。
- 第三輪最終與相同條件重跑皆366/366、0 fail、0 skip，T10／T11與原kiosk隱私斷言全部通過；記錄見`notes/test-results-v0.3.txt`與`notes/test-results-v0.3-repeat.txt`。原資料與全部原測試檔的Git差異皆為空，不把修測試setup混稱更改來源oracle。
