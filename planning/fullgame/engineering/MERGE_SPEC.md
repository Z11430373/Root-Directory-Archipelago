# 知識交換、故事分支與同人同步契約

版本：規劃稿 0.1｜2026-11-02｜狀態：未實作；性質／案例為待執行驗收。

**「知識聯集」「故事分支整合」「同一玩家同步」是三種不同操作。知識可以聯集，故事選擇與世界狀態不可直接聯集。** 本契約採用 [D02、D08、D09、D14、D15、D17、D19、D20](../DECISIONS.md)：1.0 提供有界離線知識／便條／足跡交換與 NPC 補位；完整多人合併衝突關卡屬 C1；帳號同步屬 M6／1.1。

## 1. 現況與本稿邊界

| 來源 | 現況／本稿需補足 |
| --- | --- |
| [SCRIPT.md](../../../SCRIPT.md) s0.7、s1.7、兩章多人段落 | B0／B1 只把知識帶回；K1 的 exact／collateral 可並存；有最後 20 行指令、便條、足跡與簽章收據的原構想 |
| [demo/import_rules.yaml](../../../demo/import_rules.yaml) | 匯入白名單、K0、同暱稱詢問後 import_as_peer、不覆寫；原檔沒有穩定 actor identity |
| [save/import.js](../../../demo-app/src/save/import.js) | `toFullgame` 只作資料投影，不是正式多人匯入或線上同步服務 |
| [save/validate.js](../../../demo-app/src/save/validate.js) | schema 1 僅接受封閉事件，merge 只允許 K0；不能把新增欄位塞進舊鏈 |
| [SOURCE_GUIDE.md](../../../docs/SOURCE_GUIDE.md) §3 | 試玩可攜檔不含任意檔案／cwd／完整指令；分支 VFS 隔離但 flags 共用是現況，不是正式故事分支保證 |
| [ui/session-storage.js](../../../demo-app/src/ui/session-storage.js)、[FINDINGS.md](../../../demo-app/FINDINGS.md) F-15 | 目前以完整 envelope 字串守護本地寫入；相同 head 不代表任意檔案或 journal 相同 |

完整讀取歷史規劃的 WP4，不沿用「不論順序整張存檔結果相同」的過強說法。本文已對齊 `ENGINE_CONTRACT.md` §8 與 `SAVE_SCHEMA_2.md` §4：外部 DTO 的 actorId→`state.profile.playerId`、runId→`state.lineageId`；共用 EvidenceRecord 精確使用核心六欄，演算法固定 `evidenceId=H("evidence", EvidenceRecord 去掉 evidenceId)`。以下不另定存檔根格式；需要新增的是明列的外部 fact blob registry，不是另一組 identity 或 hash 規則。

## 2. 三類操作與不變量

| `operation` | 輸入／目的 | 可產生效果 | 不能做的事 |
| --- | --- | --- | --- |
| `knowledge-union` | 本人分支、朋友分享或 NPC 的知識證據集合 | 新增有來源的證據；更新同一接收者的知識視圖；符合 gate 時揭露卡片 | 不合併 VFS、貨幣、碎片持有、主線抉擇或結局旗標；不把 peer-known 變成親自驗證 |
| `story-branch` | 同 run 的 checkpoint 分歧；主線選擇或 what-if 模擬 | 保留平行歷史；以明示 resolution 選擇後續基線；what-if 僅帶回允許的知識 | 不把「模擬成功」當作主線事件發生；不對互斥結局 flag 作 OR |
| `self-sync` | 同一使用者／run 的兩份儲存副本 | 有共同祖先時判斷 identical、fast-forward、diverged；新建候選副本後選為 active | 不由同暱稱認定同人；不以最後修改時間勝出；不拿朋友檔覆蓋自己的進度 |

`git merge --knowledge` 是故事內的知識操作；不是宿主 Git merge，也不是遠端同步 API。所謂「世界歷史未更動」指原主線世界事件不被改寫；知識新增／合併本身仍會留下新事件。若輸入來自不同 run，即使 actor 相同，也不得自動拼接世界歷史。

## 3. 身分、證據與來源可驗

### 3.1 穩定 ID

| 邏輯欄位 | 規則 |
| --- | --- |
| `actorId` | adapter 別名，持久化對應 `EngineState.profile.playerId`；改暱稱不換 ID；離線自稱此 ID 不構成帳號認證 |
| `runId` | adapter 別名，持久化對應 `EngineState.lineageId`；新遊戲／新 lineage 才換 ID；普通另存同一歷史只換 saveId |
| `branchId` | 分支穩定 ID；`alt/sandbox` 等顯示名稱不是唯一鍵 |
| `evidenceId` | `H("evidence", EvidenceRecord 去掉 evidenceId)`，64 小寫 hex；不是裸 SHA-256、UUID、任意字串或八碼值；轉寄不重建、不改原 record |
| `receiptId` | issuer 發出的穩定收據 ID；重複匯入只增加引用，不產生第二筆授權／獎勵 |
| `shareId`、`mergeId` | 分享包與本次 merge operation 的 ID；重送同內容是冪等，異內容同鍵拒絕 |
| `nick / displayName` | 顯示文字，可改、可重複；不當作路徑、account、獎勵鍵、共同祖先或簽章 subject |
| `sourceRef` | 核心固定 `{lineageId,branchId,seq}`，指原生成操作；不加 actor／commitId；profile 身分綁定與來源 saveHash 在外部 fact blob |

