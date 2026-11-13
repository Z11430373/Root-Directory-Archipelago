# UI 文字線框與工程交付

日期：2026-11-02｜工作稿／未實作｜責任：UI／UX、前端、內容、QA。

基線：[DECISIONS](../DECISIONS.md) D05–D20；共用 brief、來源 E01–E12、問題台帳在 [PLAYER_EXPERIENCE](PLAYER_EXPERIENCE.md)。本文件是十個 surface 的文字規格，不是已完成畫面。狀態與行為以 [INTERACTION_SPEC](INTERACTION_SPEC.md) ST01–ST29 為準，無障礙以 [ACCESSIBILITY](ACCESSIBILITY.md) 為準。

工程依賴：[ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md)、[SAVE_SCHEMA_2](../engineering/SAVE_SCHEMA_2.md)、[CHAPTER_PACK](../engineering/CHAPTER_PACK.md)、[COMMAND_COMPATIBILITY](../engineering/COMMAND_COMPATIBILITY.md)、[TICKET_JUDGE](../engineering/TICKET_JUDGE.md)、[MERGE_SPEC](../engineering/MERGE_SPEC.md)、[REPLAY_SPEC](../engineering/REPLAY_SPEC.md)、[MINIGIT_SPEC](../engineering/MINIGIT_SPEC.md)。props 是畫面投影；共用資料欄位直接採 ENGINE／SAVE，映射見 INTERACTION_SPEC §4.1。`storageMode`、展開狀態等呈現 props 不新增存檔欄位或引擎型別。實作沿用原生 DOM／既有模組，不指定新框架。

## 1. UI-001 IA、導航與兩種操作面

```text
S01 入口／繼續／偏好
 ├─ S09 存檔匯入／救援／同步 → S02 工作區
 └─ S02 工作區（群島 或 Bash）
     ├─ S03 群島／章節／內容包
     ├─ S04 任務／工單
     ├─ S05 手冊／提示／回顧
     ├─ S06 分支／檢查點／歷史
     ├─ S07 知識／遺物／證據
     ├─ S08 協作交換／分享預覽
     ├─ S09 保存／救援／同步
     └─ S10 終章確認／結算 → S03 當前主線補查 或 S06 還原結算前保存點
```

S01–S10 是資訊任務，不強迫十張獨立路由。群島可用面板／頁區；Bash 以同一 scrollback 的具名段落、文字表及工作階段命令呈現。新命令按 COMMAND_COMPATIBILITY 已定文法；未實作能力不能在手冊聲稱已支援。

- 全域永遠可找到「目前位置／分支」「目前目標」「手冊／提示」「保存狀態」與「返回」。群島主導航最多同時突出一個當前任務；進階功能可在章節解鎖後揭露，但基本保存／操作說明一直可達。
- 偏好分「操作模式」「顯示主題」「字級」，不以 `server.css` 名稱當使用者選項。顯示名稱為「Bash 終端（模擬）」；內部既有 `data-style=server` 保留相容。
- Bash 保留輸出與 live prompt 同一個捲動區、即刻命令結果、`game help/task/status/save`；不加入任務側欄、命令 chips 或突現存檔 dialog。
- S03 地圖與 S06 時間線必有同內容的文字清單，不能要求拖曳、縮放地圖或看線色才操作。

## 2. UI-002 現有 token 與版面來源

**已讀程式值，不是實測對比報告。** 色彩要算實際疊色／狀態，不能只因名為高對比便視為通過。

| Token | 群島深色 `theme.css :root` | 高對比 `data-theme=contrast` | Bash 深色 `server.css` | 用途 |
| --- | --- | --- | --- | --- |
| `--bg` | `#0c1211` | `#fff` | `#080808` | 頁／輸入底 |
| `--surface` | `#111b18` | `#fff` | `#080808` | 工作區／dialog |
| `--raised` | `#17241f` | `#f0f0e9` | `#151515` | 控制區／hover |
| `--ink` | `#e5ede4` | `#101510` | `#e6e6e6` | 主文字 |
| `--muted` | `#a2b4a8` | `#344435` | `#b8b8b8` | 次要文字，仍需讀得清楚 |
| `--line` | `#35473b` | `#344435` | `#555555` | 裝飾分隔，非足夠的輸入邊界保證 |
| `--control-line` | `#6b826f` | `#344435` | 沿用 theme | 可操作控制邊界 |
| `--accent` | `#c8dc9b` | `#254b16` | `#a9df83` | 主動作／提示符／焦點候選 |
| `--amber` | `#efca83` | `#704200` | `#ffd787` | 提示／錯誤，必搭配文字標籤 |
| `--font` | small 13px／medium 15px／large 19px | 同左 | 同左；手機 `.console-session` 至少16px | 終端文字；不能替代瀏覽器放大 |
| `--viewport-height` | main.js CSSOM 注入 `visualViewport.height`／innerHeight | 同左 | 同左 | 軟鍵盤可視高度；dvh 備援 |

