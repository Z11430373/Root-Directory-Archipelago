# 章節包格式、來源與離線發布契約

版本：0.2-draft｜2026-11-02｜**規劃基線，未實作；本文件驗收全部尚未執行**。

權威順序：[DECISIONS](../DECISIONS.md) → 本文件的 pack／generator 命名 → [ENGINE_CONTRACT](ENGINE_CONTRACT.md) 的 runtime 語意 → [SAVE_SCHEMA_2](SAVE_SCHEMA_2.md) 的編碼。命令子集見 [COMMAND_COMPATIBILITY](COMMAND_COMPATIBILITY.md)。本文件不補寫未取得的故事聖經；未知 F3–F8／K2–K8／隱藏結局仍是發布缺口。

## 1. 現況與目標

`demo-app/build.mjs::compileData` 目前把 YAML/text 編成 `DATA={yaml,text}`，檢查文字引用及 B0 固定文案，`src/data.js`／`dist/index.html` 為產物；build 的 1.5 MB 上限屬試玩版，不是新版 pack 預算。現有引擎是 JS modules，最後包成單檔 HTML；TS 共用引擎、manifest、pack loader、Service Worker 尚屬規劃。

新版一個章節包交付：**manifest＋唯讀 runtime data＋原始文字 bytes＋來源 map＋生成器參數規格＋正負測資＋驗收清單＋授權清單**。可獨立辦活動指可附明示 starter 進入該章，不代表玩家已親自完成前章。主線 1.0 範圍與 C1／M6／M7 分界沿 DECISIONS D01–D03。

章節包是資料，不含可執行的任意 JS／Shell／Python callback。生成器 ID 必須已在相容 engine registry；判題 runtime 的 executable/WASM 是獨立發行能力，不能透過內容包任意啟用。

## 2. Manifest 封閉欄位

| 欄位 | 型別／規則 |
| --- | --- |
| `packFormatVersion` | 整數 1；未知版本拒載。 |
| `packId` | `[a-z0-9][a-z0-9.-]{0,95}`，穩定身份，如 `ra.ch0`。 |
| `contentVersion` | 精確 semver 字串，不含浮動 `latest`。已發布版本不可換 bytes。 |
| `contentSchemaVersion` | 整數 1；compiled data 的 schema。 |
| `manifestHash` | `H("pack",manifest 去掉 manifestHash)`，完整 64 hex。 |
| `releaseStatus` | `draft`／`rc`／`released`；draft 可供作者預覽，不能冒稱主線已發布。 |
| `requires` | 精確 `{engineVersion,rulesVersion,commandSetVersion,stateSchemaVersion,hashVersion}`。可由 runtime 相容矩陣接納，但不可自行猜 range。 |
| `dependencies` | `{packId,contentVersion,manifestHash}[]`，按 packId 排序，精確閉包。 |
| `files` | FileEntry[]，按 path 碼點排序；每檔 raw bytes hash 與長度。 |
| `entrypoints` | `{story,activity}`；各為已列入 files 的相對 path 或 null。 |
| `exports` | `{id,kind,path,jsonPointer}[]`，按 kind、id 排序；統一符號 registry。 |
| `generators` | GeneratorSpec[]，按 generatorId 排序，見 §5。 |
| `sourceMapPath` | 指向 files 中 role=`source-map` 的 JSON。 |
| `timePolicy` | `{worldEpochMs,customAdvanceMaxMs,actionCostsMs}`；全部整數，actionCostsMs 為 actionId→ms。 |
| `actionBindingsPath` | files內runtime JSON；閉合引擎輸入→有守衛動作、route、exitSummary與ending policy的註冊表，見§3.1。 |
| `starterProfiles` | StarterProfile[]，按 starterId 排序；可空。 |
| `build` | `{compilerVersion,sourceTreeHash}`；sourceTreeHash 是被編譯的精確來源清單 hash。 |
| `licenses` | `{path,licenseId}[]`；未授權內容不能依「檔案已取得」當作可發布。 |

FileEntry 固定 `{path,role,byteLength,sha256,mediaType}`。role=`runtime`／`text`／`source-map`／`acceptance`／`license`。path 是 `/` 分隔相對路徑，不能有空段、`.`、`..`、反斜線、NUL、query、fragment、URL scheme／前導 slash；UTF-8 ≤1024 bytes。檔案實際 bytes 不做 CRLF→LF／Unicode 自動轉換再驗 hash；編譯器若作轉換，須明列產物的 bytes 與 source map。

`exports.kind` 可為 `chapter`、`quest`、`ticket`、`dialogue`、`branch`、`card`、`flag`、`checkpoint`、`generator`、`fixture`。原 ID Q0-1、T0100、T0427、K0、B0 等保留；跨包同 kind/id 重複拒絕，不能最後載入者覆蓋。JSON Pointer 符合 RFC 6901，指向檔案中實際存在且 ID 一致的記錄；runtime 只讀該 data，不執行 pointer 字串。

