# 可派工工作包與接手規則

版本 0.2｜設計交付；下列實作與真人研究尚未執行。

所有包先讀 [DECISIONS](../DECISIONS.md)、[STATUS](../STATUS.md) 與對應領域規格。詳細欄位、狀態與文案以領域文件為準，避免在派工提示中複製一份不同規則。

## 1. 共用交付格式

每包交付：

1. **目標與範圍**：要讓哪位玩家完成什麼，明確寫入的檔案區域。
2. **依據**：規格版本、來源 ID、共用決策、未解事項。
3. **行為與接點**：輸入、輸出、資料權威、取消／失敗與復原。
4. **驗證**：適用正反案例、使用工具／平台、實際結果；未跑的列未跑。
5. **相容性**：既有來源、legacy reader、存檔與跨章影響。
6. **差異與裁決**：如果與規格不同，先列原因與選項，不默默把錯誤寫成成功。
7. **接手摘要**：修改路徑、風險、後續包要依賴什麼。

角色成本使用低／中／高相對估計；未測產能前不折算天數。使用者的既有未提交變更不屬包的可清理內容。

## 2. 工作包總表

| 包 | 責任／成本 | 主要輸入 | 實際交付 | 出口與依賴 |
| --- | --- | --- | --- | --- |
| WP0 試玩實證 | 研究＋製作／中 | 現有 demo、[PLAYTEST_PLAN](../ux/PLAYTEST_PLAN.md) | 執行腳本、去識別觀察、卡點與修訂決策 | M0；人工資料不以代理走法代替 |
| WP1 共用核心／保存 | 核心／高 | [ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md)、[SAVE_SCHEMA_2](../engineering/SAVE_SCHEMA_2.md)、COMMAND | M1純reducer、Input/effect registry、時鐘／PRNG／scheduler／cancel、command lowering；reader/writer、legacy、恢復與固定向量；子包見下 | ACC-02/03/05/08/14/17/24；規格先行，擴大製作依M0 |
| WP2 章節包管線 | 核心＋內容／高 | [CHAPTER_PACK](../engineering/CHAPTER_PACK.md)、WP1 | manifest 編譯／驗證、固定版本載入、離線發行與 starter | ACC-06/07；模擬斷網／壞包後仍保留舊版本 |
| WP3 工單判題 | 判題＋UX／高 | [TICKET_JUDGE](../engineering/TICKET_JUDGE.md)、WP8 能力坡度 | shell-state profile、代辦／回顧、結果UI、runtime研究紀錄 | ACC-09/10；程式profile需額外runtime出口 |
| WP4 協作／合併 | 互通／高 | [MERGE_SPEC](../engineering/MERGE_SPEC.md)、WP1、揭露矩陣 | peer preview、知識聯集、去重、來源狀態；後續sync adapter | ACC-11/12；1.0不含完整C1衝突關卡 |
| WP5 mini-git | 關卡工程／高 | [MINIGIT_SPEC](../engineering/MINIGIT_SPEC.md)、Ch6提案 | 固定小repository、query子集、good/bad判定、真git案例 | ACC-13；先S-05再接WP2 |
| WP6 重放服務 | 互通＋後端／高 | [REPLAY_SPEC](../engineering/REPLAY_SPEC.md)、WP1/2/3 | 授權請求、重放工作、state/effects/OutputRecord比對、收據與限制 | ACC-14/15；M6，不以離線歷程升競技來源 |
| WP7 賽季 | 玩法＋後端／高 | [SEASON_SIM_SPEC](../gameplay/SEASON_SIM_SPEC.md)、WP3/6 | 參數矩陣、模擬器、帳本、營運計畫、真人試營運 | ACC-16；M7，與WP5無依賴 |
| WP8 長篇UX | UX＋前端／中高 | [PLAYER_EXPERIENCE](../ux/PLAYER_EXPERIENCE.md)、[INTERACTION_SPEC](../ux/INTERACTION_SPEC.md)、[UI_HANDOFF](../ux/UI_HANDOFF.md) | 續玩、證據、地圖、分支與工單介面；共用兩模式 | ACC-01/04/17/18；與WP1/3先對齊接點 |
| WP9 敘事與章節 | 作者＋內容／高 | [SOURCE_MAP](../SOURCE_MAP.md)、[CHAPTER_BEATS](../narrative/CHAPTER_BEATS.md)、[REVEALS_AND_ENDINGS](../narrative/REVEALS_AND_ENDINGS.md) | 來源化章節包、伏筆／台詞／結局條件及反向路徑 | ACC-19/20/21；O-N事項先解除受影響正文 |
| WP10 遭遇與分支 | 關卡＋核心／高 | [BOSS_AND_BRANCHES](../gameplay/BOSS_AND_BRANCHES.md)、WP1/2、時間契約 | 可診斷狀態、分支隔離、局部檢查點與重試 | ACC-08/22；先S-04，讀取不偷扣時間 |
| WP11 交付品質 | QA＋製作／中高 | [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md)、[ACCESSIBILITY](../ux/ACCESSIBILITY.md)、路線圖 | 測試與人工紀錄、平台矩陣、內容版本、發布清單 | ACC-23/24；未驗證項保持可見 |
| WP12 C1案例包 | 內容＋真人審閱／高 | [EXPANSION_MODES](../gameplay/EXPANSION_MODES.md)、WP2/3/8/9 | 已來源化案例、紅藍證據／報告／修補鏈、審閱 | ACC-25；M5後獨立批次，不阻塞主線 |