字型：群島系統 `system-ui,-apple-system,"Segoe UI",sans-serif`；終端 `ui-monospace,SFMono-Regular,Consolas,…,monospace`；Bash 的 `--mono` 另含 Liberation Mono／Noto Sans Mono CJK TC／Microsoft JhengHei。字標與值班證沿用現行 serif／等寬搭配；不新增網路字型。

| 現況 selector | 已讀尺寸／結構 | 新規格用法 |
| --- | --- | --- |
| `.welcome` | max 1180px、1.5fr/1fr、桌機 padding 66px 42px | S01 延用入口節奏；長說明自然換行 |
| `.game/.workspace` | max 1420px；桌機主欄 `minmax(0,1fr)`＋255px 任務欄 | S02 主操作優先；新資訊不再增加第三個固定側欄 |
| 1000px 以下 | 任務欄 220px、縮容器 padding | 中型桌機沿用；必要時面板切單欄 |
| 760px 以下 | 群島任務在上、可收合、max-height 40%；後置規則頁首84px | 是 compact 行為斷點，非手機完整主線支援聲明 |
| `.terminal` | padding24px、字行高1.85；compact14px／1.8 | 長 log 可換行；原始語法內容不被改寫 |
| `.console-viewport` | 18px 22px、compact12px；scrollback＋prompt | S02 Bash 維持單區；不釘住另一個 command bar |
| `.console-session` | 行高1.55；prompt 最大 min(48ch,55vw) | 路徑可折行；不能截去分支名稱 |
| `button`／focus | radius5px、11px16px、min-height42px；focus outline2px／offset3px | 既有基礎；另驗 focus 不遮蔽，不能直接聲稱符合 AA |
| 手機控制 | select／chips／execute／summary 後置44px | 44px 為專案推薦；AA 24px／例外另見 A11Y |
| `dialog/.export-layout` | max960px、330px/1fr、gap40px、padding38px；compact堆疊 | S09/S10 群島預覽，可捲全文、動作不遮文字 |

現有 spacing／radius 多為 selector literal，沒有完整命名 token。**提案**整理語意 alias（不是已存在 CSS）：`space.inline=8px`、`space.control=12px`、`space.panel=24px`、`radius.control=5px`、`layout.workspace.max=1420px`、`layout.compact=760px`、`motion.instant=0ms`、`motion.panel=120ms ease-out`。採用前核對現有 selector 與響應式例外，不為 token 化順便重設品牌。色彩仍優先用既有變數。

## 3. UI-003 十個 surface 線框規則

共同文字順序：標題／位置 → 狀態 → 主要內容 → 一個主要行動 → 次要／返回 → 診斷詳情。錯誤就近且可讀；不是只在頂端 toast。各面對應的 ST 見互動規格。

### S01 入口、回流與偏好

```text
[作品／版本] [離線能力] [模式] [主題] [字級]
[一句目的、模擬邊界]            [繼續本機紀錄摘要]
[開始值班] [繼續]               [貼碼／選檔 → 預覽匯入]
[目前已安裝章節／支援範圍]     [匯入／救援錯誤]
```

開始與繼續的優先依是否有有效紀錄，但不自動執行。摘要只顯已知章、分支、保存粒度；未讀內容不透漏。選檔不立即覆蓋，先 ST08 預覽。無紀錄顯「開始值班」，儲存失敗顯原始備份入口。Bash 啟動器文字列 `game start/resume/import/help`。對應 ST01、08–13。

### S02 工作區：終端與目前任務

```text
群島：[主機／分支／故事時間類型] | [目前目標／任務]
      [可回捲輸出]               | [提示1/2/完整解法]
      [提示符＋草稿＋執行]       | [保存狀態]
      [填入指令 shortcuts] [鍵盤說明]
Bash：[輸出／具名任務摘要／結果／live prompt 同一捲動區]
      [鍵盤說明；可見執行中／取消範圍]
```

