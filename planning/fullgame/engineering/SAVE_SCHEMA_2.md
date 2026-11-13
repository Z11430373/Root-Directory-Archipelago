# Save schema 2：可攜世界、遷移與還原契約

版本：0.2-draft｜2026-11-02｜**規劃基線，未實作；驗收向量全部尚未執行**。

上位：[DECISIONS](../DECISIONS.md) D08–D09、D13–D15。共用狀態欄位由 [ENGINE_CONTRACT](ENGINE_CONTRACT.md) 定義；本文件是 save、portable VFS、canonical 與所有新版 hash 的命名／編碼權威。主格式 `.rasave.json`，M1 不新增短代碼 RA2，也不在 RA1 夾帶新版欄位。

## 1. 現況與明確決策

現有 `demo-app/src/save/{canonical,hash,state,codec,json,validate,fold,integrity,import,score,card,config,crc32,errors,index}.js` 的公開 API 與 schema 1 保留在 legacy reader。特別注意：

- `hash.js` 是 `sha256(parent + canonical(body))` 的**前 8 hex**；body 為 `branch,chapter,kind,data,t,r`。CRC32 只防貼錯。兩者不作安全驗真。
- `codec.js` 的 RA1 用 zlib＋base64url＋CRC；緊湊列沒有各筆 ID，legacy reader 按原算法重建；JSON 存檔則直接含原 ID。
- `fold.js` 只投影旗標／任務／物品等，不能恢復任意檔案／cwd。`import.js::toFullgame` 回傳的是舊投影資料，不是已實作完整版存檔。
- `storage.js` 的本機 envelope 才有完整操作 journal；`ui/session-storage.js` 比較完整原字串，Web Locks 是同鍵協作鎖，fallback 不保證跨 process 原子性。
- `demo/import_rules.yaml` 的「匯入就是重放」需在新版 UI 改稱**進度投影**；沒有輸入歷史就不能做完整引擎 replay。原 YAML 本輪不改。

**新權威模型：baseline 完整 EngineState＋其後連續 journal。** baseline 是保存點的唯一世界狀態；journal 的 inputs 逐筆重新執行得到目前世界。`head` 是待核對摘要，effects 是待核對結果，額外 snapshots 是加速／回溯資料；它們不是可任選的一套「另一個真相」。任何兩者矛盾都拒絕候選，不挑較新時間、不自動修鏈。

## 2. 外層格式與資料流

| 欄位 | 型別／必填 | 規則 |
| --- | --- | --- |
| `format` | string | 固定 `root-archipelago-save`。 |
| `schema` | int | 固定 2；未知值只保留原件、拒執行。 |
| `saveId` | ASCII ID | 本地存檔槽身份，1–96 字元；不等於帳號或 state.lineageId。 |
| `baseline` | Baseline | 本表下述完整狀態。 |
| `journal` | JournalRecord[] | baseline 後的連續操作；可空，不可缺段。 |
| `head` | `{seq,commitId,stateHash}` | 導出值的斷言，三項皆必須與重建結果相同。 |
| `history` | History | 可回溯範圍、舊段、保留 checkpoint，見 §7。 |
| `blobs` | BlobRecord[] | 按 blobHash 排序、去重；完整引用閉包。 |
| `legacySources` | LegacySource[] | 不可改寫的舊原件引用與原分級；無則空。 |
| `annotations` | object | 非世界／非驗真資訊，僅允許 `activityClock,exportedAt,label`；可為空。 |
| `saveHash` | 64 hex | 全檔語意內容 hash，按 §4；不含自身與 annotations。 |

Baseline 為 `{seq,commitId,stateHash,state}`。`state.seq === seq`；`state` 是完整 EngineState；`stateHash=H("state",state)`。新遊戲 baseline.seq=0、commitId=null；compact 後 baseline.seq 可以大於 0，commitId 必須是已驗證被 compact 段尾的原完整 ID。新起點／legacy 投影即使 seq=0，也不等同「已證明新遊戲 genesis」。

| JournalRecord 欄位 | 定義 |
| --- | --- |
| `seq` | 前一 seq＋1。 |
| `commitId` | 本 record 除 commitId 後的 `H("commit", body)`。 |
| `parentCommitId` | 前一筆 commitId；第一筆等於 baseline.commitId，可 null。 |
| `input` | ENGINE_CONTRACT Input；expectedStateHash 必須等於 beforeStateHash。 |
| `beforeStateHash` / `afterStateHash` | 每筆執行前後完整 EngineState 摘要。 |
| `effects` | 有序 effects；不是任意 JSON，可由 kind schema 驗證。 |
| `effectsHash` | `H("effects",effects)`，不可只核對客戶端自行提供的結果。 |
| `storyTimeMs` | 提交後輸入目標分支的故事時間；離開分支仍記原目標，active 可能已是 main。 |

還原：parse → schema/limits → blob/pack references → baseline hash/invariants → 每筆驗 input/prehash/parent/seq → 執行核心 → 比 effects/afterhash → 驗 commitId → 驗 head/saveHash → 發布候選。不得在還原時重播 UI 對話 side effect／發網路／發獎勵到另一存檔。

Journal 的非決定性輸入必須顯式資料化：外部 receipt、匯入證據、活動 fixture 均以完整 hash 指向保存的 bytes；執行不能依現在時間重新下載「相同 URL 最新版本」。只有使用者許可的獨立 replay 工作可使用網路取得缺少的固定 artifact。

## 3. Portable VFS inode 圖

### 3.1 圖格式

每個 branch 的 `vfs` 是封閉物件：

| 欄位 | 型別／規則 |
| --- | --- |
| `mounts` | `{islandId,deviceId,rootInodeId}[]`，按 islandId 排序。1.0 基線一島一 device，跨島不共用 inode。 |
| `inodes` | Inode[]，按 deviceId 的 Unicode 碼點順序、inodeId 數值排序。 |
| `entries` | `{deviceId,parentInodeId,name,inodeId}[]`，依 deviceId、parentInodeId 數值、name 碼點排序。 |
| `cwd` / `home` | `{islandId,path}`；規範絕對 path，必須能解析至目錄。 |
| `nextInodeId` | deviceId → 下一個安全整數 ID；大於該 device 所有已分配且保留的 inodeId，永不重用。 |

Inode 必填 `{deviceId,inodeId,type,mode,uid,gid,mtimeMs,ctimeMs,readonly,content,sourceEvidenceRef}`。type=`dir` 或 `file`；mode 為 0..4095 整數（含權限位，不混 type）；uid/gid 非負安全整數；dir.content=null，file.content 為下表之一。sourceEvidenceRef 為 null 或 `{manifestHash,path,sha256}`，指不可變來源證據 snapshot，納入 stateHash 並驗引用閉包；dir 此欄為 null。工單 writer provenance 從 externalFacts／blobs 導出，不另存 inode.provenanceRef 作第二權威。

| content.kind | 欄位 | 權威 |
| --- | --- | --- |
| `blob` | `blobHash,byteLength` | blobs 裡的實際原始 bytes；玩家寫入使用此類。 |
| `pack` | `packId,manifestHash,path,blobHash,byteLength` | 精確已驗證 manifest 中的檔案；不讀另一版本同名檔。 |
| `generated` | `generatorId,generatorVersion,seed,parameters,sourceManifestHash,logicalByteLength,logicalContentHash` | 固定產生器＋uint32 seed＋參數；logicalContentHash 是完整輸出 bytes SHA-256。 |
| `variants` | `packId,manifestHash,variantSetId` | pack 中有序條件與內容 hash；讀取使用該 branch.flags，不能看全域共享 Set。 |

