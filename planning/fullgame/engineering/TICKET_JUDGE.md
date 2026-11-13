# 工單判題與 OJ 互通契約

版本：規劃稿 0.1｜2026-11-02｜狀態：未實作；驗收項目是待執行規格。

**1.0 以 `shell-state` 本地任務及免費 `assisted` 路徑保證主線通關。T0100、T0427 的原 Python 題、ID、參考解與測資保留；目前不能宣稱瀏覽器能執行 Python。** 本契約實施 [D05、D06、D08、D13、D17–D19](../DECISIONS.md)，優先於歷史規劃「本地／線上判題合約相同」的概括敘述。

## 1. 現況、範圍與依賴

| 可回查來源 | 已知事實／影響 |
| --- | --- |
| [T0100 metadata](../../../tickets/T0100/ticket.yaml)、[題面](../../../text/tickets/0100.md) | 選擇性工單；1000 ms／64 MB；原獎勵 2 sectors + 1 key；`on_ac` 設 `flag.t0100_done` |
| [T0427 metadata](../../../tickets/T0427/ticket.yaml)、[題面](../../../text/tickets/0427.md) | Ch1 必要工單；2000 ms／256 MB；N ≤ 1,200,000、不同 IP ≤ 200,000；12 sectors + 1 key；`on_ac` 設 `flag.t0427_done` |
| [SCRIPT.md](../../../SCRIPT.md) s0.6、s0.8、s1.5、s1.9、多人模式 | 原離港條件是 `flag.f2 and flag.t0427_done and flag.b1.done`；原文有收費提示、OJ 收據與五組本地測資的構想；INIT 點燈時已說「值班已登記」，選擇性 T0100 又說「沒有登記，燈就不算亮」，是敘事定義矛盾，待作者裁決 |
| [ENGINE_REQS.md](../../../docs/ENGINE_REQS.md) §7 | 原本要求逐行比對、行尾空白忽略；`oj_problem_id` 目前為 null，不代表已有橋接服務 |
| [SOURCE_GUIDE.md](../../../docs/SOURCE_GUIDE.md)、[quests.js](../../../demo-app/src/quests.js)、[FINDINGS.md](../../../demo-app/FINDINGS.md) F-W03 | 現行是快題只讀判定；正式工單、Python runtime、完整 B1 尚未開放 |
| [tools/validate.py](../../../tools/validate.py) `check_tickets` | 在開發機跑可信參考程式與錯解；預設 subprocess timeout 為 10 秒、未實施工單記憶體沙箱；不能當成玩家 Python 判題器或完整上限驗收 |
| [T0100 ref](../../../tickets/T0100/ref/sol.py)、[T0427 ref](../../../tickets/T0427/ref/sol.py) | T0100 會 strip 名字兩端空白，與題面／提示的邊界語意有缺口；T0427 參考解整份 read，不據此宣稱 120 萬行記憶體達標 |

版本歸屬：1.0 實作 shell-state／assisted；真正 `program-local` 是獨立 runtime spike 後的候選；M7／1.2 才包含 QDUOJ 橋接。工單 UI 可顯示「程式挑戰：待做；本機 Python 執行尚未開放」，不得寫「即將完成」或假造提交成功。