未讀信的整合引導依 UX-004；避免同級兩個「現在必做」。stdout、stderr、系統、hint、對話分種類但都文字可識別。結果依 ST03／04 區分操作成功與題目完成。busy 不使整頁無法閱讀／保存預覽；行為以實際可用範圍顯示。長路徑可換行，輸入保持游標可見。對應 ST02–07、25–27。

### S03 群島地圖、章節與內容包

```text
[目前島／章] [返回工作區]
[已解鎖島的文字清單／可選SVG地圖]
[章：未解鎖／未下載／可進入／進行中／已完成]
[待調查：B0/B1稍後調查 → 免費回訪；Ch3.5 → 目前主線補查]
[版本、下載需求、是否可離線] [下載／進入]
[更新候選與相容性／錯誤／保留目前版]
```

鎖定章只透露批准的名稱與理由，不列結局條件。下載狀態不是任務未完成；百分比有 bytes 才顯示。驗證完成、原子 activation 只讓新版可供**新遊戲**選用；進行中存檔始終固定原 `packRefs`，到安全檢查點也不自動換版。舊檔換版須明示遷移，列 source／target tuple、損失與新 generation／lineage，保留原件；未知 mapping 不開放。取消／失敗保留可用舊版，被 save／pinned checkpoint 引用的包不得靜默移除。地圖所有點有文字按鈕同等入口。對應 ST14–15，資料源 CHAPTER。

### S04 任務／工單

```text
[任務ID＋目標] [故事進度狀態]
[證據條件／目前可見結果] [處理方式與支援能力]
[原程式題｜本地操作任務：route＋profile＋可用能力]
[唯讀來源／工作檔清單／文字草稿／儲存與還原]
[程式執行入口（僅runtime已開放時）]
[提交／檢查] [免費提示] [代辦或跳過]
[結果：故事工單｜shell／assisted｜程式判題分欄]
```

原 T0100／T0427 ID、正文保留；未開放 Python 顯原因與可用故事路徑，不放會假跑的「執行」。本地操作任務的工作檔編輯不依賴 Python；標草稿未儲存、可還原，提交預覽列不可變檔案快照、route、contract／profile 版本。COMMAND 已定 `edit <path>`；開啟為 query，套用走 `file.edit {islandId,path,expectedContentHash,content}`（TICKET §5.2／ENGINE registry），content 為有界文字而非 blob hash；兩模式同一入口，衝突保留草稿。提交中鎖同筆提交，不鎖閱讀；結果含來源與有效範圍，不揭未公開測資。正確答案但缺資料流證據時顯「答案符合；尚缺從這份日誌產生統計的操作紀錄」，保留工作檔與免費引導。已處理但未解謎／未 AC 有獨立文字。T0100 保持選擇性，登記台詞矛盾待作者裁決，不增加通關 gate。對應 ST03–04、19–20、23–25。

分支邀請獨立列「現在調查／稍後調查」；B0/B1 未進入即可延期。稍後清單用 UI-COPY-029/030 與免費回訪入口，不借用工單「已代辦」或題目「已完成」。由核心 `flag.b0.deferred`／`flag.b1.deferred` 與 `branchHandled` 提供 gate 投影，回應詳情沿 `storyProgression`，不新增前端持久 type；延期不發卡／親自模擬，實際退出與取得證據分開。對應 ST28、UX-008。

### S05 手冊、提示、回顧

```text
[手冊搜尋／分類：操作、命令、目前任務]
[命令用途＋支援選項＋限制＋範例]
[提示L1 已看／未看] [L2] [主動展開完整解法L3]
[解法與原因] [填入範例，不自動執行]
[已跳過練習 → 回顧／重新嘗試] [返回原草稿]
```

`man` 免費且完整列出已支援功能；故事提示只露當前允許內容。手冊可搜尋，無結果可清條件／回目錄。完整解法標題事先提示劇透範圍，無十秒期限；長文可純文字閱讀、選取。回顧不變 AC。對應 ST07、23–24、27。

### S06 分支、檢查點、歷史

```text
[目前main/alt＋來源檢查點] [返回工作區]
[分支／檢查點清單：章、事件摘要、版本]
[可選時間線] [兩狀態差異：世界／知識／主線抉擇]
[進入分支／免費回訪／收藏目前分支] [合併知識並返回／放棄並返回]
[還原保存點 → 舊狀態與目前紀錄保留預覽]
```

