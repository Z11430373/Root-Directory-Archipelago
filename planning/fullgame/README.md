# 《根目錄群島》完整版設計文件包

工作稿 0.3｜2026-11-02｜本地規劃交付，尚未實作完整版。

本文件包把原規劃書、玩家體驗、敘事、技術契約與驗收串成可分工的工作依據。先閱讀 [修訂後總綱](《根目錄群島》完整版規劃書.md)，再依角色進入文件；不要把所有文件當成一個立即實作的大工作包。

## 五分鐘閱讀路線

1. **作者／製作決策**：[總綱](《根目錄群島》完整版規劃書.md) → [決策台帳](DECISIONS.md) → [劇情辯論](reviews/NARRATIVE_DEBATE.md) → [路線圖](delivery/ROADMAP.md)。
2. **玩家體驗／介面**：[玩家旅程](ux/PLAYER_EXPERIENCE.md) → [互動](ux/INTERACTION_SPEC.md) → [介面交付](ux/UI_HANDOFF.md) → [無障礙](ux/ACCESSIBILITY.md)。
3. **劇情／章節作者**：[來源對照](SOURCE_MAP.md) → [故事弧線](narrative/STORY_ARC.md) → [章節節拍](narrative/CHAPTER_BEATS.md) → [伏筆與結局](narrative/REVEALS_AND_ENDINGS.md)。
4. **工程**：[引擎契約](engineering/ENGINE_CONTRACT.md) → [存檔](engineering/SAVE_SCHEMA_2.md) → [章節包](engineering/CHAPTER_PACK.md) → 對應領域規格。
5. **品質與接手代理**：[工作包](delivery/WORK_PACKAGES.md) → [驗收矩陣](delivery/ACCEPTANCE_MATRIX.md) → [試玩計畫](ux/PLAYTEST_PLAN.md) → [交付檢查](reviews/VERIFICATION.md)。

## 文件地圖與責任

責任為本次分工角色；「設計基線」表示工作稿採用，並非產品完成或真人驗收通過。

| 文件 | 用途／唯一負責範圍 | 角色 |
| --- | --- | --- |
| [完整版規劃書](《根目錄群島》完整版規劃書.md) | 原九節逐段修訂、版本／模式／工作包總綱 | 整合 |
| [DECISIONS](DECISIONS.md) | 跨文件裁決、設計狀態與待作者確認事項 | 整合 |
| [STATUS](STATUS.md) | 現況證據、未驗證項、文件與功能狀態 | 整合 |
| [SOURCE_MAP](SOURCE_MAP.md) | 原始劇本、資料、附件與提案的權威對照 | 劇情 |
| [PLAYER_EXPERIENCE](ux/PLAYER_EXPERIENCE.md) | 人群、旅程、學習坡度、回流與章末 | UX |
| [INTERACTION_SPEC](ux/INTERACTION_SPEC.md) | 動作、守衛、狀態、時間、取消、復原 | UX |
| [UI_HANDOFF](ux/UI_HANDOFF.md) | 資訊架構、版面、元件、token、文案與接點 | UX |
| [ACCESSIBILITY](ux/ACCESSIBILITY.md) | WCAG 2.2 AA 目標、鍵盤、讀屏、縮放、實機驗收 | UX |
| [PLAYTEST_PLAN](ux/PLAYTEST_PLAN.md) | 主持腳本、觀察表、分母、形成性門檻與資料範圍 | UX／研究 |
| [STORY_ARC](narrative/STORY_ARC.md) | 主題、角色弧線、玩家能動性 | 劇情 |
| [CHAPTER_BEATS](narrative/CHAPTER_BEATS.md) | 九章的情緒／學習／調查節拍 | 劇情 |
| [REVEALS_AND_ENDINGS](narrative/REVEALS_AND_ENDINGS.md) | 伏筆、揭露 gate、已知結局條件與未知正文 | 劇情 |
| [VOICE_AND_COPY](narrative/VOICE_AND_COPY.md) | 人物口吻、系統訊息、術語與提案文案 | 劇情 |
| [AUTHOR_RESPONSE](narrative/AUTHOR_RESPONSE.md) | 主筆代理對 N01–N13 的實際回覆；不代表作者批准正史 | 劇情 |
| [ENGINE_CONTRACT](engineering/ENGINE_CONTRACT.md) | 狀態、效果、確定性、時鐘、分支與交易 | 核心工程 |
| [SAVE_SCHEMA_2](engineering/SAVE_SCHEMA_2.md) | 序列化、VFS、快照、歷史、legacy 遷移與來源 | 核心工程 |
| [CHAPTER_PACK](engineering/CHAPTER_PACK.md) | Manifest、內容版本、離線下載與活動入場 | 核心工程 |
| [COMMAND_COMPATIBILITY](engineering/COMMAND_COMPATIBILITY.md) | 真工具子集、遊戲擴充與行為對照 | 核心工程 |
| [TICKET_JUDGE](engineering/TICKET_JUDGE.md) | 指令判題、代辦、程式 runtime 與 OJ 合約 | 互通工程 |
| [MERGE_SPEC](engineering/MERGE_SPEC.md) | 知識聯集、朋友交換、同步分歧與冪等性 | 互通工程 |
| [REPLAY_SPEC](engineering/REPLAY_SPEC.md) | 規則可達性、來源、賽季授權與結算 | 互通工程 |
| [MINIGIT_SPEC](engineering/MINIGIT_SPEC.md) | 有界歷史查詢、blame／bisect 與參考案例 | 關卡工程 |
| [BOSS_AND_BRANCHES](gameplay/BOSS_AND_BRANCHES.md) | 九分支、診斷型 Boss、失敗與局部復原 | 關卡 |
| [EXPANSION_MODES](gameplay/EXPANSION_MODES.md) | C1 紅藍案例／協作、2.x 接力與候選矩陣 | 擴充玩法 |
| [SEASON_SIM_SPEC](gameplay/SEASON_SIM_SPEC.md) | 經濟、權威帳本、模擬情境與真人試營運 | 擴充玩法 |
| [ROADMAP](delivery/ROADMAP.md) | M0–M7／C1 依賴、發布與可縮範圍 | 整合 |
| [WORK_PACKAGES](delivery/WORK_PACKAGES.md) | 可派工交付物、讀入範圍、介面與驗收 | 整合 |
| [ACCEPTANCE_MATRIX](delivery/ACCEPTANCE_MATRIX.md) | 風險到案例、測試層次與證據要求 | 品質整合 |
| [NARRATIVE_DEBATE](reviews/NARRATIVE_DEBATE.md) | 真實跨代理議題、主筆答覆、反方結論 | 敘事反方 |
| [INTEGRATION_REVIEW](reviews/INTEGRATION_REVIEW.md) | 跨領域一致性審查與修訂去向 | 獨立審查 |
| [STORY_BIBLE_RECONCILIATION](reviews/STORY_BIBLE_RECONCILIATION.md) | 聖經取得後的 O-N 對照與後續工作 | 整合 |
| [ISSUE_REGISTER](reviews/ISSUE_REGISTER.md) | 上輪 R01–R12 的單一問題登錄與處理狀態 | 整合 |
| [VERIFICATION](reviews/VERIFICATION.md) | 實際文件檢查結果、原稿雜湊與剩餘限制 | 整合 |
| [原稿](source/《根目錄群島》完整版規劃書.original.md)／[故事聖經](source/《根目錄群島》故事聖經.md)／[來源說明](source/README.md) | 原附件與聖經封存 | 唯讀來源 |

