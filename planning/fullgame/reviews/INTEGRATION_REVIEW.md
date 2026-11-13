# 跨域整合審查：初審與修訂重核入口

日期：2026-11-02｜版本：0.6 兩項殘留有限重核完成｜角色：第七位獨立跨域審查者，非領域主筆。

**現行結論：20 項＝20 已解／0 已處理待重核／0 初審待修。本次僅重核並關閉04的最終選擇逐維預留、09的reopen跨lineage writer順序；其餘18項沿用既有精確關閉範圍。最新判定以 §10 為準，§9及更早段落保留歷史。20項所列規劃反例已全部解除；全部實作仍未實作待測，具名子schema及作者關卡保留。D21–D25是規劃裁決，非作者正史。**

本輪唯一寫入是本檔；未修改其他文件、未提交 Git、未派代理。0.6只重核04／09的指定修訂與ACC，實讀範圍及未測邊界見§10；0.5與先前審查紀錄保留。本文行號及引句對應**各次實際讀取的稿件**，不代表整個文件包來自同一個凍結commit；不能用歷史行號直接判定最新版仍有問題。

## 1. 判定方法與重要結論

- **P0／核心契約阻塞**：可能產生不同世界、提交／保存真值相反；相關基礎切片實作前應消除。
- **P1／高**：存在可描述的進度、獎勵、可恢復性或必經流程反例；相關工作包驗收前必須有唯一規則。
- **P2／中**：局部協定或驗收分歧；可局部修正，不要求重寫整個設計。
- 狀態只表示已讀證據：`初審待修`、`已處理待重核`、`已解`、`作者缺口`、`未實作待測`。初審沒有已解項；第二輪的 `已解` 僅關閉指定規格反例，全部仍 `未實作待測`。規格未註冊、已有規格互斥與尚未實作分開判斷。
- 示意 JSON、待量測資源目標、尚未選定的 runtime／資料庫／簽章算法、缺少後半正史，均不直接當成產品 bug。以下問題針對**已選規則之間的接縫**；新測試皆為建議，未執行。

**0.2 基線增補**：已重讀 DECISIONS D01–D20／O-N01–08，並全文讀取 SEASON_SIM_SPEC。D17–D20 已是規劃裁決，不等於所有引用方已完成修訂。下表 01–15 保留初審證據；D19 已取代初審的「B1 延後後仍須進分支處置」建議：B0/B1 都可直接記 main 的 deferred，`branchHandled=done OR deferred`，不發卡／親見；tag 不退出。D20 的日常補訪為當前 main 旅行，分支線索不等於 main 已取得 F5。賽季三項另補登 16–18，不以單檔自稱「契約已解」關閉跨檔問題。

### 0.4完成稿的歷史修復優先序（現行結果見§10）

1. **INTREV-02：全域 rewardLedger 與分支世界隔離衝突。** 在模擬先完成工單、再 abandon，可能耗掉主線尚未真正取得的獎勵額度。
2. **INTREV-03：章節延遲載入與固定完整 pack closure 沒有接合。** 只裝 Ch0 的既有 run 如何加入 Ch1，現行契約只有禁止換 refs 或另起 lineage，缺少正常續章路徑。
3. **INTREV-04：合法 state 不一定能保存為必需 checkpoint。** baseline 可達 32 MiB，但 checkpoint 必須是一顆最多 8 MiB 的 blob；可能到終章才發現無法建立必需回訪點。
4. **INTREV-19：volatile fallback 可續玩卻無合法終章出口。** 持續無法使用 IDB 的玩家可以合法選 memory＋匯出，但最後選擇只接受 durable pinned 快照；整合者已確認風險，仍待正式裁決。
5. **INTREV-20：COMMAND 支援 `$?`，封閉 EngineState 卻未保存上一個退出碼。** 不同前序 rc 在 compact／重載後無法由 baseline 恢復，下一筆 `echo $? > status.txt` 可改變 VFS／重放結果。

**07／08 的原契約衝突已解**，實作與具名子 schema 關卡保留。另按 §8.2 修09的結局後可玩 main／M7 接納邊界、10的跨輸出順序比較範圍、14的 compatibility 起點、15的 M1 共用核心交付及16的時鐘原點；不需等待另一份全包才開始局部修復。

## 2. INTREV 登錄表（初審歷史；最新狀態見 §10）

定位均相對 `planning/fullgame/`。引句用於稿件改行後再定位；嚴重度不是已量測發生率。owner 是工作角色，不代表已有實際人員。

### 2.1 新增的狀態／保存／章節反例

| ID／嚴重度 | 精確檔案 §／讀取行片段 | 矛盾反例 | 推薦具體局部修正 | 影響／owner | 狀態 |
| --- | --- | --- | --- | --- | --- |
| **INTREV-01／P0** | `engineering/ENGINE_CONTRACT.md` §2 L48「相同 EngineState、Input、精確內容集」；§3 L56 `reduce(state,input,content)`、L72 `branch.create {branchId,checkpointId}`；`engineering/SAVE_SCHEMA_2.md` §4 L146 stateHash 排除 history、§7 L221/L225 checkpoint 在外層且可為無前綴的狀態錨點 | 兩個合法 envelope 有同一目前 EngineState／stateHash，但 `ckpt/x` 分別引用不同、各自內部一致的舊 snapshot。送同一 `branch.create`，若 reducer 從宿主 history 找 snapshot，產生不同分支；若只能讀規定的三個參數，則根本拿不到 snapshot。現有 expectedStateHash 不能辨別這個差異。 | 把 checkpoint 解析成輸入內的不可變內容引用，例如 checkpointRef 綁完整 stateBlobHash／stateHash／來源 seq／版本及來源種類；隨 replay bundle 帶閉包。或在 EngineState 持有「過去 checkpoint 的承諾」並明定 resolver。不能只把 history 偷渡成未列出的 ambient state。避免引用當前 state 自身 hash 的循環。 | WP1/2/6/10、所有 branch/retry/ending restore；核心＋保存＋重放 | 初審待修 |
| **INTREV-02／P1** | ENGINE §4 L115 全域 `rewardLedger`、L126 branch-local progress、L136 分支結果不帶回；`engineering/TICKET_JUDGE.md` §2.2 L64 `(runId,ticketId,storyRewardPolicyVersion)` 四 route 共用一次；`engineering/MERGE_SPEC.md` §7 L210 同鍵；`gameplay/BOSS_AND_BRANCHES.md` §3 L47 世界資源恢復、L69/L71 只帶證據／abandon | 在 main 尚未處理 T0427 的 checkpoint 開分支，在分支 assisted／shell 成功，故事效果留分支，但 root rewardLedger 記一次已領。abandon 回 main 後 progress 與資源恢復；main 真正處理 T0427 卻被全 run 的 key 擋獎。相反，若回 main 還原整個舊 ledger，又可能撤掉其他合法紀錄。 | 明定分支工單的 reward domain。建議模擬只產生 branch-local 模擬獎勵／ledger，不消耗 main 故事額度；main 四 route 再共用一次性鍵。若採「分支不結故事獎勵」，也須明寫並在 UI／事件中一致。不能僅把所有 branch rewardKey 加 branchId 後允許帶回餘額。 | WP1/3/4/10；主線獎勵與因果；核心＋判題＋互通 | 初審待修 |
| **INTREV-03／P1** | 總綱 §3 L86「章節包延遲載入」；`engineering/CHAPTER_PACK.md` §3 L80/L84–89 全閉包驗檔後才啟動、L91 進行中 session 固定 packRefs／遷移另 lineage；§6 L167 完整下載閉包、L171 activation 不改 save.packRefs；ENGINE §4 L111 固定 refs；`ux/INTERACTION_SPEC.md` ST14 L106 缺下一章可重試 | A：以 Ch0-only closure 開始，之後安裝 Ch1；包 active 不能改 run refs，原內容 registry 也無 Ch1，沒有正常進章轉移。B：從 genesis 就鎖全部章為 closure，loader 又要求全部 bytes 才准啟動，便不能實現承諾的按章延遲載入。強迫每次進章做 migration／新 lineage 還會改動 run 身分、reward 鍵與 replay 起點。 | 在 PACK §3/6 明選一套：將「完整鎖定的內容目錄」與「當前章可執行／已水合閉包」分開，允許同一已鎖 refs 的分期安裝；或定義只追加相容 pack 的版本化內容轉移及 lineage／reward 保留規則。若 1.0 改採全量安裝，需同步收斂總綱與 UI 的延遲載入承諾。補 Ch0-only→下載 Ch1→原 run 續章的 fixture。 | WP1/2/8/9；離線入場、連載內容與回訪；核心包管線＋整合 | 初審待修 |
| **INTREV-04／P1** | SAVE §7 L221 checkpoint 的 `stateBlobHash` 指 canonical EngineState bytes、L236 結算前／開放分支 pin 不可刪；§8 L245 baseline 32 MiB、L248 單 blob 8 MiB、L249 全分支 100000 inodes；INTERACTION ST21 L113 快照失敗擋結算 | 一個 canonical state 為 9 MiB、符合 32 MiB baseline 與其餘計數上限的 run，可以作 baseline 保存；其必要終章 checkpoint 卻必須成為單一 9 MiB blob，被 8 MiB 上限永久拒絕。增加磁碟空間、再試或匯出原檔都不能消除格式上限。journal segment 大於單 blob 上限也有同型問題。 | 在 SAVE 局部統一可恢復單位的上限：為 state／journal blob 設明確不同的有界 profile，或設 chunked checkpoint／segment 引用；另一可行方案是把所有可達 state 的有效上限收斂到可 snapshot 範圍，且在產生變更前預留 pin 容量。明寫「合法目前 state 必可形成必要 checkpoint」的不變量。數字仍可待測，但上下限關係須先一致。 | WP1/10、M4 終章、ACC-02/05/24；保存＋核心＋QA | 初審待修 |

### 2.2 整合者已要求修訂的項目：本輪獨立確認

下列與委派時已提出的修訂重疊，不算另一份新發現；保留可重核位置與實際失效例。要求 owner 修訂不等於本審查已收到或接受修訂。

| ID／嚴重度 | 精確檔案 §／讀取行片段 | 矛盾反例 | 推薦具體局部修正 | 影響／owner | 狀態 |
| --- | --- | --- | --- | --- | --- |
| **INTREV-05／P0** | ENGINE §1.1 L29–30、§6.2 L170「原子提交成功後才發布 outputs」、§6.3 L184 I/O 失敗回滾；SAVE §6.1 L207–208 失敗保留舊 root，玩家明示才切 memory；INTERACTION §4 L68「提交引擎狀態→保存嘗試」、L81「已提交世界仍存在記憶體」、ST12 L104「遊玩可繼續」；UI_HANDOFF UI-COPY-010 L247「操作已完成，但本機保存失敗」 | durable 模式解出工單後 quota abort。工程規則判本次未提交、無獎勵；UX 卻報世界已完成並允許接下一題。關閉分頁／重新 replay 後回到未完成，玩家先前看到的因果不成立。 | UX 區分 durable 成功、未提交候選、玩家同意轉 volatile 三條；未同意前仍顯舊世界，候選只供救援／重試；轉 volatile 後才能顯示記憶體操作完成，持續標示模式。同步修改狀態圖、ST12、文案與取消表，不只改「已保存」三字。 | WP1/8/11；ACC-04/24、INT-004；UX＋核心 | 初審待修（已知待回稿） |
| **INTREV-06／P1** | ENGINE §5 L151「先…推進排程…重查…後執行」；BOSS §5.2 L108「動作原子套用、推…tick、執行…scheduler」、L111「下一個接受動作後」 | 下一 tick 會回收無引用 inode，玩家現在 `ln` 到 root。Boss 的順序先建立引用，資料保住；Engine 的順序先回收，`ln` 失敗。這不是毫秒校準，而是同一解法成敗相反。TERM handler／flush 與已重用 PID 也會受影響。 | 保留 ENGINE 為唯一 order authority，Boss forecast 改為含「執行動作前會先發生哪些到期事件」的完整步驟；或經整合正式改 ENGINE 規則並升 rulesVersion。補邊界 fixture，涵蓋一般 rc 失敗是否仍花時間、准入失敗零成本、取消整筆回滾。 | WP1/10、ACC-08/22；關卡＋核心 | 初審待修（已知待回稿） |
| **INTREV-07／P1** | TICKET §4.2 L132/L142 top3 必需編輯器；§4.3 L156–161 typed counting lineage；§5.2 L181 `file.edit`；ENGINE §3 L66–76 封閉 Input 無此 kind、§4 L132 封閉 runtime；SAVE §3 Inode L66／content L70–73 無 revision／lineage；§7 可 compact | 合法分段 `cut→工作檔→sort→uniq` 後存檔、compact、換宿主，再提交 counts。只剩 bytes／inode／mtime 不能分辨「真正計數」與「先 cat 再貼答案」；前者被拒或後者被接受。top3 的保存若從 UI 直接改 VFS，重放又缺輸入。 | ENGINE 登記 editor 的正式 lowering（專用 Input 或明確的既有動作映射）、guard／blobRef／取消；由核心保存每次寫入的 typed provenance／revision 及必要閉包，說明覆寫、append、hardlink、copy、compact 如何保留或失效。結果相同不等於來源相同；不得用 terminal history 字串補猜。 | WP1/3/8；JUDGE-005/006/009、ACC-02/09/10；判題＋核心＋保存 | 初審待修（已知待回稿） |
| **INTREV-08／P1** | ENGINE §4 L109 profile.playerId、L107 lineageId、§8 L207–208 ProgressRecord／六個 evidence 欄位及 evidenceType；SAVE §4 L141 `H(evidence,record-minus-id)`；TICKET §3 L74–84 logical actorId/runId/profile/evidenceRefs；MERGE §3 L36–43、L59 轉寄不改原證據、§4 L76 receiver View；SAVE §5.2 L167 legacy 的 shell-local 落點，TICKET §2 L34 legacy 不冒用四種新結果 | 不明訂 actorId↔playerId、runId↔lineageId 時，判題冪等鍵、同步同人判斷與 UI 本人稱謂可各自用不同 ID。若 A 的 self evidence 轉寄給 B 時改 immutable `evidenceType` 為 peer-shared，同 ID 的 hash 不再成立；若重算 ID，又破壞 A→B→C 去重。legacy shell-local 若僅看 resolutionMode 會被 UI 稱作本次本地通過。 | 在唯一 authority 加正式映射表與版本，明列 ProgressRecord 的 profile／能力／來源多筆保存及 legacy 投影優先規則。EvidenceRecord 原始 bytes／ID 不變；peer 是 receiver-dependent view，forwarding 紀錄另置。映射也要涵蓋 variant/outcome、receipt 與每個引用的 hash domain，不能只把示例名稱替換成同字。 | WP1/3/4/6/8；ACC-03/09/11/12；核心＋互通＋UX | 初審待修（已知待回稿） |