### 2.1 可解析 manifest 結構樣例

此為**格式樣例，不是可發布內容或測試 fixture**；所有 64 位 0 是示意 hash，byteLength=2 也只對示例空物件佔位。實際驗收必須換成實際 bytes 計算值，不得接受這份缺檔樣例。

```json
{
  "packFormatVersion": 1,
  "packId": "ra.ch0",
  "contentVersion": "0.2.0",
  "contentSchemaVersion": 1,
  "manifestHash": "0000000000000000000000000000000000000000000000000000000000000000",
  "releaseStatus": "draft",
  "requires": {
    "engineVersion": "0.2.0",
    "rulesVersion": "fullgame-rules/1",
    "commandSetVersion": "ra-shell/1",
    "stateSchemaVersion": 1,
    "hashVersion": "ra2-c14n-sha256-v1"
  },
  "dependencies": [],
  "files": [
    {"path":"data/ch0.json","role":"runtime","byteLength":2,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","mediaType":"application/json"},
    {"path":"source-map.json","role":"source-map","byteLength":2,"sha256":"0000000000000000000000000000000000000000000000000000000000000000","mediaType":"application/json"}
  ],
  "entrypoints": {"story":"data/ch0.json","activity":null},
  "exports": [],
  "generators": [],
  "sourceMapPath": "source-map.json",
  "timePolicy": {"worldEpochMs":0,"customAdvanceMaxMs":86400000,"actionCostsMs":{}},
  "actionBindingsPath": "data/ch0.json",
  "starterProfiles": [],
  "build": {"compilerVersion":"ra-content-compiler/1","sourceTreeHash":"0000000000000000000000000000000000000000000000000000000000000000"},
  "licenses": []
}
```

`worldEpochMs=0` 僅示例，不能替代既有 2031 年世界曆。正式值須由有來源的章節曆轉成固定 UTC 虛擬 epoch；CI 時間、檔案 mtime、故事事件時間是不同欄位，不互相推導未證實時序。

## 3. 內容版本、相依 DAG 與啟動

PackRef固定`{packId,contentVersion,manifestHash}`。D22將**鎖定目錄**與**已水合執行閉包**分開：packRefs是此次run全部預定章節及dependencies的精確manifest目錄，按packId→contentVersion→manifestHash碼點序排序；同packId只准一版。`contentSetHash=H("content-set",packRefs)`，不隨下載狀態變化。genesis必取得全部目錄manifests，但章節files可依§3.2分期取得。空集合不能啟動故事；尚未發布／無精確manifest的新章不能假填latest進目錄。

載入算法：

1. 取得使用者所選根 manifest；先限額與 strict parse，驗 manifestHash。
2. 對 dependencies 做 DFS 三色或等價 cycle 檢查；所有版本皆精確鎖定。循環、同 packId 不同 hash／版本、缺依賴、超限即拒絕，不自選「較新可用」。
3. 產生 deterministic topological order：零入度候選按 packId 碼點序取出；不得依網路完成順序註冊規則。ruleOrder 來自 compiled data 明示順序，不依檔案系統列舉。
4. 先核對全目錄manifest的exports名稱／dependencies／版本與全域符號唯一性；對本次**所需執行閉包**驗所有files長度＋SHA-256、exports實際指向、text／card／quest／checkpoint引用、flag scope及generator版本。未水合包只保留metadata，不能宣稱其bytes／JSON Pointer已驗；啟用前須完成同樣檢查。
5. 編譯限定 expression AST；拒未知函式、任意 code、無界 regex／循環、錯誤 schema；不採 eval。檢查主線 gate 的已知必需能力與免費補救路徑引用存在。
6. 用已驗所需閉包建立immutable執行registry，全目錄算固定contentSetHash；建立候選初始世界（inode分配依明示initializer），才允許session啟動。未水合包不註冊活動規則，任何本次會用到的缺件阻止dispatch，不以空guard或最新包替代。

`requires` 相容矩陣須隨 engine 發行且有向量；版本號同 major 不構成相容證據。存檔固定舊 packRefs，更新目錄不可改掉該 session 的內容。跨版本遷移是 `migrationId + sourceTuple + targetTuple + mapping + losses` 的明示流程，另開 save generation／lineage，保留原件；**不能讓進行中的世界在下一次 query 偷換文字與 gate**。

來源文字小改、測資修正、generator 輸出改變、排序 tie-break 改變皆發布新 contentVersion／manifestHash；是否同 rulesVersion 取決於核心語意有無改變。只改接受矩陣也需 engine 可追蹤發行。

### 3.1 D19/D20 action bindings（唯一註冊點）

