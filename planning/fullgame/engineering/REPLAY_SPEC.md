# 決定性重放、授權與賽季收據契約

版本：規劃稿 0.1｜2026-11-02｜狀態：未實作；M6／1.1 重放與同步、M7／1.2 賽季及 OJ。

**重放要重新執行規則、比較 state、output 與關鍵效果，不是把客戶端 input 再 hash 一次。合法重放只證明指定版本下的可達性；不證明真人、未用腳本、獨立解題或真實耗時。** 本契約依 [D07、D09、D13、D15、D17、D18](../DECISIONS.md)，並與 [TICKET_JUDGE](TICKET_JUDGE.md)、[MERGE_SPEC](MERGE_SPEC.md) 共用證據與授權邊界。

## 1. 現況與權威

| 來源 | 已知現況 |
| --- | --- |
| [save/hash.js](../../../demo-app/src/save/hash.js) | schema 1 commitId 是 `sha256((parent ?? '') + canonical(body))` 的前 4 bytes／8 個小寫 hex；body 為 branch/chapter/kind/data/t/r；這只是完整性檢查 |
| [save/validate.js](../../../demo-app/src/save/validate.js) | 只接受 schema 1、封閉事件／data keys 與八碼 hash；形狀通過不等於可重放 |
| [save/import.js](../../../demo-app/src/save/import.js)、[demo/import_rules.yaml](../../../demo/import_rules.yaml) | 形式合法但鏈損毀仍可在離線流程標示處理；`verified: chain` 是歷史投影名稱，不能當競技已驗證 |
| [SOURCE_GUIDE.md](../../../SOURCE_GUIDE.md) §3、[storage.js](../../../demo-app/src/storage.js) | RA1 不保存任意 Shell 檔案／cwd／完整輸入；本機 envelope 額外有 baseSave／journal／runMode，兩者能力不同 |
| [save/integrity.js](../../../demo-app/src/save/integrity.js) | too_fast／題序／投票時機是合理性警示；不是人類身分或作弊證明 |
| [ENGINE_REQS.md](../../../ENGINE_REQS.md) §5、[FINDINGS.md](../../../demo-app/FINDINGS.md) F-W02、F-10 | 同存檔跨宿主須一致；現有測資對日誌採嚴格比對；舊浮點 journal 分組可能影響時間與 hash，不能擅自整數化修舊鏈 |

完整SHA-256與canonical依SAVE §4：stateHash=H("state",state)、effectsHash=H("effects",effects)、commitId=H("commit",record去掉commitId)，皆64小寫hex。ENGINE定reducer／交易，PACK定內容版本。本稿不新增根schema；actorId→profile.playerId、runId→lineageId。外部資料只走實際已登錄入口；ReplayAssessment按§3.1仍未開放system.fact，M7賽季結果依D25是獨立服務讀模型，不混入主線state。

## 2. 三個互不取代的驗證維度

| 維度 | 狀態例 | 意義 |
| --- | --- | --- |
| `integrity` | `not-checked / valid-sha256 / legacy8-consistent / invalid` | bytes、形狀、引用與 hash 是否一致；完整 hash 仍可被改檔者全部重算，不是防偽 |
| `replayability` | `not-attempted / compatible / partial-compatible / unsupported / mismatch` | 指定起點、版本、輸入與外部證據能否重建狀態／輸出；必附 coverage，缺 journal 不可稱完整重放 |
| `seasonReceipt` | `none / pending / valid / expired / revoked / rejected` | 是否有受信任伺服器簽發、綁定授權及結算範圍的當季收據；與一般 replay attestation 分開 |

顯示例：「完整性一致；指定版本可重放；無競賽收據」。不能把三者壓成 `verified=true`。

與 SAVE §5.3 的 reader assessment 對應：integrity 的 valid-sha256→integrityStatus=consistent、legacy8-consistent→legacy-only、invalid→mismatch；replay 的 coverage 精確填 `{fromSeq,toSeq,genesisAvailable}`。只有有效 server replay attestation 才可填 verificationStatus=server-replayed-range，本地 compatible 仍是 local-unverified。seasonReceipt 是協定評估／receipt blob 的獨立維度，不擅加到封閉 EngineState；來源完整性、restorationCoverage 與 formatStatus 仍沿用 reader 欄位。

- 任意離線成績即使上傳後重放相容，也只標「相容／可重放」，不能事後升級為競賽 verified、補占領地或補領當季獎勵。
- 只有**解題前已發放**的有效賽季 challenge、授權範圍符合、重放／OJ 通過、伺服器原子結算成功，才發 `seasonReceipt=valid`。預先領取的任務短暫斷網後按時送出，是同一授權任務的延遲傳輸，不是無授權離線成績轉正。
- 伺服器可為一般離線重放發不含競賽權利的 `replay-attestation`；其型別／簽章 scope 不可被 ledger 當成 season receipt。
- `legacy8-consistent` 不升為 `valid-sha256` 以冒充舊鏈；新版可對保存的 legacy bytes 算完整來源摘要，但原八碼 ID、原 bytes、原版號保留。
- 速度、輸入風格或共享解法的啟發式警示不是自動作弊裁決；合法速解或腳本可產生同樣合法 trace。若某競賽另有人工政策，另定規則，不能聲稱本協定已證明遵守。
- 改檔者若把全部輸入與狀態改成另一條合法可達軌跡，重放仍可能 compatible；不沿用歷史 WP6「任何篡改一定被抓到」的絕對承諾。可抓的是違反固定規則／版本／授權或與重算結果不符的聲明，不能由可達性還原真實操作過程。