### 2.3 操作閉包、重放、交付及局部語意

| ID／嚴重度 | 精確檔案 §／讀取行片段 | 矛盾反例 | 推薦具體局部修正 | 影響／owner | 狀態 |
| --- | --- | --- | --- | --- | --- |
| **INTREV-09／P1** | ENGINE §3 L66–76 Input registry；SAVE §5.2 L172 legacy checkpoint「只產生…模板進入能力」且不列實際 restore checkpoints；BOSS §3 L72–73 tag／reopen、§4 L82 chapter return；MERGE §6.2 L186/L190 `merge.resolution` 尚待命名整合；INTERACTION ST21–22 L113–114／§6 L131 結算前回訪另開有效歷史 | legacy `gc_name_heard` 匯入承諾可立即開 B1，但沒有過去 VFS snapshot；若一律送 `branch.create(checkpointId)`，按 ENGINE 的「缺歷史拒絕」就不能進，若造歷史則違 SAVE。另有主線旅行、回結算前另開歷史、tag/reopen、self-sync 選世界等不同操作，不能全叫 restore／knowledge.import。 | 在 ENGINE／SAVE 增一張**語意操作→已註冊 Input／宿主保存操作→持久位置→來源種類**表。模板開分支要明示 template-origin，不能冒充 restore；旅行維持當前 main；結局選擇可用 choice.select，但要註冊其終態及回訪入口；self-sync active root 切換可屬宿主，不必硬塞 reducer，須有明確 audit/CAS 契約。COMMAND 未納本輪，因此此項是映射尚未證明閉合，**不是聲稱 command.execute 永遠不能承載上述操作**。 | WP1/4/8/9/10；ACC-03/05/12/20/22；核心＋保存＋互通＋敘事 | 初審待修 |
| **INTREV-10／P2** | REPLAY §3 L54、L58、§4 L85、§6.1 L245 要逐步 outputDigest／語意串流；ENGINE §6.2 L174–178 effects registry 與 presentation，只有 command.completed 明定 stdout/stderrHash；SAVE §2 L37–46 JournalRecord 無 outputDigest，§4 L136–144 hash 表無 semantic output 格式 | 兩端對同一行為使用相同 state／effects，卻將對話參數物件的 canonical message 或展開後 UTF-8 文字分別當 outputDigest 輸入；都符合目前「exact bytes／canonical message」二選一敘述，仍得到 OUTPUT_MISMATCH。只有 stdoutHash 不能涵蓋對話、系統訊息及跨 channel 順序。 | 由 ENGINE 定有序 semantic output record 的封閉格式、stdout/stderr bytes 與 dialogue textRef/args 的邊界；由 SAVE 定唯一 digest domain／編碼。明示 trace 是 journal 必存欄位、可再生 DTO，或獨立 blob；若可再生，註明它不能證明當時畫面實際曾呈現何文字。presentation 的 DOM／動畫可繼續排除。 | WP1/6/8；ACC-14、REPLAY-001/021；核心＋保存＋重放 | 初審待修 |
| **INTREV-11／P2** | REPLAY §5.1 L157「提交…期限與…結果期限分開，邊界規則固定」、§5.2 L203 明定收件 `< expiresAt`、L207 resultDeadline 未完成 timeout；§6 L227–231 結算交易再檢查 resultDeadline；TICKET §7.3 L279 遲到 OJ 依 resultDeadline | proof 在 deadline 前驗完，但結算鎖等待跨過 deadline；或 OJ 早已完成，bridge 在 deadline 瞬間才持久化結果。讀者可把「結果及時」解成 OJ finishedAt、bridge receivedAt、proof persistedAt 或 settledAt；不同服務會一邊簽 judge receipt、一邊判 RESULT_DEADLINE。沒有數值也必須能判邊界。 | 在 REPLAY 明訂 resultDeadline 對哪個伺服器持久事件、用 `<` 或 `<=`，並區分 proof 接納截止與 settlement 截止／季末 fence；OJ 自報時間不直接取代權威收件。補 deadline 前完成但後結算、恰等於、季末關閉／取消競態三組例。SEASON_SIM_SPEC 本輪未納，不能據此宣稱賽季政策已相反。 | WP6/7；ACC-15/16；重放＋OJ＋賽季 | 初審待修 |
| **INTREV-12／P2** | `engineering/MINIGIT_SPEC.md` §3 Revision L54「`~0`／`^0` 表示該 commit」，L56「第零親不存在」 | 同一 `git diff R^0 R`，實作者可依 L54 回空 diff，也可依 L56 拒第零親。這是已宣告子集內的語意衝突，不依賴未知 Ch6 正文。 | 將 L56 改為「除 `^0` 的 commit 自身語法外，不存在的父索引拒絕」，補非 commit object 是否一律拒絕的本版規則；在 MINIGIT-02 加 R^0／R~0 與根 R^1 反例。 | WP5、ACC-13；MiniGit＋QA | 初審待修 |
| **INTREV-13／P1** | 初審：`narrative/VOICE_AND_COPY.md` §4.1 L60 B0「可永久略過」、L61 B1 延後；§4.3 L89 採 T0100 修工具；REVEALS §6 L104 採目前 main 旅行；但 `narrative/CHAPTER_BEATS.md` §1 L26／§2 L52 B0 不進入仍待定，`SOURCE_MAP.md` NAR-C04 L72 仍待整合者，TICKET §2.1 L58 T0100 仍待裁決；BOSS §3 L76 tag 仍提案。增補：DECISIONS D19/D20 L37–38 | 同一玩家拒絕 B0：copy 作者準備直接離島，gate 作者仍照 B0_exited 必修。晚補礦坑：敘事已選 main 旅行，關卡回訪表仍把入口／結算前保存點並稱。初審發現為撰寫批次未收斂；現已有 D19/D20 正式規劃裁決，仍須核引用方。 | 依 D19 核 B0/B1 **皆可直接 defer**，done 僅分支 merge/abandon 出口；deferred 不冒稱親見／得卡；tag 收藏不退出。依 D20 核 main 旅行不還原舊世界、F5 須 main 合法取件／明示協助。**撤換初審「B1 延後後需處置」判準**。T0100 背景修訂仍須與 O-N07 作者批准分開，既有 YAML 留內容工作包。 | WP3/8/9/10；ACC-09/19/22；整合＋敘事＋核心 | 已處理待重核（已讀裁決，未據裁決單獨關閉） |
| **INTREV-14／P2** | SAVE §7 L225/L230–231 允許只證明 snapshot 當下一致並重放之後；REPLAY §4 L82「一般離線任意 snapshot 只提供有界 coverage」；§4.1 L131 卻只列 pack genesis／可驗伺服器 checkpoint、缺歷史回 partial | 正常離線玩家 compact 後，只剩非伺服器簽發 baseline＋完整 tail。SAVE 可續玩且可重放 tail；REPLAY 的資料表允許有界相容性檢查，但程序若只准可信 genesis／server checkpoint，會直接 CHECKPOINT_UNTRUSTED，連所宣稱的 tail coverage 都無從產生。 | 按 purpose 明定起點准入：compatibility 可用 schema/invariant 合法但來源未證的 baseline，assessment 分列「此起點後可重放」與 genesis 不可證；season 僅允許 grant 綁定的可信起點。若服務刻意不提供前者，收斂 §4 與 SAVE 對服務能力的說明。 | WP1/6；ACC-05/14、REPLAY-006/022；保存＋重放 | 初審待修 |
| **INTREV-15／P1** | `delivery/ROADMAP.md` M1 L33 要 TS／核心狀態／schema2；`delivery/WORK_PACKAGES.md` §2 L26–37：WP1 交 reader/writer，WP2 交 manifest，WP10 交遭遇；P-01 L45–48 作映射；ENGINE §11 L249–251 另列 reducer／Input／effect／時間／PRNG／分支切片 | 若各 WP 只按「實際交付」完成，SAVE reader、pack loader 與 Boss 各依賴共用 reducer、scheduler／command registry，卻沒有一包明列要交完整基礎。ACC-08 掛 WP10，但三鐘／取消／共用 Input 在 M1 就需要；「工程角色知道要做」不能作可派工出口。 | 在既有 WP1 加具名核心子包（或明確指派既有包）：Input/effect/schema registry、純 reducer、時鐘／PRNG／scheduler／cancel、command lowering、固定向量；標 M1 交付，WP10 只擴遭遇。ACC-02/05/06/08/09/14/22/24 各掛本文高風險子案例，特別是保存後提交、跨章啟用與分支獎勵，不必為此新增大量重複文件。 | M1 依賴與派工／ACC 覆蓋；整合＋核心＋QA | 初審待修 |

### 2.4 賽季接點初審補登

三項舊衝突由整合者回送，未取得舊 SEASON 稿的行號，不冒稱親讀該版。下列精確定位為本次實讀的修訂稿；原衝突及可重現失效例保留，SEASON 已改不等於 REPLAY／TICKET 已完成跨檔重核。

| ID／嚴重度 | 精確定位／證據來源 | 矛盾反例 | 推薦具體局部修正 | 影響／owner | 狀態 |
| --- | --- | --- | --- | --- | --- |
| **INTREV-16／P1** | 回送初審：SEASON 秒制與工程毫秒制衝突。實讀修訂：DECISIONS D18 L36；SEASON §2 L33–42、§3 L51–56、SEASON-21 L304 | 同一數值 duration=60 若一端當秒、一端當 ms，turn、expiresAt、維護窗及 GC 排序會相差千倍；ISO adapter 截掉毫秒亦會改期限邊界。 | 所有數值 clock/timestamp/duration 同為安全整數 ms，欄位與傳輸轉換一致；例值與 timeout fixtures 不能只改欄名。核日／週／8h 換算及 ISO 往返。 | WP6/7；REPLAY＋TICKET＋賽季 | 已處理待重核（SEASON 已見修訂，跨檔未核） |
| **INTREV-17／P1** | 回送初審：SEASON 同 work 的 WA 重試與 REPLAY 一 nonce 一 proof 衝突。實讀修訂：SEASON §4 L80–81、§5.1 L96–113、SEASON-19 L302；D18 | proof A 已受理後 WA；客戶端在同 work 換 proof B。若後端鎖 nonce，UI 的「重試」永遠被拒；若允許替換，原工作摘要／收據與一次授權承諾失真，還可繞發單配額。 | 語意失敗終結 grant；新 proof 經新 grant 並扣配額。可靠重送及系統同 job 重試只用原 proof；受理前格式失敗另列，reservation 釋回不等於退發單額度。 | WP6/7；判題＋重放＋賽季＋UX | 已處理待重核（SEASON 已見修訂，跨檔未核） |
| **INTREV-18／P1** | 回送初審：SEASON 批次聚合與 REPLAY 逐工單 CAS 衝突。實讀修訂：SEASON §5.1 L99、§5.2 L119–135、SEASON-05/20 L288/L303；D18 | 同 turn 兩份合法修補／contest 都綁 v7。逐件 CAS 只讓先到工單改為 v8、另一份 stale；批次規則則以同一 v7 聚合兩份效果。相同有效工作因 worker 順序有不同 owner／成本／獎勵。 | 逐工單重查授權與 deadline，合格項按同 group 起始 snapshot 聚合，一次 CAS 及原子 ledger；每 work 各有 receipt，共用 settlementId，不把團體收據當可轉移個人授權。 | WP6/7；重放＋DB＋賽季 | 已處理待重核（SEASON 已見修訂，跨檔未核） |

## 3. 高風險反例的最小紙上向量

下列是交給 owner 的驗收設計，不是已執行程式測試；刻意使用非正史小 fixture，不填補後半謎題答案。

### V-INT-01：checkpoint 不是 ambient input

1. S 為同一目前 EngineState，已知 stateHash=h；E1、E2 的 baseline/head 都指 S。
2. E1.history 的 `ckpt/x` 指向 state A，E2.history 的同名 checkpoint 指向 B；A/B 各自有正確 blobHash／stateHash。兩份都無該 checkpoint 的可驗前綴，依 SAVE 保持「狀態錨點」來源。
3. 同一 `branch.create` 輸入只有 h、分支 ID 與 `ckpt/x`，未攜 A/B 的內容承諾。
4. **必須裁定**：E1/E2 不可在「相同完整規則輸入」的名義下各產生不同世界；正式 Input 應不同，或其中一方在明定准入規則下被拒。把兩個結果事後各自 hash 正確，不算解決。

### V-INT-02：分支獎勵不可提前耗掉 main 額度

1. main 的工單 T 未處理、rewardKey 不存在；從此前 checkpoint 開 sandbox。
2. sandbox 以 assisted 處理 T；再 abandon，不帶世界資源／主線進度。
3. main 第一次真正處理 T；之後自行解題再試一次。
4. **期望**：main 首次按政策給一次獎勵，後續 route 不再給；sandbox 不污染 main 額度。再加「已在 main 領過→開更早 snapshot→返回」與「save/compact/reload 後返回」兩個方向。

### V-INT-03：同一 run 正常續章