以下型別是**邏輯介面與事件 payload**，不是另一套存檔根 schema。已對齊 [ENGINE_CONTRACT §8](ENGINE_CONTRACT.md#8-跨代理接點) 與 [SAVE_SCHEMA_2 §4](SAVE_SCHEMA_2.md#4-canonical完整-hash-規則)：本文外部 DTO 的 `actorId` 一對一映射 `EngineState.profile.playerId`，`runId` 映射 `EngineState.lineageId`；它們是 adapter 別名，不增加根欄位。progress 實體位置為 `state.branches[branchId].progress[ticketId]`；結果走已登錄的 `ticket.resolve {resolutionRef}`。ENGINE §3.2–3.3 已固定 file.edit／provenance 接點；外層登錄不等於子 schema 完整或 producer 已實作，真正缺口見 ENGINE §8.1。

## 2. 四條執行路徑與三個獨立投影

| `route` | 執行者與檢查 | 合法成功碼 | 可證明的範圍 |
| --- | --- | --- | --- |
| `shell-local` | 版本固定的模擬 Shell、VFS 狀態與效果證據；`judgeKind=shell-state` | `SHELL_PASS` | 指定資料與操作範圍的本地結果；不是 Python AC |
| `assisted` | 玩家主動選擇引導／代辦，套用固定、可重放的故事補救 | `ASSISTED_RESOLVED` | 工單已處理；不證明玩家掌握技能 |
| `program-local` | 待通過離線 runtime spike 的 Python 執行器與測試集 | `AC` 等程式 verdict | 只限所載 runtime／測試 profile；未開放時回 `RUNTIME_UNAVAILABLE` |
| `program-online` | 受授權的 QDUOJ adapter；伺服器驗結果並發收據 | `AC` 等程式 verdict | 指定帳號、程式、題版本、測試集的 OJ 結果；領地另行結算 |

共同工單 ID 不代表共同判題合約。`(ticketId, contractVersion, profileVersion, judgeKind, route)` 是每次結果的必要標籤。線上只可把**相同程式契約、測試內容與 comparator** 的結果視為相容；本地小測資與全量 OJ 測試必須用不同 profile，且兩者都不等於 shell-state。

結果稱謂固定對應來源：shell-local「本地操作任務通過」、assisted「由 INIT 協助處理」、program-local「程式 AC（本機，列出測試 profile）」、program-online「程式 AC（OJ，列出 mapping／收據狀態）」。故事角色回應與任務面板使用同一結果物件，不可面板標 assisted、台詞卻稱「你寫的程式全部通過」。legacy 投影只稱「保留的舊進度」，不冒用四種新結果之一。

| 邏輯投影 | 定義 | 禁止的推論 |
| --- | --- | --- |
| `storyResolved(ticketId)` | 查詢函式：`progress[ticketId].storyStatus === resolved`；有合法故事處理／有來源 legacy 投影才設 resolved | 不由朋友的 AC／單一 imported flag 直接設為已完成 |
| `competency(ticketId, scope)` | 由 `progress[ticketId].evidenceRefs` 指向的註冊證據 blob 導出 `not-assessed / assisted / observed-local / replayed`；附範圍與來源 | `assisted` 不是掌握；一次測試通過不是通用能力認證；`replayed` 也不是真人認證 |
| `programAC(ticketId, profileVersion)` | 由 evidenceRefs 中指定 program profile 的真 AC 結果導出；`programVerdict` 是最近一次真 runtime verdict，不能單靠它省略 profile | skip、讀題、看解法、shell 成功、hash 一致均不是程式 AC |

### 2.1 主線 gate 與原 flag 的明示遷移

舊 gate 為 `flag.f2 && flag.t0427_done && flag.b1.done`。依 D19，新 Ch1 gate 固定為 **`flag.f2 && storyResolved(T0427) && branchHandled(B1)`**；`branchHandled(Bx)=flag.bx.done OR flag.bx.deferred` 是查詢投影，不是新增根欄位。B0/B1 可由玩家在 main 明選「稍後調查」寫 deferred；進分支後 merge／abandon 才寫 done，tag 收藏但不退出。延期不授卡／親見證據，不以舊 done 鎖死免費路徑。舊工單旗標只作**有來源的舊進度投影**，新結果不再靠寫它表示完成：

```text
legacy flag.t0427_done + originRef + migrationVersion
  → legacyProgressProjection(T0427, storyResolved=true, provenance=legacy-claim)
legacy flag.t0100_done + originRef + migrationVersion
  → legacyProgressProjection(T0100, storyResolved=true, provenance=legacy-claim)

new route result → story resolution event / competency evidence / program verdict
                   （三者分開，依實際 route 分別產生）
```

兩個舊 flag 的原始來源意義保留在 legacy 區；投影只維持舊故事進度，不可再被報表、獎章或 OJ adapter 當作 AC，也不把新結果壓回無來源的舊布林。所有讀取位置須盤點；原 YAML、SCRIPT 與 legacy 鏈不就地改寫，修改新 pack 的引用與相容層，記錄 `gateMigrationVersion`。T0100 維持選擇性，不能因其題面「沒有登記燈不算亮」而新增 Ch0 通關門檻。

T0100 的「點燈登記」與「工單登記」是否為同一件事，工程不自行發明第二套登記簿或補完台詞為正史。作者須裁決題面定義／文案後才能驗收相應敘事；shell profile 可先作操作規格研究，不能以其報告檔設定消解來源矛盾。

若未來正式舊檔確實含 `flag.t0427_done`，投影保留 legacyRef、原旗標、原檔摘要與來源版本（UI 稱 legacy-claim，**不是 EngineState.origin.kind 的新 enum**），可維持已獲得的故事通行；沒有可驗程式證據則 `programAC=false`、competency=`not-assessed`。目前 demo 的匯入白名單不含此旗標，不得憑空補造。legacy skip 僅按既有明示白名單遷移故事狀態，絕不產生 AC。

### 2.2 ProgressRecord 的固定映射

| 核心欄位 | 更新規則 |
| --- | --- |
| `storyStatus` | `open/resolved`；新通關或明示 legacy 進度投影才設 resolved，後續 WA 不重新打開 |
| `resolutionMode` | null 或四條 route；記首次實際解決故事的方式，後續練習不抹除 assisted 經歷；只有舊 flag 的投影保留 null＋legacy 證據，不能猜原路徑 |
| `programVerdict` | null 或最近一次 program runtime 真 verdict；shell／assisted／legacy 不寫 AC、不抹掉既有真 program verdict |
| `evidenceRefs` | 排序去重的 64 小寫 hex hashes；本工單型別指向 `TicketEvidenceBundle/1` 的 `blobHash`，不填任意 ID；ENGINE §3.3 已登錄外層，scope／receipt／legacy 子型別依 ENG-SUB-TICKET-EVIDENCE 補齊後才啟用相應 profile |

`TicketEvidenceBundle/1` 是封閉 blob：`{schemaVersion,ticketId,contractVersion,profileVersion,route,sourceRef,contentSetHash,verdict,competencyScopes,provenanceRefs,receiptRef,legacyRef}`；其中 `schemaVersion` 固定 `ticket-evidence/1`，`sourceRef={lineageId,branchId,seq}`，其餘未適用 ref 為 null，provenanceRefs 為完整 blob hashes。此類工單證據不是知識卡 `EvidenceRecord`，不塞入 `knowledgeEvidence`，也不因沒有 cardId 而捏造卡片。

`resolutionRef` 指向 `TicketResolution/1` blob：`{schemaVersion,ticketId,expectedStateHash,profileVersion,route,verdict,progressAfter,evidenceRefs}`；`progressAfter` 只含上述四欄，evidenceRefs 必與其內容一致。blobHash 按 SAVE §4 對 `UTF8(C(blob))` 直接 SHA-256；bytes 放 `SaveEnvelope.blobs`。adapter 驗證及核心重算後，`ticket.resolve` 一次提交 progress、`quest.resolved`、必要 rewardLedger 與 `externalFacts` 引用；`quest.resolved.data` 精確沿用核心 `{ticketId,storyStatus,resolutionMode,programVerdict,evidenceRefs}`。引用閉包在 compact 後仍保留，不能只留不可取回的 hash。

### 2.3 獎勵與文字

- D21：故事獎勵僅main結算，ledger內`rewardKey=C(["story-ticket",ticketId,storyRewardPolicyVersion])`，不含runId／branchId；外部索引可用runId定位該ledger，但不得據新lineage重置已領集合。四route共用一次；先assisted後親解只加證據。sandbox可判題及記branch progress，獎勵階段略過、不發幣／reward.granted、不寫root ledger；merge／abandon不攜幣。main首次真完成仍可領；結局後重開較早main則繼承原已領ledger（SAVE §7.2），不重新發既得獎。
- 原 sectors／keys 數字作為內容來源保留。1.0 sectors 只作 NPC 世界／故事效果，不是可轉出的線上領地；具體故事經濟映射由內容／經濟負責人確認。
- `skip` 開啟免費確認：「由 INIT 代辦，主線可繼續；程式挑戰仍為待做。」確認後產生 assisted 事件；取消無副作用。
- 操作說明、`man`、三階提示、重試與補救均免費；完整解法需主動展開。不以剩餘鑰匙幣阻擋通關。
- 程式專屬 `on_ac` 台詞不能套在 assisted 結果上；新 pack 需提供 shell／assisted 的文字變體，原文保留供來源對照。

## 3. 題目與結果的邏輯資料合約

| 欄位 | 類型／規則 |
| --- | --- |
| `ticketId`、`displayId` | 固定 `T0100`／`TICKET-0100` 或 `T0427`／`TICKET-0427`；不得以新 ID 取代原程式題 |
| `contractVersion` | 不可變判題語意版本；例如規劃中的 `ticket-shell/1`、`ticket-program-legacy/1` |
| `profileVersion` | 完整具名版本，綁資料生成器、comparator、能力範圍與限制；語意變更必升版 |
| `engineVersion`、`packRef`、`judgeVersion` | 精確版本及完整內容摘要；不能用 `latest` 或只比 SemVer major |
| `inputSnapshotRef` | 工單資料的 VFS snapshot／generator 版本、seed、內容摘要；與核心證據的 `sourceRef={lineageId,branchId,seq}` 不同，不混用名稱 |
| `submissionId`、`attemptId` | 不變 ID；同 submission 重送返回原結果；編輯後再試是新 attempt |
| `actorId`、`runId` | 穩定來源 ID；暱稱僅顯示，不作授權依據 |
| `artifacts[]` | 各檔的 VFS 路徑、內容摘要、revision；shell 報告或 Python 原始碼的不可變提交快照 |
| `baseStateRef`、`evidenceRefs` | 引擎基線及效果證據；由引擎取得，不相信玩家自填的 `reads` 或 stdout |
| `result` | route、verdict、reasonCode、結果摘要、能力 scope、測試覆蓋；不得只留布林 passed |
| `receiptRef` | 離線可 null；外部收據的 issuer／簽章／政策按 §7；不是自行填寫的 verified |

JSON 為 **shell adapter 提交 payload 示意**，不是核心 Input；所有 `sha256:<...>` 是說明佔位符，不是合法摘要或測試向量。實際值用 SAVE_SCHEMA_2 的 64 小寫 hex，不帶 `sha256:` 前綴；尤其 evidenceRefs 只能填實際 blobHash。

```json
{
  "ticketId": "T0427",
  "contractVersion": "ticket-shell/1",
  "profileVersion": "harbor-histogram-shell/1",
  "judgeKind": "shell-state",
  "route": "shell-local",
  "submissionId": "submission-example-17",
  "attemptId": "attempt-example-3",
  "actorId": "actor-example-a",
  "runId": "run-example-a",
  "engineVersion": "engine-candidate-1",
  "packRef": {"id": "ch1", "version": "candidate-1", "digest": "sha256:<pack>"},
  "judgeVersion": "shell-judge/1",
  "inputSnapshotRef": {"profileSeed": 427, "logicalContentHash": "sha256:<frozen-source>"},
  "baseStateRef": "sha256:<before-submit>",
  "artifacts": [
    {"path": "/home/op/work/T0427/counts.txt", "revision": 2, "digest": "sha256:<counts>"},
    {"path": "/home/op/work/T0427/top3.txt", "revision": 1, "digest": "sha256:<top3>"}
  ],
  "evidenceRefs": ["sha256:<ticket-evidence-blob>"],
  "receiptRef": null
}
```

## 4. 1.0 具體 shell-state profiles

本節是待實作、可施工的 profile，不宣稱現行 `submit`、編輯器或效果溯源已存在。題面保留「原程式題」頁籤，新增「本地操作任務」頁籤，清楚顯示不同輸入、輸出與能力範圍。

### 4.1 T0100：`registry-file-shell/1`

1. pack 建立唯讀 `/tickets/T0100/input/name.txt`，一行名字，由 profile fixture／seed 固定；本 profile 名字使用 1–30 Unicode scalar values、不含 CR/LF/NUL、無兩端空白，可含內部 ASCII 空格與連字號。
2. 玩家讀取這個 snapshot，將一行 `值班已登記：<名字>` 寫入 `/home/op/work/T0100/registration.txt`；允許 shell 重導向或內建文字編輯器。
3. 引擎檢查：名字來源的實際 read evidence；報告是玩家工作區檔案、內容語意正確、在本次資料 revision 下寫入。檔名不同可由提交 UI 明選，不限定唯一命令字串。
4. `echo '值班已登記：lin' > /home/op/work/T0100/registration.txt` 在來源確為 lin 且已讀取時是本任務合法寫法。證據 scope 僅 `read-source`、`write-report`，不宣稱通用 I/O 程式能力。
5. assisted 直接建立標記為 INIT 代辦的報告與故事處理事件；沒有冒充玩家 read/write 證據。

### 4.2 T0427：`harbor-histogram-shell/1`

**目的：從日誌抽出 IP、正確分組計數、閱讀數值 IP 的平手規則，將報告交給港務員。** 它不是把 N 行 stdin 丟給 Python，也不宣稱驗過原題 120 萬行。

- 本 profile 固定產生 **300 行、最多 64 個不同 IPv4** 的教學日誌，路徑 `/tickets/T0427/input/access.log`；每行第一欄是正規十進位 IPv4，以單一 ASCII 空格接後續日誌；沒有 N 標頭。生成器必有平手且包含 `.9`／`.10` 數值排序反例。來源唯讀，附 generatorVersion、profileSeed、digest。
- 這是明示縮小的工作副本；原 `/var/log/harbor/access.log` 可有更大量資料。不得把 profile 成績標成對完整港口日誌／原 Python 題的 AC。
- 玩家產生 `counts.txt`：每行 `次數 IP`，涵蓋**全部**來源 IP，不重複、不遺漏。行順序不重要，允許 `uniq -c` 的前導空格與欄位間 ASCII 空格／Tab。
- 玩家產生 `top3.txt`：每行 `IP 次數`，精確 min(3, distinctIP) 行；次數降冪、平手按四段整數升冪。可在文字編輯器讀 counts 後手動整理。只有本排序範圍的證據，不假裝已寫排序程式。
- 引擎從凍結來源獨立計數，再解析兩個報告比較 typed values；不是比對一條「標準指令」或某段終端輸出。

可接受的第一段操作例：

```sh
cut -d' ' -f1 /tickets/T0427/input/access.log | sort | uniq -c > /home/op/work/T0427/counts.txt
cat /home/op/work/T0427/counts.txt
```

`cat source | cut ... | sort | uniq -c` 或經工作檔分階段完成也可接受，前提是來源 lineage 與結果一致。現行 Shell 未提供多 key 數值 IPv4 排序／awk 的完整能力，不把開發機 oracle 的 `awk ... sort -k2,2nr -k1,1V` 冒稱玩家可直接執行；本 profile 用編輯 top3 補足最後一步。

縮小的說明例（7 行 **說明 fixture**，不是 profile 的實際 300 行）：來源 IP 多重集合為 `10.0.1.1 ×3`、`10.0.0.9 ×2`、`10.0.0.10 ×2`，合法 top3：

```text
10.0.1.1 3
10.0.0.9 2
10.0.0.10 2
```

`.10` 在 `.9` 前是 `WRONG_TIEBREAK`；只輸出前三名卻把不完整 counts 當全部統計是 `INCOMPLETE_HISTOGRAM`。

### 4.3 語意證據與 echo 偽造

效果追蹤最少須包含：讀取時的 inode／內容 revision、來源 digest、操作類別、資料流父節點、寫入目標 revision、產生者（player／assisted）。只檢查「曾經讀過來源」不足以證明後面的輸出是由它算出。

- T0427 的 counts 要有可重放的資料流：對指定來源第一欄投影、依 IP 分組、計數、寫入。不同指令串只要實現相同語意與完整來源覆蓋即可；支援哪些等價操作由 `judgeVersion` 的能力表決定。
- `echo '3 10.0.1.1 ...' > counts.txt`、先讀來源後另貼固定答案、偽造 stdout／readEvents 都不能產生 counting competency；回 `EVIDENCE_REQUIRED`，提供免費引導或明示 assisted 出口。
- top3 的手動編輯是 profile 明列的工作步驟；可證明選擇的結果符合規則，但不能因此宣稱是程式自動計數。T0100 的 echo 則是允許的基本寫檔操作。不能用全域禁止 echo 取代題目契約。
- 正確結果與正確 provenance 都由引擎重放取得；若只有結果正確，不偷偷降級為 passed，也不永久懲罰玩家。顯示「答案符合；尚缺從這份日誌產生統計的操作紀錄」。
- lineage 是指定模擬器內的來源證據，不是人類理解、原創性或無腳本證明；離線玩家能改整份紀錄，不給競技可信標籤。

### 4.4 Counting provenance 子契約與持久化

核心現有 `file.read.data={islandId,deviceId,inodeId,path,aliases,contentHash}` 與 `command.completed` 只足以證明讀取／輸出，**不足以證明「先讀來源，再 echo 固定答案」沒有替代計數**。以下是明確待接通的 `ticket-provenance/1`，不是現有 file.read 的隱含能力。

| 欄位 | 封閉內容／規則 |
| --- | --- |
| `schemaVersion,ticketId,profileVersion` | 固定 `ticket-provenance/1`、T0100/T0427 及精確 profile |
| `sourceRef` | `{lineageId,branchId,seq}`，指產生此 trace 的成功 dispatch；不引用當前 commitId |
| `inputSnapshotRef` | `{islandId,deviceId,inodeId,logicalContentHash,generatorVersion,profileSeed}`；凍結來源 |
| `nodes` | 按 nodeOrdinal 排列的 `{nodeOrdinal,op,parents,params,inputHashes,outputHash,rowCount,coverage}`；parents 為同 blob 的較小 ordinal 或 `{traceRef,nodeOrdinal}`，禁止循環 |
| `op` | 僅登錄的 `read-snapshot/project-ip/sort/group-count/copy/concat/literal/write`；params 依 op 封閉，如 project-ip 的 delimiter／field；不含程式碼 |
| `sinks` | `{islandId,deviceId,inodeId,path,contentHash,writerNodeOrdinal}` 陣列；對應交易實際寫入，不相信客戶端聲明 |
| `coverage` | `complete/partial/literal`；完整計數須來源行數與逐步 iterator 消耗吻合，rowCount 由執行器計，不由使用者填 |

持久化位置：canonical trace bytes 進 `SaveEnvelope.blobs`；`EngineState.externalFacts` 以 `{factId,factHash}` 保存引用，其中 factId=`ticket-provenance:<lineageId>:<branchId>:<seq>`，factHash=trace blobHash。知識集合仍只放共用 EvidenceRecord。後續 judge 從這些已接納的 provenance facts、實際 VFS 及提交快照解析來源；`TicketEvidenceBundle.provenanceRefs` 引用所用 trace 的閉包。compact 必須保留仍被 active workfile／progress 依賴的 blobs，不能把必要 lineage 當可丟快取。

執行時reducer產生有界typed trace；coordinator綁blobHash，與VFS／externalFacts／journal同筆提交。effect沿ENGINE §4.2的`ticket.provenance.recorded {ticketId,profileVersion,sourceRef,factId,factHash}`，不改file.read偷塞欄位；失敗／取消撤銷。每個writer含editor、echo、同bytes覆寫與hardlink別名都產新writer，不能沿用舊計數來源。單dispatch最多一個ticket/profile，跨profile准入回ENG_TICKET_SCOPE。

writer重建沿ENGINE §4.2的因果邊界：**先由RecoveryOrigin指定P重建已驗視圖，再套目前lineage新facts**；只在同lineage／forkPoint可見分支範圍內按sourceRef.seq與nodeOrdinal排序，不跨代排序裸seq。P若recovered沿origin遞迴且受SAVE圖／深度預算；E較晚trace雖保存也不能掃進writer。新literal／同bytes／別名寫入覆蓋P的writer，未重寫才保留；清快取／compact／reload及再次reopen一致。索引可丟重建，不新增私有持久Map、不改sourceRef／evidenceId。

**外層 fact／effect 接點及 SAVE §7.1 閉包已登錄，producer 未實作；各 op.params／bounds 與非生成來源表示仍由 ENG-SUB-TICKET-TRACE 阻擋。** 補齊 schema 並通過 JUDGE-006／provenance 驗收前，不能宣稱 T0427 counting 可用或授能力證據；1.0 的免費 assisted 出口須另按其已核定 profile 實作驗收。若 producer 無法支援某等價管線，回 PROFILE_UNSUPPORTED 並指出支援範圍，不用字串白名單假裝一般語意證明。

## 5. 正規化、編輯 UX、限制與生命週期

### 5.1 編碼與比較

| 對象 | 契約 |
| --- | --- |
| shell profile 輸入 | UTF-8 嚴格解碼，輸入 CRLF 轉 LF；拒絕 BOM、NUL、無效 Unicode；不作 NFC/NFKC 或全形空白替換；source digest 對正規化後的確切 bytes |
| T0100 報告 | 允許有／無一個末尾 LF；內容必須是一行，前綴與名字逐 scalar 相等；不 trim 名字，不忽略多餘行 |
| T0427 counts | 每行 ASCII `[SP/TAB]*count[SP/TAB]+IPv4[SP/TAB]*`；正整數、四段 0–255、無前導零；行集合語意比對；重複 IP 拒絕 |
| T0427 top3 | 每行 `IPv4[SP/TAB]+count`，允許行尾 ASCII SP/Tab、有／無末尾 LF；行序是題意，不可排序後再判；空白行／多行／額外欄位拒絕 |
| 原程式輸入／輸出 | 使用獨立 `ticket-program-legacy/1` comparator；保留既有 fixtures 與舊工具比較差異的回歸向量，不套用 shell comparator |

舊工具實際用了 Python `rstrip()`（包含多種 Unicode 尾空白）及移除尾端換行；原題面只說「行尾空白忽略」。正式 program comparator 發布前須逐項固定 CRLF、末尾空行、Unicode 尾空白、T0100 名字兩端空白與長度計數規則。推薦新 program 版本只忽略明定的 ASCII 行尾空白並保留名字資料；這是**待作者確認的新版本**，不能默默改舊題／舊 AC。此缺口阻擋宣稱完整 program contract 互通，不阻擋上述獨立 shell profiles。

### 5.2 編輯與提交

- 提供檔案清單、路徑、唯讀來源、工作檔文字編輯器及「儲存／還原草稿／提交」。所有按鈕走同一邏輯 action；不要求先會 vi，不新增宿主磁碟／任意網路權限。
- 草稿標明未儲存；提交前顯示所用檔案、revision、route、profile 及預期範圍。套用形成 `file.edit` 邏輯輸入，payload.content 保留確切 inline 文字；VFS 的 immutable blob 由核心另存，不以 blob hash 替代輸入內容。
- 判題使用送出瞬間的不可變快照。背景編輯不改已送內容；重試先選「同內容重送」或「提交新版本」。沒有檔案回 `ARTIFACT_NOT_FOUND`，不自動提交範例。
- `submit sol.py` 在原程式題頁籤仍指向 program route；runtime 未開放時顯示原因與免費 shell／assisted 入口，絕不偷偷執行 shell 判題再印 AC。
- 狀態文字可讀屏、保留焦點與錯誤路徑；取消按鈕與 Ctrl+C 等價。判題不因閱讀、失焦、設定停留消耗故事時間。

`file.edit` **已在 ENGINE §3.2 封閉 Input registry 固定以下 payload，尚未實作**；不藉 `system.fact` 繞過玩家編輯權限：

```json
{
  "inputId": "edit:example:1",
  "expectedStateHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "branchId": "main",
  "kind": "file.edit",
  "payload": {
    "islandId": "logport",
    "path": "/home/op/work/T0427/top3.txt",
    "expectedContentHash": null,
    "content": "10.0.1.1 3\n10.0.0.9 2\n10.0.0.10 2\n"
  }
}
```

全零 hash 為佔位，不是 fixture。payload 四欄封閉；expectedContentHash=null 表示只准新建，否則須與現有 inode 的完整 raw contentHash 相同；content 嚴格 Unicode／UTF-8 ≤64 KiB，保存確切字元，不自行 trim／換行正規化。islandId/path 僅可指向當前分支允許的可寫工作區，不能指向宿主／唯讀題源；解析後核對 inode 與硬連結權限。expectedStateHash 同時防止預覽後重綁路徑。

原子邊界：驗證→候選 VFS 寫入（更新現有 inode 時遵守硬連結共享內容）→`vfs.changed`（ENGINE §6.2 封閉 payload）→editor/literal provenance→必要規則／判題→seq＋1／hash／journal→同一 commit point。storyTimeMs 成本為 0；取消／超限／存檔失敗皆整筆回復；提交前只存 UI 草稿不進 state。成功後才發布「已儲存」。Input 形狀已定；工單 provenance 子 schema／producer 及保存實作未驗前，不能宣稱編輯器已有可重放工單提交能力。

### 5.3 提案資源預算（發布前須量測，不是現有性能承諾）

| 資源 | `ticket-shell/1` 預設上限／處理 |
| --- | --- |
| 單工作檔／單提交所有報告 | 64 KiB／128 KiB UTF-8；讀取前檢查；超出 `RESOURCE_LIMIT` |
| 一次 evidence session | 256 個已提交操作、最多 1 MiB canonical 效果輸出；快到上限提示可另開練習 snapshot |
| 判題 Worker | 64 MiB 目標工作集、最多 1,000,000 deterministic work units；宿主 10 秒 watchdog 中止屬 `HOST_TIMEOUT`，不當能力失敗 |
| 並行／取消 | 同一 run 一個提交；取消終止 Worker、清理 iterator／URL／候選 VFS；未完成不寫結果或獎勵 |
| 故事重試／assisted | 免費且不限次數；每次仍受資料與執行預算約束；若儲存預算不足先提供匯出／保留 checkpoint，不截斷歷史 |

program 路徑的原時限與記憶體限制仍是 metadata 中的 1000/64、2000/256；不能把這些數字直接當作瀏覽器 WASM 實測結果。runtime 不具備可驗記憶體隔離／中止能力時不得標為已通過 spike。

### 5.4 狀態與結果碼

```text
LOCKED → AVAILABLE → EDITING → SNAPSHOTTED → QUEUED → RUNNING → RESULT
                                      ↘ CANCELLED / REJECTED
RESULT → EDITING（新 attempt）
program-online：QUEUED → AWAITING_OJ → RESULT（再由伺服器獨立結算）
```

| 碼 | 意義／可恢復路徑 |
| --- | --- |
| `SHELL_PASS`、`ASSISTED_RESOLVED` | 合法故事處理；保留 route，絕不顯示程式 AC |
| `AC / WA / TLE / MLE / RE / CE` | 僅 program verdict；附 runtime／test profile；CE 對 Python 指載入／語法失敗，不暗示本機已編譯 |
| `WRONG_RESULT / WRONG_TIEBREAK / INCOMPLETE_HISTOGRAM` | 結果語意不符，提供免費分層診斷 |
| `EVIDENCE_REQUIRED / STALE_SOURCE / STALE_BASE` | 缺來源證據、資料改版或基線變更；保留工作檔，可新 snapshot 重試 |
| `RUNTIME_UNAVAILABLE / PROFILE_UNSUPPORTED / VERSION_MISMATCH` | 功能或版本未開放；不可猜測相容後繼續 |
| `ARTIFACT_NOT_FOUND / INPUT_INVALID / OUTPUT_LIMIT / RESOURCE_LIMIT` | 明示檔案或配額原因；不發獎勵 |
| `CANCELLED / HOST_TIMEOUT / INTERNAL_ERROR` | 取消／宿主／系統問題；原進度保留，免費重試，不寫 WA |
| `QUEUED_OFFLINE / AUTH_REQUIRED / AUTH_REVOKED / RECEIPT_INVALID` | 線上傳送或證據問題；本地故事可繼續，領地不預支 |

shell 判題為純評估；成功結果、能力證據、故事處理與一次性獎勵由引擎在同一交易提交。依 D17，durable 模式持久化成功才發布候選世界／結果；失敗保留目前世界，volatile 必須玩家明選。有成本操作沿用「准入與固定成本→故事鐘／排程→重查→行動」；編輯／閱讀／免費提示成本為零。結果到達時檢查 expectedStateHash、attempt 狀態及取消 token；過期回覆無法復活已取消工作。

## 6. 真正 Python local 的啟用關卡

候選可研究封裝的離線 Python/WASM 等 runtime；**尚未選定或安裝**。工作標籤固定「待做：runtime spike」，通過以下全部關卡才可排開放版本：

1. 明定 runtime 精確版本／license、下載或包體大小、冷啟動、file:// 與離線快取路徑；關網後仍可啟動，不臨時抓 CDN。
2. 真正執行玩家程式的 stdin/stdout；語法錯誤、無窮迴圈、輸出洪水、記憶體耗盡可辨別並可取消；無宿主檔案、網路與憑證出口。
3. T0100／T0427 原五組 fixtures、指定錯解反例、隨機與邊界輸入、上限 N／distinctIP 的正確性及資源實測；不能以 30 萬行檢查替代 120 萬行。
4. 解決 §5.1 程式 comparator／名字邊界差異；browser／Node／OJ 的各自資源計量與語意相容範圍有報告。
5. 成功、取消、崩潰均不破壞原 run／草稿；可存檔、關閉、離線再開。無法通過的瀏覽器明示 runtime 不可用，shell／assisted 仍完整。

## 7. QDUOJ mapping、收據與結算

### 7.1 固定 mapping

QDUOJ 部署版本與實際 API 未取得，以下是 adapter 必須實現的邏輯欄位，**不是已確認的 QDUOJ 原生欄位或 API**。bridge 將遠端回應正規化；不能只填 `oj_problem_id` 即宣稱互通。

| mapping 欄位 | 要求 |
| --- | --- |
| `mappingVersion / ticketId / contractVersion / profileVersion` | 唯一對應，已提交的 mapping 不可原地換題 |
| `ojInstanceId / ojApiVersion / problemId / problemRevision` | 版本固定；不同實例相同題號不是同題 |
| `statementDigest / testsDigest / comparatorVersion` | 完整摘要；小測資與正式測資分開；測試私有內容不下發客戶端 |
| `languageId / runtimeVersion / limits` | 明確 Python 版本、時間／記憶體／輸出限制與倍率；映射不完整就不開放 |
| `rewardPolicyVersion` | 故事獎勵與賽季領地政策各自固定，不在 callback 中臨時推算 |

### 7.2 收據示意與信任

下例 hash、signature 及 ID 全為示意；不是可驗證收據。簽章演算法、序列化與 key rotation 規則須與 REPLAY／SAVE 共用。

```json
{
  "receiptVersion": "judge-receipt/1",
  "receiptId": "receipt-example-42",
  "issuer": "configured-judge-bridge",
  "keyId": "key-example-1",
  "subject": {"accountId": "account-example-a", "runId": "run-example-a"},
  "submissionId": "submission-example-42",
  "challengeId": "challenge-example-8",
  "ticketId": "T0427",
  "route": "program-online",
  "mappingVersion": "qduoj-mapping-candidate-1",
  "profileVersion": "t0427-program-full-candidate-1",
  "sourceDigest": "sha256:<submitted-code>",
  "testsDigest": "sha256:<test-bundle>",
  "verdict": "AC",
  "issuedAt": "2026-11-02T08:00:00Z",
  "settlementRef": null,
  "signature": "<example-not-a-signature>"
}
```

只有已設定信任的 issuer 以伺服器保管私鑰簽發，且 mapping、subject、source、有效期／撤銷狀態核對成功，才是 `issuer-verified`。離線自簽或另一玩家附上的 `AC=true` 只能是 claim；簽章有效也只證明 issuer 的特定判題結果，不替朋友或收件者背書。收據可攜並不包含 QDUOJ token、原始碼全文或帳號 email。

賽季adapter的`workId=challengeId`，一對一且值相同；不另造queue身份。issuedAt等ISO Z例依REPLAY §5.0嚴格parse為整數UTC epoch ms；`seasonTimeMs`也是epoch，僅`seasonElapsedMs`扣seasonStartEpochMs，turnDurationMs起始提案60000。期限比較只用epoch，不拿elapsed直接比較expiresAt；恰等期限拒絕。wire無小數ISO子集與UI可無損顯示毫秒分開，需毫秒時傳整數，不截斷。QDUOJ jobId／submissionId不是另一個workId。

### 7.3 延遲、重送與授權取消

1. 玩家明示同意傳送程式碼及必要帳號／題目資訊；本地先保存草稿。離線 outbox 只記 `QUEUED_OFFLINE`，不標 AC；原始碼需分享預覽。
2. bridge 用 `(accountId, submissionId)` 與 payload digest 冪等受理；相同鍵同內容返回原工作，不同內容 `IDEMPOTENCY_CONFLICT`。每個已授權 work／grant 只受理一份 proof；語意失敗終結授權，新解題嘗試領新 grant 並受配額，系統故障只重試原 job／同 proof。callback 重送以遠端 jobId + receiptId 去重。
3. 網路逾時先查原 job，再以相同鍵重送；不在不知道遠端受理與否時開新 job。取消後保存取消 tombstone，遲到 callback 可留診斷但不得套用獎勵。
4. 領地任務必須先取得 [REPLAY_SPEC](REPLAY_SPEC.md) 的帳號／賽季／資源／profile／seed／nonce／期限授權。一般離線程式 AC 不可事後換成競賽收據。
5. 送出時授權有效仍不足：依 D18／REPLAY §6，同 turn／同起始 resourceVersion 的有效 work **聚合為整批一次 CAS**，交易內逐件重查 subject／revoke／cancel／season／resultDeadline／唯一 reward key。剔除無效項後重算合計，同批有效工作不互相 stale；batch ledger、per-work ledger／收據原子提交，各收據共用 settlementId。撤銷先提交的項目零效果；結算先完成後撤銷需獨立可稽核補償，不能刪歷史。
6. 已及時受理、排隊導致晚到的 OJ 結果按 challenge 的 resultDeadline／SEASON turn 歸屬處理；不同 turn、GC 或其他已提交 batch 已更動資源版本才判 resource stale。過期／取消／stale 不能改目標或改季補發。程式證明可保留，領地效果仍為未結算／拒絕。
7. 主線不等待伺服器：玩家隨時免費 shell／assisted 處理故事。遲到 AC 可新增程式證據，不能重領本地故事獎勵。

## 8. 正負驗收與責任

以下均為**驗收規格，尚未執行**。每項保留輸入 fixture、版本、預期效果與實際結果；負向測試須核對原 VFS、flags、ledger 未變。

| ID | 正／負 | 驗收 |
| --- | --- | --- |
| JUDGE-001 | 正 | 零鑰匙、新玩家、不啟用 Python、不連網，以 shell 路徑完成 T0427 並滿足 Ch1 gate |
| JUDGE-002 | 正 | 全程免費 assisted 可離港；storyResolved=true，programAC=false、competency=assisted；日後自解不重領 |
| JUDGE-003 | 負 | `submit sol.py` 在 runtime 未開放時回 RUNTIME_UNAVAILABLE，不讀程式字串假判、不產生 AC |
| JUDGE-004 | 正 | T0100 合法內部空格／連字號名字、寫檔或編輯器兩種路徑通過；能力只記 read/write |
| JUDGE-005 | 正 | T0427 直接管線與分階段等價管線均通過；counts 行排列不同仍相同語意 |
| JUDGE-006 | 負 | echo 固定 histogram、偽造 stdout、先 cat 再貼答案均不能取得 counting 證據 |
| JUDGE-007 | 負 | `.9/.10` 平手反序、漏 IP、重複 IP、N 標頭誤當日誌、額外列各有明確錯碼 |
| JUDGE-008 | 正／負 | CRLF／末尾 LF／允許欄寬通過；NUL、非正規 IPv4、額外欄位、無效 UTF-8 拒絕 |
| JUDGE-009 | 負 | 判題中編輯／換 source／取消後回覆不能錯套舊結果；原進度與獎勵不變 |
| JUDGE-010 | 正／負 | 原 Python 五組 tests 保留；兩個 wrong_* 仍在 metadata 指定測試被擋；不把開發機測試當 browser runtime 通過 |
| JUDGE-011 | 負 | 小測資 AC／shell pass 不可冒用 full program profile；測資或 comparator digest 改動必拒 mapping |
| JUDGE-012 | 正／負 | 相同 submission 重送回同收據；相同鍵不同程式拒絕；重複 callback 不多領 |
| JUDGE-013 | 負 | 錯 issuer／改 subject／偽簽章／換題號／過期授權均不結算；取消與 OJ 成功競態至多一次有效結算 |
| JUDGE-014 | 正／負 | legacy story flag 只明示投影；demo 白名單外 flag 不帶入；skip 不轉 AC |
| JUDGE-015 | 負 | 超限檔、輸出洪水、Worker 逾時及失敗回復；不留下半筆故事效果、未授權傳送或未釋放資源 |
| JUDGE-016 | 正 | program-local spike 全部有實機報告後才啟用；未過任一條仍標待做；原題、ID、原 fixtures 可完整回查 |
| JUDGE-017 | 負 | T0100 保持選擇性；未裁決前不新增「燈已亮但工單未做則不能渡海」門檻，不自行補寫兩次登記為正史 |
| JUDGE-018 | 正／負 | 四來源的台詞／任務結果／profile 一致；舊 flag 只有帶 origin 的舊進度投影，不能產生新路徑成果、程式 AC 或親自能力證據 |
| JUDGE-019 | 正／負 | file.edit 的 stale state/content、唯讀源、硬連結別名及取消均按原子邊界處理；未知 kind 未登錄時必拒，不偽裝 command／system.fact |
| JUDGE-020 | 正／負 | counts 分階段 pipeline 的 provenance 隨 save/compact/replay 可恢復；echo/editor 覆寫後舊 lineage 失效；純 file.read＋正確 stdout 不足以通過 counting |
| JUDGE-021 | 正／負 | T0427 assisted＋玩家 main 明選 b1.deferred 可離港，不自動發 K1／親見；舊 b1.done 不再唯一入口；延後可免費回訪 |
| JUDGE-022 | 正／負 | 同 turn／版本兩件有效 OJ work 納入同 batch、各一張同 settlementId 收據；取消一件後重算，不對其他同批項誤判 stale；語意重試須新 grant |

| 責任角色 | 交付／未知解除條件 |
| --- | --- |
| 內容作者／敘事 | 新 shell 題面、assisted 台詞、兩個 flag 的所有 gate 使用點與原獎勵映射；解決 T0100 字串邊界及「已登記點燈／選擇性登記工單」敘事矛盾；四來源的稱謂必須與結果 profile 一致 |
| 引擎／判題 | typed lineage、不可變 source、提交交易／取消、免費補救與 profile conformance；確認 work unit 計量 |
| 存檔／互通 | 證據／收據引用、reward key、legacy 遷移事件命名與 canonical 編碼整合 |
| runtime 研究負責人 | 待做的 Python spike；候選、包體／license／離線／資源限制報告，未驗收前不排「即將完成」 |
| OJ／後端 | QDUOJ 實例及 API 版本、mapping、簽章 key rotation／撤銷、outbox 與權威結算；目前皆未驗證 |
| QA | JUDGE-* 正負向、跨端語意與突變；真人 UX 驗證另記，不以自動走法替代 |

已對齊：actorId→profile.playerId、runId→lineageId、ProgressRecord 四欄、file.edit、ticket.resolve／quest.resolved、provenance effect、SAVE §7.1 閉包、D17 durable、D18 batch／workId、D19 branchHandled。外層 DTO 已登錄；真正規格缺口為 ENGINE §8.1 的 ENG-SUB-TICKET-TRACE／ENG-SUB-TICKET-EVIDENCE，producer／validator／持久化仍未實作。作者仍需裁決 O-N07；Python runtime spike、program comparator、QDUOJ API／測資 mapping／簽章部署仍按各自關卡處理。