回 main 前說明世界改動不帶回；還原 main 的 VFS、cwd、分支 flags、時鐘及 PRNG，只有明選且過 gate 的知識可合併，不能泛稱全部復原。B0/B1 的 merge／abandon 記 done 出口，呈現「已返回主線」，不據此標親自模擬／已取得K0/K1。新版 `tag` 顯「收藏目前分支」，成功後仍在分支，不與退出共用按鈕。遊戲分支／存檔歷史與 Ch6 MiniGit repository 分開標題；後者列 `repositoryId / viewRevision / gameBranch`，repo OID 不是 save commitId。bisect reset 只還原 repo view，無法唯一定位時列候選，不假報找到答案；blame 不作責任／動機判決。操作是否可用由 MINIGIT／ENGINE 裁定，不用圖形線條暗示真 git 完整能力。多筆歷史分頁或區段載入，不自動移焦；文字列可完成所有操作。對應 ST07、16–17、21–22、26、28–29。

### S07 知識、遺物、證據

```text
[已解鎖知識清單／可選篩選]
[卡片ID＋標題＋來源：親自／朋友／模擬／代辦]
[證據摘要＋原讀取／章節位置＋版本]
[尚未解鎖的內容：封存數，不展示全文]
[回訪證據／本地驗證／分享預覽]
```

不提前顯示碎片總數或未知結局門檻；是否可顯示總數由章節 spoiler level 提供。朋友知識與主線抉擇不同，標籤不能只有色彩。空集合指向目前調查，不造示例已獲得卡。對應 ST07、16–17。

### S08 離線協作交換／分享預覽

```text
[分享目的：知識／便條交換；本人備份轉S09]
[選擇可分享項目] [來源與劇透層級]
[即將包含：暱稱／便條全文／必要證據欄位]
[不包含的項目（由實際payload投影）]
[產生檔案／複製] [取消]
[匯入對方資料 → 新增／重複／封存／不相容預覽]
```

預覽與 payload 由同一投影產生，不能預覽刪掉了便條、輸出卻仍帶上。完整備份不可偷偷刪欄位破壞鏈，改用獨立分享包；診斷匯出另選且說明輸入文字。NPC 補位不偽裝朋友在線；1.0 無即時聊天承諾。對應 ST08–09、16–17、26。

### S09 保存／匯入／救援／同步

```text
[保存模式：durable／僅此分頁volatile＋紀錄ID／版本]
[durable提交失敗：原進度保留／本次候選尚未提交]
[重試／下載候選救援檔／取消候選／僅此分頁繼續]
[本人備份：格式、包含範圍、來源、完整性、重放資訊]
[預覽] [下載.rasave.json／相容代碼可用時複製]
[匯入候選 → 可還原／缺失／新平行紀錄]
[本機救援：原始journal備份／只還原事件]
[M6 同步：本機｜遠端差異；選哪份繼續／保留兩份]
```

新版預設 durable：候選先完成 IDB 原子提交，才換可見世界並標已保存；quota／I/O 失敗用 UI-COPY-010，舊 root／可見世界保留，候選可下載但不自動成為遊戲進度。玩家明選「僅此分頁繼續」才轉 memory adapter，持續標 volatile／未保存至本機；此選擇不冒充 durable 成功。現行 demo 已完成交易而保存失敗的 best-effort 情境單用 UI-COPY-026。檔案建立與下載請求不等於玩家磁碟寫入成功；候選自檢失敗只能備份標明未驗證的原件，不生成假完整檔。RA1 上限依 SAVE，不提供超限假代碼。救援先列原始資料狀態與保存方式；同步分歧保留平行紀錄並明示選擇。群島 dialog／頁區；Bash 純文字同等資訊及明示確認。對應 ST08–13、18–20、25–26。

### S10 終章確認、結算與回訪

```text
[即將作出的選擇摘要]
[結算前存檔：已建立／失敗] [尚有可回訪調查]
[回目前主線補查（含Ch3.5）] [確認這個選擇] [取消]
── 提交後 ──
[結局正文（已批准內容）] [我做了什麼／證據來源]
[故事達成｜練習／代辦｜程式結果]
[保存／值班證分享預覽] [還原結算前保存點] [返回入口]
```

預設不聚焦確認，長文不逼讀者即刻離開。Ch3.5補訪走目前main旅行；B3b線索回來仍須main合法取件／協助取得F5。依D23／ENGINE §4.3，完整pin＋新世界在當前adapter原子提交才開選擇：durable須IDB成功，明選volatile可用memory pin，持續UI-COPY-028。缺件／hash錯／提交失敗仍擋確認，不自動切模式。結局後「另開結算前主線」走SAVE §7.2，預覽新槽／新lineage、原結局保留、恢復範圍、已領獎不重發及來源歷史缺口；不冒充日常補訪或sandbox。兩模式均可匯出完整pin閉包，下載不是落盤證明。值班證可選文字；結局正文與F5／K4條件仍待作者。對應ST21–22、25–26、29。