1. 只具備 Ch0 可執行所需的已安裝 bytes，合法開始、保存並離線續玩。
2. 後來安裝精確 Ch1 bytes；原 run 進 Ch1，保留身分、原獎勵去重與來源歷史。
3. 下載被取消／壞 hash／quota 失敗時，原 Ch0 世界仍可用；有相同 packId 的新版本時不偷換舊 refs。
4. **期望**：有唯一合法 protocol；不能靠為消除 refs 不符而反覆新建 lineage。若產品選全量安裝，須明確調整承諾，這個向量改標不適用＋理由。

### V-INT-04：必要 checkpoint 的形狀閉包

1. 用許多合法 inode／runtime 記錄形成 8 MiB 以上、32 MiB 以下的 canonical EngineState，其他總 bytes／節點上限均合格。
2. 保存為 baseline 後要求建立分支 fork pin 或結算前 pin。
3. **期望**：格式允許完成 checkpoint，或更早的 state admission 就以明示、可恢復的資源錯誤拒絕造成不可 snapshot 的變更。不能在玩家已抵達不可逆門檻時才以單 blob 格式上限造成永久死路。

## 4. 初審逐域結果與覆蓋邊界（第二輪增補見 §7）

「未發現新增矛盾」限本輪讀過的文件語意，不等於實作／真人通過。下表亦記錄可保留的設計，避免只列問題而無法判斷審查覆蓋。

| 領域／已讀範圍 | 已核對結果 | 問題或剩餘狀態 |
| --- | --- | --- |
| **決策／總綱**：DECISIONS 全文、總綱全文 | D01–D03 的 1.0/C1/M6/M7 分層在總綱模式表、章表、里程碑表一致；Ch3.5、九 B 含 B3b、四＋隱藏結局都保留。Python 未開仍可主線通關，M0 真人與文件研究分開。 | 延遲載入接點 INTREV-03；本輪未以 4–6 小時、25–40 分鐘等目標當已實測。 |
| **Engine／三鐘／order／cancel**：ENGINE 全文 | 同版本確定性、整數故事鐘、PRNG 分流、正常 shell rc≠0 與整筆取消分開；活動／賽季不倒灌故事鐘。規劃已明示宿主不可直接讀時間或亂數。 | INTREV-01/02/06/07/08/09/10/15；未實作待測。 |
| **Save／hash／legacy**：SAVE 全文 | canonical 不冒稱 JCS；碼點排序、raw-byte hashes 與 domain hashes、原八碼 ID／原 bytes 保留均清楚。baseline＋journal 是唯一世界權威；CAS 不只比 head；pin、救援與 volatile 有具體規則。 | INTREV-01/02/04/05/07/08/09/14。legacy 任意 VFS/cwd 不補造；沒有把升 schema 當驗真。 |
| **Pack／內容版本／來源**：CHAPTER_PACK 全文 | manifest／contentSetHash 的唯一算法、精確依賴 DAG、source map、draft 未知阻發布、生成 bytes 與固定版本、file:// 發行均有正負例。mtime 與藏片時序已分開。 | INTREV-03/04/09；時間 policy 的精確成本及 generator 效能仍是未實作待測，不另當缺陷。 |
| **Command** | 初次檔案清單未見 `engineering/COMMAND_COMPATIBILITY.md`，故**未納入本輪審查**；未輪詢。僅核對其他已讀文件要求的命令／動作接點。 | 不判斷完整文法、選項、stdin/stdout／pipe semantics 或 GNU 對照是否已定稿；INTREV-09 的 command lowering 留第二輪核對。 |
| **Ticket／profiles／能力**：TICKET 全文 | 四 route、故事／能力／程式 AC 分離；T0427 300 行工作副本不冒充 120 萬行 AC；數值 IPv4 tie-break、原程式 comparator 差異、取消／outbox 均明示。Python runtime 與 QDUOJ API 未驗誠實保留。 | INTREV-02/07/08/11/13；需持久 typed lineage，不可只驗輸出。 |
| **Merge／identity／knowledge**：MERGE 全文 | 三操作分類、固定 receiver/progress/policy 後驗知識三性質、相同 ID 異內容拒絕、sealed 非 DRM、轉寄不換作者、peer 不帶世界／票／貨幣均合理。K1 exact/collateral 保留雙證據。 | INTREV-02/08/09；peer K0/K1 是否滿足某個 ending 的「卡持有」與是否自動執行 ending 必須分別驗，不能把兩者混成同一禁止。本輪不擅替未知 gate 加 self 限制。 |
| **Replay／grant／receipt／settlement**：REPLAY 全文 | 已分 integrity、replayability、seasonReceipt；無授權離線結果不轉競賽。首份 proof 綁 nonce、resourceVersion CAS、取消／結算競態、transactional outbox 有實質規則。合法新軌跡不等於未改檔／真人的邊界正確。 | INTREV-10/11/14；簽章算法尚待選型是有標示依賴，不認定已有脆弱實作。 |
| **MiniGit**：MINIGIT 全文 | repo HEAD、遊戲分支、save commit 分開；blame 不判責任；線性 bisect 要單調 predicate；DAG 支援／拒絕邊界及固定 upstream Git reference 均明示。 | INTREV-12；MG-O01 路由、reference image 未取得、後半正文皆已列依賴，不當已實作缺陷。 |
| **UX／interaction／UI／a11y／研究**：ux 五檔全文 | 兩模式共用引擎、IME／多行批次、焦點與回捲、分享預覽、活動與故事時間、WCAG 2.2 AA/44px 區分、實機與真人分母均有清楚邊界。研究沒有捏造樣本或通過率。 | INTREV-05/07/09/13；本審查未做 WCAG 符合性稽核、對比計算、瀏覽器或讀屏測試。 |
| **敘事／正史／先後**：SOURCE_MAP、narrative 四檔、NARRATIVE_DEBATE 全文；另讀原 charter/fragments/K0/K1/import_rules | 三人／七片／八片／k-of-8 已分開；mtime 不證藏片時間；CI→拆片→熄燈→貓罷工的缺證沒有用新事件補洞。八空格與隱藏結局仍未知。主筆採用提案不等於作者批准。 | INTREV-13；已重讀 DECISIONS O-N01–08，均為**作者缺口**。O-N08 明列草案全文／揭露章衝突，不用只遮 UI 代替作者裁定。 |
| **Boss／九分支**：BOSS_AND_BRANCHES 全文 | 九 B→K 對應正確；GC／PID1／他人權限、TERM/KILL、hardlink/copy／buffer root 區別、免費局部復原有實質 guard。技術 fixture 不直接發 F7/K6。 | INTREV-01/02/04/06/09/13；讀取／主線停留零時間的方向一致，action 次序尚待對齊。 |
| **擴充／C1／2.x**：EXPANSION_MODES 全文 | 紅七／藍七全標 proposal，不冒充正式七案七夜；同 incident 的角色可見性分開；完整衝突與知識 union 不混同；Ch4 NPC pipe 不依賴 2.x relay；真人外部審閱不綁主線。 | 本輪未發現新增版本範圍矛盾。EXP-O03 的擴充 wire schema 應在 C1 實作前定，不要求 M1 先把全部候選機制做完；未實作待測。 |
| **賽季接點**：增補已全文讀 SEASON_SIM_SPEC | 初次清單未見而未納初審，現按回送增補。稿內已統一 ms、一 grant 一 proof、批次 CAS；§5.2 明訂 decisionTimeMs < resultDeadline；§6 明列維護窗→turn settlement→GC→稅收／維護→報表。模型假設、badparam、真人與模擬證據分開。 | INTREV-11/16/17/18 尚待跨檔核。未執行 sim／ledger／scheduler，公平參數未驗；季末 vote 細則仍為作者／產品缺口，不由本審查補造。 |
| **Delivery／WP／ACC**：ROADMAP、WORK_PACKAGES、ACCEPTANCE_MATRIX 全文 | 1.0 與 C1/M6 獨立、M7 後端依賴、WP7 不依賴 mini-git 均一致；所有持久轉移有成功／拒絕／中斷的覆蓋目標；文件、自動、整合、人工、真人證據分層。 | INTREV-15；既有 ACC 可以容納本輪反例，但廣義「round-trip／去重」不足以保證上述特殊交互已被選作案例。 |

### 應保留的作者缺口，而不是本輪新缺陷

| 範圍／已讀定位 | 現有處理是否誠實 | 狀態／解除責任 |
| --- | --- | --- |
| DECISIONS O-N01–04；REVEALS §5 L86–100 | 只列五結局已知必要條件，不虛構充分條件；未知仍阻 M4/M5 相應發布。 | 作者缺口：取得可讀正文與版本，再補可達／缺條件不可達。 |
| DECISIONS O-N05；REVEALS §7.2 L127–137；原 charter L154–162 | 把直接文本與 mtime 推論分開，未新增「更早罷工／再次 CI」作補丁。 | 作者缺口：核定事件時間／記錄時間及須改來源。 |
| DECISIONS O-N06；REVEALS §3 L54–70 | NPC 三角色不冒稱三真人；八片不等於八票；未填 k，也未宣稱已證分散授權。 | 作者缺口：root 重建／持有／動用與修憲的模型。 |
| Ch2 全文出場；REVEALS C01 L46–48 | 保留延後全文或提前 G3 兩案，說清是修訂，不用只遮 UI 防止 cat/grep 洩漏的假解。 | 作者缺口：由有權作者核定；完成稿須選定規劃預設與正式發布阻塞。 |

## 5. ACC 與工作包的最小補強建議

不要求重建驗收系統；在現有 ACC 的 fixture 清單增加可辨識子案例，並掛回實作 owner。這是初審提出的清單，不表示各列都仍未修：第二輪實讀 ACC-08/10/14/15 已補 D17、editor/provenance、OutputRecord、D18 反例；仍須補下列未解交互並實作驗證。

| 現有 ACC | 本輪需具體化的反例 | 對應 INTREV／owner |
| --- | --- | --- |
| ACC-02/05/14/22 | 同 state/input 不同 history checkpoint；legacy 模板開分支與真 restore；compact 後相同分支輸入 | 01/09/14；WP1/6/10 |
| ACC-09/10/11/22 | 分支先完成→abandon→main 第一次完成；main 已領→從更早點重試；多 route 後只增加能力證據 | 02/08；WP1/3/4 |
| ACC-06/07/01 | Ch0-only 安裝→安裝 Ch1→同 run 續章；取消更新保留舊 closure；內容 migration 不重領 | 03；WP1/2/8 |
| ACC-02/05/24 | 最大合法 state 建必要 pin；journal segment／checkpoint 與單 blob 上限互相成立 | 04；WP1 |
| ACC-04/24/17 | durable quota abort 前不可發布成功；明示轉 volatile；取消在 durable commit 前後；讀屏不先宣讀獎勵 | 05；WP1/8/11 |
| ACC-08/22 | 同 tick `ln` 與回收、TERM 與 flush、PID incarnation；准入拒絕和成本後普通失敗分開 | 06；核心子包＋WP10 |
| ACC-02/09/10 | counts 分段寫檔→hardlink/append/覆寫→compact/reload→提交；editor 保存與直接管線各有合法輸入 | 07；WP1/3 |
| ACC-03/09/11/12 | A→B→C 不改 evidence ID；同名不同人／同人不同 run；legacy 結果文案不變新 route 成功；profile 多筆證據不遺失 | 08；WP1/3/4/8 |
| ACC-14 | 對話＋stdout＋stderr 的確定順序／編碼；只變語意輸出而 state/effects 不變的反例；untrusted snapshot tail coverage | 10/14；WP6＋核心 |
| ACC-15/16 | expiresAt 恰等於、resultDeadline 恰等於、proof 早完成而 settlement 晚、GC／季末 fence／取消競態 | 11；WP6/7，第二輪規格已解、實作待測 |
| ACC-13 | R^0、R~0、根 R^1、不存在父索引 | 12；WP5 |
| ACC-19/20/22 | B0/B1 不進分支直接 defer 後 gate 成立、無 K0/K1／親見；補訪後 done 與 deferred 投影；main 晚訪合法取 F5、不帶分支物品；tag 後仍在原 branch；peer 卡效用與主線選擇分開 | 13；WP9/10/4；依 D19/D20 取代初審舊判準 |
| ACC-15/16 | 秒／ms 混用拒絕與 ISO 無損往返；同 work WA 後換 proof 拒絕、新 grant 扣額；同 v7 多工單批次、含過期項逐件剔除、整批 CAS 與各別 receipt | 16/17/18；WP6/7 |
| ACC-15/16 | 固定 seasonStart 與 now，跨服務核對 epoch／elapsed／turn、恰等期限與 ISO 毫秒接受子集 | 16；WP6/7；V-INT-16 |
| ACC-20/24 | IDB 持續不可用、已明選 volatile、全部故事條件合法時的終章與回訪出口；不能只驗暫時 quota 重試成功 | 19；WP1/8/9/11；V-INT-19 |

## 6. 未讀、未測與第二輪重核規則

### 實際已讀

- 必讀基線：DECISIONS、總綱、delivery 三檔，皆全文。
- 七份當時存在的 engineering 規格：ENGINE、SAVE、PACK、TICKET、MERGE、REPLAY、MINIGIT，皆全文。
- ux 五檔、narrative 四檔、SOURCE_MAP、BOSS_AND_BRANCHES、EXPANSION_MODES，皆全文。
- README、STATUS、reviews 的 NARRATIVE_DEBATE／ISSUE_REGISTER／VERIFICATION，皆全文。VERIFICATION 中的命令與通過／失敗紀錄是其他作者記載，**本審查未重跑或冒認為自己的執行結果**。
- 交叉核對原件：`world/charter.yaml`、`world/fragments.yaml`、`cards/K0.yaml`、`cards/K1.yaml`、`demo/import_rules.yaml`，皆全文。未把 SCRIPT 生成本與 YAML 算成兩份獨立證據。
- 0.2 增補：DECISIONS D01–D20／O-N01–08 重讀全文；SEASON_SIM_SPEC 首次全文閱讀。其自標「契約已解」不視為本審查的重核結果。
- 0.3 第二輪：重讀 TICKET／MERGE／REPLAY、MINIGIT／BOSS／EXPANSION、ENGINE／SAVE／PACK、WORK_PACKAGES／ACCEPTANCE_MATRIX 全文；首次全文讀 COMMAND。SOURCE_MAP＋narrative 五檔（含首次讀 AUTHOR_RESPONSE）全文；UX 五檔完成稿已全文重讀。核心仍在修訂，最新實讀差異詳 §7，不宣稱同一凍結版本。
- 0.4 完成稿：ENGINE／SAVE／CHAPTER_PACK／COMMAND 四檔全文重讀；有限重核 TICKET §2.2–5.2、MERGE §1–7、REPLAY §1–5.0、MINIGIT §2–10，以及 UX 終章／缺包／回訪接點。WORK_PACKAGES（含新增子 schema 小包表）及 ACCEPTANCE_MATRIX 全文重讀；SEASON §2／§4 的時間與 fact 接點、總綱延遲載入句作定點核對。另搜尋規劃內 `$?`／退出碼狀態定義以檢查新反例，未重做敘事全文審查。