`actionBindingsPath` 指向 `{bindingSchemaVersion:1,actions,flagDeclarations,branchScenarios,routes,endingPolicy}`。所有子物件封閉，未知 action reducer拒載；不接任意JS。actions每項 `{actionId,inputKind,selector,guardRef,reducerId,timeActionId,sourceRefs,enabled}`，selector為已註冊typed choice或command grammar匹配，guardRef指受限expression AST，sourceRefs為來源map記錄ID。多個action匹配同輸入須有明示優先序，基線為重複即拒。

| 固定 actionId／selector | 必須登錄的資料與效果 |
| --- | --- |
| `branch.defer.B0/B1`：choice.select 的 branch.offer.B0/B1 + defer | active=main且邀請可用；新增對應flag.b0/b1.deferred，scope=branch-progress、target=main；不給done/卡。branchHandled純投影done OR deferred，不能另存可獨立寫的布林。 |
| `branch.exit.B0/B1`：branch.leave＋scenarioId | branchScenarios[].exitSummary只允許明列目標 `{targetBranchId:"main",setFlags:[對應done]}`；merge必要證據先驗，abandon無卡；不能展開任意branch.flags。 |
| `branch.tag`：git tag NAME | ENGINE §4.3快照pin與tags，不退出。NAME上限及重名錯誤見COMMAND。 |
| `travel.<islandId>`：ssh islandId | routes項 `{routeId,fromIslandIds,toIslandId,toChapterId,targetPath,guardRef,timeActionId,revisitPolicy}`；revisitPolicy固定`preserve-current-world`。 |
| `travel.cronmine` | D20目前main旅行；結算前已開放路線必可補訪，不要求snapshot restore。已存在mount只切位置，未建立才從固定template初始化；不得重置其他島進度。 |
| `branch.enter.B3b` | 明確checkpoint source或template-entry，world隔離；merge只知識，沒有inventory/F5攜回。 |
| `item.acquire.F5` | 只能是main已核定取件或明示assisted動作的effect；正文未知時enabled=false、列發布阻塞，不從「完成B3b」自動發F5。 |
| `ending.prepare`：ending prepare | main＋完整已核定endingPolicy；保存beforeState snapshot並pin成功後開story.ending選項。 |
| `ending.return`：story.ending + return-investigation | 關閉review返回當前世界；不restore。 |
| `ending.select.<id>`：story.ending + 已核定id | 重新驗全部必要/排除條件、snapshot可讀；記一次主線選擇。不以七/八片必要條件代替完整公式。 |

flagDeclarations項 `{flagId,scope,writeTarget}`；scope沿ENGINE，四個done/deferred的writeTarget=main，寫入只由上述reducer或版本化legacy投影。branchScenarios項固定 `{scenarioId,entrySource,entryGuardRef,mergeEvidenceRuleRefs,exitSummary}`；entrySource為精確snapshot要求或明示template-entry，不能以缺snapshot靜默降級。selector／guard AST與entrySource細部子schema的實作關卡見§4.4，不能用「已列欄名」宣稱loader可直接執行。

endingPolicy=null表示正文未備齊；非null固定 `{policyId,sourceVersion,approved,reviewGuardRef,choiceId,options}`，choiceId=`story.ending`，每option `{endingId,guardRef,contentRef,sourceRefs}`；approved是內容發布流程的標記，需source map證據及發布驗收，客戶端自改不是權威批准。未知正文維持null/disabled，主線1.0完整發布仍阻塞，技術fixture須明示非正史。

MiniGit的 `git-check <predicateId>` 使用actions內的 `repo.predicate-check` reducer；repo fixture另列閉合 `{predicateId,predicateVersion,evaluatorId,parameters}` 清單，evaluatorId必須是engine內建有界實作。參數由對應predicate schema驗證，不接受任意程式／命令字串。每個predicate附good/bad/untestable fixture，完整報告與viewOid可引用；route及不自動分類規則見COMMAND §7.2。

同一主線closure的worldEpochMs必一致；旅行只累加既有storyTimeMs，不換epoch或倒回章節起始日。首次揭露／獎勵從保存的onceRuleIds與rewardLedger去重，回訪文案按當前知識/記憶選variant，不重新演「剛離開郵局」。F5/K4實際內容與取法仍待正文。

### 3.2 同 run 按章水合／續章（D22）

