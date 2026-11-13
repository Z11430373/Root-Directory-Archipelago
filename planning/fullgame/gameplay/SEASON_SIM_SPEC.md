# M7 賽季與平衡模擬器契約

版本：0.1｜2026-11-02｜狀態：**延後至 M7 的規劃工具；未實作、未模擬、未取得真人賽季結果**。

目標：先找出可重現的滾雪球、新人殺手、缺人崩盤與重複結算，再決定是否開線上賽季。模擬代理是規則下的行為模型，不是真玩家或市場研究。

## 1. 來源、範圍與責任

依 [DECISIONS](../DECISIONS.md) D03–D09、D13、D15–D18；授權／受理／收據沿[REPLAY_SPEC](../engineering/REPLAY_SPEC.md)。D18已裁定毫秒時間、一grant一proof、同turn批次聚合；數值平衡仍為提案。來源：[原規劃 §5、M7、WP7](../source/《根目錄群島》完整版規劃書.original.md)、[world](../../../world/world.yaml)、[SCRIPT](../../../SCRIPT.md)、[charter](../../../world/charter.yaml)、[fragments](../../../world/fragments.yaml)、[ENGINE_REQS](../../../ENGINE_REQS.md)、[SOURCE_GUIDE](../../../SOURCE_GUIDE.md)。

**保留的來源值／待平衡**：每島 **8×8＝64 區塊**、完整度 **0–100**、GC 每日 **02:00**、每隊每週一次 **8 小時維護窗**、**12 週／4 陣營**。這些是來源設計，不是已驗證的公平參數；陣營正式名稱、島數、對戰／投票細則待作者與產品確認。世界曆賽季 5 的日期不自動變成日後線上活動日期。

**現況**：沒有 authoritative 賽季服務／ledger／平衡模擬器。來源資源含 sectors/keys/time_fuel，但 demo 獎勵不等於真的線上領土。主線離線只有故事／NPC 地圖；不因玩家關網或考試週衰退。多人離線主持人戰報可做低成本候選，但須標「自行回報」，不冒充伺服器排名。

依賴：M6 帳號／同步／版本化重放、權威工作收據、transaction ledger、共用題目判定、schema 2 證據、時鐘契約、服務資源確認。OJ 類工單另依 M7 bridge；不能因 OJ 不可用讓離線主線不可玩。MiniGit 不是賽季計算的演算法依賴；原 WP7「WP5 之後再說」保留為排程理由，不能形成不必要技術耦合。

| 所有者角色 | 責任 |
| --- | --- |
| 規格／產品整合者 | 模式發布範圍、平衡假設、真人研究與 stop/cut 決策 |
| 經濟／關卡設計 | 參數單位、收入／支出、競技政策、情境假設 |
| 後端／資料庫 owner | authority、work lifecycle、ledger、序列化結算、scheduler／修復 |
| 引擎／OJ owner | server replay、題目版本、判定證據、失敗語意 |
| 模擬／QA | 可重現 seed、輸入矩陣、突變、invariants、metrics 報告 |
| 活動／真人測試 owner | consent、短 preseason、12 週真人證據、回饋與退出 |
| 敘事作者 | 四陣營／季末 vote 正式文本與世界曆對應，不由模擬器生成正史 |

## 2. 三種時鐘與基本單位

| 值 | 單位／權威／規則 |
| --- | --- |
| `branches[id].storyTimeMs` | 沿Engine的主線整數虛擬毫秒；閱讀、失焦、離線不推進；不參與賽季衰退 |
| `annotations.activityClock.elapsedMs` | 沿SAVE的真人試玩觀察elapsed time；自願匯出，不影響領地 |
| `seasonTimeMs` | M7服務讀模型的伺服器UTC epoch整數毫秒；不進EngineState，客戶端不能自報提早完成 |
| `seasonElapsedMs` | seasonTimeMs−seasonStartEpochMs；非負時turnId=floor(elapsed/turnDurationMs)，負值尚未開季；不能拿來與epoch期限比較 |
| `turn` | 競技服務整數結算序號，不是Boss turn；`turnDurationMs=60000`為起始提案，權威時段`[t,t+60000)`（ms），在close時處理已接受且驗證就緒事件。模擬可跳到下一個有事件turn，不能漏scheduler邊界 |
| `integrityBp` | 整數 basis points，0..10,000，顯示為 0..100%；100 bp=1 完整度百分點，計算不使用浮點 |
| `mK` | 整數千分之一鑰匙幣；1 K=1,000 mK；展示與四捨五入規則固定，不能先四捨五入再結算 |
| `sectorCount` | 無量綱整數；ownership 計數，不是可花的貨幣 |
| `workUnits` | 某題版本的工作效果單位／bp，不等於玩家技能等級 |
| `timeFuel` | 競技回溯配額，整數單位，獨立帳本；不是 mK、不是 main 分支次數 |
| `week/day` | 由season start＋固定tz policy推導。先用來源`+0000`：日=86400000ms、週=604800000ms、12週=7257600000ms（84日）。若改IANA/DST必須另凍結tzdb版本／邊界測資 |

任何params使用「每分鐘／每天／每區塊」必填單位；所有數值clock、timestamp與duration均為安全整數ms，不能混秒／浮點。ISO字串只在UI／傳輸adapter無損轉換，往返必須得到原毫秒（拒缺時區、超毫秒精度、溢位或截斷）；signed payload的canonical形狀沿REPLAY／SAVE，不由顯示字串重簽。使用者介面同時顯示賽季時區與當地換算；結算以權威時間為準。傳輸延遲不能改client timestamps取得較早turn；OJ等待時間與玩家解題時間分開觀察，不獎勵較快判題機。