EvidenceRecord 精確為 `{evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash}`，沒有 `variant`、暱稱、可變驗證狀態或 recipient 欄位。variant／技能 scope／NPC 模式由被 contentSetHash 固定的 `ruleId` 定義查得；卡片資料與來源版本必須可取得。`H` 使用 SAVE 的 `RA2/evidence/1\n` domain 與 C(value)，不重定義 hash 公式。改名、同名、換裝置、轉寄必須有案例。

### 3.2 evidenceType 是原始生成方式，轉寄不可改

| 共用 `evidenceType` | 定義／接收規則 |
| --- | --- |
| `self-verified` | 原生成 lineage 在指定 rule 下驗證操作；轉寄後仍保留此值，並不宣稱接收者也驗過 |
| `simulated` | 原生成分支的模擬／pack NPC 規則產生；由 ruleId 分辨 NPC 與玩家 what-if；轉寄仍 simulated |
| `legacy-projected` | 由明示 legacy 投影產生；原始資料 hash 與 projectionVersion 在 import fact；轉寄不洗白 |
| `peer-shared` | 原始生成方式本來就是「分享的知識聲明」；只在相應生成 rule 建立新 record 時使用，不是接收既有 record 時替換的標籤 |

**反例**：A 的 self-verified record 為 E；B 若把 evidenceType 改成 peer-shared 再計 H，就不是 E，A→B→C 的去重與原簽章皆失效。因此 B/C 原封保留 E，收件時間、轉寄者與驗簽結果另放 import provenance。UI 的 self／peer 由 sourceRef.lineageId、接收 lineage 及合法來源關係導出；外來檔僅自稱同 lineage 但祖先／來源不可驗，不可因此升 self。`knowledgeEvidence` 永遠只含六欄 EvidenceRecord，不摻便條／來源包或 receipt metadata。

### 3.3 證據視圖不是單一 trusted 布林

| 證據／視圖標籤 | 能說什麼 | 不能說什麼 |
| --- | --- | --- |
| `self-observed` | 原 record type=self-verified，且來源屬可驗的當前 lineage；可附 replay-compatible | UI 標籤，不另增 evidenceType；不證明真人、原創、無腳本或線上競技資格 |
| `simulation-observed` | 原 record type=simulated，指定 what-if 分支中看見結果 | 不等於主線實際改變了歷史；他人模擬仍顯示 peer-known＋simulated |
| `peer-known` | 從其他來源得知；顯示 origin 與驗證情況 | 不等於接收者親自驗證；不得滿足要求親自操作的條件 |
| `npc-guided` | 原 type=simulated 且 ruleId 是已核對 pack 的 NPC 教學；代辦可另有工單證據 | NPC 不是另一真人、帳號或真實多人簽章；不新增第五個 evidenceType |
| `legacy-claim` | 原 type=legacy-projected 的顯示稱謂 | 未記錄的指令、VFS、時間與來源不得補造 |

另外分開保存 `integrity`、`replayability`、`receiptVerification`（見 REPLAY_SPEC）；不能以「來源可驗」一句話跨過三者。來源檔的完整 hash 只能證明引用的內容相符；合法簽章只證明特定 issuer 對特定 subject 的聲明。接收者可以在本地驗簽，**不因此自動替對方背書，也不能用自己的帳號重簽為自己的成果**。

轉寄 A→B→C 時：保留 A 的完整原六欄 record／同 evidenceId；B 只新增明示的 forwarding provenance，按 §5.2 放入 externalFacts 所引用 blob。若簽章驗證需要連線撤銷資訊但目前離線，標為 `signature-valid / revocation-unknown`，不可升為當季有效收據。

## 4. 知識聯集的數學範圍

先以固定的 pack 相容政策 `P` 驗證每份輸入，得到合法的 immutable evidence set `E`。相同 evidenceId 不同 payload 是整包衝突，不能用 last-write-wins。未知／不相容資料留在隔離區，**不參與**下列已接納集合。

```text
U(Ea, Eb) = Ea ∪ Eb                 // 以 evidenceId + 相同 payload 去重
K(E) = 依 cardId、evidenceId 排序的知識證據投影

K(U(A, B)) = K(U(B, A))             // 交換律
K(U(U(A, B), C)) = K(U(A, U(B, C)))  // 結合律
K(U(A, A)) = K(A)                  // 冪等性
```