- **初始可只安裝Ch0 bytes**：先鎖定Ch0、Ch1等全目錄manifests，完整水合Ch0與共同基礎包的dependency closure。共同scheduler／全域規則必在每章依賴的基礎包；章節局部規則只對目前chapter／scenario有效，不能因背景下載完成就加入新規則改變同一input的結果。
- **所需閉包可純推導**：本次active chapter／scenario及其dependencies、state實際引用的內容／generators／pending scheduler／dialogue，加上本input目標的route／template／judge及dependencies。保存還原另含baseline、tail、retained checkpoints各自重建需要的閉包。每個所需pack必驗其完整files，不能只載一頁；跨包引用須在dependencies聲明，未聲明的建置錯誤拒絕，不臨時猜下載位置。
- 唯一延遲引用例外是route的`toChapterId/toIslandId/targetPath`：來源包保存guard／成本與目標識別，目標章由鎖定目錄的chapter export解析，在該travel准入才水合目標閉包；不因此將後續全章列成Ch0 eager dependency。其餘guard／textRef／generator／scheduler引用都是eager dependencies。建置驗目標metadata存在，旅行前再驗targetPath與initializer；全局預載目錄不等於先執行目標規則。
- **Ch0→Ch1**：從鎖定Ch1 manifest下載到隔離staging、驗完整閉包，原子切其installed generation。這一步是宿主安裝，stateHash／lineageId／seq／rewardLedger／history全不變。接著使用原run的`ssh`旅行input，expectedStateHash仍核對，按ENGINE正常一次轉移／初始化新島。已玩島保留、不重發獎；無需新lineage或內容升版。
- 缺目標bytes時在dispatch准入前回PACK_MISSING_DEPENDENCY／SAVE_PACK_MISSING並顯示精確版本、缺件與重試。下載取消、壞hash、quota或另頁改了state，均不先旅行／扣故事時間／切root；重新水合後重新預覽，不以舊expectedStateHash越過CAS。
- installed／hydrated是宿主cache狀態，不是EngineState新增欄位，也不進contentSetHash。同state＋input若資料齊全執行語意相同；缺件是宿主不可執行，不是另一個遊戲結果。離線標籤精確顯示「Ch0可離線／Ch1未下載」，只有全目錄bytes已驗可讀才稱「完整主線可離線」。
- **範圍限制**：本策略支援已鎖章節的延遲下載，不承諾run自動接入日後新發布manifest。初始目錄根本沒有Ch1，須原件保留的明示migration／新lineage；不能稱為本節正常續章。單檔完整發行仍嵌全目錄bytes，較小活動包標其獨立starter範圍。

## 4. Compiled data 與 source map

### 4.1 編譯輸入要求

- YAML 使用受限 schema，拒 duplicate key、可執行 tag、無界 alias 展開；數字用 SAVE 的安全整數 profile。輸入文字 raw hash 保留，UTF-8 解碼失敗報來源，不猜系統 codepage。
- 原 `files[].variants/hardlinks`、quest check、dialogue variants/keywords/expect_input、branches、flag ID 轉成有版本 runtime schema；轉換表隨 acceptance 檔交付。
- 規則 guard、順序、once、effect kind 必須顯式；未宣告 ID／多 writer 歧義／缺 fallback 不是 runtime 靜默 false。
- 本輪只定格式，不改原 YAML；D11 的 `link_time`→mtime 等修改由後續內容工作包成套更新來源、文案、題解、資料與對照測資。

### 4.2 SourceMapRecord 欄位

| 欄位 | 用途 |
| --- | --- |
| `outputPath` / `jsonPointer` | 精確定位 compiled 記錄。 |
| `sourcePath` / `sourceHash` | 原來源路徑與 bytes SHA-256，不能只鏈一份會改的網站。 |
| `startLine` / `endLine` | 1-based 含端點；生成內容若無逐行位置為 null，必須有 transformId。 |
| `transformId` | 已知 compiler transform；逐字保留為 `identity/1`。 |
| `evidenceClass` | `source-fact`／`adopted-design`／`proposal`／`unavailable`。 |
| `decisionRefs` | 如 `D11`、`N09`；本地來源引用可回查。 |
| `originUrl` / `sourceVersion` | 可 null；有 URL 仍不代表已取得正文。 |

sourceTreeHash=`H("source-tree",來源 [{path,sha256}] 碼點序清單)`。source map 本身列入 files 驗 hash；可另外封裝來源檔供作者稽核，但不得把 map 的「source-fact」標籤當真偽簽章。

故事聖經未取得段落、八空格／隱藏結局完整條件與後半碎片值標 `unavailable`；`releaseStatus=released` 的主線可達路徑引用此類未解必要內容時建置失敗。可以發 draft 結構預覽，不可拿敘事提案冒充正史。Ch0–Ch1 不因接受測資中有八片資料而在玩家輸出提前洩漏。

### 4.3 碎片排序與原始證據

採納 D11 與 [NARRATIVE_DEBATE N09/N12](../reviews/NARRATIVE_DEBATE.md)：待排序的**每一碎片**有獨立 file inode 與 mtime；該碎片的 aliases 才共享同一 inode。禁止把 F1/F2 或 F3–F8 全合成同一 inode，再聲稱各 alias 有不同建立時間。