### 未納本輪／未讀

- 初次清單未見的 COMMAND、AUTHOR_RESPONSE，當時只記未納入，未報產品缺陷；第二輪已全文讀取。SEASON 在 0.2 已全文閱讀。未輪詢不存在的文件。
- 原始完整版企劃封存全文、SCRIPT 全文、其餘原始 chapters／branches／dialogue／text／程式碼與歷史測試輸出：本審查未逐檔重讀。涉及這些現況的主張，除上列已直接核對原件外，以規劃內引用作定位，未獨立認證。
- 外部故事聖經正文／確切版號未取得；未嘗試登入或補寫。
- 本輪閱讀後由其他 owner 更新的段落，不自動納為已重核；等待整合者送交完成稿與修訂定位。

### 未執行

沒有跑遊戲測試、真 Bash/Git 對照、schema／hash conformance、JSON 範例執行、文件連結檢查腳本、效能／記憶體／取消量測、瀏覽器操作、手機／IME／讀屏器測試、真人試玩或賽季模擬。本文反例是文件規則推導；沒有宣稱程式或真人驗收通過。

### 第二輪接受／關閉條件

1. 整合者回送修訂檔與 §／ID；重核唯一 authority、引用方及對應 ACC，不靠 owner 一句「已修」關閉。
2. 新欄位／Input 不能只在示例出現，須進正式封閉 registry，並標明 hash、持久位置、版本、來源及取消邊界。
3. 規劃語意一致可標 `已解`，同列註記 `未實作待測`；未取得正史維持 `作者缺口`，不能以工程 fixture 通過代替。
4. 若修訂證明初審誤讀，保留原 ID 與反例、寫明撤回理由；若是方向已處理但尚缺跨檔核對，標 `已處理待重核`。
5. 不為湊問題數增加事項；只有新修訂、反例失敗或未解關切才擴大重核範圍。

| 輪次 | 實際收到的修訂／回應 | 重核範圍 | 判定 |
| --- | --- | --- | --- |
| 初審 0.1 | 委派訊息列出五類已要求 owner 修訂事項；尚未收到完成稿 | 上述逐域閱讀與紙上反例 | INTREV-01–15 登錄；無已解宣稱 |
| 增補 0.2 | 整合者回送 D17–D20、O-N08 與賽季三項舊衝突；主筆仍在對齊 | DECISIONS／SEASON 全文；撤換本審查 D19 舊 gate 判準 | 補登 INTREV-16–18；SEASON 已見方向處理，跨檔未核，不宣布整包完成 |
| 重核 0.3 | 互通／玩法／敘事及 UX 完成稿；整合者已要求核心採 inline content＋六欄 EvidenceRecord，核心仍收尾 | 本節所列第二輪全文與最新接點定位；UX 自檢不代替跨域判定 | 01/05/06/11/12/13/17/18 的原規格反例已解；新增19；07/08等保留待重核，實作全部未測 |
| 完成稿 0.4 | 核心四檔與 TICKET／MERGE／REPLAY／MINIGIT 引用同步完成；WP 子 schema 前置小包已列；整合者確認19風險仍待裁決 | 最新核心全文＋受影響接點有限重核，詳 §8；不等待新全包、不再派代理 | 07／08關閉原規格反例，新增20；20項＝10已解／3已處理待重核／7初審待修；具名規格關卡及全部未實作待測另保留 |

## 7. 第二輪判定歷史（0.3；現行判定見 §10，不刪原 ID／反例）

本節定位是本次實讀稿，不是凍結 commit。整合者已指定採 **inline content 的 file.edit payload＋MERGE 六欄 EvidenceRecord**；最新實讀 UI_HANDOFF S04 L120／EvidenceCard L215 已改，INTERACTION L115 亦一致。ENGINE 的 file.edit／provenance 正在收斂，但 §8、SAVE 與部分 registry 引用仍有舊稿。核心尚未收到完成通知，因此不能將這些中途差異寫成完成稿驗收失敗，也不能提前關閉。

### 7.1 原反例已解：只判規格，不判實作通過

| ID／原嚴重度 | 第二輪精確證據與關閉理由 | 影響／owner／後續驗收 | 最新狀態 |
| --- | --- | --- | --- |
| INTREV-01／P0 | ENGINE §3 L56 限 resolvedRefs 為 state/input 完整 hash 指定的不可變資料，L73 branch.create 綁 checkpointStateHash；COMMAND §7.1 L167 同形；SAVE §7 L231/L235 同驗 stateBlobHash／stateHash。初審 V-INT-01 的兩個不同 snapshot 現在必須有不同完整引用，不能再叫同一合法 Input。 | 核心＋保存＋重放，WP1/2/6/10；保留 V-INT-01 作反向驗收，ACC-02/05/14/22。 | **已解（指定規格反例）；未實作待測** |
| INTREV-05／P0 | ENGINE §6.2 L282、SAVE §6.1 L217–220、INTERACTION §4 L68–102／ST12 L137、UI_HANDOFF S09 L186／UI-COPY-010/024/025/026 L257/L271–273、ACCESSIBILITY §4 L56 全部區分 durable abort、候選救援、明選 memory commit 及 legacy best-effort。下載候選不自動發布世界。 | 核心＋UX＋QA，WP1/8/11；ACC-04/24、INT-004 故障／取消／讀屏案例仍須執行。volatile 終章另列19，不混回原「先發布後保存」反例。 | **已解（指定規格反例）；未實作待測** |
| INTREV-06／P1 | D17；ENGINE §5 L263、BOSS §5.2 L113–114／L147、REPLAY §3.1 L55、INTERACTION L38/L42、ACC-08 L33 同採准入→固定成本→時鐘／排程→重查→行動；准入拒絕與排程後正常失敗有別。原同 tick ln／GC、TERM／flush 次序不再互斥。 | 核心＋關卡，WP1/10；ACC-08/22 邊界與取消未測，不能僅比較最後畫面。 | **已解（指定規格反例）；未實作待測** |
| INTREV-11／P2 | SEASON §5.2 L121/L123 明訂本次權威交易固定並保存的 decisionTimeMs **小於** resultDeadline；恰等拒絕，proof 早通過但結算晚亦拒。REPLAY §6 L258/L262 委由 SEASON 的期限／turn 政策，TICKET §7.3 L334–335 同步。原「完成時間是哪一個事件」已有裁定。 | 重放＋OJ＋賽季，WP6/7；ACC-15/16，期限／季末／取消競態未測。時間原點另見16。 | **已解（指定規格反例）；未實作待測** |
| INTREV-12／P2 | MINIGIT Revision L54–56 明示 ^0 是 commit 自身，不當不存在的 parent；根的 ^1／越界仍拒絕。COMMAND §7.2 L182–189 已定 repo 優先路由、缺 topo-order 拒絕且不 fallback，並定名 git-check。 | MiniGit＋QA，WP5；ACC-13。MINIGIT-02 尚可補明 ^0／~0／根 ^1；MG-O01 L164 的待決標記須同步為已定路由／未實作，這不重開 ^0 衝突。 | **已解（指定規格反例）；未實作待測** |
| INTREV-13／P1 | D19/D20；SOURCE_MAP NAR-C04/C06 L75/L77；CHAPTER_BEATS L21/L27–28/L138、REVEALS L84/L104–115、VOICE L60–65、AUTHOR_RESPONSE §5–6；ENGINE §4.1/4.3、PACK §3.1、COMMAND §7.1、TICKET L44、MERGE L97、BOSS L41/L87、UX-008／ST28–29 與 ACC-22 已同採直接 defer、done/卡分開、tag 不退出、目前 main 旅行及 main 取得 F5。T0100 方案明標提案／O-N07，未當正史。 | 整合＋敘事＋核心＋UX；只關閉這些跨域 gate／旅行混用反例，**不代敘事反方結案、不解除 O-N01–08**。F5 取法、後半卡與結局充分條件仍作者缺口。 | **已解（指定規格反例）；未實作待測** |
| INTREV-17／P1 | D18；REPLAY §5.2 L234–236／REPLAY-024、TICKET §7.3 L331、SEASON §4 L80–81／§5.1 L102–113 一致：同 nonce 一份 proof，語意失敗終結 grant，新解法領新 grant 並扣發單額；可靠重送／系統重試保留原 proof。 | 判題＋重放＋賽季，WP6/7；ACC-15；reservation 釋回不等於配額退款。 | **已解（指定規格反例）；未實作待測** |
| INTREV-18／P1 | D18；REPLAY §6 L254–266／REPLAY-015、TICKET §7.3 L334／JUDGE-022、SEASON §5.2 L119–135 與 ACC-15 同採同 turn／同起始版本聚合、逐項重查、剔除後重算、整批一次 CAS，逐 work receipt 共用 settlementId。 | 重放＋DB＋賽季，WP6/7；同 v7 多工單、取消／失權／期限及原子 ledger 未測；不代表經濟公平性已驗。 | **已解（指定規格反例）；未實作待測** |

### 7.2 未閉合項目的最新定位、反例與局部修正

下表保留原嚴重度。`已處理待重核` 表示已有實際修訂但列出的殘留仍未解除；不是「只等測試」。所有實作另為 `未實作待測`。