比較對象是 `K` 中按 evidenceId 排序的 immutable 六欄 records（variant 由 ruleId 查固定內容），**不是整份 save、merge 事件順序、parent、head、時間、暱稱、forwarding facts 或完整歷史 hash**。重複輸入可以產生不同的 UI 操作紀錄，但不能增加知識條目或獎勵。

接收者視圖 `View(K, receiver, storyProgress, P)` 再決定「親自／朋友／模擬／NPC」分類及可見性。性質測試必須固定同一 receiver、progress 與 policy；不能拿 A 的自我視圖與 B 的自我視圖要求相等。驗簽／撤銷政策若改版，需以新 P 重新投影，不假稱集合聯集本身改變了真偽。

### 4.1 卡片 variant 與能力

- K1 的 `block_gc_exact` 與 `block_gc_and_convoy` 為兩筆可並存的 simulation evidence；卡片呈現聯集並在可見時附 `collateral` 註記，沒有「哪個真相覆蓋哪個」的衝突。
- 兩人聲稱同一事件但 payload 不同，屬 `EVIDENCE_COLLISION`；保留兩份原始包供查驗，不自動採信較新的那份。
- 不同版本卡片用 pack 指定的 migration／equivalence map；同 ID 不同內容 digest 不可直接聯集為同一內容。未知版保留隔離且回 `PACK_MAPPING_REQUIRED`。
- 想把 peer-known 提升為親自驗證，需在自己的 run 執行明列的驗證任務、產生**新的 self evidence**。新證據可引用 peer 提示來源，但不覆寫原來源。
- 本人的 what-if 知識可以在允許的章節作後續對話前提；它仍保留 simulation 標籤，不能觸發「主線已做出某選擇」。
- peer K1 可以讓玩家提出合理的 GC 問題，並在已到 Ch1／認識 GC 的 revealGate 後解鎖港務員回應；對話條件應使用「得知這項資訊」的明示投影，而非偽造 `simulation-observed` 或 `flag.b1.done`。回應需有「你聽說……」等有來源變體，不能把朋友的模擬經歷或投票記憶說成玩家親做。這是允許的知識用途，不放寬主線／結局的親自驗證條件。
- 依 D19，peer K1 不寫 `flag.b1.done` 或 `flag.b1.deferred`；deferred 只能是玩家在 main 明選延期的行為。B0/B1 的 `branchHandled=done OR deferred` 只供 gate，延期不發卡、merge／abandon 才記原出口 done，tag 收藏不退出。來源模擬、知識、延期與出口四者不可互換。

### 4.2 章節、劇透與結局 gate

每個 card／evidence 定義 `revealGate`、`allowedUse` 與可分享的 payload slice，由內容 pack 提供。匯入先存 sealed entry；未到章節只顯示「有一份稍後可讀的交班資料」，不露卡名、variant、片數、結局名稱或隱藏條件。一般分享預覽預設只輸出接收章節範圍內的內容，未知接收進度採最小範圍。

`peer-known` 不直接授予 F1–F8 的持有、主線分支完成或結局解鎖。需要親自驗證／主線決策／NPC 簽核的 gate，必須明確逐項滿足；不能用 `cards.length` 或「有某 ID」替代。已知七片／八片門檻仍保留；F3–F8、K2–K8 與隱藏結局充分條件仍按 DECISIONS O-N04／O-N03 待作者確認。

依 D20，Ch3.5 補訪是在目前 main 旅行，保留其他章進度；B3b 是另開隔離實驗。分支線索可經本契約帶回，F5 必須在當前 main 經合法取件或明示協助取得，不從 peer／branch 複製物品。最後選擇前存檔是復原保障，不能把每天補訪實作成載入舊檔重跑／再領獎。

sealed 是產品揭露護欄，不是加密 DRM：持有明文檔案的人可自行查看其 bytes。不得承諾離線檔案不可能被劇透；要避免意外劇透，優先不匯出超前 payload，只給不帶內容的 pending reference。

## 5. 有界交換包與 JSON 示意

交換包是專用傳輸 DTO，不是 `.rasave.json` 的新根格式。完整本人存檔同步走 SAVE_SCHEMA_2 的容器；朋友交換預設只輸出下列白名單。

| 欄位 | 契約 |
| --- | --- |
| `exchangeVersion / shareId / purpose` | 版本、穩定 ID、`knowledge-union`；不能將交換包誤當 self-sync |
| `sender` | actorId、runId、可選 displayName；不含 email／token／裝置 ID |
| `packRefs`、`sourceSaveRef` | 核心 `{packId,contentVersion,manifestHash}` 與來源 `{saveHash,rawBlobHash}`；legacy 原八碼 ID 置獨立引用；不混用 evidence.sourceRef |
| `evidence[]` | 僅核心六欄 EvidenceRecord，type／sourceRef／ruleId 原樣保存；不承載任意 executable code |
| `notes[]` | noteId、作者、UTF-8 文字、可見章節；無任意目標路徑、HTML 或自動連結動作 |
| `footprints[]` | allowlist 的高層事件、來源虛擬時間及 actorRef；不預設匯出完整指令 |
| `historyExcerpt[]` | 預設不勾選，最多最後 20 行；逐行預覽後才分享 |
| `receipts[]` | 最小簽章聲明及驗證必要欄位；完整程式碼不隨收據自動外送 |