## 3. 參數表與版本凍結

下列 A 欄是**原型假設起點，沒有平衡結論**；來源欄 S 保留來源數值。任何正式賽季要先批准完整 `SeasonConfig` 與 hash，不能在週中悄悄改稅率。

| 參數 | A／S、初始候選 | 單位／界線／說明 |
| --- | --- | --- |
| `gridWidth,gridHeight` | S：8,8 | 每島，固定 64 格；總島數 `islandCount` A：1 作切片，另試 4；不推論正史只有四島 |
| `seasonDurationMs,factionCount` | S換算：7257600000,4 | 來源12週；空陣營必須能表示，不強填NPC假玩家；陣營成員／隊伍關係另記 |
| `gcOffsetWithinDayMs` | S換算：7200000 | 來源02:00，每曆日一次，job ID由season/date/version產生 |
| `maintenanceDurationMs,slotsPerWeek` | S換算：28800000,1 | 來源8h；每隊每週一個連續`[start,end)`窗；先用豁免GC衰退，**不免疫對戰、不加輸出** |
| `turnDurationMs` | A：60000 | 整數毫秒，GC/維護邊界須能準確對齊；其他值需跑邊界測試 |
| `initialIntegrityBp` | A：10,000 | seed 格完整度，範圍 1..10,000；搶得格另用參數 |
| `seedSectors,newcomerProtectionMs` | A：2,604800000 | 每新隊種子格／7日保護的ms值；來源曾提第一週免費維護，具體格數未定；不能無限重建隊領獎 |
| `decayBaseBp,decayPerExcessBp,softLandCap` | A：100,25,8 | bp/日、bp/(超額格·日)、格；每格衰退依該隊總面積增加，不用浮點百分比相乘 |
| `taxPerSector_mK,upkeepPerSector_mK` | A：50,80 | mK/(格·日)；經濟收入與維護支出分帳。原型不是報價 |
| `unpaidPenaltyBp` | A：100 | 未付足維護後，下一 GC 對該隊每格的額外 bp；不得負債無限滾動 |
| `repairEffectBp,contestEffectBp,claimIntegrityBp` | A：300,300,1,000 | 每份已驗證工作基礎效果；各題可有版本化倍率，但不得依私人客戶端宣稱 |
| `repairPrice_mKPerBp` | A：1 | 每實際配置修補 bp 的成本；預留上限，未配置部分釋回 |
| `workReward_mK` | A：500 | 每 distinct 已驗證 workId 一次，受發單配額與難度 profile 限制；world effect 另驗 |
| `accountWorkDailyCap,teamWorkDailyCap` | A：20,60 | workId/日；隊伍規模變化與小號風險需情境測試，不能宣稱可完全防小號 |
| `maintenanceBooking_mK` | A：0 | 預約成本單獨參數。來源曾列為支出；先測免費基本窗，再比較有價版本，不與提示費混用 |
| `onlineRollbackFuel` | S 參照：B1 消耗1、每日3 | 來源是時間燃料。是否改為 mK 收費待裁決，禁止同時重複收兩種費用；B0／main 免費 |
| `backupPolicy` | A：manual / scheduled | 功能策略，詳 §7；每種另有成本／恢復效果，不能列裝飾 |

輸入檢查：安全整數、合法範圍、正 duration、格數不溢位、每週窗口長度不大於週、發單／獎勵可支撐的金流界線。拒絕 NaN、負數、未知參數、缺單位；參數組即使數學合法也可能失衡，須交模擬判斷而非只過 schema。

## 4. 狀態與雙邊 ledger

以下是**M7伺服器領域儲存模型**。依D25，前端查詢帶seasonId／seasonTimeMs／serverEventId的服務讀模型及收據，不送主線system.fact，不寫EngineState／SAVE.externalFacts；斷網顯最後查詢時間與stale，不能據cache自領獎。服務按eventId／receiptId冪等，伺服器ledger為唯一權威。若未來要賽季影響主線，另開具名版本化schema工作，現行入口收到season fact拒ENG_FACT_SCHEMA_UNREGISTERED。所有`*At`與effectiveAt採UTC epoch ms；season before/after hash是獨立服務摘要，其canonical/domain須M7定版，不冒用Engine stateHash；解題引擎仍驗原before/afterStateHash及effectsHash。

時鐘固定向量沿REPLAY §5.0：start=1800000000000、now=1800000060000，seasonTimeMs=now、elapsed=60000、turnId=1。期限兩側皆epoch；UTC日界以曆日而非季內elapsed取模，週序依季始。此為待測規格，ISO UI表示不得截毫秒改變簽章wire值。