ACC 編號的定義在 [驗收矩陣](ACCEPTANCE_MATRIX.md)；領域文件內的細部編號保持各自命名空間。

### WP1 的 M1 共用基礎子包

| 子包／owner | 具名交付 | 前置與驗收 |
| --- | --- | --- |
| WP1-A 純核心／核心owner | immutable EngineState／reduce/query、封閉Input與effect validators、固定點／預算、branch isolation、main reward guard、shellStatus生命週期 | ENGINE／COMMAND／SAVE已定基線；非正史最小fixture比相同state＋input、分支獎勵及query零變更 |
| WP1-B 確定性執行／核心owner | 整數時鐘、named PRNG、scheduler排序／drain／serial、D17行動次序、cancel與正常rc非零、GUI／Shell typed-only lowering | 依WP1-A；同tick事件、取消前後、pipeline／`;`／compact後`$?`、兩模式同效果固定向量；ACC-08/17/22 |
| WP1-C coordinator／保存owner | canonical/hash、journal／snapshot閉包、必要pin預留、durable CAS／memory commit、legacy reader、compact、reopen-main/1與RecoveryOrigin驗證 | 依A/B；故障注入、跨宿主round-trip、持續IDB失效的非正史終章／原結局保全；ACC-02/03/05/24 |

WP2的loader可先用A的封閉介面開發，正式章節切片須A/B/C與PACK子schema；WP3、WP5、WP10各領域reducer接A/B，保存接C；WP6重放重用A/B同一核心及C格式，不重寫另一套規則。WP10只交領域遭遇／scheduler事件型別，不默認承包共用scheduler。上述均屬M1交付，不由後述領域schema小包替代。

### 實作前的封閉 schema 小包

核心已固定入口／外層與保存位置，但下列子格式尚不足以產生完整 validator；先在原工作包內完成，勿把 `schemaVersion` 外殼當可執行規格。權威狀態見 ENGINE §8.1／CHAPTER_PACK §4.4，以下只派工、不複製 schema。