JSON 中所有 64 位重複字元 hash 為**形狀用佔位，並非實際 H 計算值，不能作 conformance vector**。evidenceId 必須由原六欄去除自身後按 SAVE 算出；不能照抄此全零值：

```json
{
  "exchangeVersion": "knowledge-exchange/1",
  "shareId": "share-example-a1",
  "purpose": "knowledge-union",
  "sender": {"actorId": "actor-example-a", "runId": "run-example-a", "displayName": "ada"},
  "packRefs": [{"packId": "ch1", "contentVersion": "candidate-1", "manifestHash": "1111111111111111111111111111111111111111111111111111111111111111"}],
  "sourceSaveRef": {"saveHash": "2222222222222222222222222222222222222222222222222222222222222222", "rawBlobHash": "3333333333333333333333333333333333333333333333333333333333333333"},
  "evidence": [{
    "evidenceId": "0000000000000000000000000000000000000000000000000000000000000000",
    "cardId": "K1",
    "evidenceType": "simulated",
    "sourceRef": {"lineageId": "run-example-a", "branchId": "branch-example-b1", "seq": 17},
    "ruleId": "ch1.b1.block_gc_and_convoy",
    "contentSetHash": "4444444444444444444444444444444444444444444444444444444444444444"
  }],
  "notes": [{"noteId": "note-example-1", "text": "交班前請先讀日誌。", "revealGate": "ch1-arrived"}],
  "footprints": [{"eventId": "footprint-example-1", "kind": "lighthouse.lamp-start", "virtualTime": 240}],
  "historyExcerpt": [],
  "receipts": []
}
```

### 5.1 1.0 提案上限與內容預覽

| 資源 | 預設上限；尚待實機量測 |
| --- | --- |
| 單交換包 | UTF-8 未壓縮 256 KiB；深度 ≤ 16；只接受單一嚴格 JSON，不自動解任意 archive |
| 證據／收據 | 200 筆 evidence、100 筆 receipts；單 evidence payload ≤ 4 KiB；未知大附件拒絕 |
| 便條 | 最多 4 則、每則 2 KiB、合計 8 KiB；超限要求使用者分包，不靜默截字 |
| 指令片段 | 可選最後 20 行、每行 256 UTF-8 bytes；超長行整行提示未納入，不截斷後冒稱原指令 |
| 足跡 | 最多 4 個 allowlist 類型：登入、看手冊、看地圖、點燈；每個 origin event 只一次 |
| 同一 run 的外來分享區 | 提案總額 2 MiB；到限可先匯出／移除所選便條展示副本，不能刪來源 ledger 假裝未領過 |

一般私訊、自由聊天、任意 VFS／`.bash_history`、環境變數、憑證與 Python 原始碼不在預設分享範圍。分享前逐項顯示文字、暱稱、路徑字串、指令與可推知章節；提醒可能含敏感資訊的內容，玩家可取消勾選或編輯**分享副本**。不能宣稱自動敏感字偵測足以去識別化；保留「全不分享文字」選項。沒有後台遙測或暗中上傳。

接收端純文字渲染，HTML／ANSI／控制字元不執行；NUL／不合法編碼拒絕，bidi／零寬等不可見字元以標記預覽。便條存入由 ID 生成的 `peer-notes` 命名空間，不用 `peer-<暱稱>.txt` 原樣作 path；暱稱含 `../` 不可能離開工作區。原 SCRIPT 的命名構想由此明示替代，而非改寫原資料。

足跡放入明示的分享 overlay，附 imported／NPC 來源；不能就地更動已用於判題的日誌 snapshot。重新生成日誌需新 revision／digest，現有提交仍指向舊來源（見 TICKET_JUDGE）。不能把對方提供的世界時間當作伺服器收件或真人活動時間。

### 5.2 externalFacts／blobs 的具體落點

分享 DTO 的 canonical bytes 為 `shareBlobHash`（SAVE 的 raw blobHash，非 evidenceId），存 `SaveEnvelope.blobs`。新 fact 型別 `KnowledgeImportFact/1` 精確欄位：`{schemaVersion,shareBlobHash,receiverRef,acceptedEvidenceIds,sourceBindings,forwardingRefs,visibilityPolicyVersion}`；schemaVersion=`knowledge-import/1`，receiverRef=`{lineageId,branchId,seq}`，sourceBindings 為 `{lineageId,playerId,sourceSaveHash,sourceRawBlobHash}` 陣列，forwardingRefs 指前手 import facts，所有 refs 為完整 hash。sourceBindings 是待驗來源聲明，不自行授予帳號認證。