載入後內容registry須提供 `fragmentSource` 記錄 `{fragmentId,sourcePath,sourceContentHash,sourceMtimeMs,sourceManifestHash,evidenceRef}`，evidenceRef 指 pack 中不可變證據 snapshot（原始 bytes／原文字時間／來源位置）。編譯來源先保存 `{fragmentId,sourcePath,sourceContentHash,sourceMtimeMs,sourcePackId,evidencePath}`，由驗證後loader將sourcePackId解析成manifestHash與evidenceRef；**不可把manifest自己的hash嵌進受它雜湊的檔案而形成循環**。`link_time` 舊值只能以有 decisionRef 的遷移解讀轉成 mtime，不能 silently rename 後宣稱原故事時序已證明。

- F2 `fsck` 修復若是恢復既有 inode／目錄 entry，保留 source mtime；若編輯內容則依命令改 mtime，原 source snapshot 仍可查。具體修復模型須在 Ch1 fixture 固定。
- schema2 匯出／匯入保留精確 inode、mtime 與 source evidence；legacy 投影從固定模板重建時明示「來源快照時間」，不是玩家的原 VFS 歷史。
- `ls -ltr` 依 live inode mtime＋命令規定 tie-break；不能暗用 fragmentId／link_time 排序。若正解要求唯一順序，內容作者需提供不同 mtime 或可查的額外證據；遇 tie 不由 loader 猜。
- 原始證據快照與 live 檔案分別顯示；任何「還原來源版本」操作是明示新動作，不在讀取／修復／匯入時偷偷替玩家洗回標準答案。
- mtime 不證明 lin 綁島／藏片行程時間，ctime 也不是建立時間。CI BLOCKED、拆片、熄燈、貓罷工的先後仍須有正文；不能用新 mtime 詞義自行補完 N12。

### 4.4 工單／互通綁定與子 schema 關卡

pack 以 exports.kind=ticket／固定 profile 引用 [TICKET_JUDGE](TICKET_JUDGE.md) 的工單契約；核心唯一入口／wire schema 在 ENGINE §3.3，不在 pack 另造 editor 或 fact 根格式：

- 內建編輯器套用只能是 `file.edit {islandId,path,expectedContentHash,content}`，inline內容UTF-8≤64 KiB、故事成本0。工作區、readonly來源、來源snapshot、ticketId/profileVersion由固定profile核對；pack不可放寬為較大文字或換成其他payload。
- counting trace 使用 `ticket-provenance/1`、externalFacts／blobs、`ticket.provenance.recorded`；profile必須能判定每個被追蹤工作區／inode所屬工單。等價cut/sort/group-count能力依版本化producer語意，不能只給一條命令字串當唯一合法解。新writer包含editor/literal覆寫，不能繼承舊計數證據。
- TicketResolution/1／TicketEvidenceBundle/1、KnowledgeImportFact/1／staging、MergeResolutionFact/1 與 OutputRecord/1 依 ENGINE／SAVE registry；pack僅提供它們用到的精確profile／policy／rule／textRef，不能以任意JSON資料包代替核心validator。原件／trace parents／artifact／receipt閉包保留沿SAVE §7.1。
- 卡片 EvidenceRecord 永遠六欄；variant／scope／NPC教學來源從contentSetHash固定的ruleId查得。`npc-guided`是simulated＋NPC ruleId的UI視圖，轉寄不更改原type／evidenceId。starter授予不生成親自驗證。

| 實作前阻塞 | 尚缺的精確 schema／解除條件 | 未解除行為 |
| --- | --- | --- |
| `PACK-SUB-RULE` | action selector的各inputKind判別式、guardRef指向的expression AST節點enum／arity／型別／bounds、reducerId封閉列表、branch entrySource模板定位及mergeEvidenceRuleRefs的精確驗證schema。 | §3.1已固定動作路由與守衛語意，但這些DSL尚非完整wire schema；先完成規格／驗證器再執行相應action，未知資料回PACK_SCHEMA_INVALID，不以空guard=true。 |
| `PACK-SUB-CONTENT` | 每個compiled dialogue／quest／variants／scheduler事件及textRef參數表的封閉schema；每個generator的parameterSchemaPath／輸出contract實體schema與fixtures。 | 引擎無已驗收schema／capability的內容不可發布為可執行；outer manifest合法不等於內容typed完整。 |
| `PACK-SUB-INTEROP` | ENGINE §8.1列出的trace op.params、工單證據ref子型別、share子項、Boss／MiniGit data及report；M6 ReplayAssessment另有明列blocker。 | 各owner在實作producer前補齊，registry拒未知子欄位；不能由pack擅自啟用program runtime、任意fact或假counting。 |

這些是工程子schema缺口；F5／K4、後半卡片／結局與時序的正文缺口仍是獨立內容發布阻塞。技術fixture不視為作者批准的正史。

## 5. 生成器、seed 與百萬行預算

**生成檔的最終欄位權威**：保存實例使用 SAVE 的 `content.kind="generated"` 及 `generatorId,generatorVersion,seed,parameters,sourceManifestHash,logicalByteLength,logicalContentHash`；其他規格的 logical profile 只作意圖說明，不另造 root 欄位。