BlobRecord 固定 `{blobHash,encoding,byteLength,data}`；encoding=`base64url`（無 padding、尾位合規、重編碼相等）；blobHash=`SHA256(decoded bytes)`，byteLength 為解碼後 bytes 數。一般檔案允許任意 bytes；文字顯示才進行 UTF-8 解碼，壞 UTF-8 不能被 replacement 字元覆寫回檔案。

圖的不變量：

1. 每個 mount root 是同 device 的目錄；每個 entry 的父存在且為 dir，子 inode 存在且同 device；禁止懸空引用。
2. `name` 為非空 Unicode scalar 字串，UTF-8 ≤255 bytes；不含 `/`、NUL，不是 `.` 或 `..`。同 parent 的 name 唯一；不做 NFC/NFD 正規化，不套 Windows 大小寫／保留名稱規則。
3. 目錄不能 hardlink、不能有循環；除 root 外每個目錄恰有一父；file 可多 entry。不可達 inode 不保存（開啟中、已 unlink 的暫態 inode 不跨交易存檔）。
4. `nlink`、完整 path、目錄列表是圖的導出值，不另存可矛盾副本。dir 的 Unix 顯示 link count 依支援 profile 另算，不把子 entry 數直接稱 nlink。
5. `mtimeMs`／`ctimeMs` 為**虛擬 Unix epoch 毫秒**，由 pack 的 `worldEpochMs + storyTimeMs` 或來源 fixture 決定；可表達既有歷史時間，值為安全整數，不讀檔案宿主 mtime。link 改 ctime／目錄，不創造每個名稱各自 mtime；讀檔不更新 atime。
6. 覆寫 hardlink 必須改同 inode 內容；unlink 只移除名稱。`readonly`、mode 與 variants 適用 inode，不可藉別名繞過。玩家覆寫 variants 轉成 blob，所有別名同步看見。
7. 路徑解析只在所選 island 的 root 內；`..` 到 root 停止。相同 deviceId/inodeId 在不同 branch 是獨立副本，不能用全域物件 identity 串起兩分支。
8. 同 byteLength／hash 的 blob 可共用 immutable bytes；**不同 inode 即使內容相同也不可合併成硬連結**。保存 allocator、防重綁的讀取事件與 cwd，才能保留後續行為。
9. 每個碎片各有 file inode／source mtime；同片 aliases 才共享。F2 修復保留原 inode 與來源時間的模型須固定 fixture；匯入不能用現在時間覆蓋。sourceEvidenceRef 保存原始證據，live mtime 變更仍可查來源；它不證明硬連結建立／藏片行程或 CI／貓罷工時序。
10. `ticket-provenance/1` 的權威引用只在 externalFacts，其 canonical trace bytes 在 blobs，schema owner 為 TICKET §4.4。引用圖須無環、同 trace parents 指較小 ordinal、跨 trace parents 全部存在，版本／params 受 ENGINE §8.1 關卡限制。不能裁掉跨指令 counting graph；有效 writer 查詢索引可全部重建，不保存 runtime.ticketEvidenceState。hardlink同 inode、同bytes再寫與分支fork的判定沿ENGINE §4.2。

生成檔可不把 120 萬行展開進 save，但必須能在相容 runtime＋精確已安裝 pack 還原相同 bytes。manifest 不在本機時，匯入 preview 顯示「缺內容包」，不改用新 generator；單檔發行須內嵌閉包。portable 指跨相容宿主可還原，不表示存檔內嵌整個 executable。完整離線移交須同時提供對應發行檔／pack closure。

### 3.2 可解析結構樣例

以下是 `vfs` 子物件樣例：根目錄下 a、b 共用 inode 2；cwd/home 為 `/` 只是格式示例，不宣稱 Ch0 正式起始世界。全零 blob hash 是**示意值，驗證器必須拒絕缺少對應 blob 的此片段**。

```json
{
  "mounts": [{"islandId":"lighthouse","deviceId":"dev:lighthouse","rootInodeId":1}],
  "inodes": [
    {"deviceId":"dev:lighthouse","inodeId":1,"type":"dir","mode":493,"uid":1000,"gid":1000,"mtimeMs":0,"ctimeMs":0,"readonly":false,"content":null,"sourceEvidenceRef":null},
    {"deviceId":"dev:lighthouse","inodeId":2,"type":"file","mode":420,"uid":1000,"gid":1000,"mtimeMs":1000,"ctimeMs":2000,"readonly":false,"content":{"kind":"blob","blobHash":"0000000000000000000000000000000000000000000000000000000000000000","byteLength":2},"sourceEvidenceRef":null}
  ],
  "entries": [
    {"deviceId":"dev:lighthouse","parentInodeId":1,"name":"a","inodeId":2},
    {"deviceId":"dev:lighthouse","parentInodeId":1,"name":"b","inodeId":2}
  ],
  "cwd": {"islandId":"lighthouse","path":"/"},
  "home": {"islandId":"lighthouse","path":"/"},
  "nextInodeId": {"dev:lighthouse":3}
}
```

## 4. Canonical／完整 hash 規則

算法 ID：`ra2-c14n-sha256-v1`。這是本專案整數 JSON profile，**不冒稱 RFC 8785/JCS**（本規則鍵序採 Unicode 碼點，與 UTF-16 鍵序規則不同）。不得直接替換 legacy canonical 而重算舊鏈。

### 4.1 C(value)

1. 輸入 bytes 以 strict UTF-8 解碼，拒 BOM、非法序列、孤立 surrogate、JSON 尾料與重複 key（包括 escape 後相同的 key）。讀取原字串時亦拒孤立 surrogate。
2. 只允許 null、boolean、string、整數、陣列、普通／null-prototype object；拒 undefined、NaN、Infinity、BigInt、Date、Map、Set、getter、symbol、循環、稀疏陣列、額外陣列屬性。JSON 解析不得使用 eval。
3. 數字詞法僅 `-?(0|[1-9][0-9]*)`，拒 `1.0`、`1e0`、`+1`、前導零。範圍 `[-9007199254740991,9007199254740991]`；`-0` 接受後 canonical 為 `0`。時間、seq、count 再按欄位拒負值。布林不能當整數。
4. 字串保持原 Unicode scalar sequence，**不 normalize**、不改換行、不 trim、不依語系大小寫折疊。`é` 與 `e`＋combining acute 是不同資料，空格／NBSP／零寬字元均保留。
5. string/key encoding：雙引號與反斜線分別 `\"`、`\\`；U+0008/0009/000A/000C/000D 用 `\b/\t/\n/\f/\r`；其他 U+0000..001F 用小寫四位 `\u00xx`；其他 scalar 直接 UTF-8（含 `/`、U+2028/U+2029 與 astral），不用 surrogate escape、不做 HTML escaping。
6. Object key 依**解碼後 Unicode 碼點值逐一比較**，共同前綴較短者先；例如 U+E000 在 U+10000 前。不能用 JS 預設 sort／localeCompare，也不能靠 JS 整數 key 的列舉次序。
7. Object 輸出 `{key:value,...}`，陣列輸出 `[value,...]`，無空白／BOM／末尾換行。陣列順序保留；欄位定義為集合者須事先排序／去重，匯入遇非 canonical 的集合順序拒形狀而非悄悄改值。
8. 所有 schema 為封閉欄位；預留擴充透過升版本。禁止 object keys `__proto__`、`constructor`、`prototype`，保護實作邊界；它們若是合法檔名以 entries[].name 字串保存，不當 key。