## 3. 決定性引擎與輸出契約

### 3.1 邏輯執行模型

```text
ReplayStep（驗證器 adapter，不是另一個核心入口）
  → 呼叫 reduce(state, input, content)
  → 取得 {nextState, effects, presentation}
  → coordinator 計算 hashes 與 OutputRecord；量 workUnits

fixedEnvironment = 精確 engine + pack + judge + generator + policy 版本
                 + 已固定 seed／初始狀態／允許的外部證據
```

引擎內不讀宿主 `Date.now()`、`Math.random()`、網路、locale 排序、檔案系統或 UI 偏好。故事採整數虛擬時間；閱讀、失焦、離線不自行增加主線時間。活動牆鐘／賽季時間透過分立、經驗證的 authority input 輸入，不混成故事時鐘。

依 D17，有成本行動固定為「准入／固定成本→故事鐘與排程→重查條件→行動」；Boss 同序，不在 replay 另設先行動後扣時鐘。durable 模式先保存候選，再發布新世界與結果；保存失敗保留舊世界。純驗證 worker 只產候選／報告、不發布遊戲進度；本機切 volatile 必須玩家明選。

| 比較對象 | 必須納入 | 不納入遊戲決定性比較 |
| --- | --- | --- |
| State | VFS inode／內容／硬連結／權限／mtime、cwd、branch/checkpoint、flags、任務／故事／能力證據、背包／獎勵 ledger、虛擬鐘／排程、RNG 狀態、對話等待／once 等可影響下一步的 runtime | terminal 捲動位置、動畫、字型、主題、面板展開、宿主執行耗時 |
| Output | 各stdout／stderr完整bytes及rc；commandStreams內序、presentation內序／channel／固定文字或canonical message；OutputRecord digest | 跨stdout／stderr chunk及stream／presentation合流總序；DOM、換行寬度、自動捲動、讀屏排程、UI截斷提示 |
| Effects | 引擎實際讀取 snapshot、寫檔、chapter／branch、判題、故事解決、一次性 reward intent 等權威事件 | 客戶端自稱的 effects、輸出中偽造的「AC」字樣 |
| History | 引擎產生的 ordered events、parent/reference 與完整新鏈 digest | 跨玩家知識聯集的歷史 hash 相等要求（見 MERGE_SPEC） |

不能只驗最終state hash：刪中間輸出、略過分支、先發獎再扣回仍須檢查逐步effects與OutputRecord。各stream先對**未裁剪bytes**算hash，再給UI摘要；不能只hash最後20行。兩command A/B與對話D的跨組展示可為A→D→B或A→B→D而相同digest；這不是總序證明。改A/B的commandStreams內序、D的presentation內序或任一stream bytes必須不同，依ENGINE §3.4。

輸出對齊核心：stdoutHash／stderrHash 使用 `command.completed` 的原 bytes SHA-256；對話由固定 pack 的 presentation 決定。ENGINE §3.4 已固定 `OutputRecord/1={schemaVersion,seq,commandStreams,presentation}`，schemaVersion=`output-record/1`；commandStreams 是依 effects 次序排列的 `{rc,stdoutHash,stderrHash}` 陣列，presentation 是 ENGINE §6.2 的有序語意訊息。`outputDigest=blobHash(UTF8(C(OutputRecord)))`，不用 H("output")；它是證據 blob，不進 stateHash、不新增 JournalRecord 欄位。effectsHash 本身不等於完整 presentation 比較。

**ENG-M6-REPLAY-ASSESSMENT 實作前阻塞**：ReplayAssessment 的精確欄位／wire 版本／factId／逐 seq 輸出引用／coverage 與 receipt 綁定尚未定，本版不開放以 system.fact 保存它，收到應回 ENG_FACT_SCHEMA_UNREGISTERED。解除須本文件 owner 提供完整 schema、bounds、固定起訖版本與 hashes、驗證者／收據 scope／冪等規則，並同步 ENGINE registry／SAVE §7.1 閉包。OutputRecord 外層已定，renderer oracle 與 producer 仍未實作；僅留診斷 blob 不能保證跨 compact 保存，匯出須按 SAVE 明示可用證據及 coverage。

### 3.2 輸入與輸出正規化

- `input` 是明確型別的玩家指令、對話回答、檔案編輯、明示推進虛擬時間、經驗證外部結果等；不能把 client 提交的 `set flag`／`award` 當成玩家可呼叫指令。
- 輸入正規化只做 ENGINE／pack 指定的步驟，記錄使用的版本及正規化後確切 bytes。引號、空白、零寬字元、編輯器內容可能是題意，不全域 trim 或 NFC 化。
- replay 的 output comparator 不套用 OJ 的「忽略行尾空白」；程式答案 comparator 是 judge profile 的內部規則。跨端語意輸出一致使用 exact bytes／canonical message 比較，包含 CR/LF 政策。
- 對話文字與 locale 固定在 pack；若跨端使用不同文字版，回 VERSION_UNSUPPORTED，不把差異誤判為玩家造假。
- 確定性 workUnits 達限是 profile 的固定中止結果；實機 CPU／wall watchdog 則是宿主保護，回 WORKER_LIMIT／SERVICE_ERROR，不冒充規則上的 WA 或玩家作弊。

### 3.3 外部 judge／知識／賽季事件