fact bytes 同樣放 SAVE.blobs；`state.externalFacts` 增加 `{factId:"knowledge-import:<importFactBlobHash>",factHash:<importFactBlobHash>}`。factId 由已算出的 factHash 產生、不是 fact payload 的一部分，沒有循環。便條、足跡、指令片段、暱稱快照、receipt 與 forwarding metadata 全部可由此閉包取得，**不進 knowledgeEvidence、不新增 state.notes/footprints 根欄位**。相同 shareBlobHash＋policy＋acceptedEvidenceIds 重送採既有 fact，不因新 receiver seq 重造匯入；後來合法揭露／mapping 擴大接受集合則產新 fact，保留舊 fact，知識仍按原 evidenceId 去重。自己的 profile、別人的來源 profile 與可驗性資訊分開處理。

sourceBindings 中的 sourceSaveHash／sourceRawBlobHash 是**來源聲明的摘要**，不是要求朋友默默分享整份私人 VFS；沒有附可驗來源／收據就顯示 source-unverified，不能替對方背書。真正必須有 bytes 閉包的是 shareBlobHash／factHash／forwardingRefs 及已明示附上的驗證材料；缺驗證材料不宣稱可驗，缺執行必要 blob 則拒絕。self-sync 的雙原檔保全另按 §6.2，不能和朋友的最小分享包混同。

`knowledge.import {stagedImportHash}` 與 KnowledgeImportFact 已在 ENGINE §3.3 registry；KnowledgeImportStaging/1 精確六欄由該節定義，固定 schemaVersion、shareBlobHash、importFactBlobHash、acceptedEvidenceIds、sealedEvidenceIds、expectedStateHash，receiver／policy 從 fact 核對。核心重算接受集合，一個 dispatch 同時加入原六欄 evidence、externalFacts 引用及 `knowledge.accepted`／`externalFact.accepted`，seq＋1；失敗全部撤銷。SAVE §7.1 已定引用閉包。**交換 notes／footprints／receipts 子項仍有 ENG-SUB-MERGE-SHARE 規格缺口；validator／producer／持久化均未實作**，不以外層已登錄宣稱整包 typed 完整。

sealed／pending 的超前 payload 留在 share blob 的有界隔離區，不加入可用知識；讀取視圖遵守 reveal policy。便條 overlay 由已接納 fact 導出，不寫入題源 VFS。若 UI 要建立可閱讀 VFS view，必須是另登錄的唯讀生成器引用該 fact，不能假稱原日誌已包含足跡。

## 6. Preview → staging → commit；永不覆寫來源

```text
READ_BYTES → BOUNDS_CHECK → PARSE → VERIFY_REFERENCES → CLASSIFY
        → PREVIEW → STAGED → USER_CONFIRM → CAS_COMMIT → APPLIED
                               ↘ CANCELLED
任何驗證／資源／CAS 失敗 → REJECTED 或 NEEDS_RESOLUTION；原檔保留
```

1. 保留來源 bytes 與 digest；驗證時不修改對方檔、目前 active run、VFS 或 ledger。legacy 原八碼鏈也不重算成「新版舊鏈」。
2. 先做格式與大小檢查，再分類三種 operation。同暱稱一律不能默選 self-sync；同 actorId 也只是來源聲明，需要使用者確認或帳號認證及 lineage。
3. preview 顯示：新增／重複／封存／未知證據數、來源與可信度、可見文字、故事抉擇差異、影響的 active branch、任何獎勵差額（朋友交換固定零）。劇透敏感欄位使用遮蔽摘要。
4. staging 生成新候選，不寫 active；驗證 pack、gate、引用完整性、候選可恢復性與剩餘事件預算。staging 是資料計算，不自動播放對話或重發獎勵。
5. 玩家確認後以核心 `expectedStateHash` 加 SAVE 的完整 storage revision 作 CAS；不能只用 head。其他分頁改過 journal、cwd、工作檔也要失敗，提示重新預覽，不偷換基線。
6. knowledge-union 用 `knowledge.import`；resolution 用下節受 adapter 控制的 `system.fact`。依 D17，候選持久化成功才發布新世界／結果或選新 save slot 的 active 指標；保存失敗保留目前世界，volatile 需玩家明選。失敗或取消只清 staging；原始本機副本與外來包可各自匯出。事故復原不拿「最近修改時間」覆寫較新的資料。

### 6.1 共同祖先與同步分類