可直接解析的 canonical 規則示例（尚未作跨語言驗收）：

```json
{"input":{"𐀀":2,"":1,"z":-0},"expectedCanonical":"{\"z\":0,\"\":1,\"𐀀\":2}"}
```

### 4.2 Domain separation 與包含範圍

`H(tag,value) = lowercaseHex(SHA256(UTF8("RA2/" + tag + "/1\n") || UTF8(C(value))))`。`||` 為 bytes 串接，前綴中的 `\n` 是單一 LF byte。輸出固定 **64 個小寫 hex**，不截斷；UI 可顯示前 8 碼但不得用顯示值索引、比較完整性或授權。

| 名稱 | 精確輸入 |
| --- | --- |
| `stateHash` | `H("state", EngineState)`；包含版本、origin、profile、seq、所有保留分支、全部規則 runtime、PRNG、VFS 描述、知識、rewardLedger、externalFacts。 |
| `effectsHash` | `H("effects", effects)`；完整有序結果。 |
| `commitId` | `H("commit", JournalRecord 去掉 commitId)`；包含 parentCommitId、input 與前後 hashes，不採含糊字串拼接。 |
| `evidenceId` | `H("evidence", EvidenceRecord 去掉 evidenceId)`；sourceRef 用 lineageId/branchId/seq，不引用當前 commitId。 |
| `memoryId` | `H("memory", NarrativeMemory 去掉 memoryId)`；保存本人／peer 與原件來源，不能忽略 provenance。 |
| `saveHash` | `H("save", SaveEnvelope 去掉 saveHash 和 annotations)`；包含 legacySources、blobs、history、head。 |
| `manifestHash` / `contentSetHash` | `H("pack", Manifest 去掉 manifestHash)`／`H("content-set", 排序 packRefs)`，詳見 CHAPTER_PACK。 |
| `sourceTreeHash` / generator seed digest | `H("source-tree",排序來源 [{path,sha256}])`／`H("generator-seed",{worldSeed,generatorId,generatorVersion,domain})`；取種子的 byte order 見 CHAPTER_PACK。 |
| `blobHash` / `logicalContentHash` / `stdoutHash` / `stderrHash` | 直接 `lowercaseHex(SHA256(raw bytes))`；內容尋址不加 JSON domain 前綴。 |
| `outputDigest` | OutputRecord/1 的 `lowercaseHex(SHA256(UTF8(C(OutputRecord))))`，即該證據 blob 的 blobHash；不新增 H("output") 或 JournalRecord.outputDigest。 |

`stagedImportHash`、`resolutionRef`、`factRef`／`factHash`、`shareBlobHash`、`importFactBlobHash`、provenanceRefs各項、`reportHash`、`stateBlobHash`、`journalBlobHash` 均是指定封閉 DTO 的 canonical UTF-8 bytes 之 blobHash；rawBlobHash／VFS blobHash 則對原 bytes。`sourceRef`／PackRef／legacyRef 等結構化引用依其 schema，不能因名字含 Ref 就猜是 hash。saveHash／stateHash／commitId 是各自 H domain 的語意身份；例如 MergeResolutionFact.selectedWorldRef 是 stateHash、commonAncestorRef 是 commitId，透過兩原 envelope 解析，不能當 blobs key。

EvidenceRecord 依 ENGINE §8／MERGE §3 固定六欄 `{evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash}`，sourceRef=`{lineageId,branchId,seq}`，原 record 不因轉寄改寫。variant／NPC模式由固定ruleId查得；playerId／來源原件與receipt綁定在import fact閉包，不擴充六欄。file.edit 的journal.input保留 `{islandId,path,expectedContentHash,content}` 原文字；VFS另保存UTF8(content)的blob，不能把input改寫成只剩內容hash。

stateHash **排除** journal、saveId、儲存 revision、annotations、顯示偏好、scrollback、wall clock、計算快取、性能數據、UI 錯誤；它們不得參與世界轉移。若未來有欄位會影響下一步，必須納入 EngineState 並升 schema，不得以「runtime」為由排除。特別地 branches 的 storyProgression／narrativeMemories、inode.sourceEvidenceRef、externalFacts 的完整 provenance／結果引用均包含；writer快取只准從這些權威資料導出。OutputRecord bytes 本身不進 stateHash；未來若以已登錄 assessment fact 引用，僅該 fact 引用照一般 externalFacts 規則納入。VFS descriptor 的 hash 與 pack 引用是內容承諾；載入仍需檢查實際 bytes，不能只重新 hash descriptor 就說檔案完整。

完整 SHA-256 證明特定 bytes 的一致性，**不是作者簽章、真玩家證明或任意存檔可信度**。本機可重算任意合法鏈；安全授權仍歸 REPLAY／伺服器 receipt 政策。

## 5. RA1／schema 1 遷移

### 5.1 保存原件，永不改寫舊身份

LegacySource 固定 `{format,rawBlobHash,legacyHead,legacyLevel,legacyReasons,projectionVersion}`。format=`RA1`／`schema1-json`／`local-envelope-v1`；rawBlobHash 指向**匯入時原 bytes**（含原空白／換行／編碼 bytes），不能重新 JSON stringify 取代原件；貼上字串依 UTF-8 保存輸入原貌，再交 legacy reader 容許的空白清理。

- legacyHead 保留原八碼值或 null；RA1 compact rows 衍生 ID 用 legacy 原算法，標為「由舊代碼展開」，不宣稱那些 ID 原本逐筆嵌在 RA1 中。
- 原 schema 1 JSON 各 ID／parent 原封不動；壞鏈不得補算成看似完整。新版 64 碼只能放在**新的 baseline／journal**，不能替換舊 ID、補造舊事件或偽造同一段歷史。
- `legacyLevel` 是原 `intact`／`suspicious`／`broken`，legacyReasons 保留原分級原因。`projectionVersion` 基線 `demo-to-full/2`，版本化映射可回查原 `demo/import_rules.yaml`。
- 新 save.origin.kind=`legacy-projection`，sourceHash=rawBlobHash；其後即使新版鏈完全一致，也仍展示來源投影及未有歷史的部分。不得洗成「完整遊玩／已重放 genesis」。

### 5.2 投影映射（使用原白名單，不補造事實）

**投影次序不可交換**：讀取並保存原 bytes／原 level → 在原始 fold flags 上擷取 `flag.demo.vote_block`／`flag.demo.vote_pass` 與對應原 commit 引用 → 建立 ENGINE 定義的 `main.narrativeMemories` → 套 carry whitelist／建立入口 → 最後 drop demo flags。不能先 drop 再找 memory，也不能以 K0 匯入推導本人投票。

使用者選本人 legacy 進度投影時 sourceKind=legacy-self、subjectPlayerId=新投影的 profile.playerId；來源引用 rawBlobHash／legacyCommitId 保留，非認證同一真人。選 import_as_peer 時 sourceKind=peer-report、subject 指來源身份；NPC 只能說朋友／該份紀錄的選擇，不說「你在試玩時說過」。互斥 flags 同時存在標 memory.status=conflicted 並列 preview.conflicts，不擅自選最新值。