模板／manifest建置期以sourcePackId引用自己或依賴；先算檔案hash，再算manifestHash，loader才實例化sourceManifestHash。世界初始stateHash在此之後計算。pack的bytes、manifest與runtime state之間不得有自我hash循環。

| GeneratorSpec 欄位 | 規則 |
| --- | --- |
| `generatorId` / `generatorVersion` | 精確 registry ID／版本；舊 `loggen.js` 作 legacy implementation 保留。 |
| `algorithm` | `mulberry32-u32/1` 或 engine 已明示實作的後繼版本；未知拒絕。 |
| `seedPolicy` | `{kind:"world-seed-derived",domain}` 或 `{kind:"fixed",seed}`。 |
| `parameterSchemaPath` | 檔案中封閉參數 schema／bounds；所有預設由編譯器展開後保存。 |
| `indexPolicy` | `{kind,blockLines}`；kind=`block-prng-index` 或已註冊策略，不能只填「lazy」就算完成。 |
| `outputContract` | `{encoding,lineEnding,finalNewline,orderVersion,manifestSchemaPath}`。 |

新 seed derivation：`seed = uint32BigEndian(first4Bytes(H("generator-seed",{worldSeed,generatorId,generatorVersion,domain})))`；H 的 hex 先還原 digest bytes。domain 是 pack 明示常數；保存 seed 後仍核對 derivation，不由讀取時的全域 PRNG 分配。舊 JS generator 的 XOR 子種子與 draw 次序不得改成這算法再自稱 legacy 相容。

新 generator 必須對相同 descriptor 在瀏覽器／Node 得到逐 byte 相同輸出與 manifest。現有 ENGINE_REQS 允許 Python 只符 I1–I7，不代表可用不同 Python bytes 驗同存檔；本版 golden vectors 要選定 generatorVersion 的具體輸出。只滿足統計不變量不足以核對 state／stdout hash。

索引為可重建快取：每 block 固定行數、起始 PRNG state／序號、bytes offset 與 block hash。cache 不進 stateHash；從 cold／warm cache 讀同範圍必須相同。head 只讀所需前塊；tail 由已驗證末塊索引定位，若需建立索引，首次建立成本要在能力／性能報告中揭露，不宣稱 O(1) 首讀。I/O chunk boundary 不能改 PRNG draw 次序。logicalContentHash 需串流整份輸出計算，不能以 seed hash 冒充檔案 hash。

| 資源 | 提案上限／目標（未量測） |
| --- | --- |
| 單 manifest／closure pack 數 | 1 MiB／128 packs；DAG depth≤32。 |
| 單 pack files／單 file | 10000 檔／16 MiB raw；大型實際生成檔不作 manifest 實體檔。 |
| 全 closure 實體 bytes | 128 MiB；同 hash 可 dedup，但存放配額仍需預檢。 |
| 生成檔 | 單 logical file≤512 MiB；每行≤64 KiB bytes。 |
| 百萬行日誌 | 120 萬行提案；64 KiB stream chunks、worker live heap≤128 MiB 目標。 |
| `sort \| uniq -c` | 固定桌機 p95≤2秒目標；外部 sort scratch≤256 MiB 提案。 |

所有預算皆需 fixture、裝置矩陣與冷／暖啟動測量；現有 demo 先實體化字串，未達上述能力。低基數 counting 最佳化只有能證明輸出 byte 相同才可用；不可把預存答案當成玩家真的跑過指令。file:// 缺 scratch 時明示能力不足或使用另標 contentVersion 的小資料活動包，不能聲稱同一百萬行題已通過。

## 6. 離線下載與原子更新

狀態機：`absent → downloading → verifying → staged → installed → active`；任何失敗只丟棄未引用 staging，舊 active closure 不受影響。

1. 使用者選鎖定目錄內pack／版本後固定該pack完整dependency closure與所需bytes；顯示缺資料與配額估算。不是每次都下載全目錄所有章。暫存按manifestHash／file sha256尋址，不寫現有active namespace。
2. 完整下載 manifest、所有 runtime/text/source-map/必要 acceptance／license 檔與 generator registry 所需 runtime artifact。**不是只載目前一頁**就顯示「可完整離線」。
3. 逐檔增量驗 bytes 長度與 SHA-256；缺任何必需檔或錯 hash 都不 activate。可斷點重用已驗證 immutable blobs，不接受未驗證 partial byte range。
4. 在隔離 registry 驗 DAG、符號、schema、入口與時間 policy。所需 runtime 不相容時保留下載但不可執行。
5. 所有 bytes 已存在後，在單一 IDB metadata transaction 寫 closure generation＋active pointer。SW Cache 可作重建快取，不將 Cache API 多次 put 冒稱跨 store 原子交易；pack authoritative bytes／存在性以 generation 引用閉包為準。
6. activation不改正在玩的save.packRefs；可為其已鎖章節補齊bytes並依§3.2續章。新版本只供新遊戲／明示遷移。移除舊closure前檢查所有save／pin引用；有引用就保留或要求先匯出，不能靜默GC。
7. 開啟離線模式前核對 closure 可讀；瀏覽器儲存被回收時降為 `missing`，提示缺包。先前顯示 installed 不等於瀏覽器永不驅逐儲存。