| 情況 | 動作 |
| --- | --- |
| 同 run、相同完整狀態／版本／lineage | `IDENTICAL`；不新增獎勵；可顯示已同步 |
| 可驗共同祖先，本地為遠端祖先，版本與 runtime 相容 | `FAST_FORWARD_AVAILABLE`；預覽後新建候選、保留本地原副本，再 CAS 選為 active |
| 遠端是本地祖先 | `REMOTE_BEHIND`；保留舊副本可閱讀，不回退 active |
| 有共同祖先、兩邊都有新事件 | `DIVERGED`；保留兩條分支；列出差異，明示 resolution，不自動合併 VFS 或互斥 story flags |
| 只聲稱同 head／同暱稱、祖先缺失、legacy 只有事件投影 | `ANCESTOR_UNPROVEN`；可作平行匯入／知識交換，不能 fast-forward |
| 不同 run 或版本不可轉換 | `PARALLEL_IMPORT`／`PACK_MAPPING_REQUIRED`；獨立保存，不合造共同祖先 |

祖先證明需比對完整 immutable event／checkpoint 與其版本、base state，不接受八碼前綴相等或客戶端單方填的 ancestorId。來源歷史、snapshot、runtime 與任意工作檔差異都要納入判斷；有相同 commit head 但不同 VFS 的現行 envelope 不算 identical。

### 6.2 明示 resolution 事件

故事岔路不是 SQL 欄位衝突：預設只允許選一條作後續世界基線、另一條保留平行參考；允許帶回的 knowledge 另跑聯集。what-if 世界改動不能透過選擇基線偷換成 main 歷史。完整衝突謎題需 C1 的內容規則，不在 1.0 臨時增加。

`merge.resolution` 在本文是稽核用途名稱，**不是新增的核心 Input／effect kind**。固定 `MergeResolutionFact/1` blob 以既有 `system.fact {factRef}` 接納；只有經玩家確認且驗證來源的 import adapter 可發此 Input，玩家 Shell 不能自填任意世界差異。fact bytes 在 SAVE.blobs，核心 state.externalFacts 存 `{factId:"merge-resolution:<mergeId>",factHash}`，效果用已登錄 `externalFact.accepted`。

下例是已由 ENGINE §3.3 固定外層與操作範圍的 blob payload；hash 均為示意，非可執行 fixture。self-sync 必留雙原件，受 SAVE §8 的每原件 8 MiB／總 blob 32 MiB 等上限約束；超限保留原槽並回 STORAGE_LIMIT 及底層 SAVE_BLOB_LIMIT／SAVE_BLOBS_LIMIT，不降成只有摘要：

```json
{
  "schemaVersion": "merge-resolution/1",
  "mergeId": "merge-example-9",
  "operation": "self-sync",
  "inputs": [
    {"saveHash": "sha256:<local-save>", "rawBlobHash": "sha256:<local-original-bytes>"},
    {"saveHash": "sha256:<remote-save>", "rawBlobHash": "sha256:<remote-original-bytes>"}
  ],
  "commonAncestorRef": "sha256:<verified-ancestor>",
  "resolution": "choose-local-world-keep-remote-branch",
  "selectedWorldRef": "sha256:<local-state>",
  "knowledgeEvidenceAdded": ["sha256:<unchanged-original-evidence-id>"],
  "actorId": "actor-example-a",
  "policyVersion": "merge-policy/1",
  "expectedStateHash": "sha256:<preview-base>"
}
```

實際 `factRef`／evidenceId 均為 64 小寫 hex。此 fact 記錄「選了什麼」，**不授權 system.fact 直接覆寫 branches.main/VFS**。self-sync adapter 保留兩個原始 SaveEnvelope（各自 saveHash＋原 bytes blobHash），從已選合法 baseline／連續 journal 建立新的 saveId 候選；在該候選以 expectedStateHash 提交 resolution fact，成功後才 CAS 切 active slot。不同 saveId 可以保有同一 lineage；不得只把遠端塞成另一個 branches key 後覆蓋 main 來假裝原檔仍在。可攜 resolution 候選的 blobs 必須含兩份原 bytes，原存檔槽亦保留；超額則中止並提示匯出管理，不留無法取回的 rawBlobHash 或刪來源以求成功。

知識若也要帶入，另由候選上的 `knowledge.import` 依法驗證；resolution 的 knowledgeEvidenceAdded 是對已接納內容的核對清單，不是另一條加知識捷徑。整份候選在兩步都驗完前不發布 active；失敗可捨候選，兩個原始檔仍在。1.1 雲端 self-sync 需再驗帳號對該 lineage 的所有權；離線本人確認只能標 self-declared，不升帳號認證。

## 7. 獎勵去重、NPC 補位與 legacy

