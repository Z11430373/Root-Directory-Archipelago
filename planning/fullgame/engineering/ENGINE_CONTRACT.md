# 共用引擎契約

版本：0.2-draft｜2026-11-02｜**採用的規劃基線，尚未實作、尚未執行本文件驗收**。

決策上位來源：[DECISIONS](../DECISIONS.md) D05–D09、D11–D15、D17、D19–D20。本文件是引擎共用欄位、時間與交易語意的命名權威；編碼與雜湊算法由 [SAVE_SCHEMA_2](SAVE_SCHEMA_2.md) 定義，內容版本由 [CHAPTER_PACK](CHAPTER_PACK.md) 定義。其他代理不要另造 `worldTime`、全域 `flags` 或另一個 `stateHash` 算法。

## 1. 現況、目標與交付範圍

| 可回查的現況 | 新版實作工作 |
| --- | --- |
| `demo-app/src/engine/index.js` 是 JavaScript ES module、可變的 `Engine` class；交易成功後才發布輸出。 | 漸進抽出 TypeScript 的純規則核心與宿主 adapter；不得把「規劃 TS」寫成既有程式。 |
| `src/vfs.js` 使用 Map／共享 inode；`clone()` 隔離 VFS，但刻意共用 flags。 | `branches[branchId]` 隔離 flags、VFS、時鐘、PRNG、runtime；舊共享 flags 僅留在 legacy adapter。 |
| `src/storage.js` 的本機 envelope 有 `save + baseSave + journal + runMode`；RA1 只有 durable 事件。 | schema 2 可攜完整世界；不把本機 journal 假裝原本就在 RA1。 |
| `Engine.feedCommand()` 每次增加 30 世界秒，渡海再加 600 秒；`advance(dt)` 接浮點秒，宿主換算 wall clock。 | 新規則以整數虛擬毫秒、明示成本與推進操作為準；是有版本的語意變更。 |
| `build.mjs` 將 JS、CSS、資料、Worker 嵌入單檔 HTML，CSP `connect-src 'none'`。 | 保留單檔活動發行；靜態站／Service Worker 是另一發行 adapter，非引擎必要依賴。 |
| `loggen.js` 先實體化日誌，`shell/commands.js` 的 sort 收集全部行。 | 百萬行惰性資料與外部排序另做 spike；目前沒有完成或性能通過的證據。 |

現況來源另見 [`SOURCE_GUIDE.md`](../../../SOURCE_GUIDE.md)、[`demo-app/ARCHITECTURE.md`](../../../demo-app/ARCHITECTURE.md)、[`ENGINE_REQS.md`](../../../ENGINE_REQS.md)。原規劃的「schema 2 只加欄位」已由 D09 改為明確新格式；Python／GNU 對照只對已宣告語意有效，不覆蓋新版時間、分支或遊戲 extension。

### 1.1 模組邊界（建議目錄，尚未建立）

```text
兩種 UI / Node replay
  -> SessionCoordinator（序列化、cancel、持久化）
  -> validateInput + reduce(state, input, immutableContent)
       -> parser/command registry -> VFS working copy
       -> ordered rules / scheduler / judge facts
       -> nextState + effects + presentation
  -> canonical/hash -> journal -> StorageAdapter 原子提交
  -> 已提交 effects 通知 UI；presentation 轉文字節點
```

建議 `core/`、`content/`、`save/`、`adapters/` 的 TS 邊界；檔名可隨現有結構調整，但核心不得 import DOM、storage、fetch、timer 或宿主 shell。Worker 是執行位置，不能成為另一套規則。Hash adapter 可非同步，但對相同 bytes 必須產生相同 digest。

## 2. 相容版本與確定性範圍

`versions` 是封閉物件，全部必填：

| 欄位 | 型別／基線 | 意義 |
| --- | --- | --- |
| `engineVersion` | 字串，例如 `0.2.0` | 可定位的執行器發行版；建置清單另記 bundle hash。 |
| `rulesVersion` | 字串，例如 `fullgame-rules/1` | 時鐘、規則次序、交易與 PRNG 消耗的語意版本。 |
| `commandSetVersion` | 字串，例如 `ra-shell/1` | [COMMAND_COMPATIBILITY](COMMAND_COMPATIBILITY.md) 的精確命令合約。 |
| `stateSchemaVersion` | 整數 `1` | EngineState 欄位版本，不等於外層 save schema 2。 |
| `hashVersion` | `ra2-c14n-sha256-v1` | canonical、domain separation、完整 SHA-256。 |
| `contentSetHash` | 64 位小寫 hex | 精確 `packRefs` 集合摘要，算法見 CHAPTER_PACK。 |

- 相同 EngineState、Input、精確內容集及上述語意，必須得到相同 nextState、effects、stateHash、effectsHash；不依電腦時區、語系、CPU 快慢、容器插入次序或 Worker 分塊而變。
- 預設**精確版本匹配**。新 engine 可透過隨發行的相容矩陣執行舊 tuple；矩陣須有跨宿主向量，不能只以 semver major 相同判斷。執行舊語意時保留舊 `versions`，另於非權威診斷記錄實際宿主 build。
- 未知 engine／rules／command／hash／state／內容版本：`ENG_VERSION_UNSUPPORTED`，只讀預覽與下載原件，不執行、不自動升版。下載相容 runtime 是使用者另選的操作。
- M1 的「四條舊 walkthrough 逐 commit 相同」只適用**legacy 語意模式**：原秒數、原事件次序、八碼 ID 均保留。新版 rules 的零時間查詢、分支隔離不可能仍要求舊鏈逐位一致；另建「投影結果＋明示差異」向量。
- 規則修正即使結果看似更合理，也不能以新規則驗舊鏈；提供有版本的遷移，產生新 lineage／baseline 並保留來源。

## 3. 公開介面與輸入

核心規劃介面：`reduce(state, input, resolvedRefs) -> {nextState, effects, presentation}`；`query(state, queryInput, content) -> view`；宿主提供 `dispatch(input)` 與 `cancel(inputId)`。resolvedRefs 僅含由 state/input 中完整 hash 指定並預先驗證的 immutable content、blobs 與 snapshots；不能含讀時間／下載 latest／查 mutable storage 的 callback。如此 seed、版本、所有外部輸入皆明示，核心沒有 I/O。Hash／I/O 放在 coordinator，輸入前後狀態視為 immutable。

| Input 欄位 | 型別／驗證 | 所有者 |
| --- | --- | --- |
| `inputId` | 1–96 ASCII 字元，`[A-Za-z0-9._:/-]+` | UI／replay 保留原值；不是隨機證明。 |
| `expectedStateHash` | 完整 stateHash | 防過期畫面、競爭寫入。 |
| `branchId` | 1–64 ASCII 字元；須為 `activeBranchId` | 執行目標；非自由切換旗標作用域。 |
| `kind` | 下表已註冊種類 | 不接受任意 RPC 方法。 |
| `payload` | 各 kind 的封閉 JSON 物件 | 不接受未宣告欄位或可執行字串。 |

| `kind` | payload | 語意 |
| --- | --- | --- |
| `command.execute` | `{raw}`，UTF-8 ≤ 16 KiB | 原字串保留；不 trim 掉謎題所需空格。Shell parser 與對話輸入分離。 |
| `file.edit` | `{islandId,path,expectedContentHash,content}` | TICKET §5.2 的四欄封閉 payload；content 為 inline Unicode 字串、UTF-8≤64 KiB；新檔以 expectedContentHash=null 表示。零故事時間，見 §3.2。 |
| `dialogue.respond` | `{nodeId, value}` | 驗證目前節點，大小／空白規則由節點宣告；八空格謎題尚待正文，不猜規則。 |
| `choice.select` | `{choiceId, optionId}` | 明確識別選項；過期選擇拒絕。 |
| `time.advance` | `{deltaMs, reason}` | 正整數，自訂推進；reason 為 `manual` 或已宣告 action ID。 |
| `branch.create` | `{branchId,scenarioId,source}` | source 是 `{kind:"checkpoint",checkpointId,checkpointStateHash}` 或 `{kind:"template-entry",entryId,manifestHash}`；只允許 pack 已登錄入口。模板入口明示無舊歷史，不能當原 snapshot。 |
| `branch.leave` | `{mode}`，`abandon`／`merge-knowledge` | 回 main；只合併合格知識，不攜回任意世界改動。 |
| `knowledge.import` | `{stagedImportHash}` | 指向 §3.3 的 KnowledgeImportStaging/1；經 MERGE §5.2 再驗 share／fact／接受清單。 |
| `ticket.resolve` | `{resolutionRef}` | 指向 TICKET §2.2 的 TicketResolution/1；核心核對結果，不直接套玩家聲稱的 progressAfter。 |
| `system.fact` | `{factRef}` | 只接受 §3.3 明列可走此入口的 fact；本版為受 import adapter 控制的 MergeResolutionFact/1。玩家 Shell 不能自行呼叫。 |