## 4. UI-004 元件 anatomy、props 與 variants

「延伸」表示從現有 DOM／函式抽離，不表示目前已有該名稱的 class。

| 元件／來源 | anatomy 與 props（語意型別／預設） | variants／重要行為 |
| --- | --- | --- |
| `ConsoleView`（現有） | viewport、log、prompt、textarea、runState；現有 submit/cancel/complete/history/leave callbacks | ready/running、launcher/input/choice/ended；維持單捲動區，原生 textarea |
| `Terminal`（現有） | `node, viewport=node, instant=false, rawErrors=false`；新增輸出摘要接口待契約 | 群島動畫／Bash instant；dialogue/stdout/stderr/system/hint/command；長 log 見 A11Y-005 |
| `PreferenceControls`（延伸 settings） | `mode,theme,font` 各獨立 enum；`persistState` | default/focused/保存偏好失敗；偏好失敗不偽稱已記住、不影響遊戲 |
| `CommandComposer`（延伸 createGame） | `draft,selection,inputKind,busy,capabilities,maxInputBytes,onSubmit,onCancel`；提交使用 `inputId,expectedStateHash,branchId` | 群島／Bash；命令／暱稱／口令／選擇；命令16 KiB UTF-8，其他種類依各契約；不能僅 placeholder 作 label |
| `TaskSummary`（延伸 task-panel） | `taskId,title,prompt,storyStatus,resolutionMode,hintLevel,expanded` | desktop/compact；empty/active/assisted/done 是呈現 variants，映射已註冊 progress；收合 summary 帶目前目標 |
| `StatusNotice`（延伸 saveMessage） | `messageId,params,severity,inputId?,submissionId?,storageMode,actions,persistent=true` | info/warning/error/success；durable-pending/failed/saved、volatile 與 legacy 分層；role=status 為常態，相同文字不重播 |
| `ChapterEntry`（新） | `chapterId,title,spoilerLevel,packRefs,installedVersion,candidateVersion,availability,bytes?` | locked/missing/downloading/verifying/ready/update-failed；目前存檔與新遊戲可用版本分開 |
| `EvidenceCard`（新） | ENGINE／MERGE 六欄 EvidenceRecord `evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash`＋UI `title,qualifyingEvidence,unlockState,duplicateCount`；variant／NPC模式從固定pack的ruleId導出，收據及legacy來源沿externalFacts blob引用 | evidenceType僅self-verified/simulated/legacy-projected/peer-shared，描述原始生成方式，轉寄不改類型／ID；peer-known與npc-guided是來源／規則推導的UI稱謂，不能只憑同lineage自稱親做；sealed是可見性，標籤不等於驗真 |
| `HintLadder`（延伸） | `taskId,steps[3],revealed,fullSolutionVisible=false,free=true` | unread/read/expanded；L3 主動展開；重看不重扣／重獎 |
| `TicketResult`（新） | `ticketId,storyStatus,resolutionMode,programVerdict,evidenceRefs`；詳情 `contractVersion,profileVersion,judgeVersion,submissionId?` 與 UI 工作狀態 | resolutionMode：null/shell-local/assisted/program-local/program-online；unavailable/unknown 是工作狀態，非判題來源；無 runtime 不假 AC |
| `BranchList`（新） | `currentBranch,checkpoints,diffs,allowedActions` | list/timeline-with-list、empty/selected/read-only；指令能力由 MINIGIT 提供 |
| `TransferPreview`（新） | `purpose,format,payloadProjection,onConfirm`＋SAVE PreviewResult `sourceHash,assessment,losses,requiredPacks,estimatedBytes,conflicts,allowedActions`；staging 帶 `stagedImportHash,expectedRevision` 與前次 `saveHash` | save/import/share/knowledge/sync；驗證中只讀、失敗、已確認；assessment 各維度分欄，不壓成 verified |
| `ConfirmAction`（新／延伸 dialog） | `actionId,title,consequences,expectedStateHash,storageMode,storageRevision?,saveHash?,returnTarget,confirmLabel,cancelLabel`；有匯入時附原 staging | island-dialog/terminal-confirm；safe-first focus；Escape 不提交；durable 由 coordinator 驗 root CAS，volatile 不偽造 durable revision |