重放過程不打QDUOJ、不傳聊天／郵件、不重發獎。它只處理已登錄且前置驗證綁定的immutable input，例如judge receipt或MERGE evidence。M7賽季事件只在服務領域重放／讀模型，不是主線system.fact；未來要影響故事須另版本化註冊，當前收到拒ENG_FACT_SCHEMA_UNREGISTERED。

程式 AC 的 OJ 收據是外部判題事實；遊戲重放只證明「合法套用了這張收據」，不假裝已重新執行 Python 或證明任意 Python 程式的內部決定性。要重判程式須啟動獨立 judge job，保留新 verdict／版本及撤銷政策。

## 4. Replay request、trace 與版本綁定

| 邏輯欄位 | 必要規則 |
| --- | --- |
| `replayProtocolVersion` | 協定精確版本；未知版本拒絕，不以舊 reader 忽略欄位 |
| `purpose` | `compatibility / season-challenge`；後者必有 challengeRef，不能處理完才改用途 |
| `actorId / runId / branchRef` | 來源、遊戲歷史、分支；不由暱稱推定 |
| `engineVersions` | 原封沿用核心六欄 `engineVersion,rulesVersion,commandSetVersion,stateSchemaVersion,hashVersion,contentSetHash` |
| `artifactVersions` | engineBuildHash、核心 packRefs、judgeVersion／profileVersion、generatorVersion、replayPolicyVersion；不塞入核心封閉 versions |
| `initialStateRef` | 按purpose分流：compatibility可用合法未簽baseline／snapshot並標tail coverage；season-challenge僅grant綁定genesis／可信server checkpoint，見§4.1 |
| `seed / rngStateRef` | 固定算法及狀態；有授權時以 grant 的 profileSeed 為準 |
| `inputs[]` | 每筆嚴格為核心 `{inputId,expectedStateHash,branchId,kind,payload}`；seq 由 journal／trace 排列，不新增 Input.seq；file.edit採已定inline四欄，工單trace子schema及producer仍須通過TICKET關卡 |
| `claimedTrace[]` | seq、beforeStateHash、afterStateHash、outputDigest、effectsHash；對應 journal，皆是待比對聲明 |
| `claimedHead` | 沿用 SAVE `{seq,commitId,stateHash}`；legacy 八碼另置引用；驗證器獨立生成核對 |
| `externalEvidence[]` | 最小需要的收據／來源與簽章；不可藉此讓任意客戶端事件成為權威 |
| `limitsProfile` | 固定 profile 的資源上限；客戶端不能調大 |

JSON 是協定 payload 範例，不是存檔根格式。所有 `sha256:<...>`／signature／ID 是**示意佔位符，不是可執行測試向量**；實際 hash 為 64 小寫 hex、不帶 sha256 前綴。

```json
{
  "replayProtocolVersion": "replay/1",
  "purpose": "compatibility",
  "actorId": "actor-example-a",
  "runId": "run-example-a",
  "engineVersions": {
    "engineVersion": "0.2.0",
    "rulesVersion": "fullgame-rules/1",
    "commandSetVersion": "ra-shell/1",
    "stateSchemaVersion": 1,
    "hashVersion": "ra2-c14n-sha256-v1",
    "contentSetHash": "sha256:<content-set>"
  },
  "artifactVersions": {
    "engineBuildHash": "sha256:<engine-build>",
    "packRefs": [{"packId": "ch1", "contentVersion": "candidate-1", "manifestHash": "sha256:<pack>"}],
    "judgeVersion": "shell-judge/1",
    "profileVersion": "harbor-histogram-shell/1",
    "generatorVersion": "harbor-generator-candidate-1",
    "replayPolicyVersion": "replay-policy/1"
  },
  "initialStateRef": {"kind": "pack-genesis", "digest": "sha256:<initial-state>"},
  "seed": 427,
  "inputs": [{"inputId": "replay:example:1", "expectedStateHash": "sha256:<before>", "branchId": "main", "kind": "command.execute", "payload": {"raw": "cat /tickets/T0427/input/access.log"}}],
  "claimedTrace": [{
    "seq": 1,
    "beforeStateHash": "sha256:<before>",
    "afterStateHash": "sha256:<after>",
    "outputDigest": "sha256:<all-semantic-output>",
    "effectsHash": "sha256:<effects>"
  }],
  "claimedHead": {"seq": 1, "commitId": "sha256:<new-chain-head>", "stateHash": "sha256:<after>"},
  "legacyRef": null,
  "challengeRef": null,
  "externalEvidence": [],
  "limitsProfile": "replay-segment/1"
}
```

### 4.1 驗證程序