| ID／嚴重度／類別 | 最新實讀定位與殘留反例 | 局部修正／影響與 owner | 最新狀態 |
| --- | --- | --- | --- |
| **INTREV-02／P1／規則接縫** | ENGINE §4 L173 的全域 rewardLedger、L188 分支 progress、L202 世界隔離，TICKET §2.3 L77 仍用全 run 工單獎勵鍵；MERGE §2 L24 禁帶貨幣。以允許在 sandbox 解工單的非正史 fixture：分支先解 T→abandon→main 首次真正解 T，根 ledger 已用而 main 從未取得獎勵。未見分支 route 的結獎禁止或獨立 domain。 | 明選「分支不結 main 故事獎」或 branch-local 模擬 ledger；main 四 route 仍共用一次鍵。若某 route 不准在分支執行，登記 guard，不由 UI 隱藏替代。WP1/3/4/10，核心＋判題＋互通；保留 V-INT-02／ACC-09/11/22。 | 初審待修 |
| **INTREV-03／P1／載入協定缺口** | PACK §3 L82–93 要啟動前驗完整閉包、固定 contentSetHash；§6 L195–200 全 bytes 才 activation 且不改原 run refs。UX ST14 L139、S03 L100–106 仍承諾下一章未下載時保留當前進度。Ch0-only run 安裝 Ch1 後仍無合法同 run 內容轉移；若一開始全鎖全下載，則沒有按章延遲載入。 | 在 PACK 明定鎖定目錄與已水合可執行閉包的區別，或註冊相容追加轉移與 lineage／reward 規則；若選全量安裝則同步總綱／UX 承諾。WP1/2/8/9，核心包管線＋整合；V-INT-03，ACC-01/06/07。 | 初審待修 |
| **INTREV-04／P1／上限互斥** | SAVE §7 L231/L237/L248 的完整 stateBlobHash 與必要 pin；§8 L257/L260 仍 baseline 32 MiB、單 blob 8 MiB。9 MiB canonical state 可當 baseline，卻不能成為必要 checkpoint；增加磁碟／匯出不會改格式上限。 | 按 state/journal 類型設有界 profile、分塊，或更早限制可達 state 並預留 pin；須成立「合法目前 state 可建立必需 snapshot」。WP1/10、M4，保存＋核心；V-INT-04／ACC-02/05/24。數值待量測不免除上限關係一致。 | 初審待修 |
| **INTREV-07／P1／已登錄部分契約仍互斥** | ENGINE L69／§3.2 L105–111、TICKET §5.2 L219–238、UI_HANDOFF L120／INTERACTION L115 的四欄 content payload **已一致**，原未註冊說法不再適用。但 ENGINE §4.2 L218–228 選 externalFacts／blobs，L220 排除 runtime.ticketEvidenceState／inode.provenanceRef；SAVE L66/L88/L152/L301 仍要求保存這兩者。ENGINE L222 定 ticket.provenance.recorded，§6.2 L286/L307 的列表及指向仍稱 artifact.provenance。按 ENGINE 產出的合法 state 會被依 SAVE 寫的 reader 要求不存在欄位；compact 後判題權威也可分裂。 | 同步 SAVE 封閉 schema／例子／hash 包含範圍／閉包及 effect 名稱；確認單一 producer、重建索引可丟且不改結果。TICKET L195/L219/L376 的「未登錄」改成實際已登錄與未實作的分層狀態。WP1/3/8，核心＋保存＋判題；ACC-02/09/10，含同 bytes 重寫／append／hardlink／fork／compact。 | 已處理待重核（核心收尾中；payload 接點已對齊） |
| **INTREV-08／P1／wire schema 互斥** | MERGE §3.1–3.3 L43–70、MINIGIT L107 及最新 UI_HANDOFF L215 均為六欄、三欄 sourceRef、四 enum（含 peer-shared）；實讀 ENGINE §8 L339/L346 仍十欄、sourceRef 含 playerId、enum 有 npc-guided。六欄合法 E 若送十欄 validator 會缺欄／enum 不符；補 null／改 enum 再計 H 也不是原 evidenceId。actorId/runId 別名與轉寄保留原 bytes 已處理，不能再說整套完全未設計。 | 依整合裁決統一六欄，NPC／variant 由固定 ruleId、收據／legacy 由註冊 fact blob 承載；核對本地生成、投影、轉寄 A→B→C 及 receiver view，不只改 UI。WP1/3/4/8，核心＋互通＋UX；ACC-03/09/11/12。 | 已處理待重核（已選六欄；核心完成稿待送） |
| **INTREV-09／P1／剩餘操作及註冊缺口** | ENGINE §4.3 L236–244、COMMAND §7.1 已閉合 defer、template-entry、tag、main 旅行及 review 返回調查；ENGINE §3.3 L148–150 亦定 self-sync 候選／CAS。剩 UX ST22 L147／INT-006 L166／L192、S10 L197–200 承諾 **ended 後還原為較早可玩 main 並保留原結局**，目前表只有 review→playing 與隔離 branch.create，無該宿主協定。另 ENGINE §3.4 L156 明列 ReplayAssessment 未註冊；REPLAY L18/L66 與 SEASON §4 L72 泛稱 system.fact 接納，不能解讀成此封閉入口已接受所有評估／賽季 fact。 | 補 ended→新槽／候選 main 的保存操作，明定 saveId、lineage、seq／歷史起點、reward 去重及 root CAS；不得以開 sandbox 代替。M6 ReplayAssessment／M7 season fact 各列 schema、producer、驗證與啟用閘；未註冊與未實作分開。WP1/4/6/7/8/10，核心＋保存＋互通；ACC-05/12/20。 | 已處理待重核（大部分動作已閉合；剩餘非單純未實作） |
| **INTREV-10／P2／輸出語意部分未閉合** | ENGINE §3.4 L154、REPLAY §3.1 L66 已選 OutputRecord 四欄、raw blobHash、獨立證據 blob，非 JournalRecord 新欄位；commandStreams 按 effects 次序亦已定。但 ENGINE §6.2 L309 的 presentation 仍只列字串或 {channel,textRef,args}，未封閉 channel／args 型別與純文字 channel；兩個陣列未定 stdout/stderr、多 command 與 presentation 之間的語意相對次序。兩端可對同一對話用字串／textRef 不同表示，或 renderer 交錯不同而相同 record。 | 定義唯一 canonical semantic message／順序投影，或明定固定呈現排序及哪些不比較；用含兩 command、stdout/stderr 與中間對話的 fixture 核對。assessment 持久接納缺口歸09，不再說 outputDigest 沒有算法／位置。WP1/6/8，核心＋重放；ACC-14／REPLAY-001/021。 | 已處理待重核 |
| **INTREV-14／P2／purpose 起點規則互斥** | REPLAY §4 L91 允許一般離線 snapshot 的有界 coverage，§4.1 L146 卻仍只准 pack genesis／可驗伺服器 checkpoint；SAVE §7 L235/L242 允許內部一致狀態錨點及其後 replay。合法 compact baseline＋完整 tail、無 server 前綴，究竟可驗 tail 還是直接 CHECKPOINT_UNTRUSTED，仍無 purpose 分流。 | compatibility 允許來源未證但 invariant 合法的 baseline，標精確 tail coverage 與 genesisAvailable=false；season 維持授權可信起點。若服務不提供一般 tail 驗證，收斂承諾。WP1/6，保存＋重放；ACC-05/14。 | 初審待修 |
| **INTREV-15／P1／可派工責任缺口** | WORK_PACKAGES §2 L26 的 WP1 實際交付仍只有 reader/writer、legacy、分支／VFS 向量、恢復 UI；WP10 L35 是遭遇／重試。ENGINE §11 L391–393 的共用 reducer、Input/effect registry、scheduler／PRNG／cancel 基礎仍未具名掛入 M1 工作包。ACC-08/10/14/15 雖已補反例，不代替 producer 的交付 owner。 | 在既有 WP1 增明確核心子包、M1 出口及對 WP3/10/6 的依賴；不必另建一批規格。整合＋核心＋QA；沿 ACC-02/05/08/09/14/22/24 指派固定向量。 | 初審待修 |
| **INTREV-16／P1／同單位不同原點** | 舊秒制已修；REPLAY §5.0 L171 定 epochMs−seasonStartEpochMs=seasonTimeMs，SEASON §2 L33 卻定 seasonTimeMs 為 UTC epoch ms，§4 L72 的 *At 亦 epoch。兩端相差整個 seasonStart，turn／日界／維護窗比較不一致。REPLAY L171／REPLAY-025 L349 只收無小數 Z 字串，SEASON L42 允許無損 ISO 毫秒 adapter，接受子集也需收斂。 | 明定 seasonTimeMs 是 epoch 或 elapsed，另一概念改具名欄位，所有 turn/deadline/日界用相同轉換；明列 ISO 接受文法，拒絕截毫秒而非默默取整。WP6/7，重放＋賽季；見 V-INT-16，ACC-15/16。 | 已處理待重核（單位已修；原點衝突仍在） |

### 7.3 新增 INTREV-19／P1：volatile 可續玩卻無合法終章出口

- **精確定位**：SAVE §6.1 L217–220 允許 storage unavailable／file:// fallback 後明選 memory＋匯出；ENGINE §4.3 L242/L246、ENG-016 L385 要 ending prepare 的快照與新世界同次 durable 保存。INTERACTION ST21 L146、UI_HANDOFF S10 L200／UI-COPY-028 L275、PLAYER_EXPERIENCE UX-007 L155 明拒 volatile 快照，下載也不解除。這些終章規定彼此一致，衝突在它們與合法 fallback 的端到端承諾。
- **矛盾反例**：以已核定 ending policy 的非正史技術 fixture 排除正文缺口。IDB 持續 SecurityError，但記憶體、hash、檔案匯出皆可用；玩家明選 volatile，合法完成全部故事條件。最後 ending prepare 永遠過不了 durable guard。匯出、返回調查、重試都不能在同一支援模式完成主線；移到另一可用宿主不是現有 fallback 的完成協定。
- **局部修正**：由整合者／保存 owner 明選支援政策。若 memory fallback 支援完整主線，定義完整候選與 pinned snapshot 的 memory 原子提交／匯出閉包、保留原結局與回訪操作，並如實標未持久保存；若最後選擇確須 durable，必須在選 fallback 前揭露終章限制及可實行的轉持久化／移交流程，不繼續承諾本模式可走完整主線。不要把「送出下載」改名為 durable 成功。
- **影響／owner**：1.0 file://／儲存停用玩家、M4/M5 終章；WP1/8/9/11，整合＋核心／保存＋UX＋內容 QA。加到 ACC-20/24 與 UX-007，不能只測暫時 quota 後重試成功。
- **狀態**：**初審待修；未實作待測**。這是規劃可達性反例；不宣稱已在真瀏覽器重現，也不以作者未給結局正文掩蓋 adapter 守衛問題。

### 7.4 第二輪新增紙上向量（未執行）

**V-INT-16：ms 相同不代表時鐘相同。**

1. 非正史數值 fixture：seasonStartEpochMs=1800000000000，nowEpochMs=1800000060000，turnDurationMs=60000。
2. REPLAY §5.0 得 seasonTimeMs=60000；SEASON §2 得 seasonTimeMs=1800000060000。兩值都是合法安全整數毫秒，單位檢查抓不到原點差異。
3. 用同一跨服務 fact 推導 turn／日界／維護窗；必須得到同一結果，並明示期限使用 epoch 還是 elapsed。不能由接收端猜「數值很大應該是 epoch」。
4. ISO adapter 另驗 `.001Z` 的接受／拒絕政策；若只允許無小數秒，精確毫秒就改用整數 epochMs，不截成整秒後重簽。

**V-INT-19：持續 storage unavailable 的終章路徑。**

1. 使用完整、合法但非正史的終章 fixture，排除未知結局正文及 INTREV-04 大小上限；hash／Worker／匯出可用，IDB 從入場起持續拒絕。
2. 玩家明選 volatile，進度只經 memory adapter 原子提交，完成既定條件；畫面始終如實標未保存至本機。
3. 到 ending prepare，依目前 ENGINE／UX 被 durable guard 拒絕；下載備份亦不解除。記錄這是規格推導，不是已測的 SecurityError。
4. **必須裁定**：選定的支援模式要有符合其事前承諾的終章／復原出口；若限制此模式，限制及可行移交須在入場／切換前可知。另驗 durable 恢復後的候選轉存／CAS，不把重試當重新發獎或第二次結局。

### 7.5 覆蓋、已接受的進展與交付邊界

- **UX 五檔**已全文重讀；D17 的候選／commit／播報、D19 的邀請／defer／done／tag、D20 的旅行／還原／F5 主線取件有一致表述。editor 與 EvidenceCard 的最新修訂已實讀，不再把兩處舊 UX 引用列待改；EvidenceRecord 核心接點仍為08，volatile 終章為19。
- **敘事六檔與反方 R3**：第二輪全文閱讀後，整合者依 R-L01–07 局部修訂並送同反方有限重核。先前回報的 R2＝3 已解／7 部分／3 待作者已被 **[NARRATIVE_DEBATE](NARRATIVE_DEBATE.md) §9 的 R3 取代：R-L01–07 全部關閉，N13 規劃已解；現行4已解／6部分／3待作者**。本審查已實讀該節 L400–457，正確引用其裁定，未重複六檔全文審查或代為再簽核；敘事數量不混入 INTREV 計數。另續讀 AUTHOR_RESPONSE L170–237，確認 L203 的互斥投票補註獨立於主筆原回答，與 SAVE §5.2 一致。O-N01–08 及相應內容發布阻塞全部保留，不再把七項 R-L 局部修稿當待修。
- **D06 引用小缺口已收斂**：最新 DECISIONS L24 已明訂不自動追溯補發提示費補償幣，AUTHOR_RESPONSE L175 保留後續整合補註；不再列為缺權威決策，也不當作已執行帳務。
- **命令／MiniGit**已核到唯一路由、DAG 缺 topo-order 拒絕不 fallback、git-check 與 typed-only lowering；未取得 reference image/binary digest，未做真 Git／GNU 對照。MG-O01 待決標記只是需要同步的文檔狀態，不代表路由完全沒設計。
- **交付矩陣**已實讀 ACC-08/10/14/15 新增反例與 WP6 的 state/effects/OutputRecord 交付。整合者另回報 ROADMAP／總綱 M6 已同步 output 比對，該輪改文未再全文重核；這不影響 INTREV-15 的 WP1 核心交付責任缺口。
- **歷史測試與結構檢查**：UX E11 已區分前次390/390與後續391/391，整合者回報 SOURCE_GUIDE／BASH_TERMINAL 可查391/391；本審查未獨立重跑或認證歷史報告。整合者回報的第二輪35 Markdown／429 links／8 anchors／14 JSON／0錯亦為他方執行紀錄，並非本審查的新測試結果，更不能代替本節語意接點。
- **未測**維持 §6：沒有執行遊戲、模擬、schema/hash conformance、文件驗證腳本、效能、瀏覽器、真人或無障礙驗收。所有新增向量均為待執行設計；registry 登記不等於 producer、validator、持久化或 UI 已實作。
- **收尾判定**：本輪已完成可用稿的跨域重核並保存結果；仍不授整包凍結／施工或發布通過。下一次收到核心完成稿後只重核07/08的 schema／持久閉包及09/10的剩餘契約，其他未解項依其 owner 的實際修訂擴大，避免重複已解反例。O-N01–08、F5具體取法及後半結局充分條件維持作者缺口。

## 8. 核心完成稿的現行判定（0.4；本輪完整交付）

已收到全包主筆結束通知，並實讀核心四檔與本輪局部引用同步。以下取代 §7 的「核心仍收尾」及各項最新狀態；§7 的行號、殘留與收尾語句只保留作歷史，不再要求已修內容重修。此次沒有因「producer 都未實作」否定文件交付。

**計數：20 項＝10 已解＋3 已處理待重核＋7 初審待修。** 已解為01／05／06／07／08／11／12／13／17／18；已處理待重核為09／10／16；初審待修為02／03／04／14／15／19／20。全部實作驗收仍為 `未實作待測`。O-N01–08 的 `作者缺口` 與 §8.4 的具名子 schema 關卡不混入這個計數。

### 8.1 已解項：關閉的精確範圍