`stagedImportHash`／`resolutionRef`／`factRef` 都是各自封閉 DTO 的 canonical UTF-8 bytes 之 raw blobHash；被指向資料必須隨 replay bundle 保存，不能讀「最新伺服器回應」。核心再次核對引用、版本與來源；adapter 授權資訊不能僅由客戶端欄位宣稱。具體 registry 見 §3.3；OutputRecord/1 已登錄為證據 blob，ReplayAssessment 明列 §3.4 的 M6 schema blocker，不能因入口叫 system.fact 就接受任意 JSON。

COMMAND標為typed-only的故事checkout/merge/abandon與game choose，adapter只產生對應typed input一次；若直接以command.execute繞過，核心回 `ENG_INPUT_KIND_REQUIRED`，不偷偷走第二條transition。保留原輸入的顯示紀錄不作另一筆journal。

可解析的輸入結構樣例（全零 hash **僅佔位，不是驗收 fixture**）：

```json
{
  "inputId": "input:000001",
  "expectedStateHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "branchId": "main",
  "kind": "time.advance",
  "payload": {"deltaMs": 1000, "reason": "manual"}
}
```

同一 `inputId` 與相同完整 input 再送：coordinator 若仍保留對應 journal，回原結果、不重做；相同 ID、不同內容為 `ENG_INPUT_REUSE`。已裁切的舊 ID 不能靠缺紀錄重送；`expectedStateHash` 必須匹配目前狀態，重試有疑義時重新預覽並發新 ID。單一 session 一次只准一筆 dispatch；跨頁寫入另由 SAVE_SCHEMA_2 的 revision CAS 保護。

### 3.1 查詢不是遊戲行動

`query` 僅供狀態／地圖／提示列表／存檔預覽／補全，**stateHash、seq、PRNG、storyTimeMs、journal 均不變**。不得呼叫舊 `summary()` 會 seal 的行為。可有本機 UI 統計，但不進世界狀態。

玩家實際 `cat`／`grep` 是 `command.execute`：檔案系統唯讀，仍可產生 `file.read`、發現或解題證據，故會有 journal 與 seq；其時間成本為 0。不可把 UI 背景預讀當玩家已閱讀。免費提示主動展開可以記錄 `hint.viewed`，時間仍為 0；不扣主線資源。

### 3.2 可重放 `file.edit`

- `islandId` 必須屬目前 branch.vfs.mounts；`path` 是該島規範絕對路徑、UTF-8≤4096 bytes、不能指目錄或逃出 mount，且須在目前分支 profile 允許的可寫工作區。payload 精確沿用 [TICKET_JUDGE](TICKET_JUDGE.md) §5.2，不接受其他內容引用欄位替代 content。
- `content` 是合法 Unicode scalar 字串，UTF-8 編碼後≤65536 bytes、無 NUL；空字串合法。保留實際 LF/CRLF、空格與 Unicode，不 trim、不 normalize。journal.input 保留全文；VFS 寫入另由 UTF8(content) 算 raw blobHash 並保存 bytes。replay 只讀這份 inline 輸入，不讀 editor 草稿／玩家磁碟。binary 編輯不在此能力內。
- `expectedContentHash` 為編輯器開啟時**有效內容**的完整 hash；null 僅在目標原本不存在時成立。套用時再核對現在 inode／有效內容及 input.expectedStateHash；有變更回 `ENG_EDIT_CONFLICT`，原草稿保留，不能盲目覆寫。
- 驗 readonly、mode／uid／gid、父目錄權限、profile 工作區限制；hardlink 必須更新同一 inode。新檔需要父目錄存在，不替玩家建立缺失目錄。指向 pack/variants 內容的普通可寫檔，成功寫入轉成 blob；readonly 檔不因 editor 來源而豁免。
- 開啟 editor 只是 query，不能作玩家 read evidence。若教學需要「玩家已讀」，必須另由明示閱讀動作產生 file.read；TICKET 不可把背景載入當讀過。
- 套用 storyTimeMs 成本0，但 mtime/ctime 改為 worldEpochMs＋目前 storyTimeMs；產生 `vfs.changed`。屬工單工作區時，同筆產生 §4.2 的 literal→write trace、externalFacts 引用與 `ticket.provenance.recorded`；手動編輯不能生成虛構 cut/sort/counting nodes。T0100 報告／T0427 top3 的接受範圍依 TICKET profile。
- 與 command 使用同一交易、seq、hash、取消及持久化入口；cancel／quota／驗證失敗不留半個檔。普通 editor 衝突／權限錯誤為拒絕 input，不寫成功 journal；UI 可以保存草稿，草稿不是世界狀態。

完整可解析的 file.edit 輸入結構樣例；全零 stateHash 是**佔位，非可執行驗收向量**。新檔 null 表示必須仍不存在，content 是確切要寫入的文字。

```json
{
  "inputId":"edit:000001",
  "expectedStateHash":"0000000000000000000000000000000000000000000000000000000000000000",
  "branchId":"main",
  "kind":"file.edit",
  "payload":{
    "islandId":"logport",
    "path":"/home/op/work/T0427/top3.txt",
    "expectedContentHash":null,
    "content":"10.0.1.1 3\n10.0.0.9 2\n10.0.0.10 2\n"
  }
}
```

### 3.3 輸入／fact／證據 blob registry

下列**已固定核心入口、外層欄位、wire 版本與保存位置；實作尚未完成**。owner 章節定義記錄與語意，不建立第二套同名 schema。登錄名字不代表每個巢狀子 schema 都已完整：尚缺精確定義者明列 §8.1，解除前不能接納相應資料或啟用能力。所有 DTO 拒未知欄位／版本；完整 refs 的引用閉包見 SAVE §7.1。