更新 crash 注入點須覆蓋每個檔案、verification 前後、metadata transaction、首次開啟；重啟只能看到原完整 generation 或新完整 generation。配額不足／網路中斷不得讓章節選單可選但一半對話缺檔。

### 6.1 file:// 單檔策略

- 活動版 build 將精確 engine、manifest closure、文字、固定 registry、必要 Worker bytes 內嵌同一 HTML；不依 fetch 同目錄 JSON、CDN、Service Worker、動態網路下載或未經允許的 imports。
- 保留目前 esbuild＋CSP hash 發行方式，Worker 以 Blob 建立；CSP 明示授權 blob worker，仍 `connect-src 'none'`。新 bundle 的 CSP/hash 由 build 產生，不手改生成檔。
- 檔案匯入用明示 picker，匯出 Blob download。儲存／crypto／Worker 不支援時依 SAVE 救援；沒有相容 hash implementation 時不宣稱保存自檢完成。
- 單檔更新是另發完整版本 HTML，不在打開舊檔時替換內嵌 pack。匯入新 save 缺版本時顯示缺少發行版，保留原檔；可提供相容下載資訊但不自動執行遠端內容。
- 單檔完整 closure 的 bytes／啟動峰值需量測。若 128 MiB 預算無法接受，發布較窄章節活動版與明示進度投影，不宣稱與完整版功能／資料量完全相同。

## 7. 獨立活動 StarterProfile

| 欄位 | 意義 |
| --- | --- |
| `starterId` | 穩定 profile ID，作 save.origin.starterId。 |
| `entrypointPath` | 精確世界模板。 |
| `chapterId` / `checkpointId` | 活動開始位置；checkpointId 只指模板入口，不是假過去 snapshot。 |
| `prerequisitePolicy` | 固定 `scenario-grant`；不能為 `player-completed`。 |
| `grants` | `{kind,id,reasonRef}[]`，只給情境所需世界條件／道具／NPC 補位；附來源文案。 |
| `evidencePolicy` | 固定 `simulated-origin`。 |
| `returnPolicy` | `separate-save` 或 `eligible-knowledge-only`；不能覆蓋既有主線世界。 |

可解析樣例（僅示範活動入口，不宣稱 Ch2 正式 gate 已定）：

```json
{
  "starterId":"activity.ch2.intro",
  "entrypointPath":"starters/ch2-intro.json",
  "chapterId":"ch2",
  "checkpointId":"entry/activity-ch2",
  "prerequisitePolicy":"scenario-grant",
  "grants":[{"kind":"scenario-access","id":"entry.ch2","reasonRef":"activity.setup"}],
  "evidencePolicy":"simulated-origin",
  "returnPolicy":"eligible-knowledge-only"
}
```

起始 save.origin.kind=`activity-starter`；不新增 Q0..Q1 task／B0..B1 親自完成／K0/K1 self-verified／程式 AC，不播「你以前已做過」的 NPC 記憶。活動中實際完成的行動仍可保存，但來源帶 starterId；是否可作主線 gate／排行證據由 MERGE／REPLAY 明定，不能洗掉 starter origin。活動沒有前章檔案歷史，UI 不提供虛構回溯點。

## 8. 錯誤碼

| code | 期望回應 |
| --- | --- |
| `PACK_FORMAT_UNSUPPORTED` / `PACK_RUNTIME_INCOMPATIBLE` | 原件保留；列缺少版本，不猜降級。 |
| `PACK_DEPENDENCY_CYCLE` / `PACK_VERSION_CONFLICT` / `PACK_DEPENDENCY_MISSING` | 顯示具體 pack chain，拒整個候選 closure。 |
| `PACK_FILE_HASH` / `PACK_FILE_MISSING` / `PACK_PATH_INVALID` | 不 activate；定位 path，允許重新下載原精確 bytes。 |
| `PACK_SYMBOL_DUPLICATE` / `PACK_REFERENCE_MISSING` | 建置／載入都拒；不可 last-writer-wins。 |
| `PACK_SCHEMA_INVALID` / `PACK_GENERATOR_UNKNOWN` | 不執行資料；提缺 schema／registry ID。 |
| `PACK_SOURCE_UNAVAILABLE` | draft 可預覽缺口；正式必需路徑發布阻塞。 |
| `PACK_QUOTA` / `PACK_LIMIT` / `PACK_DOWNLOAD_INTERRUPTED` | 舊 closure 可用；保留已驗證 chunks 或清 staging，不留下半套活躍包。 |
| `PACK_IN_USE` | 仍被 save／checkpoint 引用，拒直接清除。 |