| 記錄 | 必需欄位／不變量 |
| --- | --- |
| Season | id、configVersion/hash、engine／pack／judge versions、seed、start/end、tzPolicy、status、lastSettledTurn |
| Team/Faction | IDs、成員區間、size、joinTime、保護截止、active roster、權限；離隊不搬走隊伍帳戶／區塊 |
| Sector | island,x,y、ownerTeam（或null）、integrityBp、version、lastOwnershipChange；64個格唯一且完整度界內 |
| Wallet | account/team＋currency、available、reserved；任何狀態不為負；main keys 不匯入競技餘額 |
| Work | workId一對一映射REPLAY challengeId（不得另發第二個grant）；nonceHash、subject/account/team/authorizationEpoch、kind/action、target/resourceId、targetVersion/resourceVersion、seed、rulesVersion、issuedAt/expiresAt/resultDeadline（均ms）、effectBudget、costReservation、status、可選replacementOfChallengeId |
| Submission | submissionId/idempotencyKey、challengeId、首次受理payloadHash、serverReceiptSeq、serverReceivedAt（ms）、jobId、系統jobRetryCount、verificationState／resultHash；一challenge只有一份受理proof，不設可替換proof的attemptNo |
| Settlement | group settlementId、turn、resourceId／起始resourceVersion、inputEventRange/hash、beforeSeasonStateHash／afterSeasonStateHash、逐work結果／拒絕原因、ledgerTxIds；同group一次CAS，committed才對外生效 |
| Receipt | 每challenge各有receiptId／subject／submissionId／proof摘要／自身效果分配／status；同一批共用settlementId和資源before/after version。拒絕收據不標成valid競技權利，不能用一張團體收據轉移其他人的授權 |
| LedgerTx | txId、causeEventId、currency、debitAccount、creditAccount、integerAmount、balanceAfter、version；每幣別 debits=credits；mint/burn 也經 treasury accounts |
| SchedulerJob | jobId、effectiveAt、type、configVersion、pending/running/committed、attempt、settlementId；不得因重啟換 jobId |
| Backup | backupId、team、policy/version、createdAt、可恢復資料摘要、受控 sector/version 邊界、驗證收據、成本；不是可回滾整個世界的 save |

餘額等式：`closing = opening + earned + tax + grants + refunds - repair - upkeep - booking - backup - permittedCosmetic`，此closing指available＋reserved的總持有；reserved釋回available是內部轉移，**不列新收入／refund**。refund只退已發生的實際扣款，需原交易引用及唯一補償鍵。賽季重置後主線不變；徽章／名人堂是獨立成就投影，不把技能值／知識卡當mK。

「修補等級」若存在，是完成某技能／工單的能力資格，只影響可領題／可用動作；不是鑰匙幣來源，不能同時在收入欄與可買能力欄記兩次。原規劃的「題目買到的修補等級」「備份策略是裝飾」在此明確拆開，需主代理核定總表。

## 5. 工作、驗證與並發 settlement

### 5.1 流程與 API 領域契約（路由名稱待後端定版）

1. `issueWork(kind,target,expectedVersion,requestId)`映射`IssueChallenge`：requestId即issuanceKey，workId對應challengeId；驗權限／配額／資源，產生一個nonce、seed與固定版本，預留最大費用。工單綁subject/authorizationEpoch/season/resourceVersion，固定issuedAt/expiresAt/resultDeadline。相同帳號＋issuanceKey＋相同payload回原grant，不多占配額；同鍵異內容拒絕。
2. `submitWork(workId,submissionId,payloadHash,payload)`映射`SubmitChallenge`：先驗nonce／綁定／有效期／版本／大小，`serverReceivedAt < expiresAt`才可原子綁定**唯一受理proof**並標nonce已受理；保存成功回pending，不先改格子。payload是共用引擎可重放操作；程式題取得可核對OJ收據。
3. `verify`：重放不只比客戶端輸出或輸入 hash，要比關鍵效果、完整 state hash、資源限制與題目判定；nonce 只防重送／錯綁，不能證明真人或不能分享通用解法。
4. `settle`：驗證就緒後納入下一個未關閉turn；逐工單重查§5.2授權與resultDeadline，同turn同resourceVersion合格工作聚合，一批一次CAS，wallet/sector/逐工單receipt/job checkpoint同一DB transaction提交。每work收據獨立、共用group settlementId；外發用outbox，不能先告知成功再commit。
5. `queryStatus`：掉線／timeout 查同 submissionId，已結算回原 receipt；未確定不提示「再付一次」。無客戶端直接提交 coin/ownerDelta 的入口。

狀態沿REPLAY：`ISSUED → ACCEPTED → VERIFYING → PROOF_VALID → SETTLING → SETTLED`；queued為服務排隊視圖，不是另一份授權。**受理後的WA、語意重放失敗／不滿足題目規則 → REJECTED，終結該grant**；世界零效果、獎勵零、無實際扣費，釋回未花reservation。不能在同nonce換proof；新解法需新issuanceKey／新grant，重新扣一次發單配額。先離線免費練習、看提示／重做不受競技發單配額限制，離線結果不事後補成競技授權。

| 失敗／重送類型 | nonce／grant與預留 | 配額、重試與回饋 |
| --- | --- | --- |
| 受理前格式／大小／授權檢查失敗 | 沒綁proof；合法本人的issued grant仍保持；陌生請求不能釋回別人預留 | 原有效grant可修正入口資料再送；不生成第二份grant，不把此步稱WA |
| 同submissionId同payload可靠重送 | 返回原job／receipt，保持一次受理／一次結算 | 不再扣配額；同ID異payload拒絕；不同submissionId搶同nonce回ALREADY_SUBMITTED |
| 已受理後語意失敗 | REJECTED終態；釋回預留一次，不能換proof | 新嘗試領新grant受配額；UI給「免費練習」與「領新工單」兩個明確選項 |
| 系統crash／可恢復錯誤 | RETRYABLE_SERVICE_ERROR；原job、原不可變proof與grant，結果期限內保留預留 | 同job重試／查詢，不另扣額、不算玩家失敗；禁止換proof冒稱系統重試 |
| 到resultDeadline仍未能有效結算 | SETTLEMENT_REJECTED／RESULT_EXPIRED；零世界效果，釋回預留一次 | 若是服務責任，可依明列補償政策經新grant入口補發並記replacementOf；仍走配額／補償配額ledger，不改舊期限或復用nonce |
| 過期、合法取消、撤銷、stale target | terminal；只釋回該工作未花預留；已commit則不撤回他人世界 | 新工作須新grant；發單配額不因WA／過期自動退還，任何補償須有明列原因及去重記錄 |