`storageRevision` 是 SAVE active root 版本；staging 的 `expectedRevision` 就是預覽時目標 root 的該值，另固定前次 `saveHash`。世界過期用 `expectedStateHash`，不以儲存 revision 取代。線上 `submissionId` 與本機 `inputId` 各沿其 owner，不新增泛用 request/revision wire 型別。

共同控制狀態：default 用 ink/control-line；hover 用 raised；focus 有可見獨立指示；pressed 以邊界／文字回饋；disabled 真正禁止 handler 並提供理由；pending 顯工作狀態且防重複；error 文字＋修復；success 文字＋下一步；empty 說明來源及可行動項。選取用 native checked/selected/pressed 語意；不靠 opacity 或 pointer-events 假裝 disabled。元件不包巢狀互動元素。

## 5. UI-005 desktop、compact、手機與內容邊界

| 範圍 | 版面／支援目標 | 焦點與測試 |
| --- | --- | --- |
| >1000 CSS px desktop | 雙欄群島、Bash 單欄；完整主線目標 | 1280×800、1440×900、寬螢幕；2模式×2主題×3字級抽樣＋關鍵全覆蓋 |
| 761–1000 CSS px compact desktop | 220px 任務欄、預覽可堆疊，主線可操作；寬度不足提早單欄為待驗調整 | 1000/1001、760/761 邊界及低高度；不靠裝置 UA 判斷 |
| ≤760 CSS px compact layout | 任務 summary 在工作區前；預覽單欄；輸入與目前目標可達 | resize 不藏 focus、不清草稿；主頁不整頁水平捲動 |
| 真手機 | **只承諾經驗收後的 Ch0**：開始、讀信、命令、提示／skip、分支基礎、保存／匯入、偏好 | 320/360/390/414px 幾何＋iOS Safari／Android Chrome 真軟鍵盤／橫直向／大字；現未實測 |
| Ch1–Ch7 手機 | 未完成支援驗收；可讀預覽／保存出口，不標「完整手機版」 | 不因手機自動 reset 或丟進度；可備份到桌機繼續 |

- 所有寬度以 CSS px，縮放後可落入 compact；不能用固定最小寬度拒絕 400% 放大。
- 說明／錯誤／對話全文換行不省略；檔名／路徑用可換行文字，若列表視覺省略必有可鍵盤展開全文，不能只靠 title tooltip。指令複製保留原 bytes；UI 軟換行不可改命令。
- 新版 `profile.nick` 已定合法 Unicode 純文字，顯示與預覽不得套現行 demo 的 ASCII 1–12 限制；legacy reader 仍保留原驗證邊界。若產品另提較短顯示長度需明示核定，不假稱 schema 限制；暱稱不作路徑、身份或授權鍵。命令按 ENGINE 16 KiB UTF-8，便條／包依各 profile 上限，在輸入前說明並保留超限草稿；不靜默截字／正規化。
- 碼片／知識總數由 spoiler gate 決定；大型日誌只載可讀範圍／摘要並可分頁，不能將 120萬行塞進 live region。長內容／空內容／含 `<script>` 與中英混排皆以文字節點呈現。
- 無聲音亦可完整遊玩；字幕需標說話者、重要非語音事件與時間語意。聲音或插圖若未交付，使用文字，不生成假素材。

## 6. UI-006 文案 ID（具體提案，未改原劇本）

UI 字串與章節正文分開外部化；先繁中。參數以安全文字插入，保留原始錯誤細節的可展開區，不直接 innerHTML。INIT 沿來源短句、不嘲笑；工程錯誤不硬套 NPC 台詞。