| ID／原嚴重度 | 完成稿證據與本次判定 | 影響／owner／保留驗收 | 狀態 |
| --- | --- | --- | --- |
| INTREV-01／P0 | ENGINE §3 L56/L73、COMMAND §7.1 L167 與 SAVE §7 L234/L238 仍以完整 checkpoint stateHash／stateBlobHash 綁不可變資料；不再從未宣告的可變 history 決定同一 input 的結果。 | 核心＋保存＋重放，WP1/2/6；V-INT-01、ACC-02/05/14/22。 | 已解；未實作待測 |
| INTREV-05／P0 | ENGINE §6.2 L282／§6.3 L317、SAVE §6.1 L218–223、INTERACTION ST12 L137 一致：durable abort 保留舊世界，明選才 memory commit。原「先報成功再保存」衝突已解；19另論終章出口。 | 核心＋UX，WP1/8/11；ACC-04/24、故障／取消／播報。 | 已解；未實作待測 |
| INTREV-06／P1 | 延續 §7.1 的 D17 跨檔判定；完成稿 ENGINE §5 L263 仍為准入→固定成本→排程→重查→行動。本次未重做 Boss 全文審查。 | 核心＋關卡，WP1/10；ACC-08/22，同 tick ln／GC、TERM／flush。 | 已解；未實作待測 |
| **INTREV-07／P1** | ENGINE §3.2 L105–111／§4.2 L218–228／§6.2 L286/L307、SAVE §3.1 L66/L88／§4.2 L153/L155／§7.1 L259–262/L274、TICKET §4.4 L191–195／§5.2 L219–238、PACK §4.4 L163–165、COMMAND L155/L160/L214 已同採四欄 inline content、externalFacts／blobs、ticket.provenance.recorded。SAVE 明確排除 inode.provenanceRef／runtime.ticketEvidenceState 作第二權威，compact 保留 trace parents／必要 artifact，快取可丟重建。原入口缺失及保存／effect 互斥已消除。 | 核心＋保存＋判題，WP1/3/8；ACC-02/09/10、ENG-011/012、SAVE-014。TRACE／EVIDENCE 精確子 schema 仍須按 §8.4 解除，不能稱 counting 功能已通過。 | **已解（原契約反例）；未實作待測** |
| **INTREV-08／P1** | ENGINE §8 L339/L346、SAVE §4.2 L143/L153、MERGE §3 L36–70／§5.2 L168–176、MINIGIT §6 L109 均固定六欄／三欄 sourceRef／四 enum；npc-guided 是 simulated＋ruleId 視圖。actorId/runId 映射固定，轉寄不改 bytes／ID，來源／附件另沿 import fact 閉包。TICKET §2.2 L66–73 保存四欄 ProgressRecord 與多筆 bundle refs；SAVE §5.2 L180 不把舊 task 偽造成新版 shell 成功。最新 UX 接點已於前輪核齊，無需回修舊十欄引用。 | 核心＋互通＋UX，WP1/3/4/8；ACC-03/09/11/12、ENG-018、SAVE-016。SHARE／EVIDENCE 未定子項仍是能力啟用關卡。 | **已解（原契約反例）；未實作待測** |
| INTREV-11／P2 | 延續 §7.1 的 decisionTimeMs＜resultDeadline 裁定；本輪引用同步沒有改該政策，不重跑期限審查。時鐘原點16仍獨立未解。 | 重放＋OJ＋賽季，WP6/7；ACC-15/16。 | 已解；未實作待測 |
| INTREV-12／P2 | MINIGIT L54–56 的 ^0 自身規則仍一致；§2 L31、§5 L86、MG-O01 L166 已同步 COMMAND §7.2 的唯一路由及 git-check。撤下 §7.1／§7.5 的「MG-O01待決標記仍需同步」要求。 | MiniGit＋QA，WP5；ACC-13；^0／~0／根^1及路由負例未測，DOMAIN／reference digest關卡保留。 | 已解；未實作待測 |
| INTREV-13／P1 | 延續 §7.1／§7.5 的 D19/D20 與敘事 R3 邊界。完成稿 ENGINE §4.3、PACK §3.1、COMMAND §7.1 仍分清 defer／done／卡、tag不退出、main旅行／B3b／F5取件。 | 整合＋敘事＋核心，WP3/4/8/9/10；ACC-19/20/22；不解除 O-N01–08，不重複敘事全文審查。 | 已解；未實作待測 |
| INTREV-17／P1 | 延續 §7.1 的一 challenge／nonce 一 proof；本次不因 wire 引用同步重開已核定 D18。 | 判題＋重放＋賽季，WP6/7；ACC-15，語意失敗須新grant並扣額未測。 | 已解；未實作待測 |
| INTREV-18／P1 | 延續 §7.1 的同 turn／同起始 resourceVersion 聚合、逐項重查、整批一次 CAS；本次未重做帳本／模擬審查。 | 重放＋DB＋賽季，WP6/7；ACC-15，逐work收據／共用settlementId及取消競態未測。 | 已解；未實作待測 |

### 8.2 既有未解項：完成稿仍需局部修復的內容

`已處理待重核` 的三項均列出實際未閉合內容，不是只等執行測試。定位均相對 `planning/fullgame/`；以下是文件推導反例，未聲稱已在程式重現。

| ID／嚴重度／類別 | 最新精確定位與反例 | 最小修正與解除證據 | 影響／owner／狀態 |
| --- | --- | --- | --- |
| **INTREV-02／P1／獎勵域未定** | ENGINE §4 L173/L188/L202、§6.2 L302；TICKET §2.3 L77；MERGE §7 L242。reward.granted 雖已有 recipientBranchId，root ledger 仍採全 run key，沒有 branch-local ledger 或分支不結故事獎的守衛。sandbox先解T→abandon→main第一次解T，main可因已消耗的key拿不到從未實得的獎勵。 | 明選分支不結main故事獎或branch-local模擬額度；若分支禁此route，寫入正式guard。main四route維持一次性政策。用V-INT-02核首次main領獎、main已領後回更早點、compact再返回，不能只把key加branchId卻讓餘額帶回。 | WP1/3/4/10，核心＋判題＋互通；ACC-09/11/22；**初審待修**。 |
| **INTREV-03／P1／同run續章協定缺失** | 總綱§3 L90明列正式版章節延遲載入；PACK §3 L82–93要求完整closure才啟動，§6 L212–217完整下載後activation仍不改run refs；INTERACTION ST14–15 L139–140保留缺下一章／重試承諾。Ch0-only→裝Ch1沒有同run合法轉移；起初鎖全章且下載全部又不符合延遲載入。 | 在PACK區分鎖定內容目錄與已水合執行閉包，或明訂相容追加轉移及lineage/reward/history保留。若選全量安裝則同步總綱／UX承諾。V-INT-03驗精確Ch1加入、取消／壞hash／quota保留Ch0，不用遷移新lineage冒充正常續章。 | WP1/2/8/9，包管線＋整合；ACC-01/06/07；**初審待修**。 |
| **INTREV-04／P1／必要snapshot上限不閉合** | SAVE §7 L234/L240/L249/L251與§8 L283/L286：baseline≤32MiB，完整checkpoint是一顆≤8MiB blob。9MiB canonical state可合法當baseline，必要fork／終章pin卻永久超限。§8 L293已誠實限制self-sync原件，不解決必要snapshot，兩者不可混稱同一修復。 | 統一state／journal的有界blob profile、分塊格式，或在更早state admission確保可snapshot並預留必要pin容量。V-INT-04驗最大合法狀態；一般quota救援不能解格式上限。 | WP1/10、M4，保存＋核心；ACC-02/05/24；**初審待修**。 |
| **INTREV-09／P1／剩餘操作與M7入口** | ENGINE §3.3 L148–150的self-sync與§4.3 L236–246的defer／template／tag／旅行／review返回已定。仍缺 INTERACTION ST22 L147、INT-006 L166、L192及UI_HANDOFF S10 L197–200所承諾的 **ended後保留原結局、另開較早可玩main**：目前只有review→playing或隔離branch。另SEASON §4 L72要將賽季結果交system.fact，但ENGINE L77/L132–142只開MergeResolutionFact，§8.1亦未單列賽季結果fact。 | SAVE／ENGINE補宿主回訪協定：來源checkpoint、候選saveId／lineage／seq／歷史起點、reward去重、原結局保全與CAS；不以sandbox代替。M7則明選純服務讀模型不進EngineState，或列具名未註冊schema關卡、owner、驗證／冪等／閉包與啟用限制，無須本輪實作。**ReplayAssessment已由REPLAY L68／ENGINE L156明列M6拒絕入口及解除條件，撤下其「未管理入口」疑慮**；REPLAY L18泛稱已登錄的敘述應讀作受此限制，不當實際開放。 | WP1/4/6/7/8/10，保存＋核心＋互通；ACC-05/12/20；**已處理待重核**，殘留為宿主協定及M7邊界。 |
| **INTREV-10／P2／比較順序範圍未定** | ENGINE §3.4 L154／§6.2 L309、SAVE L149/L266、REPLAY §3.1 L60/L64/L66。四欄OutputRecord、raw hash、streams陣列、presentation的channel與args型別均已定，撤下舊「channel未封閉／無digest格式」說法。殘留：兩陣列與各stdout/stderr摘要不編碼跨組交錯順序；相同A/B串流及對話D，可以呈現A→D→B或B→A→D而同digest，REPLAY卻泛稱比較channel／順序／實際語意串流。 | 明訂固定語意拼接順序，或明示只比各stream bytes及各陣列內序、排除跨stream／presentation合流順序；若要比較總序，再定有界投影。不是要求記錄瀏覽器讀屏排程，也不再以字串／textRef雙型別本身判錯。補兩command＋stdout/stderr＋對話fixture，oracle邊界須與REPLAY文字一致。 | WP1/6/8，核心＋重放；ACC-14／REPLAY-001/021；**已處理待重核**。 |
| **INTREV-14／P2／compatibility起點互斥** | REPLAY §4 L93稱一般離線snapshot可有界coverage；§4.1 L148仍要求genesis／可信server checkpoint及起點可追；SAVE §7 L238/L245/L249允許無前綴狀態錨點與tail。compact baseline＋完整tail但無server來源，程序仍可能直接拒絕而無法交承諾的tail報告。 | 按purpose分開：compatibility可驗合法但來源未證的baseline之後，標from/to／genesisAvailable=false；season仍要求grant可信起點。若服務刻意不提供一般tail檢查則收斂宣稱。補未簽snapshot＋完整tail正例及同資料不能授season的負例。 | WP1/6，保存＋重放；ACC-05/14；**初審待修**。 |
| **INTREV-15／P1／M1基礎交付未具名** | WORK_PACKAGES §2 L26/L35、前置小包表L41–53，對照ENGINE §11 L408–410及ACC-08 L33的M1要求。新表已把TRACE/EVIDENCE、SHARE、DOMAIN、PACK DSL、ASSESSMENT精確派到WP3/4/5/10/2/6，這一進展接受；但WP1交付仍只列reader/writer等，尚未具名交付共用純reducer、Input/effect registry、時鐘／PRNG／scheduler／cancel與command lowering。領域schema小包完成仍可能沒有共用執行基礎可接。 | 在既有WP1加核心子包或明確指派既有包，列M1交付、依賴及固定向量；WP10提供領域遭遇／事件而非被默認負責全部共用引擎。解除只需派工文字閉合，不要求現在寫producer。 | M1、WP1/2/3/6/10，整合＋核心；ACC-02/05/08/09/14/22/24；**初審待修（已接受子schema派工，原基礎交付缺口仍在）**。 |
| **INTREV-16／P1／時間原點互斥** | REPLAY §5.0 L173以epochMs−seasonStartEpochMs得到seasonTimeMs；SEASON §2 L33仍定該欄為UTC epoch ms，§4 L72的*At亦epoch。V-INT-16仍得到60000與1800000060000兩個不同值；單位同ms不能解除。 | 明選seasonTimeMs為epoch或elapsed，另一概念另命名；turn／期限／日界及TICKET §7.3 L326轉換一起核對。ISO wire可合法比UI adapter子集更窄，**此差異不單獨算互斥**；須標清範圍且不截掉毫秒。以固定start/now及恰等期限核對跨服務值。 | WP6/7，重放＋賽季＋判題；ACC-15/16、V-INT-16；**已處理待重核**。 |
| **INTREV-19／P1／volatile終章無出口** | SAVE §6.1 L220–223允許持續storage unavailable後明選memory＋匯出；ENGINE §4.3 L242/L246、ENG-016 L399、SAVE §7 L240與UX ST21 L146／S10 L200／UI-COPY-028 L275只接受durable pin。完整合法終章fixture在無IDB宿主永久不能最後選擇。整合者本輪已確認風險，未提供裁決，故不因UX與ENGINE一致就關閉。 | 若fallback支援完整主線，定義memory原子保存完整候選與pin、可匯出閉包及回訪，持續如實標volatile；若不支援，切換前明示終章限制並提供可實行的轉持久化／移交協定。下載不是durable證據。V-INT-19與09的原結局保留一併核，但不互相代解。 | WP1/8/9/11、M4/M5，整合＋保存＋UX；ACC-20/24；**初審待修**。 |

### 8.3 新增 INTREV-20／P1：`$?` 的必要持久狀態沒有落點

- **精確定位／類別**：COMMAND §3.2 L66宣告支援`$?`，L68–77規定pipeline末站rc、`;`同交易、多行不同交易；ENGINE §4 L160–196的封閉EngineState／BranchState／runtime沒有上一個shell退出碼。ENGINE §6.2 L288只把rc存於command.completed，SAVE §4.2 L155明排journal／scrollback／快取於stateHash外，§7 L246/L249允許head baseline／compact。這是**尚未登錄的必要規則狀態及生命週期**，不是發現既有程式丟欄位；ENG-SUB-DOMAIN目前的Boss／MiniGit／scheduler範圍也未涵蓋它。
- **反例 V-INT-20（紙上，未執行）**：用無故事觸發器的非正史fixture，普通檔`/work/source.txt`含`hit\n`。提交`grep -q absent /work/source.txt`，正常rc1可commit。A直接執行下一筆`echo $? > /work/status.txt`；B先compact成完整head baseline、空tail，再在新宿主還原同一state並送同一筆輸入。若上一退出碼只留在shell物件／scrollback／被裁掉的effect，A應寫`1\n`，B卻無資料可恢復；預設0會得到另一個VFS與stateHash。改從envelope history找rc又違反同一state/input的純規則輸入邊界。SAVE不保證保留該舊journal。
- **局部修正**：由ENGINE／COMMAND選定branch-local的有界shell status欄位或等價、明示的權威輸入；建議保存在runtime並納入stateHash／snapshot。定義genesis／legacy初始化、成功提交的普通rc、pipeline／`;`逐步更新、typed非shell操作與query是否保留、cancel／核心錯誤回滾，以及fork／leave／restore的隔離。若本profile只支援單腳本內`$?`，須明訂每筆初始化與和Bash的偏差，不得默認宣稱跨命令支援。
- **影響／owner／解除條件**：M1的ra-shell/1、WP1/2/6/8，核心＋命令＋保存；ACC-02/05/14/17，追加CMD-002/005與跨宿主向量。固定來源後比對直接續玩與compact/reload的`status.txt`bytes、state/effects/output；另驗`grep ...; echo $?`、pipeline末站、cancel、query不改狀態及分支隔離。原始fixture／實際expected hashes由實作包產生，本審查未偽造黃金向量。
- **狀態**：**初審待修；未實作待測**。相關shell切片實作前須閉合，文件審查可先交付此具體修復項。

### 8.4 已接受管理方式、但尚未解除的實作前關卡