配額是發grant次數，不是mK扣款。釋回reservation不是退配額；系統重試不是新grant。失敗率可作容量觀測，不能折成玩家「能力差」或公開懲罰。取消只在未結算時有效；commit先贏則回ALREADY_SETTLED，後續補償另記，不刪已結算歷史。

回饋文案提案：「這份工單已受理，重送只會查回同一結果。」／「這次驗證未通過，授權已結束；可先免費練習，再領新工單（計入發單額度）。」／「服務暫時失敗，正以原工作重試；不會重複領單。」／「驗證結果超過結算期限，未改變領地，預留已釋回。」只有確實提交了釋回／重試狀態才顯示完成式。

### 5.2 一個 turn 的確定性批次規則（D18採用；公式參數待平衡）

以`(seasonId,turn,resourceId,起始resourceVersion)`分group；batch關閉後不插入遲到工作。同一turn同格修補與contest用同起始snapshot聚合，不能逐工單CAS讓先到者贏。

批次交易**逐項重查**：subject/team/authorizationEpoch、grant無取消／撤銷、season仍開放、唯一受理proof有效、原`serverReceivedAt < expiresAt`、精確policy/profile/judge/pack、`decisionTimeMs < resultDeadline`、resourceVersion符合該group起始snapshot、challenge尚未結算、費用預留充足。decisionTimeMs為本次權威結算交易固定並保存的ms，不用client clock，也不因延遲補跑倒填到舊turn。恰等resultDeadline拒絕；即使proof較早通過，排隊到結算時逾期也不套世界效果。受理及時後超過expiresAt本身不算遲交，結果期限另判。

不合格項各有拒絕結果／釋回記錄，合格項才聚合；整group CAS起始resourceVersion一次並原子寫入。若GC／另一合法group已變更起始版本，該group返回RESOURCE_STALE，零效果、釋回未花預留；需要新grant，不將舊delta套新版本。DB暫時錯誤可同batch重試，但再次執行仍重查期限／授權；已commit的batch只查回原結果。不可部分寫領地卻漏某work的收據／帳目。

對有 owner 的格：

1. 匯集 owner 的有效修補 `R` 與其他隊 contest `A`（單位 bp）。`R_applied=min(R,10000-I)`；攻擊不替當步修補創造額外可收費容量。
2. `I_after=max(0, I + R_applied - A)`。`I_after>0` 保留 owner；等於 0 變中立。此 turn **不直接易主**；下一 turn 才接受 claim，讓同時動作結果可解釋。
3. 修補成本只對實際配置的 R_applied 收費：依每 action 的有效 R 比例分配整數 bp，餘數以 `H(seasonSeed,turn,serverAssignedWorkId)` 次序配發；上限受 reservation，與網路完成先後無關。零效果／飽和部分退還。

對 turn 開始為中立的格：有效 claim 按隊加總固定 work power；唯一最高隊取得 owner、完整度 `claimIntegrityBp`，平手維持中立並列 tie reason。repair／contest 不適用中立格。claim 不能用改 client workId 操控排序；平手不以到包快慢決定。

`workReward`是每distinct challengeId的**有效且成功結算**解題獎勵，不在PROOF_VALID先發；其合法claim平手也可依政策得一次。territory／修補效果獎勵不得另重複鑄幣。stale／resultDeadline到期／撤銷／無效工作不領；發單與難度／每日上限限制刷同seed，不能宣稱徹底防小號。每工單receipt列自身獎勵、修補bp／成本與平手理由，同group共用settlementId但receiptId不同。

相同 target 的併發再多也只一筆聚合 sector transition；所有成員/隊伍/target 的 wallet 預留不超 available。引擎原 `transaction` 不是多使用者互斥；後端需 DB 原子交易／序列號，不可把本地 snapshot rollback 當隔離級別。

## 6. Scheduler、GC、稅收與維護窗

事件比較鍵固定 `(effectiveAt, priority, stableId)`。同一時點提案順序：**維護窗 end/start → 已驗證且入列的 turn settlement → GC → 稅收／維護費 → snapshot/報表**。每項 consumer 使用唯一 causeEventId；有效期恰好等於 receivedAt 視為過期，窗口結尾不含端點。順序是規則，須向玩家可查，不能依 worker 搶鎖順序改變。

### 每日 GC

先拍各隊 n 個 owned sectors 的一致快照。一般每格衰退：

`D = min(10000, decayBaseBp + decayPerExcessBp × max(0,n-softLandCap) + unpaidPenaltyBp × unpaidPreviousDay)`。

若該隊在有效保護期／該次 GC 落在維護窗，當次 D=0；否則 `I'=max(0,I-D)`，0 變中立。n 不在掃到一半時重算，避免格順序不同衰退不同。回收波特殊事件若新增須有版本化公式／預告，不以未取得正文編成強制 PvP 懲罰。

### 每日稅收／維護費

- GC 後快照 owned n，記 `tax=n×taxPerSector_mK`，由 treasury mint 到 team wallet。
- `upkeepDue=n×upkeepPerSector_mK`；新人免維護期間為 0。提案扣可用額至 due，未足標 `unpaidPreviousDay=true`，不產生負數餘額或複利債務；明日可補恢復。預留資金不被重複扣用。
- 稅收／維護誰先入帳是固定契約；本提案先稅後費。參數變更不得追溯重算已結算日。退費必須以原 causeEventId 生成唯一補償。