| 原資料 | 新版落點／限制 |
| --- | --- |
| nick、seed | 保留 seed；顯示 `op-<nick>` 沿舊規則，另產生本地 playerId；同 nick 不是同帳號。 |
| carry.flags | 依登錄的 branch scope 放到 `main.flags` 的進度映射；`flag.b0.*` 保留原宣稱，不代表完整 B0 世界或親證。另寫 `main.storyProgression[B0].legacyClaims`；handled/resolved 由版本化 gate 映射，資訊不足設 unknown。 |
| Q0-1..Q0-5 的 task | `storyStatus=resolved,resolutionMode=null,programVerdict=null,evidenceRefs=[]`；來源由 origin／legacySources 原task回查，不假造新版 TicketEvidenceBundle 或 shell-local 判題結果。 |
| 舊 skip | 保留曾代辦的證據；若其故事旗標被白名單攜帶，gate 可處理，但不得轉成 task／親自完成或 AC，也不捏造 K0/K1。B0/B1 邀請 handled、故事 resolved、知識證據分開。 |
| Q1-1、Q1-3 | 依原規則不帶快題完成；新規模要重做；`flag.gc_name_heard` 仍可帶。 |
| items/cards | 原白名單 F1、R0、K0；badge 依原 level 與活動完成條件，不額外推導；K0 證據類型 legacy-projected。 |
| B0 / B1 | B0 只帶 exit state；B1 不帶世界／完成；不能生成舊分支 VFS。 |
| checkpoint ID 與 create_on_import | 只產生「可由正式模板進入」能力，來源=`legacy-projection`；不是可還原的過去 snapshot，不能列入 history 的實際 restore checkpoints。 |
| demo.vote_* | drop 前擷取到 narrativeMemories，保留本人／peer provenance；不寫成主線抉擇，demo.* 最終不留世界旗標。 |
| T0100／T0427 | 舊資料沒有真正執行證據就不產生 program verdict；故事補救用 assisted，不能填 AC。 |

正式版從固定 pack 的起始／允許入口模板建立新 VFS，疊上可攜進度；生成檔用原 seed＋**新版明示 generatorVersion**，不宣稱與試玩 3315 行逐字相同。原 arbitrary files／cwd／命令歷史缺失列於 preview.losses：`vfs-history-unavailable`、`cwd-unavailable`、`input-history-unavailable`；預設 cwd 來自入口模板，不能寫成「已還原」。

若有 local-envelope-v1：先保留整份原件，用精確 legacy build＋baseSave＋原浮點 dt 順序重播，並核對內嵌 save 的原 ID 與結果；成功才可另導出當下 VFS。若 baseSave 本來就是不完整 RA1 投影，其之前缺失仍保留；不因後半 journal 完整而宣稱全程完整。重播失敗提供「備份原件／明示只投影事件」兩條操作，不悄悄 fallback。

形狀安全但舊鏈 broken 可供**明示的離線進度投影**，來源標記保留、無排行／新可信徽章；硬安全拒絕資料不可執行。新版 hash 不一致則不直接續玩；可由有效 baseline／連續前綴建立 origin=`recovered` 的獨立救援存檔，preview 必須列丟失區間與信任限制。

### 5.3 分開呈現的 assessment（reader 導出，不信檔案自稱）

| 欄位 | 建議 enum／語意 |
| --- | --- |
| `formatStatus` | `valid`／`unsupported`／`invalid`。 |
| `integrityStatus` | `consistent`／`mismatch`／`legacy-only`；一致性不是防偽。 |
| `restorationCoverage` | `full-current-state`／`progress-only`／`partial-recovery`。 |
| `replayCoverage` | `{fromSeq,toSeq,genesisAvailable}`；有缺段不把範圍連成完整。 |
| `originKind` | 對應 origin.kind，另顯示 legacyLevel／starterId。 |
| `verificationStatus` | `local-unverified`／`server-replayed-range`；後者須有效 receipt 並顯示範圍／版本。 |

## 6. 匯入 preview → staging → commit

1. **Acquire**：保存 File／原 bytes 引用與 rawBlobHash；先做外層長度界限。讀取失敗不動現在 session。未知 schema 只顯示未知版本與原檔下載，不能用舊 parser 猜。
2. **Preview**：受限 parser、schema、pack availability、圖不變量、hash、legacy assessment；顯示身份、來源、可還原層級、缺 pack、失去歷史、分支與預計佔用量。顯示文字用 textContent，不執行檔案 HTML。
3. **Staging**：在隔離 worker／暫存區完整還原驗證；完整存檔候選固定其 saveHash、目標 expectedRevision 與前次 saveHash。若為 knowledge.import，另建立 ENGINE §3.3 的 KnowledgeImportStaging/1，stagedImportHash 專指此 DTO 的 raw blobHash，不能拿本機暫存 handle 或候選 saveHash 代替。外部副作用禁止；取消釋放 temp 資源。
4. **Commit**：使用者選「新存檔槽」「合併為對方證據」或明示替換。替換前在**同一 IDB transaction** 比 revision＋saveHash、寫全部所需引用與新 root 指標；成功才替換可見 Engine。不能先清空舊槽再載入。
5. **完成**：重讀新 root 引用驗證存在；再非同步回收無引用暫存。崩潰重開只看到舊完整 root 或新完整 root；孤兒 staging 不會自動變活躍存檔。

PreviewResult 共同欄位 `{sourceHash,assessment,losses,requiredPacks,estimatedBytes,conflicts,allowedActions}`。同 nick 顯示衝突選擇；按原 import_rules 不覆蓋既有存檔，可選 peer import。ID 不同但同名、ID 相同但內容不同皆不自動認領。

### 6.1 儲存權威與配額救援

- 規劃主 adapter 為 IndexedDB，object stores：不可變 blobs、save generations、active roots；LocalStorage 僅放偏好或小型最後槽 ID，不宣稱跨鍵原子存檔。
- 本機 root 記 `{storageRevision,saveHash,generationId}`，revision 每次提交增加。所有 writer 同 IDB transaction compare-and-write；不能只比較 journal head（同 head 也可能不同 VFS／history）。Web Lock 可輔助協調，不能替代 transaction。
- 磁碟 quota／SecurityError／私密模式失敗：abort transaction，舊 root 和原檔保留；可見狀態不宣稱保存成功。候選完整 save 可留在記憶體讓玩家下載救援檔或重試，提示本次尚未提交。
- 玩家明示選「僅此分頁繼續」才將完整候選切到 memory adapter，UI 持續顯示 `volatile`；每次匯出仍自檢，不能以 localStorage 局部寫入冒充 durable commit。
- D23：memory adapter保存完整不可變generation（baseline／journal／blobs／history／所有pin），在同一同步critical section驗memory revision並一次替換root；失敗／取消仍保留原generation，不發布半套世界。它支援ending prepare、最後選擇及§7.2回訪，和durable使用相同closure／hash／容量驗證。pin只表示禁止回收，不表示已落盤。匯出包含所有必要pin；關頁仍可能失去未備份進度。恢復durable須另在IDB以已觀察disk revision CAS寫完整memory generation，成功才改標籤，不自動覆蓋別頁進度。
- 匯出：先 canonical／hash／引用閉包自檢，再建立 download bytes；無法算 hash 時可下載標明未驗證的**原件**，不得生成假完成檔。主動下載成功不等於已證明使用者磁碟實際保存。
- file:// 的 IDB／WebCrypto／Worker 能力需逐瀏覽器 spike；fallback 為明示記憶體＋檔案匯出，不降級成安全性未知的 hash 或偷偷依賴 Service Worker。