- 知識聯集從不新增朋友的 sectors／keys／fragment／當季積分。知識展示解鎖與本人技能獎勵是不同政策；需要本人再驗證時才走自己的任務獎勵交易。
- 既有收據重複出現在不同 shareId、改名檔、轉寄鏈或另一分支，仍以 `(issuer, receiptId)` 去重；即使收據 ID 被替換，也用原 `(subject, challengeId, rewardPolicyVersion)` 的唯一 ledger 鍵防重領。可信 subject 不符接收帳號時不可領。
- 本地故事獎遵D21／TICKET §2.3：ledger內鍵為`C(["story-ticket",ticketId,storyRewardPolicyVersion])`，只有main可結獎，sandbox不消耗main額度。self-sync不加兩邊餘額，knowledge union不加ledger；岔路雙領用reward provenance核對，不由總額相減猜測。ended後新lineage回訪走SAVE §7.2繼承原已領ledger，不能因runId換了重領。
- 1.0 無朋友也能完成協作教學：NPC 提供同樣的交班介面與證據範例，標 `npc-guided`；需三名故事角色簽核時是 NPC 敘事流程，不聲稱真人 quorum。NPC 台詞與 Ch2 具體 gate 待內容 pack 確認。
- 原 ada／bo 足跡在單人模式是 NPC 記錄；不能用暱稱相同推論真實玩家在線。NPC 的可信度是「來自已核對 pack 的固定模擬內容」，不是「外部服務驗真的人類行為」。
- schema 1 只按 `demo/import_rules.yaml` 白名單投影；Q1-1、Q1-3 的原小日誌成績不能當正式大日誌通過。K0 可帶，B1 不帶；沒有完整指令／便條的舊檔不生成假的分享內容。
- 本人 demo 的 block／pass 先從**尚未刪除 demo flags 的原始 fold**產生帶來源的 memory，再 drop `flag.demo.*`；保留原規則「你在試玩時說過：block／pass」的本人語意。朋友匯入的投票只能是 peer statement，顯示「交班資料記錄對方選了……」，不能套用「你當時」；不把投票預告當 B1 模擬已完成。若無法證明本人來源，保持 legacy／peer 稱謂，不補造個人回憶。
- 原同暱稱 `import_as_peer` 是相容性預覽建議，保留詢問與不覆寫。schema 2 改以穩定 ID＋lineage 分類；不把所有同名檔都硬判為朋友，也不自動連結帳號。

## 8. 錯誤碼與恢復

| 碼 | 行為 |
| --- | --- |
| `MERGE_APPLIED / MERGE_NOOP` | 已原子提交／沒有新知識；顯示本次資料差額 |
| `FORMAT_REJECTED / LIMIT_EXCEEDED / UNSAFE_TEXT` | 入口拒絕；不渲染不可信內容、不改 active |
| `EVIDENCE_COLLISION / RECEIPT_INVALID` | 不一致／收據錯誤；來源保留隔離；不自動替換或背書 |
| `PACK_MAPPING_REQUIRED / PROFILE_UNKNOWN` | 等待精確版本 mapping；不猜測同 ID 等價 |
| `ANCESTOR_UNPROVEN / IDENTITY_UNPROVEN` | 限制為平行副本／知識交換；可提供明示本人確認，但不增加競技信任 |
| `DIVERGED / RESOLUTION_REQUIRED` | 保存兩邊，待玩家選擇；取消仍可繼續原進度 |
| `STALE_PREVIEW / STORAGE_OWNERSHIP_LOST` | CAS 失敗，重新讀取／預覽；不可拿新 token 替舊候選背書 |
| `SPOILER_SEALED / ALREADY_IMPORTED` | 正常狀態提示，不是作弊錯誤；不解鎖或重領 |
| `CANCELLED / STORAGE_LIMIT / INTERNAL_ERROR` | 清 staging、保留來源與當前狀態，提供匯出或重試 |

## 9. 正負驗收

所有項目是**待執行規格**；性質測試以固定政策與接收者比較 `K`，另對副作用逐一斷言，不要求鏈尾相同。