1. 有界讀取／嚴格 parse／shape／版本檢查。拒絕 duplicate keys、原型鍵、超深結構、不安全整數、未知輸入種類、非法路徑及未解析引用。不得執行包內 JS、宿主命令或任意 URL。
2. 驗新鏈與原始摘要；legacy 使用固定舊 reader，兩套命名空間不可混接。受理目的為 season 時先驗 account／grant／resource binding。
3. 從可信 registry 載入**精確摘要**的 engine／pack／judge；不存在則 unsupported，絕不改用最新版本。registry 來自部署配置，不接受上傳檔自帶程式或下載位置。
4. 按purpose驗起點。`compatibility`允許未簽snapshot／compact baseline，須驗封閉schema、全部state invariants、hash、必要blob／pack閉包；只驗自稱hash不足。來源未證標local-unverified，連續tail可回partial-compatible及`{fromSeq:baseline.seq,toSeq:head.seq,genesisAvailable:false}`（fromSeq為起始錨點，實際執行fromSeq+1起）；不推論被裁前綴可達。`season-challenge`必須是grant精確綁定的genesis或可驗server checkpoint，驗issuer／版本／subject／授權scope；同份未簽baseline回CHECKPOINT_UNTRUSTED，不降級繼續結算。缺tail必要輸入回缺口，不能把不連續範圍連成一段。
5. 在無外部副作用的隔離 worker 逐步執行 inputs；每個輸入完成一個原子交易，重新生成 semanticOutputs／effects／state。最早差異回傳 seq、差異類型與安全摘要，不外洩隱藏測資或未到章節正文。
6. 對照逐步 trace、最終 state、關鍵效果、生成事件／鏈尾。禁止從 client.delta 套用 state 後宣告一致。hash 相等之外，結算前還需核對結果是否真的滿足本次目標。
7. 生成帶 coverage 的 replay assessment。compatibility 到此結束；season 結果只產生 settlement intent，交 §6 的獨立權威交易。

### 4.2 Legacy／部分重放

RA1／schema 1 沒有的 arbitrary VFS、cwd、完整輸入、口令或無 commit 時鐘不可逆推出來。可以做資料投影／已知事件相容性檢查，但必須 `partial-compatible` 或 unsupported，不能把重算八碼鏈叫完整重放。

若附原本機 baseSave＋journal 且有精確舊 runtime，可按原浮點／事件順序嘗試 legacy replay；成功仍是 legacy coverage，不變成當季授權。失敗保留原 bytes，不能為使測試通過而「修正」時間、重新排序、補 flag 或重造舊鏈。遷移另產新事件及來源完整摘要，原 ID 不改。

## 5. 賽季發題與提交協定

以下是未實作的邏輯操作名，URL／HTTP 與資料庫產品待後端選型。帳號身分來自已驗證 session，不相信 payload 的 accountId；不把 token／email 放入可攜存檔。

### 5.0 ID 與毫秒映射（D18）

| 名稱 | 固定映射 |
| --- | --- |
| `workId` | **與 challengeId 一對一且值相同**，是 SEASON 的名稱，不是另一個 queue job ID |
| `submissionId` | 某 work 唯一被受理 proof 的冪等提交鍵；每 grant 僅一份 proof |
| `jobId` | 內部重放／OJ 工作 ID；系統重試可重用原 job，不創新 work／grant |
| `settlementId` | 同 turn／同 resource 起始版本的整批結算 ID；逐 work 收據共用此值 |
| `seasonTimeMs / seasonElapsedMs / turnDurationMs` | 前者為UTC epoch ms；elapsed=seasonTimeMs−seasonStartEpochMs；duration提案60000 ms，皆safe integer |

wire首選整數epochMs；本文ISO wire例只接受`YYYY-MM-DDTHH:mm:ssZ`（無小數／offset／本地時區，拒非法曆日／閏秒），parse所得epochMs就是seasonTimeMs。需要毫秒精度必傳整數；UI可用更寬的無損ISO顯示，不能截掉毫秒拿來簽章。issuedAt／expiresAt／resultDeadline／serverReceivedAt／settledAt／effectiveAt皆UTC epoch ms。`seasonElapsedMs=seasonTimeMs-seasonStartEpochMs`只用於季內相對位置；負值未開季，不發turn。`turnId=floor(seasonElapsedMs/turnDurationMs)`，區間為`[start+turnId*duration,start+(turnId+1)*duration)`。日界及02:00排程仍以SEASON的UTC曆日，週序以季始推導；不把epoch除60000直接當季內turn。

固定反例：start=1800000000000、now=1800000060000，兩服務seasonTimeMs皆1800000060000、elapsed=60000、turnId=1。serverReceivedAt恰等expiresAt或decisionTimeMs恰等resultDeadline均拒絕；比較兩側皆epoch。此為待實作向量，不是測試結果。

SEASON adapter 按固定規則給合格結果分配 turnId（基於權威 seasonTimeMs 與 60000 ms turn），提供該 turn 的起始 resourceVersion；客戶端不能自行指定或跨 turn 搬移結果。重放服務不另發明一套秒數或逐工單到達順序。

### 5.1 發題授權

| Grant 欄位 | 必須綁定的內容 |
| --- | --- |
| `grantVersion / challengeId / issuanceKey` | 單一挑戰、發題請求冪等鍵及版本；challengeId 就是 workId |
| `subject.accountId / teamId / authorizationEpoch` | 帳號與當時角色／隊伍權限；epoch 可使未結算授權失效 |
| `seasonId / rulesetVersion` | 明確賽季與規則，不能換季沿用 |
| `resourceId / resourceVersion / action` | 指定領地／目標／修補或攻擊操作及發題時版本；不可改另一目標 |
| `profileVersion / engineRef / packRefs / judgeRef` | 精確可重放／可判題環境 |
| `profileSeed / generatorVersion / initialStateRef` | 本題資料與合法起點；不能事後選容易的 seed |
| `nonce` | 伺服器產生的不可預測至少 128-bit 一次性值，唯一索引；簽章之外仍需狀態表防重送 |
| `issuedAt / expiresAt / resultDeadline` | UTC 伺服器時間；提交收件期限與異步判題結果期限分開，邊界規則固定 |
| `rewardPolicyVersion / limitsProfile` | 結算與限額政策版本，不接受客戶端追加獎勵 |
| `issuer / keyId / signature` | 對完整 grant payload 簽章，簽章外殼及 canonical bytes 按共用規格 |