### 週維護窗

每隊每 season week 可預約一個連續 8h，至少一 turn 前登記，不可回填；同週不可拆成多個窗，取消／移動只可在開始前，費用政策須明列。窗僅豁免該時間內的 GC 衰退、不凍結所有隊友／對手、不影響主線。跨週窗口 quota 歸開始週；週末重疊新一週的窗須拒絕，防拼接成超額連續免衰退。只覆蓋一次 GC 的實際效果要在預覽顯示，避免「買八小時卻沒用」誤解。

### 重啟與併發

同一 GC/date/version job 在兩個 worker 執行，只有一筆 commit；失敗 rollback 所有 sectors/ledger/job marker。服務停機跨兩日，依原 effectiveAt 順序補跑兩個日任務，不能只跑最後一天／重跑三次。模擬器與服務使用同 scheduler reducer；通知可遲，世界狀態不能因通知重送改動。

## 7. backupStrategy 是功能策略

備份設定列**功能性支出**，登入歡迎詞才可作 cosmetic。策略改變資料可恢復窗口、驗證負擔與恢復效率，必須列真實遊戲效果。

| 策略 proposal | 行為、成本與驗證 | 可恢復／不可回滾 |
| --- | --- | --- |
| manual | 玩家明示產生一份 team 資料 snapshot，付固定 `backupCost_mK`；完成 restore drill 才標 verified | 從該時間點恢復己方可控制資料；未驗備份不給競技 bonus |
| scheduled | 固定週期 job，自動產生有界版本、付每次成本／保留上限；失敗有明確 missed 記錄 | 缺人可維持備份，但不是自動得分／無限修補；需模擬儲存與幣耗 |

提案 `restoreWork`：只作用於仍屬該隊、ownership generation 未變的目標，使用可核對 backup receipt＋完成恢復檢查，可提高一次修補效果到 `min(policyCap,missingIntegrity)` 或減少恢復工單步數；具體倍率待平衡。不能把已被別隊取得的格、別人操作、wallet/稅款／判題收據一起倒回。相同 backupId＋targetGeneration 的額外恢復額度有限且 ledger 去重。

失敗備份、過期／缺檔、不相容版本給零功能效果；UI 顯示原因與下一個 drill。若初版不能驗證 restore 語意，砍競技備份 bonus，保留非排名的恢復練習；不得把未做功能改叫裝飾掩蓋。

## 8. 新人、缺人、公平與提示政策

新人保護以 server 的 team/join entitlement 記錄；新帳號／重建隊的免費資源只按規則領一次，避免重置套利。來源「第一週活得下去」是設計目標而非無條件勝率保證。玩家晚進入第 11 週不必靠前十週積分才有可做的事。

主線 `man`、操作說明、三階提示、重試、引導代辦全部免費；競技 mK／timeFuel 不扣主線。**競技提案**：操作手冊與規則免費且不降級；題目方向提示可用並標 `assistedCompetitive`；主動展開完整解法後仍可練習／交班，但該 workId 不列無提示速度榜。是否減世界效果／貨幣須另比較，本版預設不減，不能有暗扣。所有排行榜明示分類；不把提示使用當道德分數。

| 情境 | 行為模型輸入（全部假設） | 必看風險／出口 |
| --- | --- | --- |
| 晚入新人 | week 1/4/8/11 入隊；初始技能 profile 相同，資源從合法新人規則產生 | 七日內可完成至少一個有世界效果的工單；新手格是否立即被淘汰；不靠老隊施捨才可操作 |
| 低活躍 | 每週 1/2/5 個 session；每 session 1/3/6 個工單 | 相同比率不同時間分布，是否受 02:00 上線壓力；離線 main 不受影響 |
| 考試週 | 第 5–6 週中 7 日／14 日零活動，前後同配置 | 回歸能否恢復、是否永遠財務死路；提供 preseason 公布的停戰／保護政策候選比較，不暗改賽季 |
| 隊伍 size | 1/2/5 人隊，與同總工單數的隊比較 | 人多配額及資源線性膨脹；單人失去 maintenance/backup 管理是否必死 |
| 缺人／隊長失聯 | 一半成員離開；唯一有維護權限的人離線 14 日 | 預定交班／權限接管、無需提供私人原因；無聊天也能用預定義訊息補位 |
| 空陣營／不均 | 4 陣營含 0 人、1:1:1:10 人等分布 | 分數正規化是否被空分母污染，不能宣稱固定公平四隊 |
| 知識差異 | novice/intermediate/expert 的成功率、工單時間分布（人工假設） | 效果是否全由打字／判題延遲決定；模型不能推論真實學習能力 |
| 網路／服務差 | 高延遲、重送、OJ queue、一天 outage | 重放和結算一致、免費重試、reservation 釋回、主線可離線 |

## 9. 模擬架構與可重現輸入

流程：`ScenarioManifest → seeded agents/actions → authoritative work verifier stub/profile → event queue → 同版 settlement/scheduler reducers → ledger/state → metrics/diagnostics`。

「verifier stub」只能代表宣告的成功／失敗分布；另以真 engine/OJ receipts 的整合測試驗證判題鏈，不能用 stub 結果宣稱反作弊通過。

輸入 manifest 必含：