下表是已有owner、範圍及解除條件的後續規格工作，**不再重報成「核心完全沒登錄」或新增一批INTREV**。子schema未完與producer未實作是兩層：先交精確規格／負向fixture，再實作／驗收；只有外層已定不代表typed資料全可執行。

| 關卡／權威定位 | 已固定與仍缺的邊界 | owner／解除證據／狀態 |
| --- | --- | --- |
| ENG-SUB-TICKET-TRACE／EVIDENCE：ENGINE §8.1 L352–353；TICKET L195；WP L47 | inline編輯入口、trace／bundle外層、facts／effects及SAVE §7.1閉包已定；op.params／bounds、非生成來源、scope／legacy／receipt判別式仍缺。 | WP3＋核心；精確schema、null規則、跨writer／compact正負fixture。**已處理待重核（子schema待補）；實作未實作待測**。07／08關閉不解除這些能力閘。 |
| ENG-SUB-MERGE-SHARE：ENGINE L354；MERGE L174；WP L48 | 六欄staging與KnowledgeImportFact／雙原件self-sync限制已定；notes／footprints／receipts的精確子項及簽章envelope未定。朋友來源摘要可缺私人VFS，執行必要閉包不可缺。 | WP4；與示例一致的必填／可選／bounds及驗證材料規則、轉寄不變向量。**已處理待重核（子schema待補）；實作未實作待測**。 |
| ENG-SUB-DOMAIN：ENGINE L355；MINIGIT L107；WP L49 | runtime位置、命令路由及predicateChecked六欄已定；Boss／MiniGit data、minigit.changed、report與scheduler事件封閉schema仍缺。 | WP5/10＋核心；round-trip、未知子版本、取消及合法空值fixture。**已處理待重核（子schema待補）；實作未實作待測**。不替代20的shell status。 |
| PACK-SUB-RULE／CONTENT／INTEROP：PACK §4.4 L170–174；WP L50 | manifest及D19/D20操作語意已定；selector／guard AST／reducer列表／entry細節、compiled內容、textRef參數、generator schema須先補。 | WP2及各領域；建置／載入雙重validator，未知guard不作true、未知capability不啟用。**已處理待重核（子schema待補）；實作未實作待測**。正文另為作者缺口。 |
| ENG-M6-REPLAY-ASSESSMENT：ENGINE L156/L356；REPLAY L68；SAVE L267；WP L51 | OutputRecord外層／digest已定；assessment wire、factId、逐seq引用、coverage／receipt／issuer綁定未定，system.fact明確拒絕。 | WP6；先同步三檔schema／閉包／冪等及驗證，再啟用持久M6評估。**已處理待重核（schema待補）；實作未實作待測**。本地reader assessment不冒稱server-replayed。 |

runtime可行性、GNU/Git reference digest、file://與資源上限spike及真人研究，繼續按原工作包保留`未實作待測`；沒有用registry登記、自檢或文件結構通過替代這些證據。O-N01–08、F5正文取法、後半卡片與完整結局充分條件仍為`作者缺口`；敘事現行仍引用R3的4已解／6部分／3待作者，不混入INTREV數量。

### 8.5 交付、修復順序與有限重核邊界

1. **先修共享規則**：02獎勵domain、03同run續章、04必要snapshot形狀、20 shell status；同步唯一authority與引用方。19由整合者選fallback支援政策，與09結局後回訪協定一起閉合。這些有具體反例，不靠「尚未實作」移除。
2. **其餘局部收斂**：10定輸出比較順序範圍、14分purpose起點、16統一epoch／elapsed；15補M1核心具名交付。09的M7入口可先列明未註冊關卡／停用邊界，不要求現在交付完整M7。
3. **ACC最小補強**：既有ACC-08/10/14/15已有重要案例；仍應把V-INT-02/03/04/16/19/20及09的ended→新可玩main、10的跨channel順序範圍、14的未簽baseline tail明確掛回對應ACC。這是待加入／執行的測試設計，不稱已跑；15以派工表／依賴核對解除即可。
4. **實際閱讀與未測**：本次範圍詳§6的0.4條目；未重做敘事全文或擴充玩法全文審查。沒有執行遊戲、schema/hash conformance、文件連結檢查腳本、GNU/Git對照、模擬、效能、瀏覽器、真人或無障礙測試。§7.5所引391/391及35 Markdown／429 links／8 anchors／14 JSON／0錯均為他方歷史紀錄，本檔修改後不沿用為最終結構檢查結果。
5. **本輪完成**：只以patch更新本檔，保留原INTREV ID與歷史反例；審查結果現在交付整合者修復。收到精確修訂定位後，僅核對相應authority、引用方及ACC；沒有新變更或未解反例就不重開已解項，不要求再送新全包或再派代理。

## 9. 十項修訂的現行判定（0.5；有限重核交付）

依整合者提供的D21–D25及修訂定位，只重核INTREV-02／03／04／09／10／14／15／16／19／20，並納入其補充的跨lineage writer順序與64 KiB預留核對。以下取代§8的現行狀態，§8全文及更早反例保留歷史；沒有新增INTREV，也沒有重開07／08原入口及wire衝突。

**計數：20項＝18已解＋2已處理待重核＋0初審待修。**

- 本次關閉：**02／03／10／14／15／16／19／20**，精確範圍見§9.1。
- 本次仍有規格殘留：**04／09**，均為`已處理待重核`；不是只等待測試，也不是原修訂完全未生效，詳§9.2–9.3。
- 沿用先前已解：01／05／06／07／08／11／12／13／17／18；本輪沒有重新認證這十項全文。
- 所有實作／平台／真人驗收仍`未實作待測`。§8.4的具名子schema關卡與作者缺口另列，不混入上述計數。

### 9.1 本次八項已解：原反例與精確關閉範圍

定位相對`planning/fullgame/`；表內為文件規則推導，並非已執行fixture。

| ID／原嚴重度 | 實讀證據與原反例回應 | 關閉範圍／owner／保留驗收 |
| --- | --- | --- |
| **INTREV-02／P1** | D21；ENGINE §4 L175/L202、§6.2 L312；TICKET §2.3 L77、MERGE §7 L242、BOSS §3 L58；SAVE §7.2 L284。sandbox判題仍可成功，但不發故事幣／reward.granted、不寫root ledger。main用`C(["story-ticket",ticketId,storyRewardPolicyVersion])`，不含branch／lineage；fork／leave不回滾ledger，reopen採E完整已領集合、餘額仍P且預覽不補發差額。故sandbox先解→abandon→main首解不再被吞獎，main已領→較早點也不因新lineage重領。 | **已解：分支獎勵域及回訪去重規則。** 核心＋判題＋互通，WP1/3/4/10；ACC-09/11/22、V-INT-02（ACC §2.1 L58）。09的writer殘留不重開獎勵鍵；離線ledger不是競技防偽。 |
| **INTREV-03／P1** | D22；PACK §3 L82/L89–91、§3.2 L124–130、§6 L222–227；ENGINE L171；總綱§3 L90；INTERACTION ST14 L139。genesis鎖全預定manifests，可只水合Ch0及共同依賴；route目標是唯一deferred引用，guard／成本／scheduler等仍eager。裝已鎖Ch1只改installed generation，stateHash／seq／lineage／ledger不變，之後`ssh`才正常轉移。背景下載不擴活動規則。 | **已解：同run按章下載續章。** 包管線＋核心＋UX，WP1/2/8/9；ACC-01/06/07、V-INT-03（L59）。未鎖的新章須明示遷移；Ch0可離線不等於完整主線已離線，取消／壞hash／quota及過期state不先旅行。 |
| **INTREV-10／P2** | D24；ENGINE §3.4 L154–156；REPLAY §3.1 L60/L64/L66；ACC §2.1 L62。明選逐stream完整bytes／rc、commandStreams內序與presentation內序；不比較跨stdout/stderr chunk或stream／presentation合流總序。原A/B/D可同digest但展示交錯不同的例子，現在明確在排除範圍，沒有再聲稱總序已驗。 | **已解：OutputRecord比較邊界。** 核心＋重放＋UX，WP1/6/8；ACC-14。改bytes／rc／任一陣列內序仍須拒；renderer oracle與M6 assessment關卡保留。 |
| **INTREV-14／P2** | D25；REPLAY §4 L93、§4.1 L148；SAVE §7 L239/L245–250；ACC §2.1 L63。compatibility可驗未簽但schema／invariants／hash／closure合法的baseline＋連續tail，回partial-compatible、精確coverage及genesisAvailable=false；fromSeq是錨點，實際從其後一筆執行。同資料作season-challenge須CHECKPOINT_UNTRUSTED，仍需grant綁定可信起點。 | **已解：一般tail檢查與競技授權的起點互斥。** 保存＋重放，WP1/6；ACC-05/14/15。未簽來源仍local-unverified，不補造被裁前綴可達性。 |
| **INTREV-15／P1** | WP總表L26、WP1-A/B/C L41–49；ROADMAP M1 L33；總綱L208/L293；ACC L68。A具名純reducer／registry，B具名時鐘／PRNG／scheduler／cancel／lowering，C具名coordinator／保存／pin／reopen；依賴、固定向量與領域包接點皆已列。WP10不再被默認承包共用scheduler。 | **已解：M1共用核心交付與依賴缺口。** 整合＋核心＋保存，WP1-A/B/C；ACC-02/03/05/08/14/17/22/24。文件派工閉合即足以解除此項，未聲稱producer已實作；領域子schema仍按WP L53–61先行。 |
| **INTREV-16／P1** | D25；REPLAY §5.0 L171–175、SEASON §2 L33–34／§4 L73–75、TICKET賽季adapter段L326；ACC L64。seasonTimeMs統一UTC epoch，seasonElapsedMs才減季始。固定start=1800000000000／now=1800000060000得到epoch=1800000060000、elapsed=60000、turnId=1；期限兩側epoch，UTC曆日／02:00與季內週序分開。 | **已解：時間原點互斥。** 重放＋賽季＋判題，WP6/7；ACC-15/16、V-INT-16。ISO wire子集與UI無損顯示分清，需毫秒時傳整數；恰等期限拒絕、UTC邊界尚未執行。 |
| **INTREV-19／P1** | D23；SAVE §6.1 L220–224／§7 L241；ENGINE §4.3 L248/L252/L256、ENG-016 L409；INTERACTION ST21–22 L146–147、UI_HANDOFF S10 L200／UI-COPY-028 L275、PLAYER_EXPERIENCE UX-007 L155。明選volatile後以完整不可變memory generation、revision CAS及一次換root提交pin＋review／ended，和durable使用相同closure與容量限制；UX不再要求durable-only。 | **已解：無IDB時被儲存模式永久擋在最後選擇的原反例。** 保存＋核心＋UX，WP1/8/11；ACC-20/24、V-INT-19（L65）。下載不升durable，缺pin仍拒；完整「ended→另開main」向量仍受09殘留及04容量補註約束，這裡不宣稱整條E2E已通過。 |
| **INTREV-20／P1** | D24；ENGINE §4 L198–200、COMMAND §3.2 L79；SAVE §4.2 L140/L155及§7.2 L282；ACC L66。branch-local shellStatus是0..255持久欄，入stateHash／snapshot／compact；genesis／legacy／template初始化0、checkpoint複製。管線啟動值／末站rc、`;`／短路、空白／comment、typed／query、parse2／unknown127、取消／abort及leave均有生命週期。 | **已解：跨命令`$?`缺權威狀態。** 核心＋命令＋保存，WP1/2/6/8；ACC-02/05/14/17、V-INT-20。grep rc1後直接或compact／換宿主再echo，規則皆應寫`1`＋LF，不依被裁journal猜值；尚未產生或執行黃金向量。 |

### 9.2 INTREV-04／P1：可快照形狀已修，最終預留計量須最小補註

**狀態：已處理待重核。** 不再保留「9 MiB仍可合法當baseline」或「只到終章才檢查pin」的舊判定；殘留限於SAVE §8 L310最後選擇的未知policy預算如何覆蓋各獨立限額。

已接受的修復：

1. SAVE §8 L298/L303/L308將每個state、單record及每個segment各限8 MiB；9 MiB state在genesis／import／變更准入即拒。segment按完整record切分，單record過大不能靠分段偷渡。
2. L310已要求每個playing候選S（含import／reopen）先做非遞迴演算：固定prepare產R、C(S)、checkpoint及prepare journal，以實際canonical、base64、引用去重及計數核對8／32／64 MiB、checkpoint／record／JSON預算；既有pin不可刪。這比單純「尚有8 MiB空間」完整，也不把實體IDB quota保證混進格式不變量。
3. ENGINE §4.3 L256封住review期間其他世界Input，prepare不能掛任意副作用；返回playing後重新准入，反覆tag／fork／prepare也重算。**已核定policy亦受同一64 KiB總新增canonical上限**，不是只有未知policy受限；此點現文已成立，沒有「已知policy可無上限」的跨檔互斥。

**真正殘留：64 KiB是一個byte上界，尚未明定最終交易的計數／封裝增量如何一併預留。** L310對S→R＋prepare明列全部維度，但接著只以「各選項取最大／未知policy先用64 KiB」描述R→ended；沒有固定未知policy的record／JSON values增量界，也未明示「最大」是逐維上界、與已核定policy沿同一計量。ENGINE的64 KiB硬上限本身不能代替這些獨立限額。