`IssueChallenge(auth, issuanceKey, request)` 在單一交易中：核對帳號／賽季／資源權限、配額、expected resourceVersion；產生並保存 grant／nonce；扣一次發題配額。相同帳號＋issuanceKey＋相同 payload 返回原 grant，不二扣；同鍵不同內容 `IDEMPOTENCY_CONFLICT`。quota 的日界線／時區由賽季政策明示，伺服器時間決定。

例示授權（摘要與簽章均非真實值）：

```json
{
  "grantVersion": "challenge-grant/1",
  "challengeId": "challenge-example-8",
  "subject": {"accountId": "account-example-a", "teamId": "team-example-2", "authorizationEpoch": 4},
  "seasonId": "season-example-1",
  "rulesetVersion": "season-rules-candidate-1",
  "resource": {"id": "sector-example-17", "version": 23, "action": "repair"},
  "profileVersion": "harbor-histogram-shell/1",
  "engineRef": "sha256:<engine>",
  "packRefs": ["sha256:<pack>"],
  "judgeRef": "sha256:<judge>",
  "profileSeed": 427,
  "generatorVersion": "harbor-generator-candidate-1",
  "initialStateRef": "sha256:<issued-state>",
  "nonce": "<example-not-a-real-nonce>",
  "issuedAt": "2026-11-02T08:00:00Z",
  "expiresAt": "2026-11-02T08:30:00Z",
  "resultDeadline": "2026-11-02T09:00:00Z",
  "rewardPolicyVersion": "repair-reward-candidate-1",
  "limitsProfile": "replay-segment/1",
  "issuer": "configured-season-service",
  "keyId": "key-example-1",
  "signature": "<example-not-a-signature>"
}
```

例子的 30／60 分鐘不是正式賽季政策；有效期限必須由經量測的 ruleset 設定。seed＋nonce 綁工作與防重送，不阻止分享通用管線／演算法，也不證明真人。每帳每日配額只能限制單帳活動，**不能宣稱防 Sybil／大量小號**；任何另加的濫用政策要另行驗證，不混入故事門檻。

### 5.2 提交與可靠重送

| 邏輯操作 | 行為 |
| --- | --- |
| `SubmitChallenge(auth, submissionId, challengeRef, payloadDigest, proof)` | 硬規則／授權通過後原子受理，記 serverReceivedAt、綁定首份 payload、把 nonce 標成已受理；存工作後才回 accepted |
| `GetSubmission(auth, submissionId)` | 僅本帳／明示授權者可讀；取得 queue／驗證／結算狀態，不信 client 自報完成 |
| `CancelChallenge(auth, challengeId, cancellationKey)` | 冪等撤銷未結算工作，寫 tombstone／epoch；Worker 盡快停止，遲到結果不得結算 |
| `RetrySubmission(auth, submissionId)` | 使用相同不可變 payload 續查／重試系統工作；不是另建一次成功機會或二次扣額 |

受理條件為 `serverReceivedAt < expiresAt`；恰等於 expiry 拒絕。此時間是在驗完入口、原子保存受理記錄時由伺服器產生，不採 client.sentAt 或本機牆鐘。收件前斷網，客戶端不知道是否已受理時，先用原 submissionId 查詢／重送，不生成新 ID。

- 同 `(accountId, submissionId)` 同 payload 返回同一工作／結果；不同 payload 拒絕。每個 challenge 只綁定一份被受理的 proof；不同 submissionId 搶同 nonce 時，只有一份原子綁定成功，其餘回 `ALREADY_SUBMITTED`，不再排第二個 job。
- 格式／上限／授權在受理前失敗，不消耗 submission slot；已受理後若語意重放失敗，challenge 終結為 rejected，不能換 proof 重試同 nonce。新的解題嘗試必須領新 grant／work 並受發題配額；服務崩潰只重試原 job／同 proof，不算玩家錯誤。
- 被受理時及時，排隊期間超過 expiresAt 不倒改成遲交；到 resultDeadline 仍未完成則回明確 timeout，系統責任可依政策補發**新 grant**並記關聯，不改原收件時間。
- offline outbox 不代表伺服器已受理；UI 必須區分「本機待傳／伺服器已收／已驗證／已結算」。

### 5.3 時間的誠實邊界

`issuedAt → serverReceivedAt` 是領題到收件的經過時間，包含網路、排隊前的傳送、閱讀、掛機與等待。`verifyStartedAt → finishedAt` 是服務處理時間。兩者都**不是玩家實際投入時間**；客戶端 r、鍵入間隔、虛擬時間也不能證明真人解題耗時。排行若採收件先後，只可稱「伺服器受理次序」，不能宣稱最快真人思考時間。

## 6. 權威結算、競態與收據

```text
ISSUED → ACCEPTED → VERIFYING → PROOF_VALID → BATCH_PENDING → SETTLING → SETTLED
   ↘ EXPIRED        ↘ REJECTED       ↘ SETTLEMENT_REJECTED
   └──────────────→ CANCELLED（未結算時可撤銷）
系統暫時失敗：RETRYABLE_SERVICE_ERROR → 原 job 重試
```

PROOF_VALID 只是規則結果，不能先加地圖再等收據。驗證 worker 只有唯讀資料與返回 assessment 的能力；不持有直接更改領地的通用憑證。