| 文案 ID | 情境 | 提案文字／動作 |
| --- | --- | --- |
| UI-COPY-001 | 開場主指示 | 「先讀交班信：輸入 mail。也可以先用 ls 看看家目錄。」 |
| UI-COPY-002 | 先 ls 成功 | 「目錄已列出。交班信還沒讀，可隨時輸入 mail。」 |
| UI-COPY-003 | 未解謎 | 「指令已執行。目前任務仍待完成。查看目標」 |
| UI-COPY-004 | 工單代辦 | 「故事工單已代辦。程式題尚未通過；你可以稍後回來練習。」 |
| UI-COPY-005 | 免費提示 | 「提示免費。完整解法只會在你選擇展開後顯示。」／「展開完整解法」 |
| UI-COPY-006 | skip 確認 | 「跳過『{taskTitle}』並繼續故事？這會記為代辦，可稍後回顧。」／「跳過並繼續」「返回題目」 |
| UI-COPY-007 | 未知指令 | 「找不到指令 {command}。{suggestion}」／「查看支援指令」；suggestion 無可靠候選時省略 |
| UI-COPY-008 | 匯入失敗 | 「這份存檔無法匯入：{reason}。目前進度未被覆寫。」／「保留原檔」「重新選擇」 |
| UI-COPY-009 | RA1 預覽 | 「這是事件存檔，可還原已記錄的進度；不包含任意檔案改動、工作目錄或未記錄輸入。」 |
| UI-COPY-010 | 新版 durable 提交失敗 | 「本次操作尚未提交，原進度已保留。本機保存失敗：{reason}。」／「重試保存」「下載候選救援檔」「取消本次操作」「僅此分頁繼續」；只列實際可用出口 |
| UI-COPY-011 | 取消成功 | 「已取消本次指令。先前完成的指令仍保留。」 |
| UI-COPY-012 | 取消太晚 | 「這筆操作已完成，未撤銷。查看結果」 |
| UI-COPY-013 | 缺包 | 「『{chapter}』尚未下載。目前離線，可返回已下載的章節。」 |
| UI-COPY-014 | 更新失敗且舊包可用 | 「更新未完成，仍使用 {version}。進度未改動。」／「重試」「稍後」 |
| UI-COPY-015 | 知識匯入 | 「新增 {added} 項，{duplicate} 項已擁有，{sealed} 項待你解鎖後閱讀。來源：朋友分享。」 |
| UI-COPY-016 | 同步歧路 | 「兩邊都有不同進展。請選擇要繼續的紀錄；另一份將保留為平行紀錄。」 |
| UI-COPY-017 | 分享預覽 | 「將分享下列內容：{includedFields}。請確認全文，再產生分享檔。」includedFields 與實際投影一致，包括有勾選的暱稱、便條／指令等；可取消 |
| UI-COPY-018 | durable 終章前 | 「即將記錄這個選擇。結算前存檔已保存至本機；你也可以先回去完成尚未結束的調查。」僅 pinned 快照 IDB 提交成功時使用 |
| UI-COPY-019 | 虛擬時間 | 「閱讀不推進故事時間。此動作將推進 {cost}。」cost 由引擎格式化 |
| UI-COPY-020 | 線上未知 | 「尚未收到這筆操作的結果。正在保留原提交資訊，可查詢結果。」 |
| UI-COPY-021 | 長 log | 「新增 {count} 段輸出。你仍在閱讀先前內容。」／「讀取新摘要」「回到最新」 |
| UI-COPY-022 | runtime 未開放 | 「此版本尚未開放 Python 執行。可用本地狀態任務或免費代辦繼續故事。」 |
| UI-COPY-023 | 重複提交 | 「這筆操作正在處理，無需再次送出。」 |
| UI-COPY-024 | 已明選 volatile，持續狀態 | 「僅此分頁：後續進度尚未保存至本機，關閉分頁可能遺失。請下載備份。」／「匯出目前進度」 |
| UI-COPY-025 | quota 後選 volatile 前 | 「要以本次候選進度在此分頁繼續嗎？原本機紀錄會保留；本頁後續進度不會自動保存至本機。」／「僅此分頁繼續」「返回」 |
| UI-COPY-026 | 僅現行 demo：引擎已提交但保存失敗 | 「操作已完成，但本機保存失敗。請先匯出備份，再離開。」不可套用新版 durable 失敗 |
| UI-COPY-027 | 新包可用，舊 save 固定版本 | 「新遊戲可使用 {newVersion}。這份紀錄仍使用 {currentVersion}。」有合法遷移才另列「預覽換版」 |
| UI-COPY-028 | volatile已建立完整結算前memory pin | 「結算前保存點已在此分頁保留，可以繼續選擇；關閉分頁仍可能失去進度。」／「匯出備份」「繼續選擇」「返回調查」；不稱持久保存。pin尚未提交則顯實際錯誤，不先顯此成功文案 |
| UI-COPY-029 | B0/B1 邀請可延期 | 「要現在調查『{branchTitle}』嗎？也可以稍後免費回訪。」／「現在調查」「稍後調查」 |
| UI-COPY-030 | 延期提交成功 | 「已選擇稍後調查『{branchTitle}』，可免費回訪。這不記為親自模擬，也不會因此取得知識卡。」／「前往調查」；不在未解鎖時曝露卡名 |
| UI-COPY-031 | tag 收藏成功 | 「已收藏目前分支；你仍在此分支。」／「繼續調查」「查看返回方式」 |
| UI-COPY-032 | Ch3.5 當前主線補訪 | 「前往 Ch3.5 補查會保留目前其他章進度；這是主線旅行。」／「前往補查」「留在此處」；有時間成本另顯 UI-COPY-019 |
| UI-COPY-033 | 還原保存點預覽 | 「將還原到『{checkpointTitle}』。請確認下方還原範圍與目前紀錄的保留方式。」／「還原此保存點」「返回」；保存模式／缺失另列 |