- `scenarioId/version, configHash, engineVersion, packVersions, simulatorVersion, masterSeed`。
- island layout、4 faction assignments、team roster／加入退出事件、initial sector/wallet（含來源）、工作種類／難度／效果、策略與可見資訊。
- 成功率、做題時間、活躍 schedule、協作／攻擊偏好、提示使用、late join、absence、network／OJ failure profile。每個假設附來源：`synthetic-assumption` 或獲同意的匿名觀察，不能混稱實測。
- PRNG 使用既有 mulberry32 的明確 32-bit 語意；各子流 seed 由穩定 actor/scenario ID 的已指定 digest 派生，避免多加一個隊伍就改所有其他抽樣。派生規則與字元編碼須版本化、提供固定向量。
- 玩家代理只能讀該角色可見的狀態，不偷讀其他代理私密計畫／future RNG。決策依純函式與事件，不能在 reducer 讀 Date.now/Math.random。
- `eventBudget, maxQueueDepth, maxTurns, maxWorkAttempts`。超限回 `SIM_INCOMPLETE`，停止並留 last-confirmed；不能把被截斷當隊伍滅亡或完整 12 週。

### 輸入矩陣與實驗次序（提案）

| 層 | 最小矩陣 | 目的／證據類型 |
| --- | --- | --- |
| 語意 fixture | 1 島、2 隊、同格併發；固定事件；無隨機 | 手算可核對交易／GC／維護／平手／冪等，先於平衡 |
| 基準 | 12 週×4 陣營；1、4 島；每個 scenario 30 個固定種子（A） | 觀察跨種子的分布，非真人統計顯著性 |
| 可及情境 | §8 各情境單獨 sweep，再 pairwise：晚入×低活躍、size×缺人、考試×維護窗 | 找受損群，不只看全體平均 |
| 敏感度 | decay/tax/upkeep/repair/reward 依 0.5×、1×、2×；tax 額外10×；不同提示政策 | 排查哪一參數支配結果；不假設十倍一定在所有配置都失衡 |
| 對抗／故障 | 重複 nonce、結算重送、worker crash、stale target、多人搶同格、備份重複恢復 | 用已知壞事件驗不變量，不混作一般玩家行為 |

每批以相同場景／對應子流做 paired 比較，保存完整 config 與 seed 清單，不只報最佳一輪。不同策略 tie-break 可固定；合法事件交換若不影響業務結果，測重排後 state/ledger 一致。真正同格競爭按已凍結 batching 規則，不能要求所有任意事件都可交換。

## 10. 輸出、metrics 與門檻假設

必交 artifacts（路徑命名提案，非本輪已產生）：`run-manifest.json`、`config.json`、`events.jsonl`、`ledger.jsonl`、`daily-metrics.csv`、`cohort-metrics.csv`、`diagnostics.json`、`summary.md`；每份有 hash、seed、版本與完成／截斷狀態，敏感文字預設不收。允許從 event ledger 重建每個 daily snapshot。

| metric | 定義／分母 | 提案警戒門檻（A，待真人校準） |
| --- | --- | --- |
| 領地集中 | 每日各隊格數 share、HHI=`Σ share²`；中立格另列；無 occupied 時標 N/A | 最大隊 share>0.60 連續7日且無策略差異→紅旗；不是保證一定不准領先 |
| 滾雪球斜率 | 前期領先者後續淨格變化／mK 淨收入，按活動量分層 | 同活動下 top cohort 後4週擴張持續超過 bottom 2倍→調查；零分母用差值而非除零 |
| 新人可行性 | 各 joinWeek cohort 在加入7日內「至少一次有效世界貢獻」比例、仍有合法可領工作比例 | 任何入隊 cohort <0.80 有效貢獻、或存在永久無工可領→紅旗；N與seed範圍同列 |
| 存活／回歸 | ≥1 owned sector 的隊比例；另列零領土但可重進隊，不能混稱消失 | 考試後7日仍無法重進 >0.20→紅旗；低活躍與高活躍分開 |
| 活動壓力 | 每隊維持「至少1格且可做工」的最少 sessions/week、在02:00附近行為占比 | 需每日上線或單一時段才能存活→設計調查；不是用留存率掩飾壓力 |
| size parity | 同有效工單數下 size=1/2/5 的淨領土與 mK；另列不同總工單 | 同工作量 outcome 差>25%→查 quota／權限／稅收效果 |
| 幣流 | 各 source/sink 總量、available/reserved、分位數、零餘額／無法重進天數 | 負餘額／借貸無來源／對帳不平為硬失敗；mint/sink 比率>2 連7日為經濟紅旗 |
| 公平處理 | stale rate、queue wait、判題技術失敗、平手／重送數、每 work 實際作用率 | 重送增幣／增加 ownership、有效失敗被扣費為硬失敗；等待閾值須依機器實測設定 |
| backup value | verified restore 成功率、成本／有效修復bp、未驗／過期備份比例 | 若只增費無可量效果、或可逆轉他人已結算事件→拒絕策略 |
| 提示政策影響 | assistedCompetitive／無提示各完成率、世界效果、收益與榜單 | 任一政策鎖主線／暗扣費為硬失敗；效果差異列結果不臆判能力 |

門檻是**先驗診斷假設**，不是已驗證業務 KPI，也不以通過平均值掩蓋某 cohort 死路。輸出每個種子的原值、min/median/p95 或 max（依指標）、有效 N、不可計算原因，說明對 threshold 的敏感度。不得只報「公平分數 95」。

### 可重現 badparam 診斷

至少固定三個帶版本的 diagnostic fixtures，保留 baseline 與 mutation 的**相同輸入矩陣／seed**：