## 7. 快照、歷史裁切與回溯能力

History 固定：

| 欄位 | 定義 |
| --- | --- |
| `replayStartSeq` | 目前 envelope 可連續 replay 到 head 的最早基底 seq。 |
| `earliestRestorableSeq` | 可還原 snapshot 的最小 seq；**不表示其到 head 每一步都可還原**。 |
| `genesisReplayAvailable` | 僅當有合法新遊戲 genesis＋完整輸入／artifact 閉包才 true；由 reader 核對。 |
| `retainedCheckpoints` | `{checkpointId,seq,commitId,stateHash,stateBlobHash,pinned}[]`；stateBlobHash 指 canonical EngineState bytes。 |
| `segments` | `{fromSeq,toSeq,baseStateHash,tailCommitId,journalBlobHash}[]`；from/to 為包含的 record seq，第一筆 before hash=baseStateHash。 |
| `prunedRanges` | `{fromSeq,toSeq}[]`；明示不存在的操作區間，不填假紀錄。 |

snapshot stateBlobHash 與 stateHash 不同 domain；都需驗證。若保留可 replay 前綴，須把 replay 到該 seq 的 stateHash 與 snapshot 比較；缺前綴時 snapshot 是**保留的狀態錨點**，只可證明當下內部一致，不能宣稱之前行為可達。保存點 reference 是外層 history，不放當前 state 的當前 hash，避免自我循環。

D19/D20/D23補充：`branches[id].tags`、runtime.endingState.preEndingCheckpointId引用retainedCheckpoints的實際資料；tag／ending prepare的snapshot為**輸入前**完整state，在同次adapter交易建立與pin（durable IDB或明選volatile memory）。tag不退出；Ch3.5是目前main旅行，不讀snapshot重建世界。分支fork與結算復原才用snapshot；模板entry不混進retainedCheckpoints。引用中的pin不可裁切；儲存模式只影響持久保證，不另設durable-only終章guard。

| 保存方式 | 能做什麼 | 不能承諾 |
| --- | --- | --- |
| 全 journal＋genesis＋必要 artifacts | 重放到任一已提交 input；可比逐筆 effects。 | 仍不證明真人操作或未參考答案。 |
| 保留章末 snapshot＋該章後 journal | 直接還原該 checkpoint、重放之後；可開分支。 | 不能還原已丟失章內任意一步。 |
| 只有 head baseline | 完整續玩當前世界。 | 無法回到任意舊 checkpoint，更無全程 replay。 |
| legacy 事件投影 | 保留 whitelist 進度，從模板入口繼續。 | 任意檔案、cwd、過去 VFS 與已做程式 AC。 |

Compaction：先從現權威鏈驗證到 k → 產生完整 snapshot（含全部 branch／PRNG／VFS）→ 新 baseline 指該原 commitId → 保留 k 後 tail → 同 transaction 發新 root。保留世界時 stateHash 不變；saveHash 可能改變。不能依新 baseline 重算前面原 commitId。

裁切前 preview 列出會失去的 checkpoint／精確 seq 範圍、可下載 archive、後續可否接受 replay；須使用者明示選擇。封存到獨立檔案不等於目前裝置仍可回溯；缺 archive 顯示需要匯入。主線結算前存檔與目前開放分支 fork point 預設 pinned，空間不夠停止新變更／給救援出口，不能默默刪除 pin。保留結算前模板不是假造此前的世界。

### 7.1 Typed blob registry 與引用閉包保留表

根集合為 baseline、重建 head、所有保留分支／checkpoint state、保留 journal／segments、legacySources，以及明示保留的 replay 證據。從**引用所在欄位宣告的型別**解析 blob，不因檔案內容碰巧有 schemaVersion 就執行它。每個必需 DTO 須符合 ENGINE §3.3／owner 的封閉 schema；僅列名稱但子 schema 未定者按 ENGINE §8.1 阻塞，不能以 opaque JSON 冒稱已驗證。

| 引用根／型別 | 必須保存與驗證的閉包 | compact／缺件規則 |
| --- | --- | --- |
| `journal.input` | 完整 inline file.edit.content；knowledge.import.stagedImportHash、ticket.resolve.resolutionRef、system.fact.factRef 指向各自精確 DTO。 | 保留的 replay 範圍不能刪 input 或將 inline content 換成別種 payload；裁前綴後，state／其他根仍引用的 blobs 繼續保留。 |
| `TicketResolution/1`（TICKET §2.2） | `ticket-resolution/1` bytes；evidenceRefs 及 progressAfter.evidenceRefs 的同一集合；profile／來源與expectedStateHash核對。由 externalFacts 的 ticket-resolution 引用保留。 | 裁掉原 journal 仍留結果與工單 evidence；不得只留 progress 布林。資料一致不等於已重放被裁掉的操作。 |
| `TicketEvidenceBundle/1`（TICKET §2.2） | `ticket-evidence/1` bytes、provenanceRefs 全閉包、非null receiptRef 的原收據 bytes／可用驗證政策、非null legacyRef 的原件及原 ID；精確 content/profile。 | progress.evidenceRefs／resolution 使用者均為根；不能丟來源後仍顯示原能力／驗簽狀態。未定receipt／legacy子schema不能以任意物件接納。 |
| `ticket-provenance/1`（TICKET §4.4） | externalFacts.factHash → trace；nodes.parents 中所有外部 traceRef、較小nodeOrdinal、凍結來源bytes或精確可重建的pack/generator descriptor、仍被graph依賴的workfile/artifact bytes。sinks對實際inode／contentHash／writer核對。 | 所有已接納facts及其parents保留；即使檔案已覆寫／刪除，仍被後續trace或progress引用的舊artifact保留。只有查詢索引可丟。來源不能重建／parent缺件回SAVE_BLOB_MISSING。 |
| `KnowledgeImportStaging/1`（ENGINE §3.3） | `knowledge-import-staging/1` 六欄、shareBlobHash／importFactBlobHash、接受與封存集合、expectedStateHash；receiver／policy從fact核對。 | journal保留時必留staging；裁掉input後若已由fact保存全部執行後必要資料，無其他引用才可回收staging。不能只留本機staging token。 |
| `KnowledgeImportFact/1`（MERGE §5.2） | `knowledge-import/1` bytes、shareBlobHash、全部forwardingRefs遞迴fact；share的六欄evidence、notes／footprints／historyExcerpt／receipts及已明示附上的驗證材料。receiver、sourceBindings、visibilityPolicyVersion固定。 | externalFacts是根，sealed資料仍在有界share blob；不可為減量改原evidenceType／ID或抹轉寄來源。forwarding圖無環且受總界限限制。 |
| `MergeResolutionFact/1`（MERGE §6.2） | `merge-resolution/1` bytes、inputs中**兩份完整原SaveEnvelope的原bytes**（各rawBlobHash），分別核對saveHash／內部closure；commonAncestorRef／selectedWorldRef從原件解析，knowledgeEvidenceAdded核對既有六欄evidence。 | 原存檔槽也保留；可攜候選不能以「另一裝置還有」取代雙原bytes。不丟原annotations／空白後重新序列化冒充原件；超限按§8拒整次self-sync。 |
| `OutputRecord/1`（REPLAY §3.1／ENGINE §3.4） | `output-record/1` canonical bytes；outputDigest為raw blobHash；commandStreams依對應command.completed，presentation依固定pack。 | 由replay claimedTrace.outputDigest／明示匯出的證據清單指向；不新增JournalRecord欄。尚無已登錄assessment根時，單獨診斷blob不保證跨compact保留，預覽需列失去的輸出證據；不可謊稱仍可比對缺失輸出。 |
| `ReplayAssessment` | **M6 schema blocker，未開放fact**；精確wire／輸出與receipt引用規則須按ENGINE §3.4解除。 | 不接受system.fact寫入，更不能把未知blob標成server-replayed。解除後須同步本表完整閉包規則。 |
| `RecoveryOrigin/1`（§7.2） | recovered origin.sourceHash→reopen-main/1 descriptor；來源checkpoint／ended head的state blobs及兩者依賴閉包，核對來源ledger與起點。 | 宿主恢復來源，不是system.fact；compact不能刪origin根。sourceSaveHash僅摘要，原槽另保留，不要求把整份原envelope再包成8 MiB blob。 |
| VFS／知識／memory／history | VFS blob bytes；sourceEvidenceRef與pack/gen closure；六欄EvidenceRecord的contentSetHash＋ruleId來源；memory的原raw bytes／legacy ID；pinned snapshot／segment引用。 | 保留任一根就保留其依賴；轉寄知識的來源／receipt另沿import fact，不往六欄record加附件欄。任意同內容inode不可dedup成hardlink。 |