依 D18，結算服務先按 `(seasonId,turnId,resourceId,startingResourceVersion)` 聚合同 turn 的有效工作，按 SEASON 規則計算整批效果；**不是逐工單先到者勝**。候選按 workId 穩定排序，重試批次不得漏掉已納入的有效工作，也不能把 worker 回覆順序當得分順序。

在**整批同一原子交易**中：

1. 逐 work 重新檢查 grant／subject／authorizationEpoch、取消／撤銷、賽季有效性、resultDeadline、profile／judge／pack、reward policy 與目標。被取消、失權、到期者排除並記拒絕原因；**排除後重新計算整批合計**，不得沿用先前聚合數字。
2. 對每件檢查唯一鍵 `(seasonId,workId,rewardPolicyVersion)` 未結算，去除重複 proof／receipt。無剩餘有效工作時僅記整批無效果結果，不升 resourceVersion 或發獎。
3. 比較 resource 現版與該 turn 起始版本；不同 turn、GC 或另一已提交批次已改版則 `RESOURCE_STALE`，不把舊 delta 重套新世界。同批的兩件工作不互相製造 stale。
4. 依 SEASON 的確定性聚合函式產生效果，**整批一次 CAS** 更新資源版本；同時寫 batch ledger、逐 work ledger／SETTLED 狀態、逐 work receipt／outbox。它們共用 settlementId、before/after resourceVersion，各自保留 contribution／result 範圍；全部成功或全部回滾。
5. 批次 commit 前若有新的取消／權限或期限變更，重新檢查／重算；遇序列化衝突重試同 batch，不先發布成功再補扣。截止／ready membership 由 SEASON 的固定 turn 政策決定，遲到結果不得由 client 移入較早批次。

收據傳送失敗不撤銷已完成交易；可從 ledger 重取同一 receipt。簽章／發布用 transactional outbox，重送不重做世界效果。取消先贏交易則無獎勵；結算先贏則取消回 `ALREADY_SETTLED`，不偷偷刪已結算歷史。後續管理撤銷需要有因由的補償事件與新版本，不假稱原交易沒發生。

兩人同 turn 修補同一起始 resourceVersion，兩份有效 proof 都進聚合，整批一次 CAS 並各得自己的收據；不能讓第一件結算把第二件判 stale。不同 turn／已被 GC 或其他已提交批改版才 stale。GC／賽季結束／授權取消與 batch 結算走共同序列化 ledger，不能由客戶端時鐘排序。符合故事憲章的雙 root 衝突若未有完整規則，不在此自創權限分配；批次原子性不代表已解決敘事授權條件。

### 6.1 收據欄位

| 欄位 | 契約 |
| --- | --- |
| `receiptType / receiptVersion / receiptId` | 明確 `season-settlement`，與 `replay-attestation`／`judge-receipt` 不可互換 |
| `issuer / keyId / algorithm / signature` | 部署 trust registry 中的 allowlist 演算法與公鑰；拒絕 none、payload 內任意 key URL；輪替／撤銷有版本 |
| `subject / seasonId / challengeId / submissionId / turnId` | 綁帳號、賽季與原受理工作／批次 turn；challengeId=workId；轉寄不轉移權利 |
| `grantDigest / payloadDigest / versions` | 說明驗的哪一份資料、哪個規則；不能只簽一句 AC |
| `result / stateHash / outputDigest / effectsHash / coverage` | 重算結果及覆蓋範圍；不靠 client 自報 hash |
| `settlementId / resourceBeforeVersion / resourceAfterVersion / effectSummary / workContribution` | 共用整批結算 ID 與世界效果，另記各 work 的貢獻；不能拿同 batch 的另一收據再領一次 |
| `serverReceivedAt / settledAt / status` | UTC 權威時間、有效／撤銷狀態；不是人類耗時 |

公開 key 輪替需保留可驗歷史收據的必要公鑰及撤銷紀錄；離線只可驗簽章與已快取政策，不能宣稱知道最新撤銷。一般本地 hash／自簽收據不等於受信任 issuer。canonical JSON 沿用 SAVE 的 C(value)；簽章用 payload 排除 signature 的 C bytes，固定 protocol／receiptType／version 防跨用途混用。簽章演算法、key provisioning／rotation 尚待後端選定，不接受各服務自行替換 C 規則。

## 7. 資源上限、惡意檔與拒絕副作用

下列是 `replay-segment/1` 的**提案配額**，需壓測後固定版號；不是目前主機規格或已達 SLA。SAVE_SCHEMA_2 的容器上限若更小，兩者取較小值；legacy reader 保留原更嚴格限制。

| 資源 | 預設／拒絕方式 |
| --- | --- |
| 入站 bytes | 每 segment 未壓縮 8 MiB；若協定允許壓縮，壓縮 2 MiB 且串流 inflate 即時計數；拒絕多串流／尾隨垃圾／壓縮炸彈 |
| 結構／輸入 | 深度 ≤ 32、100,000 個 JSON 節點、最多 10,000 inputs；單指令 4 KiB、單 edit 64 KiB；所有數值需 safe integer |
| 語意輸出／VFS 工作量 | 輸出累計 8 MiB、VFS 增量 8 MiB、最多 5,000,000 workUnits；產生日誌使用固定生成器與有界迭代，不能無界實體化 |
| 隔離工作 | 每 worker 記憶體 256 MiB、CPU 10 秒、wall 30 秒上限；可硬終止；實際 runtime 限額能力未確認前不宣稱落實 |
| 同帳排隊 | 提案 1 個執行、3 個待處理；全站 queue／concurrency 由部署設定，超限回 retry-after，不無限排隊 |
| 參照解析 | 最多 32 個 pack／external refs；不允許任意外部 fetch／巢狀分享包／循環引用 |