錯誤文案的「未改動／已建立／已保存」必須由引擎或儲存真實終態決定，不可硬編為每種失敗通用句。提示／按鈕長度不設會裁掉語意的強制字數；以最長實例、多語參數與大字測試。

## 7. UI-007 資產、QA、交付與變更

- 資產：沿現有系統字型、文字／CSS。地圖 SVG 若後續製作需 title/description、非色彩識別、文字清單等價；裝飾 icon `aria-hidden`，有意義者名稱取動作。尚無新圖／音檔／Figma 匯出，不以 placeholder 當正式資產。
- 功能切片次序：既有原語／焦點／命令 → S01/S02/S05 → S09 原子保存 → S03 章包 → S04 判題 → S06/S07/S08 → S10；M6 同步、M7 線上狀態依各版開放。每片至少正常／空／等待／失敗／取消與資料邊界一併交付。
- 每片一次短 walkthrough：UX 提供目標、ST、copy ID；工程指出契約差距；QA 決定 fixture／環境。人力少可由同一人兼任，但未知不能因兼任而標完成。

| 驗收 ID | pass/fail 準則（尚未執行） | 角色／估算 |
| --- | --- | --- |
| UI-001 | 十個 surface 皆有兩模式等價入口／資訊；Bash 不出現額外圖形側欄；偏好獨立 | FE＋UX／M |
| UI-002 | computed style 對照以上來源；兩模式／兩主題所有互動狀態量測對比，記 fg/bg/ratio | FE＋a11y QA／M |
| UI-003 | 每個 surface 的主要流程及 ST fixture 可達；延期／免費回訪、tag與退出、Ch3.5旅行與還原有獨立標籤；缺包／壞檔／無資料不空白 | FE＋內容＋QA／L |
| UI-004 | props 可追到 ENGINE／SAVE 欄位；staging 固定 expectedRevision／saveHash，過期確認拒絕；原生 semantics、loading/disabled/error/success 有真行為 | FE＋QA／M |
| UI-005 | desktop／compact／真手機 Ch0，resize／大字／鍵盤不遮輸入與焦點；長文／路徑完整可讀 | FE＋裝置 QA／L |
| UI-006 | 參數安全、預覽等於輸出；quota 注入無候選成功播報，明選 volatile 才切模式，三類保存 copy 不混用；更新不改 save.packRefs；作者確認敘事提案 | 內容＋工程＋UX／M |
| UI-007 | 視覺對照＋功能＋鍵盤＋讀屏＋真機證據各自記錄，沒有以截圖代替互動通過 | QA＋UX／M，與 A11Y/RES 成本去重 |

QA 紀錄最小欄：build/章包版本、surface/ST、模式/主題/字級、OS/瀏覽器/AT版本、CSS viewport/縮放、重現步驟、預期、實際、截圖或宣讀紀錄、issue ID、修復版本、複驗結果。狀態只用「待測／通過／失敗／不適用＋理由」。兩主題、兩模式、critical ST 必測；低風險組合可抽樣但保留未覆蓋欄。

交付就緒：文字線框／copy／現有 token 可供實作評審。INT-O01/02 的時間與提交接點、S04 file.edit、D19/D20延期與補訪政策已定，剩實作驗收／成本調校，不列全域未知契約。**blocking 邊界**：UI-O01 真機支援聲明、A11Y-O01 鍵盤發布驗收、UX-O02 作者工單稱謂、UX-O03 對應正文／結局發布；M6/M7 接點依版本。**nonblocking**：UI-O02 SVG 裝飾及可選淡入。估算 S/M/L 見共用 brief，未計實際產能／外部設備採買。修改需留下「改了什麼／理由／影響 ID／哪個版本生效」，不可在程式先改完再把規格中的未測勾掉。