| ID | 正／負 | 驗收 |
| --- | --- | --- |
| MERGE-001 | 正 | A/B/C 的多次排列／分組聯集，K 投影交換、結合、冪等；history/head 可不同 |
| MERGE-002 | 正 | K1 exact 與 collateral 兩種 variant 都保留，附原來源且不當故事衝突 |
| MERGE-003 | 負 | 相同 evidenceId 不同 payload 拒絕整包；不得 last-write-wins；active 原 bytes 不變 |
| MERGE-004 | 正／負 | A 改名仍同 actor；兩人同名仍不同 actor；偽同 actorId 不得到帳號或 self-sync 授權 |
| MERGE-005 | 正 | A→B→C 保留 A origin；C 顯示 peer-known，B 不被當成果作者 |
| MERGE-006 | 負 | 朋友有 F8／結局卡，Ch0 preview 不露卡名／片數，不給碎片或結局 gate；未到章節保持 sealed |
| MERGE-007 | 正 | 接收者親自再驗證後新建 self evidence；保留 peer 記錄與提示來源 |
| MERGE-008 | 負 | 改 shareId／檔名／暱稱／轉寄重複 receipt 都不能重領；subject 不符不可領 |
| MERGE-009 | 正／負 | 祖先可驗時提供 fast-forward；同 head 不同 VFS／journal 不能 identical；legacy 八碼相同不能證明祖先 |
| MERGE-010 | 正 | 真分歧保留原始兩檔與平行分支；明示 resolution 事件可查；反悔可返回原副本 |
| MERGE-011 | 負 | what-if 刪檔／封鎖結果、互斥故事 flags、兩邊餘額不可經 union 進主線 |
| MERGE-012 | 負 | preview 後另一分頁改檔，CAS 拒絕，無半筆知識／獎勵／active 指標更新 |
| MERGE-013 | 正／負 | 預設不分享指令；選分享後逐行可預覽；超大包、深層 JSON、重複鍵、原型鍵、path traversal、ANSI／HTML payload 無可執行副作用 |
| MERGE-014 | 正 | 足跡 overlay 不改判題 source digest；重開新 source revision 明示且可重放 |
| MERGE-015 | 正 | 無朋友／離線／零鑰匙可用 NPC 完成主線協作；UI 清楚 NPC 身分，不算真實人數 |
| MERGE-016 | 負 | legacy 缺便條／指令不能補造；B1、小資料快題及未列白名單 flag 不帶入；舊原檔與八碼 ID 保留 |
| MERGE-017 | 正／負 | 不同 pack policy 先隔離；合法 migration 後明示新增版本事件；未知卡不以相同 ID 偷合併 |
| MERGE-018 | 負 | 取消／儲存額滿／中途錯誤不覆寫；對方簽章有效但撤銷狀態未知時不升競賽有效 |
| MERGE-019 | 正／負 | 到章節的 peer K1 能開合理提問及來源相符的港務員回應；不能變親自模擬、B1 完成或本人投票記憶 |
| MERGE-020 | 正／負 | 本人 demo block／pass 在 drop flags 前生成有來源 memory；peer 投票不套「你當時」，unknown identity 不升本人經歷 |
| MERGE-021 | 正／負 | A→B→C 六欄 EvidenceRecord／evidenceId 位元組相同；B 改 self-verified→peer-shared 必因 H 不符／改來源被拒；UI C 顯示 peer-known，不藉修 hash 洗成新自證 |
| MERGE-022 | 正／負 | 匯出／匯入／compact 後 notes/footprints/forwarding 仍從 externalFacts blob 閉包恢復；knowledgeEvidence 僅六欄；缺必要引用拒絕；合法後續揭露用新 fact，不撞舊 factId、不重領 |
| MERGE-023 | 正／負 | resolution 由受限 adapter 經 system.fact 接納並保存雙原檔；玩家偽 fact／覆寫 main／僅保留一條 branches 假裝保留原始來源皆拒絕 |
| MERGE-024 | 正／負 | peer K1 只開合理問答，不能寫 b1.done/deferred；玩家 main 明選延期才寫 deferred，不發卡；tag 不退出 |
| MERGE-025 | 正／負 | Ch3.5 main 補訪保留其他進度，B3b 只帶線索；F5 需 main 取件／協助，拒分支／peer 物品複製與補訪重領 |

## 10. 責任、取捨與待確認

| 責任角色 | 待交付與解除條件 |
| --- | --- |
| 存檔／引擎 | 依核心六欄 EvidenceRecord／H 規則實作；登錄 KnowledgeImportFact、staging 與 MergeResolutionFact 的閉包／授權驗證；expectedStateHash＋storage revision CAS；保留雙原檔 |
| 內容作者 | 卡片 variants／revealGate／allowedUse、NPC 補位、四結局與隱藏結局完整必要及排除條件；未知正文不由工程補寫 |
| 前端／互動 | 類型選擇、分享逐項預覽、sealed 顯示、分歧比較、取消／復原及可及性 |
| 後端／OJ | 帳號與 actor/run 綁定、issuer trust list、撤銷、receipt 去重與 reward ledger |
| QA | MERGE-* 性質與負向；真人能否理解「知道／親做／模擬」需另做試玩，不以屬性測試代替 |

取捨：有界白名單分享比任意 VFS 互換少自由度，但可避免把世界狀態、私密文字、判題來源與經濟重複帶入。平行保留增加儲存量，換取可恢復與可解釋性；預算達上限時要求管理副本，不默默丟失稽核資訊。待 C1 有具體衝突謎題、M6 有帳號模型、更多章節有完整正文後，再擴充 policy 與額度。

已對齊：actorId→profile.playerId、runId→lineageId、共用六欄 EvidenceRecord／H、原 type 不因轉寄改、knowledge.import／system.fact／externalFacts／SAVE.blobs 與 expectedStateHash。實際待接通的是上述 fact/staging 封閉 schema、來源閉包及持久化 producer、雙 SaveEnvelope 的 slot-CAS 實作與內容 reveal/use rules；不是另等命名。NPC 類型用 simulated＋ruleId，不新增核心 enum。