完整主線超過 segment 預算時，使用版本固定的連續分段與已驗 checkpoint；每段有 before/after refs 串接。只有從允許起點到目標的**全部必要段**都通過，才能聲稱該 coverage 可重放；缺段不以 snapshot hash 填補。賽季 challenge 的大小必須在發題前符合其 profile 預算，不能把合理解答事後卡在服務上限。

防護與恢復要求：

- 入口先擋大小與語法，再分配大 VFS／解壓／載入 pack；惡意檔不得觸發網路、宿主檔案寫入、任意 shell／Python／JS 執行。
- 未知 pack、非法 snapshot、無窮排程、輸出洪水、極端 regex／path、iterator 不結束均可中止；worker kill 後釋放暫存、iterator、記憶體與 job lease。
- 重放環境不能用真 Bash 執行不可信玩家輸入；repo 的開發機 Bash oracle 只供可信固定測資，與服務沙箱無關。
- 拒絕／取消／timeout 不變更本機 active save、遠端同步指標、領地、貨幣或徽章；必要的受理／拒絕 audit 與既已發題的配額記錄可保留，不混稱世界效果。診斷資料最小化，原始輸入可能含個人文字。
- 玩家可下載自己的拒絕摘要與原始本機檔；服務不自動把對方 payload 或未到章節內容回給錯誤頁。資料留存／刪除期限及支援取證流程仍待確認，預設不新增公開排行榜以外的文字暴露。

## 8. 結果碼與重試語意

| 碼 | 類別／行為 |
| --- | --- |
| `REPLAY_COMPATIBLE / REPLAY_PARTIAL` | 一般重放結果；有 coverage，無競賽授權升級 |
| `ACCEPTED / VERIFYING / PROOF_VALID / BATCH_PENDING / SETTLED` | 不同階段；PROOF_VALID 不等於領地到帳，只有 SETTLED 能回當季結算收據 |
| `FORMAT_REJECTED / LIMIT_EXCEEDED / UNSAFE_REFERENCE` | 入口拒絕；無世界副作用，不拿未知資料執行 |
| `VERSION_UNSUPPORTED / CHECKPOINT_UNTRUSTED / COVERAGE_GAP` | 環境或起點不夠；不是作弊指控；補精確版本／資料後另作評估 |
| `CHAIN_MISMATCH / STATE_MISMATCH / OUTPUT_MISMATCH / EFFECT_MISMATCH` | 回首個分歧序號及安全摘要；保留原檔，不自動修 hash |
| `AUTH_REQUIRED / SUBJECT_MISMATCH / GRANT_INVALID / AUTH_REVOKED` | 授權不符；不得結算或轉寄權利 |
| `GRANT_EXPIRED / RESULT_DEADLINE / SEASON_CLOSED / RESOURCE_STALE` | 時間／賽季／資源不符；不能偷換 seed／目標／賽季 |
| `IDEMPOTENCY_CONFLICT / ALREADY_SUBMITTED / ALREADY_SETTLED` | 按原鍵返回既有工作或拒絕不同 payload；不二次結算 |
| `CANCELLED / QUEUE_LIMIT / WORKER_LIMIT / SERVICE_ERROR` | 取消或服務故障；適用時重試同工作；不可把宿主不穩定寫成玩家 WA |

## 9. 正負驗收

以下均為**未執行的驗收計畫**。瀏覽器／Node 對照須記錄精確平台與版本；代理、測試程式與真人試玩分開列證據。