| 所屬包／缺口 | 先交付的具體成果 | 解除證據 |
| --- | --- | --- |
| WP3：ENG-SUB-TICKET-TRACE／EVIDENCE | 各 op.params／bounds、非生成來源表示、每 profile competencyScopes、legacyRef／receipt 判別式及 null 規則 | 封閉 schema、正負 fixture；跨指令／相同bytes重寫／取消／compact不冒用來源 |
| WP4：ENG-SUB-MERGE-SHARE | notes／footprints／receipts 的必填、可選、上限及驗簽 envelope；與分享範例對齊 | 未知欄位拒絕、最小分享與完整必需閉包分開、A→B→C來源不變 |
| WP5／WP10：ENG-SUB-DOMAIN | Boss／MiniGit runtime data、minigit.changed、predicate report、scheduler事件的完整型別 | runtime round-trip／合法空值／取消與未知子版本fixture |
| WP2：PACK-SUB-RULE／CONTENT／INTEROP | guard AST、selector、reducer列表、入口與每類內容／generator格式；引用上述領域型別 | 建置及載入雙重驗證，未知guard不作true、未定capability不可啟用 |
| WP6：ENG-M6-REPLAY-ASSESSMENT | 評估wire版本、起訖hash／coverage、逐seq輸出引用、issuer／receipt scope、factId與冪等 | 同步REPLAY／ENGINE／SAVE的封閉schema及閉包；解除前system.fact拒絕此型別 |

這些是明列的後續規格工作，不是本輪已完成的功能或測試。後半正文、runtime可行性、reference工具digest與實機研究另按原關卡處理。

## 3. 首批應接的三個實作前小包

### P-01 玩家／判題／保存接點對齊

- 讀：D05/D07/D09/D17、ENGINE_CONTRACT §3／§8.1、TICKET_JUDGE、SAVE_SCHEMA_2、INTERACTION_SPEC。
- 產出：一個具體 T0427 的「接受任務 → 操作 → 代辦或本地判定 → 保存 → 重新匯入」資料流示例。
- 必答：故事解決與 AC 的欄位從哪裡來？舊 `t0427_done` 如何解釋？取消留下什麼？不支援 Python 的畫面說什麼？
- 退出：四份規格不對同一事實使用相反定義；無未登記的欄位別名；該切片用到的 TRACE／EVIDENCE 子 schema已補齊，而非只列名字。
- 不需要新後端或完整章節資產。

### P-02 敘事反證與終章來源補齊

- 讀：SOURCE_MAP、STORY_ARC、REVEALS_AND_ENDINGS、NARRATIVE_DEBATE。
- 產出：作者正文來源版本、八空格與五結局的必要／充分／排除條件；每個條件有可觀察證據。
- 退出：只有確認過的正文可標「來源事實」；未知繼續阻塞該部分，不用新劇情補洞。
- 同時核對 mtime修訂、三人簽核與八片多簽、舊 `wall` 的模式呈現。

### P-03 新手形成性試玩

- 讀：PLAYTEST_PLAN、現有 demo 操作說明與驗證邊界。
- 產出：任務逐項紀錄、參與者分群、卡點／閱讀／求助區分、至少一項可追蹤修訂。
- 退出：觀察者不把自己提示後的完成算成獨立理解；未收集的指標不補估。

## 4. 多代理協作與審查

- **寫權分區**：一位主筆擁有一組文件；反方先寫自己審查檔，再由主筆局部修訂。
- **討論要有真實往返**：保留實際問題、主筆答覆、反方是否接受與仍缺證據。主筆自行列A/B是選項比較，不能稱另一代理已同意。
- **技術語意衝突**：優先找唯一權威檔，修引用方；必要時更新決策台帳並列受影響檔案。
- **正史衝突**：查來源，不採多數決造正史；可推薦提案，待作者提供正文。
- **獨立驗證**：審查者讀完成稿，至少挑一個會讓規格失效的反例；被修復後再次核對指定段落。
- **停止條件**：核心矛盾修復、剩餘缺口有範圍與解除條件、結構檢查通過即可交付；不無限增加文件或重跑同樣測試。

## 5. 接手代理回報模板

```text
包／規格版本：
實際寫入路徑：
讀取來源與決策：
完成的行為／文件：
重要差異與裁決：
執行過的驗證（命令、環境、結果）：
未執行／待正文／待真人：
失敗與恢復證據：
下一包需用的接點：
```

沒有執行證據時填「未執行」，不以「應可」或「格式看起來正確」替代通過。