**區分引用與摘要聲明**：KnowledgeImportFact.sourceBindings 的 sourceSaveHash／sourceRawBlobHash，以及分享DTO的sourceSaveRef，是朋友來源的摘要聲明；未附整份私人存檔時可保留為 source-unverified，不能要求默默分享 VFS。shareBlobHash／factHash／forwardingRefs 及已明示附上的執行／驗證材料則必須可取回。self-sync 的 inputs.rawBlobHash 是強制 bytes 引用，沒有這個例外。沒有 receipt 驗證材料就不能升為 issuer-verified。

trace 的 inputHashes／outputHash、OutputRecord.stdoutHash／stderrHash 是 bytes 摘要斷言，不自動把每個暫態stream都要求成持久blob。仍被判題／重放依賴的來源與artifact，必須保留原bytes或固定可重建的內容descriptor／完整必要inputs；做不到就拒絕該closure／縮小明示replay coverage，不能用摘要補造bytes。判題trace完整性與完整行為可達性分別評估。

閉包檢查以完整hash去重並有 visited／深度／總量預算；缺件 `SAVE_BLOB_MISSING`，錯schema／循環／不合法ordinal `SAVE_REFERENCE_INVALID`，未知版本 `SAVE_VERSION_UNSUPPORTED`。compact先算所有根的傳遞閉包，再回收真正無引用blobs；本版不提供靜默刪externalFacts的GC捷徑，亦不因quota截斷parents／receipt／雙原件。

### 7.2 ended → 新槽可玩 main（D23）

這是宿主`reopen-main/1`，不是reducer Input，也不是知識合併。請求固定`{sourceSaveId,expectedSourceRevision,expectedSourceSaveHash,checkpointId,targetSaveId,targetLineageId}`；目標ID必為新值。來源必為main ended，checkpointId必等於其preEndingCheckpointId，來源snapshot必為active main／playing、精確versions相同且closure可讀。缺歷史／壞hash／非結算前點拒絕，不能退成模板或sandbox。

1. 隔離驗原envelope、ended head E及指定checkpoint P；保留原槽與其結局。候選複製P完整世界（包括全部分支、VFS、PRNG、shellStatus與既有證據），active=main、main.status=active；不攜入E後來取得的道具／知識／主線選擇。
2. 新saveId／新lineageId，seq=0、baseline.commitId=null、journal=[]；P的main原為playing，不偽造ended→playing的歷史事件。保留P中舊sourceRef／evidenceId／forkPoint／tags原值及其閉包，不改寫成新lineage親做；恢復來源允許從P繼承的writer／memory，不能讀到E後來的操作。新操作才使用新lineage及seq1起。
3. rewardLedger採E的完整main已領集合（P必為其子集；同key異來源拒衝突），鍵不含lineage，故不因重開再領；餘額／inventory仍是P，**不補發E後已花或已領的幣**。preview明示此差異；這是離線恢復政策，不是防竄改／競技授權。
4. origin=`{kind:"recovered",sourceHash:<descriptorBlobHash>,projectionVersion:"reopen-main/1",starterId:null}`。`RecoveryOrigin/1`封閉descriptor為`{schemaVersion:"reopen-main/1",sourceSaveHash,sourceLineageId,sourceHeadStateHash,sourceHeadStateBlobHash,checkpointId,checkpointSeq,checkpointCommitId,checkpointStateHash,checkpointStateBlobHash}`；hash全64hex，checkpointCommitId可null。兩state blobs為C(E)／C(P)原bytes，各≤8 MiB；sourceSaveHash為來源envelope摘要，不把descriptor當原件／簽章。從E驗ended及ledger，從P驗新baseline投影；兩state的refs按§7.1保留。來源舊journal若未附，不假造其可達性。
5. 新history.replayStartSeq=0、earliestRestorableSeq=0、genesisReplayAvailable=false；為新baseline建`ckpt/recovered/<targetLineageId>/0`（hash在history外層，無自我引用），保留P仍引用的舊checkpoint為帶原seq的來源錨點。每個checkpoint的lineage從其完整state讀取，seq須匹配該state，不默認屬目前lineage；新／來源checkpointId不可碰撞，不能把舊點混作新lineage連續journal。新history.segments=[]／prunedRanges=[]；UI分列「新歷史自0開始」與來源checkpointSeq，前綴缺失依descriptor告知，不宣稱新遊戲genesis。
6. 宿主同一交易比較來源revision＋saveHash及active-root revision、確認target不存在，寫完整新槽與active指標，原槽保持原bytes／ended。任何CAS、quota、closure或取消失敗都不切active；volatile用同等memory CAS且保留兩memory槽。重送相同target時只在已存descriptor／請求一致時回原結果，不另開新槽或發獎。可各自匯出原結局與新遊戲；下載不升durable。

回訪候選亦須§8准入，不刪被引用pin或源資料湊容量。較早普通checkpoint若未來開放同類重開，須另登來源guard；本版只承諾明示的結算前點。

**恢復writer的因果順序**：以P的已接納facts及forkPoint重建起點視圖（P若recovered先沿其origin遞迴），再套目前lineage的新facts；seq／nodeOrdinal僅在同lineage／可見分支內排序。不得掃blobs所有trace，E晚於P的操作不是恢復起點。舊seq120 counting在新seq1同bytes literal寫入後失效；未重寫則仍可用。此為ENGINE §4.2／TICKET §4.4的純投影，使用既有visited／循環／深度預算；compact保留必要origin與trace，不保存第二份權威writer、不改來源ID。

## 8. 上限與防半套寫入

以下為 schema2 profile 的**初始提案，待裝置／file:// spike 校準**；修訂以 profile／版本發行，不隨可用 RAM 靜默變動。