## 使用規則

- **正文未知不填造**：已知必要條件不能直接擴寫成完整結局條件；八空格與隱藏結局待原文。
- **詳細規格不重複**：wire schema 由 SAVE_SCHEMA_2 負責、判題 profile 由 TICKET_JUDGE 負責；其他文件用連結與邏輯接點引用。
- **同名不等於同證據**：故事工單已處理、程式 AC、知識已匯入、親自驗證及競賽收據是不同事實。
- **變更要連帶檢查**：改版本／clock／欄位／profile／gate 時，在 DECISIONS 與相關 acceptance 更新；保留來源與反方異議。
- **驗收分類**：文件結構檢查、代理語意審查、程式測試、實機測試、真人研究各自報告，不互相升格。
- **實作前先選一包**：WP 文件有清楚寫入範圍；不要把未解正史或未驗 runtime 一次交給代理猜完。

## 本輪交付範圍

工作區文件位於 `planning/fullgame/`。原附件留在下載目錄，原始遊戲資料與程式保留既有狀態。本次不是遊戲建置、部署、作者正史終稿或無障礙認證；實際文件審查與檢查結果以 [VERIFICATION](reviews/VERIFICATION.md) 為準。

共35份Markdown，含原稿封存；規劃有D01–D25、O-N01–O-N08、WP0–WP12與ACC-01–ACC-25。七位代理分工稿已收齊，劇情保留主筆實際答覆及反方R2/R3，跨域審查保留初審與逐項修訂紀錄。

**文件規劃已完成交付。** 獨立跨域審查0.6 §10關閉20項指定規劃反例；敘事R3為4已解／6部分解／3待作者。這些是文件語意判定，具名子schema、八項作者缺口與實作／真人驗收仍依工作包完成；最後結構檢查與原稿比對見VERIFICATION。

### 接手順序

1. 工程先接WP1-A/B/C共用核心與保存小切片，配合WP2／WP3補齊所需封閉子schema；案例以非正史fixture隔離驗證。
2. 作者依O-N01–O-N08提供正文與裁決；未知僅阻擋受影響章節／結局，不由工程猜補。
3. 執行WP0真人試玩，再依M0結果擴大內容製作；性能、Python runtime、手機／讀屏與M6/M7服務依各自關卡驗收。