## 9. 正負驗收與跨版本向量（尚未執行）

| ID | 正例 | 負例／必拒 |
| --- | --- | --- |
| PACK-001 | 相同來源／compiler 產出相同 manifests、檔案 bytes、sourceTreeHash。 | OS readdir／locale／CRLF 差異不能無聲改輸出或 hash。 |
| PACK-002 | 依賴不同下載順序產同一 registry／contentSetHash。 | DAG cycle、同 ID 多版本、缺依賴、重複符號必拒。 |
| PACK-003 | Ch0–Ch1 legacy profile 對四條 walkthrough 保留原逐 commit。 | fullgame rules 的時鐘改變不得混用 legacy 預期 hash。 |
| PACK-004 | 精確 seed＋generatorVersion 的 bytes／manifest 跨瀏覽器 Node 一致。 | 只滿足 I1–I7、卻不同 bytes 不能當同版本。 |
| PACK-005 | 完整 closure 下載後斷網可走全章與補救路徑。 | 只載首頁／遺漏分支文字不能標 offlineReady。 |
| PACK-006 | 每個下載／activation crash 點仍有完整舊版或新版。 | quota 下不得先刪舊包；更新不能改執行中 save 的版本。 |
| PACK-007 | file:// HTML 在斷網／不支援 SW 下啟動內嵌包。 | 不能偷偷依賴相對 fetch／CDN／線上判題 runtime。 |
| PACK-008 | 活動 starter 有清楚情境授予與來源，能單獨開始。 | 前章進度、NPC 本人記憶、K0/K1 與 AC 不得造假。 |
| PACK-009 | 每片獨立 inode、source mtime、evidence snapshot；F2 修復與 roundtrip 排序一致。 | 同 inode 假不同 mtime、用 fragmentId 當 `ls -t` 排序、把 mtime 當藏片行程皆不通過。 |
| PACK-010 | head/tail cold/warm 讀取量與記憶體有測量報告。 | 完整實體化但標 lazy、預存題目答案當指令結果不通過。 |
| PACK-011 | source map 標明 proposal/unavailable，發布 gate 會阻擋缺正文的必要路徑。 | 取得不了聖經卻填造後半台詞／結局測資不可作驗收證據。 |
| PACK-012 | B0/B1四個done/deferred正確scope；main回訪route與B3b隔離、F5取件分開。 | 無exitSummary白名單就聯集flags、tag當exit、endingPolicy=null仍可結局皆拒。 |
| PACK-013 | 工單綁定inline edit／單profile trace與完整source/artifact閉包；卡片六欄＋固定ruleId可重建variant。 | pack另造blob-only編輯payload、npc-guided enum、任意op.params／未定DSL仍標enabled皆拒。 |

跨版本清單：V-PACK-L1 DATA 舊版→legacy manifest；V-PACK-N1 same tuple 不同 build 平台；V-PACK-N2 contentVersion 新增不覆寫舊 save；V-PACK-N3 未知 packFormat/contentSchema/generator 拒載；V-PACK-N4 相容 engine matrix 接舊包／不在矩陣拒；V-PACK-N5 starter→主線 eligible knowledge 的來源保留；V-PACK-N6 舊 link_time 資料→明示 mtime 遷移與未定時序缺口；V-PACK-N7 相同外層manifest、未知trace/profile/DSL子schema必拒而非默認相容。每向量附精確 bytes、hash、期望符號表／losses／錯誤碼，不使用本文件佔位 hash。

## 10. 交接與實作退出條件

- [TICKET_JUDGE](TICKET_JUDGE.md)：題目 schema、測資 raw hash、runtime 能力都列入 closure；真 Python 未通過離線 spike 前不得在 pack 宣告 program-local 可用。
- [MERGE_SPEC](MERGE_SPEC.md)：source pack／starter／legacy來源不可丟；knowledge 適用 gate 由內容顯式定義，不能匯入旗標整包覆蓋。
- [REPLAY_SPEC](REPLAY_SPEC.md)：驗精確 manifest closure、generator bytes／固定依賴，不讀 latest；只接受可定位的 registry build。
- [MINIGIT_SPEC](MINIGIT_SPEC.md)：歷史 fixture／物件內容列 files 或生成器輸出，單檔也需閉包；真 Git 語意對照與遊戲 extensions 分開。
- [INTERACTION_SPEC](../ux/INTERACTION_SPEC.md)：下載 bytes／缺包／更新／來源差異／starter 標示，供使用者理解何時能真正離線。

實作順序：manifest/schema/來源 map → 單章 immutable registry → DAG staging/atomic activation → legacy Ch0–Ch1 對照 → 生成檔 seek/hash/sort spike → 單檔／靜態站兩 adapter。交付代理必須附未達標項與限制，不能因文件存在就把「全章已驗收」打勾。