| 資源 | 提案上限 | 檢查時機 |
| --- | --- | --- |
| `.rasave.json` 原 bytes | 64 MiB | 讀檔前／串流讀取中；annotations 也算。 |
| 每個EngineState canonical bytes（baseline／head／checkpoint） | 8 MiB | genesis／import及每筆候選提交前；另驗下述必要pin預留，不到終章才驗。 |
| JSON depth / values | 48 / 1000000 | parser 增量計數，不先完整 parse 才計。 |
| 一般字串 | 64 KiB UTF-8；命令另限16 KiB | token 解碼前後；blob.data 例外，按 blob 限額。 |
| 單 blob / blob 總 decoded bytes | 8 MiB / 32 MiB | base64 解碼時，拒一邊超限一邊保留。 |
| 全分支 inode / entry / branch | 100000 / 200000 / 32 | 圖載入與候選 commit 前。 |
| tail journal / 所有保留 journal records | 20000 / 100000；單record與每個segment canonical bytes≤8 MiB | segment按完整record邊界切分，單record超限提前拒絕；不以record數豁免blob限額。 |
| checkpoints / packs | 64 / 128 | 引用閉包驗證；pin 亦受限，先告知無法新增。 |
| path / name | 4096 / 255 UTF-8 bytes | 路徑解析；不在超限後截斷。 |
| 生成檔 logical bytes | 512 MiB 每檔 | descriptor 與讀取 work budget；不等於可完整輸出到 UI。 |

**可快照不變量（D22）**：所有可執行state都能編成單一≤8 MiB的state blob；9 MiB state在genesis／import／變更准入就回SAVE_LIMIT，不能先當合法baseline。checkpoint外層baseline欄位不算進state byteLength，但算入總檔預算。journal過大按完整record切多個≤8 MiB segments；任何單record超限在commit前拒絕。

**必要pin容量預留**：每個playing候選（含import／reopen）在發布前做一次非遞迴容量演算：以S作beforeState，按固定prepare生成存儲用review候選R、C(S)、checkpoint與完整prepare journal；不執行故事guard、不授結局。R的seq／shellStatus／commandOrdinal／endingState及effects按核心規則，無pack額外副作用。以實際canonical／base64／引用去重核對全部上限；再預留下表R→ended的最後一步。兩筆Input的inputId按96 ASCII bytes最壞長度計，S.seq+2及其他計數器不得溢位。預留不是state私有旗標、不佔用真snapshot；反覆prepare／tag／fork及返回playing重新計算。不足回SAVE_SNAPSHOT_RESERVE，保留原世界，可預覽明示裁切未引用歷史後再試，不偷刪pin。實體quota／RAM失敗另走§6.1，不假稱格式預留能保證硬體容量。

**最後一步的共同計量與逐維上界**：固定final-select沿ENGINE §4.3，僅改既有終章欄位與seq、發ending.selected、追加一筆journal；沒有新blob／checkpoint／內容副作用。定義`G=max(0,|C(E)|−|C(R)|)+|C(完整最後JournalRecord)|`，effects已在record內計入，不重複加總。已核定／未知policy皆要求G≤65536；所有policy另通過下表每一維，不以bytes通過取代計數通過。已知policy用所有選項（含最大合法inputId）的**逐維最大**，不能只選總bytes最大的那一項；未知policy用固定保守界。最大值指在同一R上的容量上界，不實際提交假結局。

| R→ended維度 | 未知policy固定保守預留／已知policy檢查 |
| --- | --- |
| state canonical bytes | 額外65536 bytes，保證E≤8 MiB；已知按實際正增量，但G仍≤65536 |
| 完整最後record | 1筆，canonical≤65536 bytes（包含input、effects、所有hash及parent）；tail與所有保留records各預留＋1，不能只預留prepare的那筆 |
| 單blob／總decoded／blob數 | 增量0：final-select不產blob，不將E或最後record重包成blob；既有每blob≤8 MiB／總≤32 MiB仍驗。選用輸出證據另作匯出，不阻擋必需提交 |
| envelope bytes | canonical writer在R-envelope追加完整record、更新head／saveHash，預留65536＋256 bytes封裝／數字長度開銷；最後一步不compact、不重包baseline／segments、不增annotations。已知可算實際C(E-envelope)，仍須≤64 MiB |
| JSON values | 固定預留＋1024個值（object／array容器亦各算1）；涵蓋完整record與新值，已知逐項實算不得超此界；最終總量≤1000000。新增資料不能靠base64隱藏子JSON計數 |
| JSON depth | 新增record／被更新欄位路徑的絕對depth≤16；預留檢查max(depth(R-envelope),16)≤48。不在既有深層值下附任意子樹；已知亦不得超16的新結構界 |
| checkpoints／packs／inodes／entries／branches | 最後一步增量皆0；prepare所增checkpoint及snapshot已在S→R逐維計量，既有pin不回收 |

發布validator對每個ending policy／fixture驗固定mutation範圍、G與上述增量界；超界拒發布，不能在玩家最後選擇時才發現。S→R的snapshot原bytes、base64url實際長度、BlobRecord欄位、baseline與journal中必要的重複資料皆依各自封裝完整計算；R→ended不新增blob不是省略其既有容量。故即使bytes富餘，只要最後一筆record名額或JSON values／depth不足，也須在S准入拒絕。准入與commit重驗用同一profile；已知policy可用較緊上界，不能放寬共同限制。

self-sync 仍受上述相同限額：**每份原 SaveEnvelope 的原 bytes 必須各自≤8 MiB** 才能成為單一 raw blob，兩原件加候選全部唯一 blobs 的 decoded 總量≤32 MiB、最終輸出≤64 MiB。原件本來可合法接近64 MiB，並不保證可嵌入本版self-sync候選；單blob超限回 `SAVE_BLOB_LIMIT`，總decoded超限回 `SAVE_BLOBS_LIMIT`，最終檔／解析預算超限回 `SAVE_LIMIT`；MERGE介面顯示 `STORAGE_LIMIT` 並保留底層code／requiredBytes／limitBytes。禁止只存雙hash、截斷原件或未登錄分塊格式；使用者可先匯出管理副本，但不能以下載宣稱候選已包含閉包。兩原槽及active不變。

原envelope作blob是不可變證據，不因解析它而遞迴啟動遊戲／自動匯入其中facts。內部驗證亦共用深度／節點／decoded工作預算，不能每層重置限額。相同raw hash可去重；saveHash相同但原空白／annotations不同的兩份bytes不得合併成同rawBlobHash。更大的self-sync封裝需要新profile／格式與spike，不在本輪偷偷放寬。

RA1 仍用原 `demo/integrity.yaml`：8000 chars、256 KiB inflated、400 commits、depth6、ASCII string64、r≤2700000ms、t≤1000000秒；不能為了新版而放寬 legacy 壓縮炸彈邊界。schema2 第一版**不接受壓縮外層**；未來格式需明示壓縮／解壓／ratio 限額、單串流尾料規則與新版本，不能猜 zip/gzip。

## 9. 錯誤碼與恢復