- **邊界反例（紙上）**：若容量演算已容納C(S)與prepare，使R的bytes仍有64 KiB餘裕，但保留record計數沒有下一筆餘額，只替未知policy扣64 KiB的實作仍可能放行S；最後選擇即使新增很少bytes，也須一筆journal，屆時才因record上限拒絕。JSON values接近上限同理。這是現文對最後一步預留仍有兩種解讀，不是宣稱既有程式已重現；commit時重驗能防半寫，卻不能代替playing准入時保留必需的最後一步。
- **最小補註**：在SAVE L310與ENGINE L256交界明寫：已知／未知policy沿同一新增canonical計量及64 KiB共同上限；最終選擇預留包含完整最後一筆record、state變化、實際需要的新blob及封裝開銷，並對state／單blob／總decoded／envelope bytes、journal record數與JSON depth／values等**逐維**檢查。已知policy取各選項逐維最大；未知policy須有固定保守的增量界（確定不增加的維度可明列0），發布validator驗每個policy不超這組界，不能只驗總bytes≤64 KiB。明確把必要的重複保存／base64長度算進各自封裝上限，不只從32 MiB扣一個常數。
- **有限解除範圍**：只核SAVE §8這段、ENGINE §4.3對應句及ACC §2.1 V-INT-04補例：bytes富餘但最後record／JSON計數不足時，必須在S准入拒絕；未知與已核定policy同計量，恰界接受／超界拒絕。owner保存＋核心，WP1-C（依A/B）；WP2驗證器／WP10內容資料同步採此界；ACC-02/05/24。此輪只需規格補註及測試設計，實作向量仍待測。

可准入state可能因R與最後選擇預留而小於8 MiB，這不構成新的矛盾；也不要求無限次tag／pin或超過格式上限的self-sync一律成功。一般quota／RAM失敗仍走既有救援。

### 9.3 INTREV-09／P1：reopen來源閉包已建，跨lineage writer順序未閉合

**狀態：已處理待重核。** §8所列宿主操作與M7入口均已有明確回應；餘下的是新lineage seq歸零後，如何使用繼承的來源判定有效writer。

#### 已接受及精確解除的範圍

- **操作／世界投影**：SAVE §7.2 L280–284固定六欄請求；來源E須main ended，P須E指定preEnding點、active main／playing、版本一致。新saveId／lineage、seq0／空tail，複製P世界／shellStatus／原來源身份，僅ledger採E已領集合且驗P為子集。這已提供真正可玩main的候選，不再以sandbox或review返回替代。
- **來源bytes與閉包**：SAVE §7.1 L269、§7.2 L285的origin.sourceHash指封閉RecoveryOrigin descriptor，明列E/P兩組stateHash／stateBlobHash及checkpoint身份；C(E)、C(P)與兩者依賴均須保存、驗hash與閉包。sourceSaveHash明定只是摘要、原槽另保留，故**不要求再把整份可達64 MiB的原envelope塞進8 MiB單blob**，也不把缺原envelope blob誤報成閉包缺失。E用於ended／ledger驗證；有E的bytes不授權新世界讀取P以後的writer／記憶。
- **歷史與自我引用**：L283/L286保留原sourceRef／evidenceId／forkPoint／tags；新baseline checkpoint的hash在外層history，不自我hash。來源checkpoint從各自完整state讀lineage與seq，不混成新lineage連續journal；新起點genesisReplayAvailable=false，來源前綴未附就不宣稱可達。重複恢復的origin依賴仍受§7.1圖／深度／總量限制。
- **原子性／重送**：L287同交易驗來源revision＋saveHash、active-root revision、target不存在，完整建槽才切active，保留原ended bytes。memory用同等CAS並保留兩槽；相同target僅在descriptor／請求一致時回原結果。缺件／取消／CAS／容量失敗不切active，下載不升durable。
- **容量範圍**：L289明定新候選連同來源閉包也須§8准入，不刪origin／pin湊容量。這不是每個合法ended檔都必能在任意剩餘空間再開新槽的無條件保證；本次接受其明示容量拒絕及原結局保全，04仍只追必要終章預留的計量。
- **M7入口**：ENGINE clocks L266、REPLAY §1 L18／§3.3 L80、SEASON §2 L33／§4 L73一致採服務讀模型，不進主線EngineState／system.fact，收到season fact拒ENG_FACT_SCHEMA_UNREGISTERED。§8.2的M7未管理入口疑慮解除；M6 ReplayAssessment維持§8.4原關卡。

#### 剩餘反例、最小修法與有限重核

**定位／類別**：SAVE §7.2 L283允許繼承P的writer並讓新操作從新lineage seq1開始；ENGINE §4.2 L226及TICKET §4.4 L193仍單寫按`sourceRef.seq`數值序重建。既有forkPoint規則能限制分支可見來源，卻沒有定義recovered main的跨lineage先後。這是09新增恢復協定與既有writer規則的接縫，並非07的編輯入口或08的EvidenceRecord欄位重新失效。

**V-INT-09-R1（紙上，未執行）**：P中的同一工作inode在舊lineage seq120有合法counting→write，bytes為B。reopen至新lineage seq0後，以file.edit在seq1把同一inode重寫為相同B；新writer必為literal，不能沿用舊計數來源。舊trace因合法繼承保留，新trace由本次寫入產生；若跨lineage仍只按seq升序套writer，新seq1會先套、舊seq120反而最後覆蓋；因bytes相同，contentHash檢查也擋不住錯誤。全域降序或按lineage字串排序同樣不是因果規則，不能靠改排序方向補洞。

**最小補註**：

1. ENGINE／TICKET將writer重建明定為「**先由RecoveryOrigin指定的P重建並驗證繼承來源視圖，再套目前lineage的新facts，僅在同一lineage／可見分支範圍內按seq及nodeOrdinal排序**」。P已是recovered時，沿其origin邊界遞迴重建；用既有visited／循環／深度預算，不把多代raw seq混排。
2. SAVE §7.2明示P的writer視圖是恢復起點，不採E在P之後的操作；只按P／新state實際接納的facts及forkPoint可見性取來源，不能掃描blobs中所有trace當可用writer。新literal、同bytes覆寫及hardlink別名寫入都覆蓋繼承writer；沒有新寫入則保留P的合法來源。
3. 這是既有origin／facts的純投影，不新增私有持久Map、不改原sourceRef／evidenceId、不將舊操作改號成新lineage；清快取／compact／換宿主後仍須得到同一視圖。

**解除證據／owner**：僅重核ENGINE §4.2 L226、TICKET §4.4 L193、SAVE §7.2 L283/L285與ACC §2.1 INTREV-09 L61的局部同步。補舊seq120→新seq1同bytes literal負例、未覆寫仍保留counting正例，並含清快取／compact／reload、再次reopen及E晚於P的trace不可混入。核心＋保存＋判題，WP1-A/C＋WP3，ACC-05/10/12/20/24。TRACE精確子schema仍按原關卡交付；本項只要求先把跨lineage因果規則寫唯一，不要求本輪實作或重做全部判題設計。

### 9.4 延續的關卡與判定邊界

- §8.4的TRACE／EVIDENCE／SHARE／DOMAIN／PACK DSL／ReplayAssessment子schema尚未解除；已有owner與啟用限制不代表資料可任意接納。02／03／10／15等關閉只消除各自指定的規格反例。
- 04是最終預留的規格計量未閉合；09是新恢復邊界與既有排序規則未閉合。其餘已解項的producer、故障處理及跨宿主正確性屬`未實作待測`，不把這兩類狀態混為一談。
- D21–D25只作規劃裁決；O-N01–08、F5正文取法、後半卡片及完整結局充分條件繼續是`作者缺口`。本輪沒有重做敘事審查，非正史終章fixture不能替作者批准正文。

### 9.5 本輪證據、交付與下一次有限重核

**實讀範圍**：DECISIONS D21–D25；ENGINE §3.3–6.3及ENG-016；SAVE §6–8、§3.1／§4 hash與來源接點；PACK §3／3.1／3.2／6；COMMAND §3.2；REPLAY §1／3／4–4.1／5.0；SEASON §2／4；TICKET §2.3／4.4與賽季adapter段；MERGE §7、BOSS §3；WORK_PACKAGES WP1總表／A/B/C／子schema表，ACC新增§2.1、ROADMAP M1與總綱對應句；UX ST14／21／22、S10／COPY028／UX-007。以上為定點閱讀／搜尋，未聲稱本輪再次全文審查所有文件。

**實際未執行**：遊戲、hash／schema conformance、GNU／Git reference、模擬、效能／平台／瀏覽器、真人及無障礙測試均未跑；沒有執行文件checker或接手整合者的結構檢查。整合者回報中途checker與管理文件修正是他方紀錄，不列為本檔修改後通過證據；歷史391/391及其他文件數／連結數亦不沿用為本次結果。

**交付範圍**：只以patch更新本檔的頂部版本／計數／現行指向並新增§9，保留§8與早期歷史實質內容；未提交Git、未派代理。八項本次關閉可按精確範圍登錄；下一次只需送**04的多維最終預留補註與09的恢復writer先後規則**及上述ACC接點，不需新全包。若這兩處閉合且無新的相關變更，即可關閉剩餘規格反例；實作與作者關卡仍沿原工作包管理。

## 10. 兩項殘留的現行判定（0.6；有限重核完成）

本次僅依§9.2／§9.3的解除條件，核對INTREV-04／09與指定ACC補例。**兩項均已閉合；20項＝20已解＋0已處理待重核＋0初審待修。** 其餘18項沿用既有精確關閉範圍，沒有重新認證全包。§9全文及更早反例保留當輪歷史，本節取代其待修要求。

### 10.1 INTREV-04／P1：最終選擇的共同計量與逐維預留——已解

**實讀定位**：SAVE §8 L310–326，尤其「最後一步的共同計量與逐維上界」L314–326；ENGINE §4.3 L250–258；ACC §2.1 V-INT-04及末步補例L60–61。

- **計量已唯一**：以R為review、E為本次ended，`G=max(0,|C(E)|−|C(R)|)+|C(完整最後JournalRecord)|≤65536`；effects已在完整record內，不重複計。已核定／未知policy同受G與每一維的共同限制；已知取同一R上各選項的逐維最大，未知採固定保守向量，發布validator逐policy／fixture驗證。
- **最後一步範圍已封閉**：ENGINE L258限定既有終章／等待欄位與seq變更、一筆ending.selected及最後一筆journal；endingId為1..96 ASCII ID。無VFS／flags／facts／scheduler等任意副作用、新blob或checkpoint；診斷OutputRecord是選用匯出，不得阻擋必要提交。SAVE明定最後一步不compact、不重包baseline／segments、不增annotations，使預留不被其他保存操作消耗。
- **獨立限額已有明確預留**：未知policy的state正增量65536、完整record≤65536且tail／全部records各＋1、blob各維增量0、canonical envelope＋65536＋256；JSON values＋1024並計容器，新增結構絕對depth≤16且檢查`max(depth(R-envelope),16)≤48`，其餘列明counts增量0。已知policy可取較緊實算值，但不能放寬共同界。S→R仍實算snapshot、base64、BlobRecord欄位及必要重複保存，並納入兩筆inputId最壞長度、S.seq+2與計數器溢位檢查。
- **原殘留反例的結果**：bytes雖足夠，但prepare後沒有最後一筆record或JSON values名額，現在必須於playing S准入回SAVE_SNAPSHOT_RESERVE；不再只扣64 KiB後等最後選擇才失敗。未知／已知policy同計量、各維恰界／超界、depth與封裝容量均已掛回ACC末步補例。這是文件規則推導，案例尚未執行。

**精確關閉範圍**：結合§9.2已接受的state／record／segment上限與必要pin演算，04的原9 MiB反例及最後一步計數預留殘留均已解除。格式准入仍不等於IDB／RAM物理容量保證。owner保存＋核心、WP1-C（依A/B），WP2驗證器／WP10內容資料；ACC-02/05/24。**狀態：已解（規劃反例）；未實作待測。**

### 10.2 INTREV-09／P1：reopen跨lineage的有效writer先後——已解

**實讀定位**：ENGINE §4.2 L224–236，尤其L226–228；TICKET §4.4 L191–197，尤其L195；SAVE §7.2 L280–291，尤其新增「恢復writer的因果順序」L291；ACC §2.1 INTREV-09／V-INT-09-R1 L62–63。

- **恢復邊界已唯一**：先依RecoveryOrigin指定的P及forkPoint可見範圍重建已驗writer，再套目前lineage已接納的新facts；只在同lineage／可見分支範圍內按seq／nodeOrdinal排序。P若recovered沿origin遞迴，沿用visited／循環／深度／總量預算，不跨代混排raw seq。
- **來源與持久權威一致**：只取P實際接納且可見的facts；E晚於P的trace即使因閉包存在blobs也不可混入。新literal、同bytes覆寫與hardlink別名寫入取代繼承writer；未寫入才保留P來源。索引由origin／facts／VFS／forkPoint純重建，不加第二份持久Map、不改sourceRef／evidenceId或舊seq。
- **V-INT-09-R1的結果**：舊lineage seq120 counting先成為繼承起點，新lineage seq1同bytes file.edit後writer必為literal；舊高seq不再有機會晚套而覆蓋新寫入。未覆寫保留counting的正例，以及別名、清快取／compact／reload／再次reopen、E較晚trace排除，已列入ACC L63；全部仍未執行。

**精確關閉範圍**：解除§9.3唯一剩餘的跨lineage因果排序接縫；該節已接受的P/E來源閉包、歷史起點、ledger、CAS／原結局保全與M7邊界判定沿用。07／08維持既有關閉範圍。owner核心＋保存＋判題，WP1-A/C＋WP3；ACC-05/10/12/20/24。**狀態：已解（規劃反例）；未實作待測。**

### 10.3 交付與保留關卡

- 本次實讀僅上述authority、引用接點、ACC與本審查§9／頂部；兩項殘留均無需追加規格修復，可據此更新管理文件的20項現行狀態。
- 全部實作、黃金向量、跨宿主／故障注入／平台及真人驗收仍`未實作待測`。§8.4／§9.4的TRACE／EVIDENCE／SHARE／DOMAIN／PACK DSL／ReplayAssessment子schema關卡維持；TICKET L197亦明示producer未實作及TRACE阻塞。20項已解不等於全部wire可啟用。
- O-N01–08、F5正文取法、後半卡片及完整結局充分條件仍為`作者缺口`；D21–D25仍是規劃裁決。工程fixture不替作者批准正文。
- 本輪在前景完成，只以patch更新本檔版本／計數／現行指向及新增§10，保留§9歷史；未改其他文件、未提交Git、未派代理、未執行遊戲或其他測試／文件checker。結構checker由整合者於本稿完成後執行；既往他方通過紀錄不列為本次結果。