1. `tax-10x`：僅稅率×10；輸出哪個領地／淨收入 cohort 被放大、何日越線、其 source ledger 與 first divergence。若沒有越線，不硬宣告所有配置失衡；該 fixture 未達「偵測壞參數」目的，重新檢查情境／其他抑制機制，不能調鬆門檻湊綠。
2. `decay-off`：D=0（基礎／超額／未付罰全部關），觀察囤地與領地周轉。診斷結構警告 `NO_PASSIVE_LAND_SINK` 及量測結果分開；若對戰 sink 可維持平衡須指出原因。選定應失衡的無對戰囤地 fixture 必須觸發集中／新人入口紅旗。
3. `duplicate-settlement`：複製已提交 event／job；正確系統結果不變。若 mutation 去掉 idempotency，ledger/state 不變量立即紅旗；不是靠12週末分數差才發現。

每個 diagnostic 記 `code, severity, ruleVersion, observed, threshold, firstTurn, affectedCohort, causeEventIds, reproductionManifest, confidence`；**先分 correctness failure、balance risk、model limitation**。修參數後保留原失敗 case，不能覆寫 badparam 證據。

## 11. 真人 preseason 與十二週 sim 是不同證據

| 證據 | 提案規模／用途 | 不能聲稱 |
| --- | --- | --- |
| 自動12週 sim | 完整規則周期、固定種子與多情境；數分鐘／小時的計算時間須實測 | 不能證明玩家願意回來12週、提示容易懂或隊伍相處公平 |
| 短 preseason 真人 | A：5–10日、≤20位自願者；正常上課／工作空檔、允許退出。明示測試時鐘倍率及不同正式規則 | 不能因加速／短樣本稱完成真正12週真人賽季；不猜完成率／招募成功 |
| 12週真人 pilot | 原規劃 M7 發布退出條件含小規模≤20人跑完12週；留存／缺人／活動負擔如實記錄 | 不能以30 seeds 的模擬代理取代；需要實際日曆與持續運作證據 |

**規劃已解**：依[ROADMAP](../delivery/ROADMAP.md)，M7仍須二十人內十二週真人實際紀錄及其餘退出驗收。`M7 tech-preview`（sim＋preseason）僅階段名稱，不算M7完成，也不另造較低的發布退出定義；真人證據仍未取得。

真人試玩只收經同意的最小資料，預設無遙測；自願匯出前可看事件／暱稱／文字範圍。記任務完成、卡點、失敗理由理解、提示使用、缺席／回歸的操作感受；不要求揭露考試、健康或生活隱私原因。無開放聊天室基線下使用預定義交班訊息；`wall` 來源相容性另依 D16，不默默刪設定。

## 12. 服務、預算與 stop／scope-cut

目前主機／資料庫／OJ 配額、同時使用量、維護人力、供應商單價均未知。下列為估算式與需量測的假設，**不報實價／不宣稱免費**。

- 日發單上界`min(accounts×accountCap,teams×teamCap)`；一grant最多一份受理proof，另估受理前失敗請求／可靠重送／系統job重試負載；語意失敗的新嘗試計入新grant數，不能只用AC數估算。
- replay CPU＝有效提交數×每次重放 CPU時間分布；OJ CPU／RAM／queue 分開估算，避免和 replay 搶同一個無上限 worker pool。
- ledger 儲存＝每日事件數×平均 event bytes×保留日數＋索引／snapshot／backup；模擬12週不能只存最終盤面。
- outbound＝snapshot bytes×訂閱者×推送頻率＋工作題材；先用 turn 結算摘要與按需查詢，無須全圖每秒廣播。
- **初期提案**：一個 authoritative settlement writer、一個 DB、可限制的 verifier queue、可停的 scheduler、靜態前端；≤20人是驗證規模假設，不是容量測試結果。要同機共用 OJ 先做實機壓力／隔離與故障回復驗證。

| stop criterion | 當下處置 | scope-cut／重新開啟條件 |
| --- | --- | --- |
| ledger 不平、重送增幣、雙 owner、不可重放 | 停止競技結算／發新單，保留最後有效 snapshot 與事件；不動主線 | 修復與完整重放／補償演練過後才恢復 |
| 未知／超出批准 CPU、記憶體、儲存或維運時數 | 停擴玩家數，不虛報可用吞吐 | 降發單頻率／島數／非必要推送；無資源就保留離線主線與自行回報戰報 |
| 新人／低活躍／考試情境持續紅旗 | 不開正式長賽季 | 先改成本／回歸入口或試非淘汰合作模式；保留來源值並記要重議的參數 |
| 真人 preseason 顯示必須夜間登入／難以理解損失 | 暫停正式排名發布 | 減衰退／批次化、預定保護與回歸設計再驗；不能只改文案怪玩家不活躍 |
| 缺持續12週真人／維護人力 | 只標 tech-preview | 將完整賽季後移，公布未完成證據；不得以 sim 冒充 |
| backup／OJ／PvP 成本過高 | 砍競技 backup bonus／程式工單／對戰模式之一並重跑模型 | 保留可驗證 shell 工作與非競技練習；修改預覽名稱／規則表，不影響 M5 |

## 13. 驗收（未執行）