| code | 行為 |
| --- | --- |
| `SAVE_SCHEMA_UNSUPPORTED` / `SAVE_VERSION_UNSUPPORTED` | 不執行；原 bytes 可下載。 |
| `SAVE_JSON_INVALID` / `SAVE_LIMIT` | 拒絕不安全解析／超限；不改 active root。 |
| `SAVE_BLOB_LIMIT` / `SAVE_BLOBS_LIMIT` | 分別單blob超8 MiB／唯一blobs decoded總量超32 MiB；self-sync顯示STORAGE_LIMIT並保留雙原件。 |
| `SAVE_SNAPSHOT_RESERVE` | 候選不能容納下一必要pin／終章記錄；提前拒絕變更，保留原世界與所有被引用pin。 |
| `SAVE_HASH_MISMATCH` / `SAVE_JOURNAL_GAP` | 拒絕直接續玩；可另預覽有效前綴救援。 |
| `SAVE_VFS_INVALID` / `SAVE_BLOB_MISSING` | 指出圖／引用位置；不得補空檔。 |
| `SAVE_REFERENCE_INVALID` | typed DTO欄位、來源／接受清單、trace parents／ordinal／循環不合法；拒候選，不猜引用。 |
| `SAVE_PACK_MISSING` | 列精確 pack refs；取得 closure 前不能 commit。 |
| `SAVE_LEGACY_HISTORY_MISSING` | 非硬解析失敗；preview.losses 明示 progress-only。 |
| `SAVE_REVISION_CONFLICT` | 停止自動保存；保留雙方，重新 preview，不認領對方 root。 |
| `SAVE_QUOTA` / `SAVE_STORAGE_UNAVAILABLE` | 舊 durable root 保留，提供候選記憶體救援下載。 |
| `SAVE_CANCELLED` | staging 清理，既有 session 不變。 |
| `SAVE_EXPORT_SELF_CHECK` | 不產生聲稱完整的新檔；可備份未變原件。 |

## 10. 驗收與跨版本向量（尚未執行）

| ID | 正例 | 負例／預期 |
| --- | --- | --- |
| SAVE-001 | 含硬連結、任意新檔、cwd、分支、PRNG、待回應對話的跨宿主 roundtrip，stateHash 相同。 | 相同內容的不同 inode 不可被 dedup 成 hardlink。 |
| SAVE-002 | baseline＋journal 重建與 head 完全吻合。 | 偽造 effects、換 baseline、缺一筆／parent 斷鏈、seq 重複全拒。 |
| SAVE-003 | Unicode 碼點鍵序、astral、NFD/NFC、控制字元、-0 canonical 對照。 | duplicate escaped key、孤 surrogate、1e0、1.0、unsafe integer、getter、BOM 全拒。 |
| SAVE-004 | RA1 原 bytes、原 head、原 IDs／展開 ID、原 level 皆保留。 | 壞鏈不得升成 intact；新 64 hex 不得覆蓋舊 8 hex。 |
| SAVE-005 | Q0 whitelist／K0／seed 投影，Q1 快題重做；history 缺失可見。 | 舊 skip、假 Python、starter 不生成 AC；未記錄檔案不假裝還原。 |
| SAVE-006 | valid legacy local envelope 用舊 build 還原檔案。 | 缺 baseSave 前史或 dt 語意不符，不能宣稱完整 genesis replay。 |
| SAVE-007 | preview 取消／staging crash／quota abort 均保留原 active root。 | 先清舊槽再失敗、半寫 blobs 成為活躍 root 均不允許。 |
| SAVE-008 | 跨頁同 revision 僅一個 writer 成功。 | 相同 commit head 不同 VFS 仍判 conflict。 |
| SAVE-009 | compact 後目前 stateHash 不變，保留 checkpoint 可還原。 | 刪掉 archive 後不得宣稱章內任意回溯，pin 不可默默裁切。 |
| SAVE-010 | 未知 schema／rules／generator 原件留存且可預覽版本。 | 不能當最新版解析或用新 generator 代替。 |
| SAVE-011 | 修改保存的 VFS bytes 即使 descriptor 未變也被抓到。 | 只核對 8 碼前綴、只重新 hash 宣告 state 而不讀資料不算驗收。 |
| SAVE-012 | 同 nick 進 peer preview／新槽選擇。 | 不自動覆蓋或把他人證據稱本人操作。 |
| SAVE-013 | drop 前擷取本人 demo.vote，roundtrip 後 NPC 仍能按來源回應；peer 分開。 | 雙 vote 未標 conflicted、先 drop 丟 memory、skip 造K0/K1皆不通過。 |
| SAVE-014 | externalFacts／blobs的跨指令trace、artifact與原始碎片證據snapshot roundtrip／compact不丟，無writer快取也同判定。 | 缺父節點、未知子schema、重綁inode冒用舊counting、F2修復/匯入改mtime皆拒或對照失敗。 |
| SAVE-015 | tag/ending prepare前態snapshot與新世界同次提交；旅行後存檔保有多島圖。 | 把Ch3.5回訪當restore、dangling tag/pinned snapshot、quota半套結局皆失敗。 |
| SAVE-016 | resolution／bundle／staging／import facts依§7.1閉包保留，A→B→C六欄evidence與原type不變。 | 丟forwarding／receipt／仍用artifact、把來源摘要聲明當已驗原件或改evidence欄位皆拒。 |
| SAVE-017 | self-sync候選可還原兩原SaveEnvelope及逐byte原件，CAS成功才換active。 | 單原件8 MiB+1回SAVE_BLOB_LIMIT、總量32 MiB+1回SAVE_BLOBS_LIMIT；兩原槽不動，禁止只留hash。 |
| SAVE-018 | OutputRecord canonical bytes的rawsha與outputDigest一致，無JournalRecord新欄。 | H("output")混用、只hashUI截斷輸出、未定ReplayAssessment被當有效fact皆拒。 |

必交跨版本 fixture 清單：V-SAVE-L1 RA1 intact/suspicious/broken/CRC 錯／inflate 超限；V-SAVE-L2 schema1 JSON 原 ID 保留；V-SAVE-L3 local-envelope-v1 完整／缺前史／重播取消；V-SAVE-N1 schema2 空 tail／多分支 tail／compact；V-SAVE-N2 hashVersion 未知／stateSchemaVersion 未知；V-SAVE-N3 同 rules 下 JS legacy reader→TS adapter、schema2 瀏覽器→Node；V-SAVE-N4 新 pack 不覆寫舊 manifest；V-SAVE-N5 權威／快照矛盾與有效前綴救援；V-SAVE-N6 已登錄DTO完整closure→未知子版本／缺件拒絕及self-sync限額邊界。每個 fixture 附原 bytes hash、期望錯誤碼／coverage／缺失清單；示意 hash 不得拿去當黃金 expected 值。

## 11. 代理交接

- [REPLAY_SPEC](REPLAY_SPEC.md)：使用完整 state/effects/commit hashes，報告可重放區間；server receipt 不提升缺失舊歷史。
- [MERGE_SPEC](MERGE_SPEC.md)：只接 staging 的證據與來源，禁止整份 peer flags/VFS 覆蓋 main；完整 evidenceId 算法見 §4。
- [TICKET_JUDGE](TICKET_JUDGE.md)：proof/receipt 以 blob hash 引用，programVerdict 不由 legacy task 推導。
- [MINIGIT_SPEC](MINIGIT_SPEC.md)：Git repo object bytes／runtime 進可攜引用閉包；repo commit 與 save journal commit 分開。
- [INTERACTION_SPEC](../ux/INTERACTION_SPEC.md)：用 assessment 多軸顯示、原件下載、缺檔 preview、精確回溯範圍、volatile 狀態，不顯示單一「100%可信」。

待驗 spike：IDB 同 transaction roots/blobs 配額失敗、file:// WebCrypto／Worker／IDB 行為、8 MiB state及pin預留峰值記憶體、受限 UTF-8 JSON parser、legacy envelope 的浮點 dt 重播一致性。結果未知時維持明示限制，不替代成假還原。