| ID | 正／負 | 驗收 |
| --- | --- | --- |
| REPLAY-001 | 正 | 同 engine/pack/judge/gen/seed/inputs，在瀏覽器與 Node 逐步 state、output、effects、完整鏈一致；不只 final head |
| REPLAY-002 | 負 | 保持 inputs 不變，竄改 delta／完成 flag／獎勵後重算所有 client hash，仍因權威重放不一致被擋 |
| REPLAY-003 | 負 | client input hash 合法但捏造 output、跳中間操作、插入「AC」文字，各回對應 mismatch |
| REPLAY-004 | 正／負 | 同 seed 版本固定可重現；換 engine／pack／judge／comparator／locale 版本須明確 unsupported 或新 profile，不默認 latest |
| REPLAY-005 | 正／負 | 原八碼鏈原樣保留且用 legacy reader；只有八碼／缺 journal 不能宣稱完整重放或新 hash 驗真 |
| REPLAY-006 | 負 | 自填 snapshot hash 不能當可信 checkpoint；缺必要分段回 partial／gap，無競技收據 |
| REPLAY-007 | 正 | 合法人工輸入與相同腳本輸入可得到相同 compatible 結果；標籤不稱真人或無腳本 |
| REPLAY-008 | 負 | 無事前 grant 的離線全通關，即使 server 重放成功也無當季領地／積分／verified 收據 |
| REPLAY-009 | 正／負 | IssueChallenge 同鍵同 payload 回同 grant／一次扣額；同鍵異 payload 拒絕；每日帳號額度不宣稱防小號 |
| REPLAY-010 | 負 | 換 account／team epoch／season／resource／profileSeed／nonce／版本或偽簽名均拒絕授權 |
| REPLAY-011 | 正／負 | 網路遺失受理回覆後同 submission 重送返回同 job；兩份不同 proof 搶 nonce 最多一份受理 |
| REPLAY-012 | 正／負 | expiry 前受理、排隊後才跑依 resultDeadline 處理；expiry 同時／之後才受理拒絕；client.sentAt 不影響判定 |
| REPLAY-013 | 負 | 取消先贏時晚到 Worker／OJ callback 零結算；結算先贏取消回 ALREADY_SETTLED，不刪歷史 |
| REPLAY-014 | 正／負 | 重複 callback／同收據改名轉寄／outbox 重送都只一次 ledger；授權不是 receipt 的可轉移資產 |
| REPLAY-015 | 正／負 | 同 turn／同起始版本兩個有效 work 全納入一次 batch CAS，各有同 settlementId 的收據；排除取消／失權／到期項後重算；不同 turn／GC／已提交批改版才 stale；失敗不留半筆 ledger |
| REPLAY-016 | 負 | 壓縮炸彈、尾隨串流、重複鍵、深層 JSON、原型鍵、非法 VFS、循環 refs、任意 pack URL 於限額內終止，無外部 I/O |
| REPLAY-017 | 負 | 無窮工作／輸出洪水／超記憶體 worker 被終止；原 save／同步指標／領地不變，資源／lease 釋放 |
| REPLAY-018 | 正 | 主線閱讀／失焦／離線不推進虛擬鐘；伺服器收件／處理時間標為不同時鐘，不顯示「實際遊玩耗時」 |
| REPLAY-019 | 正／負 | judge receipt 作合法 external input 可重放套用；無簽章／錯 mapping 不能變 AC；重放不再次向 QDUOJ 送出 |
| REPLAY-020 | 正／負 | key rotation 仍可驗歷史；撤銷未知明示；replay-attestation／judge-receipt 不能冒用 season-settlement |
| REPLAY-021 | 正／負 | 出現狀態相同但輸出不同、中間重複獎勵後回退、未裁剪輸出被改動，都不能只靠 final hash 通過 |
| REPLAY-022 | 正 | 長主線分段 coverage 可查；缺段不猜測；有授權 challenge 斷網後及時重送仍保有原 job 與一次結算 |
| REPLAY-023 | 正／負 | 以另一條合法 inputs 重新生成全部 state/output/effects 可 compatible，但不得因此宣稱原檔未被改過、真人操作或無授權離線成績可升競賽 |
| REPLAY-024 | 正／負 | workId=challengeId；受理後語意失敗的新 proof 需新 grant／配額，系統重試仍用同 job；不得因 SEASON alias 重複發單或重領 |
| REPLAY-025 | 正／負 | ISO Z 無小數例與整數 epochMs 精確映射；拒小數／模糊時區／溢位；turnDurationMs=60000；相同批次重算與 callback 順序不改效果 |

## 10. 責任、部署取捨與未知

| 責任角色 | 交付／尚未確認 |
| --- | --- |
| 引擎／存檔 | 已對齊 beforeStateHash／afterStateHash／effectsHash／commitId／Input及OutputRecord；ReplayAssessment尚缺精確schema（ENG-M6-REPLAY-ASSESSMENT），renderer oracle、trusted checkpoint與coverage producer仍未實作 |
| pack／判題 | 資料生成器、profile／comparator 版本、合法目標、輸出與效果 oracle；不以 sample tests 冒稱完整題相容 |
| 後端／帳號 | authentication、grant 簽章、nonce／idempotency 唯一索引、隊伍權限撤銷、CAS／原子 ledger、outbox 與 job lease |
| 維運 | worker 隔離／CPU 記憶體硬上限、公鑰輪替、資料保留政策、可信版本 registry；主機與 QDUOJ 容量目前未取得 |
| 產品／經濟 | 發題與結果期限、quota、resource stale 的補發政策、排名名稱及結算規則；沒有數字實測前不宣稱平衡或防 Sybil |
| QA | REPLAY-* 跨端與惡意輸入／競態突變、服務崩潰恢復；真人與效能證據另記 |

規模提案：先對不超過 20 帳號的賽季試行做有界負載測試，記錄 job 延遲、拒絕率、記憶體及重送／結算重複率。這是負載假設，不是已知 DAU 或主機能承受的承諾。Worker concurrency × 每 worker 配額只估算重放工作集，不能當全站記憶體總量；資料庫、版本 registry、queue、OJ 要另計。當等待時間或配額拒絕妨礙合法解題時，先量測再調 profile／容量並升版本，不降低語意驗證。

取捨：精確版本與完整覆蓋使重放較昂貴，但能指出真正差異；部分離線記錄保持可讀卻不授競賽權，避免把缺資料當造假或把可達性當真人證明。尚未決定的服務框架、資料庫、簽章演算法、主機規格與 QDUOJ API 均不阻擋本邏輯契約編寫，也不代表已有可部署服務。

已完成映射：ReplayStep→reduce/coordinator、actorId→profile.playerId、runId→lineageId、versions／Input／journal hashes／OutputRecord、reader assessment、workId=challengeId 與 D18 batch settlement。ReplayAssessment依§3.1明列M6 schema blocker；其他真未知為簽章fact契約／部署、可用精確runtime registry、worker硬隔離、SEASON ready/deadline參數與公平性、金鑰輪替、QDUOJ API／容量。JSON 範例不定義另一套根 schema，外層規格完成不代表producer已實作。