| ID／owner | 正例 | 反例／突變必須結果 |
| --- | --- | --- |
| SEASON-01／schema QA | 8×8、0–100顯示／bp、02:00、8h週窗、12週4陣營全部有來源／版本 | 單位錯、超格、NaN、貨幣／能力混欄 → 拒絕輸入 |
| SEASON-02／引擎 QA | 同 manifest/seed/events 在兩宿主 state/ledger hash 一致 | Date.now／Math.random／locale 排序改結果 → 失敗 |
| SEASON-03／DB owner | 同 nonce/work/job/action 重送只返回原 receipt | 重送加錢／多格／多領新人資源 → 硬失敗 |
| SEASON-04／判題 owner | 伺服器驗規則／效果／state，合法工作才排 settlement | 只信 client rc／輸出或重雜湊輸入 → 失敗；nonce 不算真人證明 |
| SEASON-05／DB QA | 同格修補／contest 批次，tie 中立、成本按實際 bp，任意到達順序等價 | 最後寫入贏、雙 owner、花超 reservation、飽和照收全費 → 失敗 |
| SEASON-06／scheduler QA | 02:00與窗start/end同點、跨週、停機補跑都符合優先序 | 日任務兩 worker 重跑、漏一天、窗結尾仍免、跨週拼成超額 → 失敗 |
| SEASON-07／ledger QA | 每幣別對帳、mint/burn皆可追 cause、資源不為負 | 混 main coins、能力等級當收入、未知來源鑄幣 → 硬失敗 |
| SEASON-08／QA | WA／過期／stale／未授權零世界效果，未花預留正確釋回 | 失敗扣實費、timeout重試雙付、陌生請求釋他人預留 → 失敗 |
| SEASON-09／經濟 QA | GC 用一致 n 快照，0格仍有合法重進出口 | 邊掃邊重算、只因格遍歷序不同改勝負、永久負債死路 → 失敗 |
| SEASON-10／backup owner | verified backup有功能效果，限仍屬己且generation相符 | cosmetic 名義藏加成、未驗備份有bonus、倒回別人領土 → 失敗 |
| SEASON-11／sim owner | tax10x／decay-off 固定壞情境產生可重現診斷，包含first divergence／ledger引用 | 只說「看起來公平」、壞參數全綠卻宣稱完成、調門檻湊過 → 失敗 |
| SEASON-12／sim owner | §8晚入／低活躍／考試／size／缺人均有完整輸入與分群metrics | 只報平均存活率、空分母算0、把代理成功率當真人 → 證據不足 |
| SEASON-13／UX QA | 免費main hints；競技提示規則／榜單類別顯示且可查 | 主線負債、暗扣競技收益、assisted寫無提示自解 → 失敗 |
| SEASON-14／sim QA | 到84日含季末邊界，輸出完整artifacts／hash／seed；可查任意日 | 超budget截斷卻標12週完成、只留最佳種子 → 失敗 |
| SEASON-15／活動 owner | preseason與12週sim／真人pilot三種紀錄分開 | 短真人測試或12週代理冒充M7原真人關卡 → 不通過 |
| SEASON-16／後端 owner | crash後重放／outbox重送不改業務，超額可停發單 | 將本地Engine.transaction當跨人鎖、先通知贏再rollback → 失敗 |
| SEASON-17／產品 owner | 每個budget假設有量測／批准上限，scope-cut可保留M5主線 | 報未查實價／固定容量、線上停機鎖主線 → 規劃驗收失敗 |
| SEASON-18／真人測試 | 參與者能解釋一次損失原因、預約窗效果、如何回歸；可退出 | 非自願收輸入、02:00必在線、夜間壓力靠提示帶過 → 回設計，不以模擬判通過 |
| SEASON-19／REPLAY／QA | 同nonce只一proof受理；WA終結grant；新proof經新grant扣配額；系統同job可重試；離線練習不限 | 同nonce換proof、把釋回mK當退發單配額、系統重試變第二次成功機會 → 失敗 |
| SEASON-20／DB／QA | batch逐項在decisionTimeMs重查resultDeadline／epoch／取消；通過項同group一次CAS、每work獨立receipt共用settlementId | 已驗過就跳期限、恰到期限仍生效、逐工單先到CAS贏、整批只簽一張可轉移收據 → 失敗 |
| SEASON-21／時間QA | 全數值時間ms；ISO adapter往返保持原ms；日86400000、週604800000、8h28800000 | 秒／ms混算、截掉毫秒、無時區字串猜本機時區、client倒填deadline → 失敗 |

## 14. 主代理裁決項

- **SEA-O01／規劃已解／產品**：ROADMAP保留原M7「12週真人跑完」與完整退出條件；tech-preview僅階段名稱。實作／真人驗收未完成。
- **SEA-O02／高／經濟＋敘事**：四陣營名稱／隊伍關係／島數／季末 vote 及其計分；未知不補造。
- **SEA-O03／契約已解、未驗測／引擎＋後端**：D18統一整數ms、turnDurationMs、一grant一proof及同turn同起始resourceVersion聚合；REPLAY與SEASON以逐工單期限／授權重查、整group CAS及獨立receipt交接。scheduler priority沿§6，仍須SEASON-05/06/19/20/21實測。
- **SEA-O04／中／經濟**：原 time_fuel 每日3與原規劃「鑰匙幣回溯」哪個用於競技；先採來源燃料，不能雙扣或牽連主線。
- **SEA-O05／中／產品**：新人／缺席保護、免費基本維護窗與競技提示政策均是未驗提案；需選參數後跑情境，不把本表數字當來源真值。
- **SEA-O06／高／工程**：主機／OJ／維護人力未知；先量測與批准資源預算，再決定是否開服務。

以上只有設計／來源查核，沒有模擬輸出、效能結果、審閱人員指派或真人通過紀錄。