| 型別／schemaVersion | 唯一入口與 schema owner | 核心守衛／落點 |
| --- | --- | --- |
| `TicketResolution/1`：`ticket-resolution/1` | `ticket.resolve.resolutionRef` → [TICKET §2.2](TICKET_JUDGE.md#22-progressrecord-的固定映射) | expectedStateHash 必須等於 input.expectedStateHash；重算／驗證 route、profile、verdict、ProgressRecord 四欄及 evidenceRefs 一致性。原子套 progress、quest.resolved、一次性獎勵；externalFacts 加 `ticket-resolution:<resolutionRef>` → resolutionRef。 |
| `TicketEvidenceBundle/1`：`ticket-evidence/1` | TICKET §2.2；由 resolution.evidenceRefs／progress.evidenceRefs 引用 | 必須與 ticketId、profile、route、來源及 contentSetHash 相符；provenanceRefs／receiptRef／legacyRef 按 owner 驗。只作工單證據，不能塞進 knowledgeEvidence。 |
| `ticket-provenance/1` | TICKET §4.4；只由 command／file.edit／assisted 的核心 producer 產生 | externalFacts 的 factId 精確為 `ticket-provenance:<lineageId>:<branchId>:<seq>`，factHash 指 canonical trace；發 ticket.provenance.recorded。不是玩家可用 system.fact 匯入的事實。 |
| `KnowledgeImportStaging/1`：`knowledge-import-staging/1` | `knowledge.import.stagedImportHash`；MERGE §5.2 的欄位具體化見下 | receiver／policy／expectedStateHash 固定，重算接受與封存集合後才提交。staging 本身不新增世界根欄位。 |
| `KnowledgeImportFact/1`：`knowledge-import/1` | [MERGE §5.2](MERGE_SPEC.md#52-externalfactsblobs-的具體落點)；只由 knowledge.import 接納 | externalFacts 加 `knowledge-import:<importFactBlobHash>` → importFactBlobHash；同時加入合法原六欄 evidence，發 knowledge.accepted／externalFact.accepted。sourceBindings 是來源聲明，不是帳號認證。 |
| `MergeResolutionFact/1`：`merge-resolution/1` | `system.fact.factRef` → [MERGE §6.2](MERGE_SPEC.md#62-明示-resolution-事件) | 玩家已確認的 import adapter；核對兩原件／候選基線／expectedStateHash／已接納知識。externalFacts 加 `merge-resolution:<mergeId>` → factRef，只發 externalFact.accepted，不直接覆寫世界。 |
| `OutputRecord/1`：`output-record/1` | replay coordinator；[REPLAY §3.1](REPLAY_SPEC.md#31-邏輯執行模型)及 §3.4 | 證據 blob，outputDigest 是其 raw blobHash；不是 Input／fact／JournalRecord 新欄位。 |

**KnowledgeImportStaging/1** 精確六欄為 `{schemaVersion,shareBlobHash,importFactBlobHash,acceptedEvidenceIds,sealedEvidenceIds,expectedStateHash}`。兩清單是按 evidenceId 排序去重的 64-hex 陣列、互斥且涵蓋 share.evidence；未知／未到 reveal gate 的記錄保留 sealed，不作可用知識。接受清單必須等於 import fact 的 acceptedEvidenceIds；shareBlobHash 亦須一致。receiverRef／visibilityPolicyVersion 從所指 fact 取得：新 fact 的 receiverRef 必須為當前 lineage、active branch、待提交 seq；policy 必須是精確內容集准用的版本。核心重新計算接受結果，不能信 adapter 自填清單。便條／足跡／轉寄資訊僅由 share/fact 閉包導出，不新增根欄位。

同 shareBlobHash＋policy＋acceptedEvidenceIds 且同 receiver lineage／branch 的重送沿 MERGE 重用既有 import fact（receiverRef 保留原 seq）；staging 仍綁本次 expectedStateHash，不能用舊預覽越過 CAS。沒有新增證據時不重發 knowledge.accepted／獎勵。所有 factId 同 ID 同 hash 冪等、不同 hash 回 `ENG_FACT_CONFLICT`；不能用較新到達的聲明取代舊 fact。

**MergeResolutionFact/1 的核心綁定**：欄位精確沿 MERGE §6.2 範例，`inputs` 固定兩項 `{saveHash,rawBlobHash}`（local 在前、remote 在後）；本版只開放 operation=`self-sync`，resolution=`choose-local-world-keep-remote-branch` 或 `choose-remote-world-keep-local-branch`。名稱中的 branch 是保留平行來源的語意，實際保存兩完整 SaveEnvelope／槽，不是塞一個 branches key。commonAncestorRef 為已證明的完整 commitId；不能證明時用 null，僅提供平行匯入，不能冒稱 fast-forward。selectedWorldRef 是所選來源 head.stateHash，從保全原件重建核對，不把它當 raw blobHash。actorId 對應候選 profile.playerId；policyVersion 固定；knowledgeEvidenceAdded 為排序 evidenceId 清單，只能核對先前 knowledge.import 已接納的記錄。expectedStateHash 指候選提交此 fact **之前**的 state，不能指含此 fact 的結果以免循環。

self-sync adapter 從選定來源的合法 baseline＋journal 建新 saveId 候選；先在候選依法匯入可帶知識，再提交 resolution fact，全部成功才以 storage revision CAS 切 active。兩原 SaveEnvelope／原 bytes 均保留；raw bytes 超限按 SAVE §8 拒絕，不降格只存 hash。story-branch 的額外衝突 policy 屬 C1，未登錄不藉本入口執行。

### 3.4 OutputRecord 與 M6 明示缺口

D24比較邊界：各stdout／stderr自身bytes順序、commandStreams陣列次序、presentation陣列次序均嚴格比較；**不編碼／不比較stdout與stderr的chunk交錯、不同command串流與presentation之間的合流總序**。相同兩組陣列但renderer把對話插在不同stream之間，outputDigest可相同，不宣稱呈現總序相同。需精確相對時序的世界事件仍在有序effects，不可把規則藏到renderer。跨端fixture含兩command、雙stream及一則對話；更改任一bytes／陣列內序應失敗，只換跨組展示次序不在此oracle範圍。

OutputRecord/1 精確四欄 `{schemaVersion,seq,commandStreams,presentation}`，schemaVersion=`output-record/1`；seq 為對應成功 dispatch 的正安全整數。commandStreams 是按 effects 次序投影每筆 command.completed 的 `{rc,stdoutHash,stderrHash}` 陣列（無 command 時為 []）；presentation 是 reducer 的有序語意訊息陣列，元素為 §6.2 的純文字字串或封閉 `{channel,textRef,args}`，不含 DOM、捲動與截斷提示。`outputDigest = lowercaseHex(SHA256(UTF8(C(OutputRecord))))`，無 H("output") 前綴；blobs 保存這份 canonical bytes。比對必須重算完整 stdout/stderr，不能只驗 UI 截圖。

**M6 schema blocker `ENG-M6-REPLAY-ASSESSMENT`**：REPLAY 尚未給 ReplayAssessment 的精確欄位、wire schemaVersion、factId、逐 seq OutputRecord 引用及 receipt／coverage 綁定；本輪不註冊可執行的 ReplayAssessment fact。system.fact 收到此型別回 `ENG_FACT_SCHEMA_UNREGISTERED`，不得保存任意 JSON 後稱「完整接通」。解除須 REPLAY owner 提供封閉 schema／bounds、固定版本與起訖 hashes、輸出引用清單、驗證者與收據 scope、同一 fact 的冪等規則，並完成對應驗收。其簽章與跨端 renderer oracle 亦未實作。1.0 可本地重算／顯示 reader assessment；持久化 M6 評估／server-replayed 標籤須等此關卡。

## 4. EngineState 與分支

以下為封閉的持久規則狀態；所有會影響後續轉移的值都必須在其中或可由固定內容純推導。不得把難以序列化的 runtime 漏留在 class 私有欄位。

| EngineState 欄位 | 型別／語意 |
| --- | --- |
| `versions` | §2 物件。 |
| `lineageId` | 1–96 ASCII 字元，建立遊戲時輸入一次並永久保存；不是登入身份。 |
| `seq` | 非負安全整數；每次成功提交的 dispatch 加 1，包括正常 rc 非零結果。 |
| `profile` | `{playerId,nick,worldSeed}`；playerId 為1–96 ASCII字元不透明本地 ID，nick 為1–32個合法 Unicode scalar純文字、不含CR/LF/NUL，worldSeed 為 uint32。legacy原件nick限制不變。 |
| `origin` | `{kind,sourceHash,projectionVersion,starterId}`；kind 為 `new-game`／`legacy-projection`／`activity-starter`／`recovered`；其餘未適用為 null。 |
| `packRefs` | 排序的 `{packId,contentVersion,manifestHash}` 陣列；鎖完整版本目錄，bytes按CHAPTER_PACK §3.2分章水合；不可隱性升版。 |
| `activeBranchId` | `branches` 已有的 key；初始 `main`。 |
| `branches` | branchId → 下表 BranchState；最多 32 個保留世界。 |
| `knowledgeEvidence` | 已接受的知識證據集合，按 evidenceId 排序；不是主線選擇旗標。 |
| `rewardLedger` | main已領故事獎的 `{rewardKey,sourceRef}` 集合，按rewardKey排序；D21僅main結獎，sandbox不消耗此集合。 |
| `externalFacts` | 經接納的 `{factId,factHash}`，按 factId 排序；僅 §3.3 已登錄型別，完整資料在 blobs／replay bundle。也包括本地 provenance，不因名稱 external 就宣稱由伺服器背書。 |

| BranchState 欄位 | 型別／語意 |
| --- | --- |
| `parentBranchId` | main 為 null；分支為來源 branchId。 |
| `scenarioId` | main 為 null；分支為 pack 登錄的 B0/B1/B3b 等 scenario ID，不從自由分支名稱猜。 |
| `forkPoint` | null 或 `{sourceBranchId,seq,stateHash}`，指過去狀態，不指正在計算的 commit。 |
| `chapterId` | 內容集宣告的章 ID。 |
| `status` | `active`／`suspended`／`closed`；恰有一個 active。 |
| `principal` | `{uid,gids}`；模擬權限身份，gids 排序去重；不讀宿主帳號。 |
| `inventory` | 按 itemId 排序的 `{itemId,quantity,sourceRefs}[]`；實體道具與知識分開，quantity 為正整數，fragment 數量規則由 pack 限為1。 |
| `tags` | tagName → `{checkpointId,seq,stateHash}`；指當前輸入**之前**的 snapshot，不形成當前 hash 自我引用。 |
| `storyTimeMs` | 非負安全整數；此分支自己的故事鐘。 |
| `flags` | 排序且去重的旗標 ID 陣列。 |
| `progress` | 題目 ID → 已註冊 ProgressRecord；判題欄位見 §8。 |
| `storyProgression` | 活動 ID（如 B0/B1）→ InvitationResolution；邀請處理／故事通行與知識驗證分開，見下。 |
| `narrativeMemories` | NarrativeMemory[]，按 memoryId 排序；本人／peer／情境來源分開，見下。 |
| `pendingKnowledgeEvidence` | 此分支候選證據；退出時經 MERGE_SPEC 過濾才加入全域集合。 |
| `runtime` | 下述 runtime；包含等待玩家回應的狀態。 |
| `prng` | streamId → `{algorithm,stateU32,draws}`；algorithm 固定 `mulberry32-u32/1`。 |
| `vfs` | SAVE_SCHEMA_2 的 portable inode graph；含 cwd/home、跨島 mounts、分配計數器。 |

runtime 必填：`nodeId`（string/null）、`inputMode`（`command`／`dialogue`／`choice`）、`pendingChoice`（ID/null）、`onceRuleIds`（排序集合）、`hintLevels`（guideId → 0..3）、`scheduler`、`nextScheduleSerial`、`commandOrdinal`（非負整數）、`shellStatus`（0..255整數）、`bossStates`、`miniGitStates`、`endingState`。bossStates 與 miniGitStates 為領域 ID→`{schemaVersion,data}` map，可為空。未知子版本拒執行，不當任意 JSON 忽略。ticket evidence 的權威是 externalFacts／blobs（§4.2），不另存 runtime graph。

`shellStatus` 是跨命令 `$?` 的唯一權威，包含在stateHash、snapshot與compact baseline。新遊戲、活動／分支模板及legacy投影初始化0（不猜缺失舊rc）；checkpoint fork複製來源分支值。每個實際執行的simple command／pipeline完成時在候選shell環境更新，pipeline取末站rc；`;`與`&&`下一段先展開當時值，被短路跳過的段不更新。dispatch最後將最末執行段rc存回；正常非零、unknown127、已接納的parse error2均可提交。query、file.edit、dialogue／choice、ticket.resolve及其他typed非shell不寫shellStatus；typed-only捷徑亦不額外模擬一次shell。cancel／核心拒絕／儲存abort整筆回原值；leave恢復main自身值，restore依來源snapshot，不能讀已裁journal或UI私有欄位補猜。詳細文法見COMMAND §3.2。

**D21故事獎勵守衛**：只有activeBranchId=main且recipientBranchId=main可執行reward.granted及寫rewardLedger。sandbox判題可寫自己的progress／候選證據，獎勵階段明確略過，不產生故事幣或獎勵effect；不把整個判題誤拒為失敗。scenario練習資源由模板初始化，只供該分支，leave不搬回。main各route共用`rewardKey=C(["story-ticket",ticketId,storyRewardPolicyVersion])`，不含lineage／branch；其他故事獎使用pack登錄且跨版本穩定的語意鍵。政策改版須有防重領映射，不能換policy字串重發同一獎。普通fork／leave不回滾root ledger，知識匯入不發故事獎；較早main新槽沿SAVE §7.2繼承已領集合。

endingState 固定 `{schemaVersion:"ending-state/1",data:{status,endingId,choiceId,preEndingCheckpointId}}`，status=`playing`／`review`／`ended`；其餘可 null，review/ended 時要求有效 choiceId／preEndingCheckpointId，ended 才有 endingId。這是工程狀態，不填造未知結局名稱或條件。

每個 scheduler 項為 `{scheduleId,dueStoryTimeMs,ruleOrder,serial,eventType,payload}`。排序依 dueStoryTimeMs → ruleOrder → serial；serial 由 `nextScheduleSerial` 分配後加1，即使項目已觸發也不重用。計數器為安全整數且進 stateHash。排程資料是資料，不是函式／閉包。

旗標 scope 必須由 pack 登錄：`branch-world`（世界及主線抉擇）或 `branch-progress`（本地完成）。沒有預設全域 scope。知識與紀念證據不以 `flag.*` 偷渡。B0 把筆記刪除、支線選 block、分支程式結果都不能讓 main 檔案／主線選擇改變。離開分支恢復 main 的 VFS、cwd、時鐘與 PRNG；保留已選擇合併且過 gate 的證據。分支暫停期間不自動經過時間。

### 4.1 邀請處理與敘事記憶

InvitationResolution 固定 `{invitationStatus,handling,resolutionStatus,sourceRefs,evidenceRefs,legacyClaims}`：invitationStatus=`not-offered`／`offered`／`handled`；handling=null／`accepted`／`declined`／`deferred`／`assisted`／`completed`／`legacy-projected`；resolutionStatus=`unresolved`／`resolved`／`unknown`。sourceRefs 為完整內容 hash 陣列；evidenceRefs 指既有證據；legacyClaims 為 `{flagName,rawBlobHash,legacyCommitId}`。handled 表示已回應邀請，**不等於**故事 resolved，也不等於親自驗證。

B0/B1 邀請與舊 done gate 的衝突依 D19 裁決：新版主線 gate 使用純投影 `branchHandled(Bx) = main.flags 含 flag.bx.done OR flag.bx.deferred`，不新增另一個可寫 handled 布林。四個 flag 均登記 `branch-progress`、目標 main；storyProgression 只保存回應細節與來源，不另決定 gate。defer 為 handled/deferred/unresolved；真正退出為 handled/completed/resolved（只指故事處理，不指知識已驗證）。已存在的 deferred 作歷史保留，不因後來 done 而刪除。

`branch.leave` 依 scenarioId 的**封閉 exitSummary**允許寫 main 的相應 done；禁止把整個 branch.flags 聯集回來。B0/B1 merge 與 abandon 都可記 done；merge 缺必要證據則留在原分支、不先 done；abandon 不發卡。單一 done、deferred 或 skip 皆不足生成 K0/K1／親自驗證；legacyClaims 保留原宣稱，缺細節時 resolutionStatus=unknown，但原白名單 done 的通行能力可依版本化 legacy gate 保留，不捏造出入口事件。

NarrativeMemory 固定 `{memoryId,npcId,topic,value,subjectPlayerId,sourceKind,sourceRef,status}`。sourceKind=`self-history`／`legacy-self`／`peer-report`／`npc-scenario`；status=`recorded`／`conflicted`；sourceRef 固定 `{lineageId,branchId,seq,rawBlobHash,legacyCommitId}`，不適用欄位為 null。topic 與 value 由 pack registry 列舉，例如 `demo.vote` 的 `block`／`pass`。memoryId=`H("memory",記錄去掉 memoryId)`。

本人 legacy 投影須在 drop `flag.demo.*` **之前**從原 fold 擷取 demo.vote，subjectPlayerId 指此投影玩家，保留原件／原 commit 引用；peer import 則 subject 指來源玩家／未認證 legacy namespace、sourceKind=peer-report，不得寫成「你當時說過」。兩個互斥投票旗標同時存在時保留 conflicting claims，不能挑一個作 NPC 肯定記憶。所有 memory 影響對話且納入 stateHash；不能僅存在 UI annotations 或因匯入成功丟失來源。

### 4.2 跨指令 ticket evidence 的持久化登錄

採 [TICKET_JUDGE §4.4](TICKET_JUDGE.md#44-counting-provenance-子契約與持久化) 的 `ticket-provenance/1` 作唯一 trace schema：凍結 inputSnapshotRef、sourceRef、nodes（read-snapshot/project-ip/sort/group-count/copy/concat/literal/write）、coverage、sinks 及跨 trace parents 都按該節驗證。canonical trace bytes 放 blobs，externalFacts 保存 §3.3 的 factId／factHash。其完整引用進 stateHash，bytes／圖閉包再由 SAVE 驗證。

先前草案的`runtime.ticketEvidenceState`／inode.provenanceRef不列入持久schema。writer索引只可由權威資料純重建，清快取不得改判題／stateHash。**先重建起點，再套本lineage後續facts**：recovered世界先依RecoveryOrigin的P及其forkPoint可見範圍重建已驗writer視圖，再套目前lineage已接納的新facts；P若亦recovered，沿origin邊界遞迴，使用SAVE的visited／循環／深度／總量預算。只有同一lineage及可見分支範圍內才按sourceRef.seq數值序、同trace nodeOrdinal排序，不能跨代混排seq或依lineage／factId字串決定因果。

恢復只採P實際接納且可見的facts；E在P之後的trace即使因來源閉包留在blobs，也不進新世界writer視圖。新literal、同bytes覆寫及hardlink別名寫入都取代繼承writer；沒有新寫入則保留P合法來源。此順序由origin／facts／VFS／forkPoint純推導，不新增私有持久Map、不改原sourceRef／evidenceId、不將舊seq改號。compact／清快取／換宿主／再次reopen須得相同視圖；不能只憑相同contentHash認領舊counting證據。

`ticket.provenance.recorded.data` 精確 `{ticketId,profileVersion,sourceRef,factId,factHash}`，sourceRef=`{lineageId,branchId,seq}`；每筆必與所指 trace 同值。核心完成候選 trace、coordinator 在 hash 階段綁定其 raw blobHash，再驗完整候選與算 stateHash；VFS／trace bytes／externalFacts／effect／journal 同一 commit point 發布。此專用 effect 即記錄該 provenance fact，無需另發 externalFact.accepted；取消／失敗全撤銷。

為遵守 owner 的單一 `ticket-provenance:<lineageId>:<branchId>:<seq>` 鍵，一個 dispatch 最多產生一個 ticket/profile trace；同 profile 的多段管線／工作檔合併到同 trace 的有序 nodes/sinks。若單輸入需跨兩個 ticket/profile 寫入，准入時回 `ENG_TICKET_SCOPE`，要求拆成兩筆，不覆蓋同 factId。工作區歸屬與 bounds 由固定 profile 宣告，套用 TICKET §5.3 及 SAVE 上限的較嚴者。

每個被追蹤工作檔 writer（含 editor／echo／truncate／append／硬連結別名、同 bytes 再寫）都生成新 write sink；literal 改寫以 literal→write 取代舊 lineage，append 必含舊內容與新增 stream 的有序 parents。只有 read 過來源再貼答案不能生成 group-count。hardlink 不換 inode 身份；unlink 最後名稱後 allocator 不重用 inode；新路徑不能繼承舊 writer。分支只繼承 forkPoint 當時可達的來源 facts，不能讀到父分支其後或兄弟分支的 writer；匯入朋友的 trace 不能成為本人工作檔 lineage。

judge 接收 immutable `{stateView,ticketEvidenceView,artifactRefs,contentRegistry}`；ticketEvidenceView 僅為上述 facts 的純投影，artifactRefs 固定為讀／提交當下 `{islandId,deviceId,inodeId,contentHash}`。judge 只讀，回結果與所用 refs；核心才套 progress。至少能跨多筆 input 重建 `read → cut → sort → uniq-c → write → 再讀工作檔`，roundtrip／compact 不丟必要 trace parents／來源／artifact bytes。暫存 sort chunks 可清；已提交的 provenance facts 不可當快取清除。

### 4.3 D19/D20 的唯一動作映射

以下沿用封閉 Input registry，不另造 chapter/ending 根格式。新 pack 的 `actionBindings` 詳見 CHAPTER_PACK；GUI 與命令捷徑必須到同一 reducer。

| 操作 | Input／守衛 | 原子效果 |
| --- | --- | --- |
| B0/B1 稍後調查 | `choice.select {choiceId:"branch.offer.B0"或"branch.offer.B1",optionId:"defer"}`；active=main、對應已顯示邀請或可再訪選項、版本/gate有效 | main.flags 加對應 deferred，storyProgression 記 deferred；時間0、無卡、無進分支／done。 |
| 進入 Bx | `branch.create` 明示 scenarioId 與 snapshot hash／template manifest hash；先驗入口／版本／容量，main必須有效 | 保留完整 main；建立隔離世界，status切換；主線不先記done。template-entry 僅是legacy/活動入口能力，UI明示來源。 |
| merge／abandon | `branch.leave {mode:"merge-knowledge"或"abandon"}`；active非main、scenario exit有效；merge另驗必要證據 | 先驗全候選、合格知識去重（abandon為空）、main 恢復，套 exitSummary 指定的 done、退出紀錄；不帶物品／任意flags。 |
| 收藏 tag | `command.execute {raw:"git tag <name>"}`；目前分支存在、名稱未用、容量可 pin | 保存輸入前 S 的完整 snapshot，tags 指向 seq/S hash；發 snapshot.requested；仍留原分支，不記done、不卡、不退出。 |
| 主線章節旅行／回訪 | `command.execute {raw:"ssh <island>"}`；main、目標 route已登錄且guard有效、ending未ended、包完整 | 依明示成本處理鐘／排程；在同一 main VFS graph 切 mount/cwd/chapterId，已存在島不重建、首次才初始化；其餘進度／文件／PRNG不倒退。 |
| Ch3.5補訪 | 同上，固定目的 `cronmine`；從已開放回訪 route 進入 | 當前main旅行；B3b另走branch.create，線索合格才merge；F5只能由main已核定取件／協助action進inventory，分支物品不可帶回。未知取法不先啟用。 |
| 準備最終選擇 | `command.execute {raw:"ending prepare"}`；main、已達審查入口、已核定且完整的 ending policy、無pending交易 | 保存輸入前S為pinned `ckpt/pre-ending/<lineageId>/<seq>`；當前adapter原子提交snapshot＋新世界後才發布review／choice。durable須IDB成功；明選volatile可用完整memory pin，不能標持久保存。 |
| 返回調查 | `choice.select {choiceId:"story.ending",optionId:"return-investigation"}`；review | endingState回playing、解除pendingChoice；不restore、不發ending；之後ssh回訪，快照仍保留。 |
| 最終選擇 | `choice.select {choiceId:"story.ending",optionId:<已核定endingId>}`；review、全部必要/排除條件、pinned snapshot可讀且hash相符 | endingState=ended與明確主線選擇effect一次提交；不得靠卡片數／七八片必要條件猜充分條件。未知policy回ENG_CONTENT_UNAVAILABLE。 |

`snapshot.requested.data` 固定 `{checkpointId,seq,stateHash,pinned}`，只指向此次input的beforeState；coordinator按D17/D23以同一adapter交易保存原state bytes、history checkpoint及新世界。durable用IDB transaction；volatile用經閉包驗證的不可變memory generation一次換root，不能先發布tag／結局選單再存snapshot。pin保留策略相同，儲存模式是宿主狀態、不改世界hash；下載不是durable證明。snapshot hash不放自己的當前state內，避免循環。引用可讀性由coordinator提交前檢查，核心只用已驗證resolvedRefs。template-entry不冒稱snapshot restore。

ended後「重開結算前main」不是branch.create或review返回：呼叫SAVE §7.2宿主`reopen-main/1`操作，保留ended原槽，另建可玩main的新lineage／baseline；不得向封閉Input registry塞未註冊restore事件。所有候選先通過SAVE §8的state可快照與必要pin容量准入。

review期間僅接受story.ending選擇（含return-investigation）及query／宿主匯出，其他世界Input拒絕。prepare與final-select皆固定核心操作，pack只供guard／文字／選項，不掛任意副作用。final-select只改main.endingState的status／endingId、清pendingChoice、inputMode回command、seq加1並發一筆ending.selected；不改VFS／資源／flags／facts／scheduler，不加blob或checkpoint。endingId為1..96 ASCII ID；結局選擇以endingState為權威，不另造完成旗標。已知／未知policy共同遵守SAVE §8的64 KiB計量及逐維預留（完整最後record、JSON計數／depth與封裝），非正史fixture亦同。可選OutputRecord診斷匯出不在必要提交內，不得使已准入的最後選擇因選用資料而失敗。

旅行在原島與目的島的 cwd/home 設定由 route 的 targetPath 明示；原島檔案 graph／其他章 progress 留存。不得把舊 createWorld 換掉整個 main VFS 當回訪實作。1.0 不允許分支內自由跨章，除非該 scenario 額外登錄 route；不能藉ssh跨出隔離範圍。tag／ending prepare 成本0；後半 route／F5／ending正文未定只准非正史fixture研究，不啟用正式遊戲。

## 5. 三時鐘與自訂時間

| 時鐘 | 欄位／權威 | 可影響內容 | 暫停／失焦／離線 |
| --- | --- | --- | --- |
| 故事虛擬鐘 | `branches[id].storyTimeMs`；核心 | 明示排程、GC、Boss 行動節拍、檔案 mtime | 全部停止；只有被接受的時間操作或明示動作成本推進。 |
| 活動牆鐘 | `annotations.activityClock`：`{eventId,elapsedMs,source}`；宿主／主持人 | 值班計時顯示與活動結束通知；不是故事衰退 | source=`local` 不可信；是否失焦仍計時由活動設定明示。不能寫回主線故事鐘。 |
| 線上賽季鐘 | M7服務讀模型的`seasonId,seasonTimeMs,serverEventId`；seasonTimeMs為UTC epoch ms | 只影響賽季服務世界，不進EngineState／system.fact | 客戶端暫停不能暫停賽季；離線主線不追補衰退。 |

所有規則時間皆整數 ms，禁止浮點秒偷偷乘 1000。故事鐘上限提案 `315360000000`（3650 日）；自訂一次 `deltaMs` 為 1..86400000。較大跨度拆成多筆明示操作，不能 clamping。溢位／超上限拒絕整筆。

- 普通閱讀、`ls`、`cat`、診斷、`man`、提示、設定、存檔、失焦成本 0。UI 不送定期 `time.advance` tick。
- pack 宣告 `timePolicy.actionCostsMs`。例如渡海可提案 600000 ms、Boss 行動 1000 ms；均是待內容／互動校準數字，不沿用舊引擎每命令 30 秒。UI 在執行前能查到成本，提示與診斷不消耗節拍。
- `time.advance` 逐一處理 `(oldTime, newTime]` 邊界；同時刻依排程排序。抵達指定時間前即結束／離島時，未處理部分依該 action policy 明定，基線為仍完成此分支已宣告推進，禁止偷偷丟失剩餘時間。
- 有成本的 command：先在 S 上解析／准入並固定成本，再於候選狀態推進排程，重查當下前置條件後執行。若因時間事件改變世界而成一般指令失敗，時間已經過；若 cancel／核心錯誤則整筆回滾。
- 同 tick 新增的到期事件必須在同一次 drain 處理；不能排到過去。跨時區日期由 pack 固定 UTC epoch／純整數日曆轉換，不讀本機時區。
- Boss 預設診斷→行動→結果，可停在任一步。需要即時壓力的活動屬獨立 policy，不能重新定義主線規則。

## 6. PRNG 與 state → effects

### 6.1 PRNG

保留現有 mulberry32 的 uint32 整數算法：`a=(a+0x6d2b79f5) mod 2^32`，乘法用低 32 bit；`below(n)=nextU32()%n`（有模數偏差，非安全隨機）。不得用浮點 `Math.random()` 或換成其他抽樣法卻不升版。seed 只初始化；中途存檔要保存 `stateU32` 與 `draws`。

世界機制與生成檔分流：每分支 named PRNG streams 在 fork 時複製；生成檔使用 pack 的獨立 seed 規則，不因玩家多讀檔、UI 補全、分塊大小而消耗遊戲 PRNG。`draws` 溢位或未知 algorithm 拒絕；cancel 恢復所有 streams。PRNG 不作 nonce 或簽章。

### 6.2 effects 次序與封閉種類

1. 驗版本、expectedStateHash、input 形狀、前置條件與資源預算。
2. 建候選 state／VFS write set，按 §5 處理明示時間成本。
3. 執行行動；讀檔當下記錄 inode／alias 快照，不於腳本結束後重新解析 pathname。
4. FIFO 派送 `file.read`（依實際讀取次序）→ `command.completed` → 來源 `ruleOrder` 規則；每批事件耗盡後做 state-rule 固定點。
5. 只讀 judge 接受同份命令結果／世界快照，核心依判題合約套完成效果，再 drain 到固定點。
6. nextState.seq 加 1，驗 invariants、計算 hashes；生成 journal；原子提交成功後才發布 outputs。

規則迴圈／效果總預算是一筆交易共用計數器，不可遞迴重設。提案上限 10000 個 effects 或 10000 次規則觸發；超限 `ENG_RULE_BUDGET`，整筆撤銷，不跳過關鍵事件以求繼續。

每個 effect 為 `{kind,data}`，順序有意義，不排序。registry：`file.read`、`vfs.changed`、`ticket.provenance.recorded`、`flag.changed`、`clock.advanced`、`dialogue.opened`、`hint.viewed`、`command.completed`、`quest.resolved`、`story.progressionChanged`、`memory.recorded`、`inventory.changed`、`branch.changed`、`knowledge.accepted`、`reward.granted`、`externalFact.accepted`、`snapshot.requested`、`chapter.travelled`、`ending.selected`、`minigit.changed`、`minigit.predicateChecked`。共用 payload 如下，領域 payload 見指定 owner 及 §8.1 阻塞表；未知或只有名稱而未完成封閉 schema 的 kind 拒執行。先前草案的 `artifact.provenance` 不在本版 registry。

`file.read.data` 固定 `{islandId,deviceId,inodeId,path,aliases,contentHash}`；aliases 為讀取瞬間的排序絕對路徑。`command.completed.data` 固定 `{rc,stdoutHash,stderrHash,readCount}`，hash 對原始 bytes，不對 UI 截斷後文字。新規則不再讓 unknown-command 文本混到 stdout。

共用effect payload亦為封閉schema，不是任意delta：

| kind | data |
| --- | --- |
| `vfs.changed` | `{branchId,operation,islandId,deviceId,inodeId,path,contentHash}`；operation=`create`／`write`／`link`／`unlink`／`metadata`／`cwd`／`mount`，未適用inodeId/contentHash為null；每個完成的檔案操作一筆，不能每個stream chunk亂增效果。 |
| `flag.changed` | `{targetBranchId,flagId,value}`，value為boolean；寫main需宣告target與guard。 |
| `clock.advanced` | `{branchId,fromMs,toMs,reason}`。 |
| `dialogue.opened` / `hint.viewed` | 分別 `{branchId,nodeId,choiceId}`（choiceId可null）／`{branchId,guideId,level}`（1..3）。 |
| `story.progressionChanged` / `memory.recorded` | `{branchId,activityId,record}`（record為InvitationResolution）／`{branchId,memoryId}`（記錄存在該branch）。 |
| `inventory.changed` | `{branchId,itemId,quantity,sourceRefs}`；quantity為變更後值，0表示移除，不能由peer資料直接授予。 |
| `branch.changed` | `{fromBranchId,toBranchId,scenarioId,mode}`，mode=`create`／`merge-knowledge`／`abandon`。 |
| `knowledge.accepted` | `{evidenceIds}`，排序且每ID存在；receiver視圖不改immutable記錄。 |
| `reward.granted` | `{rewardKey,recipientBranchId,sourceRef}`；sourceRef=`{lineageId,branchId,seq}`；rewardLedger保存其中`{rewardKey,sourceRef}`；D21本版recipientBranchId及生成branchId必為main，分支判題不發此effect。 |
| `externalFact.accepted` | `{factId,factHash}`；來源類型由已登錄fact schema辨別。 |
| `chapter.travelled` | `{branchId,fromIslandId,toIslandId,fromChapterId,toChapterId,routeId}`。 |
| `ending.selected` | `{branchId,choiceId,endingId,preEndingCheckpointId}`。 |

ticket.provenance.recorded 見 §4.2，snapshot.requested 見 §4.3，quest.resolved 與 MiniGit 見 §8；這些 schema 需一起產生驗證器，不准僅寫 enum 就接受任意 data。file.read 要由真實 iterator 消耗產生，純開檔／UI補全／0 byte讀取不假稱已看內容；具體教學 read predicate 仍由 pack 定義。

`effects` 是可比較的結果證據，**不能把匯入者自稱 effects 直接套用**；replay 應重新執行 input 比對 effectsHash 與 afterStateHash。`presentation` 是有序訊息陣列；元素為純文字字串（system channel）或封閉 `{channel,textRef,args}`，channel=`system`／`dialogue`／`hint`，textRef 指精確 pack 的訊息 ID，args 為該 textRef 宣告的封閉參數物件、值只准 string／boolean／safe integer／null。stdout/stderr 由 commandStreams 表達，不重複塞 UI 格式化字串。presentation 不直接進 stateHash，但可保存為 OutputRecord blob；動畫、換行寬度、主題、操作模式不改規則。遊戲對話的解鎖／等待狀態仍在 effects/runtime，不能藏在 renderer。

### 6.3 cancel、失敗與提交

- `cancel(inputId)` 在 commit point 前撤銷整筆輸入：VFS、flags、PRNG、storyTimeMs、判題證據、scheduler、seq、journal 與尚未發布輸出均回到 S；finally 關閉所有 iterator、Worker、Blob URL、臨時 sort 檔。
- commit point 後的 cancel 回 `ENG_ALREADY_COMMITTED`，不宣稱撤銷已提交世界。UI observer 壞掉只記診斷，不把提交當失敗而重試。
- **正常 shell rc≠0 不是核心交易失敗**：`echo x > a; missing` 可保留 a 並提交 rc127。解析錯誤 rc2 無 VFS 寫入；也可記為完成的指令輸入。取消、版本錯誤、資源上限、I/O commit 失敗才是整筆回滾。
- 線上 job 不能由取消本機視圖撤銷已收件工單；其 receipt 用新 `ticket.resolve` 輸入接納，依 TICKET_JUDGE 去重。
- 持久化失敗不能顯示「已保存」。持久模式須舊 revision 保留且本次可重試；救援與明示記憶體模式見 SAVE_SCHEMA_2。

## 7. 規模與資源提案

以下是**提案／待量測，不是實測結果或目前支援承諾**：

| 項目 | 初始預算 | 超限行為／spike |
| --- | --- | --- |
| 120 萬行日誌 | 64 KiB bytes chunk；不可建立完整 JS 行陣列 | 產生器 seek/index spike，量 head、tail、grep、完整 hash 的讀取量。 |
| `sort \| uniq -c` | 指定桌機 benchmark 的 p95 2 秒目標；worker live heap 提案 ≤128 MiB | 固定硬體／瀏覽器／冷暖快取後量；不能把 ENGINE_REQS 的目標當既有成果。 |
| sort scratch | ≤256 MiB，候選 chunk run merge | file:// 無可用暫存時回資源錯誤或使用受限小資料活動包，不假稱完整百萬行支援。 |
| UI 輸出 | 顯示最近 1 MiB；完整 stdout 可串流下載／判題 | UI 截斷不影響命令輸出 hash／判題；超過執行輸出預算則回滾，不默默裁答案。 |
| 單次指令 bytes | stdout/stderr 合計 32 MiB；輸入檔總串流 ≤512 MiB | deterministic work budget／取消，不用機器速度決定遊戲 verdict。 |
| 取消反應 | 發出取消至 worker 終止 p95 ≤100 ms 目標 | 實機測；主執行緒不跑不可中斷長工作。 |

量測 spike 必須輸出版本 tuple、seed、資料 hash、行數／bytes、機器、瀏覽器、峰值記憶體、elapsed、取消後殘留資源；未達標時調整資料策略／有版本上限，不能放寬正確性。

## 8. 跨代理接點

| owner 文件 | 本文件要求的接點 |
| --- | --- |
| [TICKET_JUDGE](TICKET_JUDGE.md) | `progress[ticketId]` 的共用欄位為 `storyStatus`（`open`／`resolved`）、`resolutionMode`（null／`shell-local`／`assisted`／`program-local`／`program-online`）、`programVerdict`（null 或真 runtime verdict）、`evidenceRefs`（完整 hashes）。舊完成／starter／代辦不能填 AC。judge 只讀，核心單次套獎勵。 |
| [MERGE_SPEC](MERGE_SPEC.md) | EvidenceRecord 固定**六欄** `{evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash}`；sourceRef 固定 `{lineageId,branchId,seq}`。evidenceType 僅 `self-verified`／`simulated`／`legacy-projected`／`peer-shared`，含義沿 MERGE §3.2；peer-shared 只可由「分享知識聲明」的原生成 rule 建立，不能在轉寄既有 record 時改 type。variant／scope／NPC 模式由固定 contentSetHash＋ruleId 取得；來源 playerId／原件／收據／forwarding 放 KnowledgeImportFact 閉包，不加進 record。evidenceId=H("evidence",record 去掉 evidenceId)，轉寄 bytes／ID 保持不變。知識聯集交換／結合／冪等，操作歷史與鏈尾不必相同。 |
| [REPLAY_SPEC](REPLAY_SPEC.md) | 固定 baseline＋inputs＋精確內容；比對 before/afterStateHash、effectsHash、commitId。無 genesis 不冒稱全程可達，簽章／nonce 不屬於 stateHash 的真實遊玩證明。 |
| [MINIGIT_SPEC](MINIGIT_SPEC.md) | `runtime.miniGitStates` 為repositoryId→版本化狀態；遊戲分支與仿 Git repo 分開，Git object ID 不代替 save commitId。`git-check <predicateId>` 對應command.execute、時間0；`minigit.predicateChecked.data`固定 `{repositoryId,viewOid,predicateId,predicateVersion,result,reportHash}`，result為good/bad/untestable，reportHash為完整blob hash；已觀察報告落入該repo子schema。`minigit.changed`的封閉data由MINIGIT登錄，未知拒絕。 |
| [INTERACTION_SPEC](../ux/INTERACTION_SPEC.md) | query 零變更，診斷零故事時間；顯示 action cost、cancel commit point、匯入 preview 與保存失敗；設定／閱讀／失焦不呼叫 time.advance。 |

`quest.resolved` 的 data 使用 `{ticketId,storyStatus,resolutionMode,programVerdict,evidenceRefs}`；其他 schema 的語意細節歸 owner，但不得更名以上欄位而不回此文件同步。

跨文件邏輯別名統一：`actorId` 對應 `profile.playerId`，`runId` 對應 `lineageId`；PackRef 只用 `{packId,contentVersion,manifestHash}`。MERGE 的 self-observed／simulation-observed／legacy-claim 分別由 self-verified／simulated／legacy-projected 加來源條件導出；`npc-guided` 僅是 simulated＋已核對 NPC ruleId 的 UI 視圖，**不是第五個 type**。peer-known／self 視圖依來源 lineage、可驗關係與接收者導出，不能單憑他人自稱同 playerId／lineageId 升 self。此六欄裁決替代本輪未實作的擴充欄位草案；不改任何已存 RA1 事件。

### 8.1 子 schema 完整度與實作前阻塞

| 缺口 ID | 已固定／真正未定 | 解除前的限制與 owner |
| --- | --- | --- |
| `ENG-SUB-TICKET-TRACE` | TICKET §4.4 已固定 trace、node、sink 外層及 op enum；各 op.params 的全量封閉欄位／bounds（目前只舉 project-ip delimiter/field）、非生成來源的 generatorVersion/profileSeed 表示尚不完整。 | TICKET／引擎在實作 producer 前補齊每個 op 的 schema＋跨命令 writer／coverage 正負 fixture；未知 params 拒絕，不能宣稱 T0427 counting 已可用。file.edit 的四欄輸入本身已完整；工單 provenance 能力須一同過關。 |
| `ENG-SUB-TICKET-EVIDENCE` | Bundle／Resolution 外層、ProgressRecord、ref hash 已固定；competencyScopes 的每 profile 封閉值、legacyRef 子物件、receipt 的可執行版本與 program mapping 仍須成套定明。 | TICKET owner 在啟用相應 profile 前交付 discriminator／null 規則與 validators；未取得 program runtime／receipt 契約不開 program route、不造 AC。不能用任意 JSON 填 scope／legacy／receipt。 |
| `ENG-SUB-MERGE-SHARE` | KnowledgeImportFact／六欄 staging／MergeResolutionFact 的核心接點已定；MERGE §5 的 notes／footprints／receipts 子項仍有邏輯欄位與示例差異，驗簽 envelope 尚未定。 | MERGE owner 在交換 producer 前固定 knowledge-exchange/1 子項的必填／可選與 bounds；目前不能聲稱整個交換 DTO typed 完整。空清單不授予未定子項能力。來源摘要聲明與必需 bytes 的區別依 SAVE §7.1。 |
| `ENG-SUB-DOMAIN` | bossStates／miniGitStates 的位置已定；其 data 的完整 wire schema、minigit.changed.data、predicate report blob 與 scheduler.eventType/payload 的封閉 registry 仍須由領域規格落實。 | BOSS／MINIGIT／內容作者在啟用該 capability 前提供 exact schema、合法空值、bounds、effects 與轉移 fixture；不能因外殼有 schemaVersion 就接受任意 JSON。命令路由／git-check 名稱仍按 COMMAND 已定映射。 |
| `ENG-M6-REPLAY-ASSESSMENT` | OutputRecord 四欄與 digest 已定；ReplayAssessment 未有精確 schema。 | 按 §3.4 阻擋 system.fact 接納 assessment；renderer oracle、trusted checkpoint／簽章仍待驗。 |

PACK 的 guard AST、selector、內容 reducer 子型別與未知正文另見 CHAPTER_PACK 的實作／發布關卡。以上是明列阻塞，不是「已登錄所以能用」；解除須更新 owner 的精確子 schema 與本表狀態，再實作／驗收，不把兩份不同 schema 留給實作代理猜。

## 9. 錯誤碼

| code | 處理 |
| --- | --- |
| `ENG_VERSION_UNSUPPORTED` | 拒執行，保留原件；顯示缺少版本。 |
| `ENG_STALE_STATE` / `ENG_INPUT_REUSE` | 不重跑舊輸入；重新預覽或回既有結果。 |
| `ENG_INPUT_SHAPE` / `ENG_SCOPE` | 拒絕未宣告欄位、未知 kind、錯分支。 |
| `ENG_INPUT_KIND_REQUIRED` | typed-only故事動作必須走指定Input，不以raw command重做或旁路。 |
| `ENG_EDIT_CONFLICT` / `ENG_EDIT_PERMISSION` / `ENG_EDIT_CONTENT` | 保留草稿；拒過期內容、工作區／權限／readonly、不合法 Unicode／NUL／UTF-8>64 KiB；不留下半檔。 |
| `ENG_FACT_SCHEMA_UNREGISTERED` / `ENG_FACT_CONFLICT` | 未定 fact 子 schema／錯入口或同 factId 異 hash 拒絕；不接受任意 JSON 或覆蓋既有來源。 |
| `ENG_REFERENCE_INVALID` / `ENG_TICKET_SCOPE` | DTO 交叉引用／進度清單不一致，或單 dispatch 跨 ticket/profile trace 鍵衝突；准入拒絕，原世界不變。 |
| `ENG_TIME_RANGE` / `ENG_PRNG_VERSION` | 不截斷、不重置 clock／seed；保留世界。 |
| `ENG_RULE_BUDGET` / `ENG_RESOURCE_LIMIT` | 撤銷整筆，提示分段或匯出；提供 ruleId／resource 診斷。 |
| `ENG_CANCELLED` / `ENG_ALREADY_COMMITTED` | 區分撤銷成功與已完成。 |
| `ENG_HISTORY_UNAVAILABLE` | 顯示實際可回溯節點，不能用目前世界假冒舊 checkpoint。 |
| `ENG_CONTENT_UNAVAILABLE` | route／ending／取件policy未核定或缺內容；不以placeholder true執行。 |
| `ENG_INVARIANT` | 撤銷，保留候選診斷供主動匯出；不能自修成另一狀態。 |

錯誤回應共同形狀 `{code,message,details,retryable}`；details 只含界定欄位／ID／位置，不含宿主 stack 或未預覽的玩家全文。

## 10. 正負驗收與跨版本向量（全部尚未執行）

| ID | 正例／期望 | 負例／必拒或不發生 |
| --- | --- | --- |
| ENG-001 | 相同 baseline＋inputs 在瀏覽器／Node／不同 worker chunk 得相同 stateHash、effectsHash、commitId。 | 改 cwd／待觸發 timer／PRNG 一位必須改 stateHash。 |
| ENG-002 | 連續 query、開設定、失焦一天：世界 hashes、storyTimeMs 不變。 | UI 背景讀稿不能給閱讀旗標／解題證據。 |
| ENG-003 | time.advance 跨多邊界與拆成明示小步，世界結果（扣除 seq／輸入歷史）相同。 | delta 浮點、溢位、未宣告負時間拒絕；不漏同 ms 的事件。 |
| ENG-004 | 分支改 flags／檔案／PRNG 後 abandon，main 世界除明列 exitSummary／退出記錄外逐欄一致。 | branch 的 block、AC 或故事選擇不能自動帶回 main。 |
| ENG-005 | `cat a; rm a; ln b a` 的讀事件仍指最初 inode。 | 不可用結束後的 a 認定讀到 b。 |
| ENG-006 | cancel 在排序／重導向／判題前後任一 commit 前階段撤銷所有效果。 | observer throw 不重做已提交輸入；commit 後 cancel 不假報成功。 |
| ENG-007 | 非零 rc 的正常 Shell 結果可提交，事前寫檔仍在。 | 核心 budget error 不可留下半個檔或新增 PRNG draws。 |
| ENG-008 | prompt input 原始八空格保留到節點驗證器。 | 不能因全域 trim 而消失；尚未有正文不得宣稱隱藏結局通過。 |
| ENG-009 | 同 inputId 重送命中原結果；staleState 拒絕。 | 換 payload 不得二次發獎。 |
| ENG-010 | 遺留與新規則分別顯示能力範圍。 | 新三時鐘規則不能拿舊八碼鏈一致當驗收。 |
| ENG-011 | inline file.edit 對既有／新檔，含 hardlink、Unicode、空檔及剛好65536 UTF-8 bytes 的 replay 相同、故事鐘不變。 | 65537 bytes、未知欄位替代 content、stale hash、readonly、取消不寫檔；背景開 editor 不給 read evidence。 |
| ENG-012 | 多筆 commands 的 counting trace 僅依 externalFacts／blobs 重建；刪查詢快取、roundtrip／compact 後仍同判定。 | 讀來源後 echo 固定答案、同bytes手改沿用舊writer、跨branch混來源、缺parents／未知params不得通過。 |
| ENG-013 | demo.vote 在 drop flags 前保留來源 memory；本人與 peer 對話稱謂正確。 | peer 投票當本人／同時 block+pass 擅選一個／把 skip 當K0/K1親證皆不通過。 |
| ENG-014 | B0/B1 defer讓branchHandled為true且無done/卡；後續真退出只套白名單done。 | branch.flags任意聯集、tag退出、缺merge證據先發done皆失敗。 |
| ENG-015 | main從Ch6旅行cronmine再返回，其他島文件/進度保留，B3b物品不帶回。 | 用舊snapshot覆蓋main、生成F5未知取法、重播首次揭露/獎勵皆失敗。 |
| ENG-016 | ending prepare與pin同次adapter提交；durable／volatile各驗，返回調查不restore；ended可依SAVE另開main。 | durable失敗先顯成功、memory缺閉包、未知ending條件當true、試看即結局皆失敗。 |
| ENG-017 | resolution／staging／fact 的固定schema、expectedStateHash與閉包相符才原子接納，重送不重發知識／獎勵。 | 偽 progressAfter、接受／封存重疊、同factId異hash、system.fact直接換main皆拒。 |
| ENG-018 | A→B→C 六欄 EvidenceRecord bytes／ID 不變，NPC由simulated＋ruleId顯示。 | 轉寄改type、加入variant/playerId/receipt欄、npc-guided當enum或朋友當self皆拒。 |
| ENG-019 | OutputRecord 使用完整streams與有序presentation的raw SHA-256，JournalRecord不加欄。 | 自創H("output")、UI截斷後hash、ReplayAssessment未知schema卻接納皆拒。 |

跨版本向量交付清單：V-ENG-L1 四條原 JS walkthrough→TS legacy adapter（逐 commit）；V-ENG-L2 原 RA1→新版投影（進度與缺失清單）；V-ENG-R1 新 tuple 瀏覽器↔Node（逐 input）；V-ENG-R2 rules/1→未知 rules/2 拒執行原件不變；V-ENG-R3 同內容、不同 chunk/語系/時區；V-ENG-R4 內容升版後舊存檔仍固定舊 tuple；V-ENG-R5 本輪定版inline edit／六欄evidence／fact與output DTO→未知子版本拒絕（未實作的舊草案不冒稱已發布版本）。向量檔須存 input bytes、expected hashes、語意差異說明與來源，不能只存最後分數。

## 11. 實作工作包與解除條件

1. 抽出 legacy facade，凍結來源 fixture／版本清單，先建立對照工具；不改舊 ID。
2. 建 EngineState／input／effect schema 與不變量檢查；做時鐘、PRNG、分支與取消的最小垂直切片。
3. 接 SAVE 原子提交與 PACK 固定內容；再接判題／merge／miniGit，不能先讓 UI 直接寫 flags。
4. 百萬行、file:// 儲存、跨宿主 hash 是限時 spike；結果未出前保留提案標記。
5. F3–F8、K2–K8、八空格與完整結局 gate 待可讀正文；只能做結構驗證與未啟用內容標記，不填造正史。
