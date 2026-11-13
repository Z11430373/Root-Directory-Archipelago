# 玩家體驗與共用設計 brief

日期：2026-11-02｜文件狀態：規劃工作稿，未實作／未真人驗證｜責任角色：體驗設計、作者、整合者。

權威為 [DECISIONS](../DECISIONS.md) D01–D20；本組五份文件共用本 brief、證據索引及問題台帳。規格中的「應」是驗收要求，不表示現行版本已做到。角色代表工作責任，非已到位人力。

## 1. 目標、範圍與證據

**UX-001：玩家能從看見異常、找到證據、嘗試修補，走到理解因果；卡關仍有免費出口，離開後能可靠續玩。**

- 對象：對系統／故事有興趣的高中以上玩家；依操作經驗與遊玩情境分群，不用年齡推定能力。
- 平台：瀏覽器離線優先；桌機完整主線、手機 Ch0 為 1.0 驗收目標。既有原生 JS、DOM、CSS、系統字型；規劃共用引擎，沿用群島／Bash 終端兩種操作模式。
- 1.0：Ch0–Ch7（含 Ch3.5）、B0/B1/B2/B3/B3b/B4/B5/B6/B7、四結局與隱藏結局、有界離線交換及 NPC 補位。C1 為後續完整協作衝突／紅藍隊包；M6＝1.1 同步重放、M7＝1.2 賽季與 OJ。此處不另訂版本。
- 成功衡量：有效開始、可恢復離開、理解證據、沒有被提示劇透或誤認 AC；實驗定義見 [PLAYTEST_PLAN](PLAYTEST_PLAN.md)。原稿的 2–3 分鐘回饋、每章 25–40 分鐘、全線 4–6 小時均是待校準目標。
- 標準：WCAG 2.2 AA 目標；見 [ACCESSIBILITY](ACCESSIBILITY.md)。本輪只讀來源與建立文件，沒有瀏覽器、讀屏器、真人試玩或對比量測結果。

### 證據索引（五檔共用）

| 證據 ID | 已讀來源與定位 | 可支持的事實／限制 |
| --- | --- | --- |
| E01 | [原規劃](../source/《根目錄群島》完整版規劃書.original.md) §1–9 | 願景與歷史範圍；衝突由 D01–D20 取代，非實測 |
| E02 | [SOURCE_GUIDE](../../../SOURCE_GUIDE.md) §2–4 | 交易、三種保存、資源生命週期；RA1 與本機 envelope 不同 |
| E03 | [README](../../../demo-app/README.md)「操作模式」「三種跑法」 | 模式／主題／字級獨立，Bash 快捷鍵，活動限制 |
| E04 | [main.js](../../../demo-app/src/main.js) `settings`、`switchSurface`、`createGame`、`refreshConsole` | 同 Engine 切換、草稿與歷史保留；Bash 無側欄／存檔 dialog |
| E05 | [main.js](../../../demo-app/src/main.js) `importCandidate`、`resumeLocal`、`persist`、`showRecovery` | 候選准入後替換；重播失敗保留原始 envelope；跨頁停止寫入 |
| E06 | [main.js](../../../demo-app/src/main.js) `syncClock`、末尾 250ms 排程 | 現行試玩以 `performance.now()` 差額 advance；不能聲稱已符合完整版 D07 |
| E07 | [console-view.js](../../../demo-app/src/ui/console-view.js)、[shell-job.js](../../../demo-app/src/ui/shell-job.js)、main `submitConsole`／`cancelConsole` | 原生 textarea、IME guard、引號外分行、Worker 取消；群島仍用同步 Shell |
| E08 | [theme.css](../../../demo-app/src/ui/theme.css)、[server.css](../../../demo-app/src/ui/server.css) | 真實 token、1000/760px 斷點、44px 手機覆寫；Bash input 移除 outline，需實機檢查替代焦點 |
| E09 | [terminal.js](../../../demo-app/src/ui/terminal.js) `write`／`tick`／`scroll` | polite log、逐字動畫／立即模式、回捲不強拉、1200 個輸出區塊上限；不是 1200 個日誌文字行 |
| E10 | [DEMO_DESIGN](../../../demo/DEMO_DESIGN.md) §2–7、[REPORT](../../../demo-app/REPORT.md)「沒能驗證的」 | 15 分鐘活動與歷史驗收；真人、讀屏器、跨瀏覽器仍未驗證 |
| E11 | [BASH_TERMINAL](../../../demo-app/notes/BASH_TERMINAL.md) §最新／前次驗收 | 前次整合 390/390、原生 Bash 對照後修正 391/391，均為既有紀錄；本輪未重跑，不能外推真人或新版功能 |
| E12 | [init.yaml](../../../dialogue/init.yaml) `login`、[quests/ch0.yaml](../../../quests/ch0.yaml) Q0-1、[flow.yaml](../../../demo/flow.yaml) `r.mail_file`／`skip`／提示階梯 | `mail` 與 `ls` 同時出現的引導來源；目前 skip 寫 skip、非 task；完整提示有自動升階 |

### 工程契約索引

以下配套文件已讀；ENGINE／SAVE／CHAPTER／COMMAND 0.2-draft 與其餘領域工作稿提供規劃接點，採 DECISIONS 最新裁決。工程稿仍在整合，已定欄位依權威檔同步，不把工作稿當 API 已實作，也不把已解契約持續列未知。

| 文件 | UX 所需輸入 |
| --- | --- |
| [SAVE_SCHEMA_2](../engineering/SAVE_SCHEMA_2.md) | legacy reader、完整 baseline＋journal、assessment、staging expectedRevision／saveHash、IDB 原子提交與明選 volatile、pinned 結算前存檔 |
| [CHAPTER_PACK](../engineering/CHAPTER_PACK.md) | timePolicy.actionCostsMs、精確 packRefs、原子安裝／更新；新遊戲啟用不改進行中存檔，換版須明示遷移 |
| [ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md) | inputId／expectedStateHash、storyTimeMs 整數毫秒、query 零變更、取消／提交邊界、file.edit、故事與程式結果分欄 |
| [COMMAND_COMPATIBILITY](../engineering/COMMAND_COMPATIBILITY.md) | 支援命令與選項、`game` 控制層、未知／不支援差異 |
| [TICKET_JUDGE](../engineering/TICKET_JUDGE.md) | 故事處理／shell-local／assisted／程式判題的可辨結果 |
| [MERGE_SPEC](../engineering/MERGE_SPEC.md) | 知識證據資格、來源、去重、封存劇透、同步歧路 |
| [REPLAY_SPEC](../engineering/REPLAY_SPEC.md) | 重放範圍／版本、待驗證與失敗、線上憑據 |
| [MINIGIT_SPEC](../engineering/MINIGIT_SPEC.md) | 分支、檢查點、`log/blame/bisect` 模擬語意及不支援操作 |

## 2. 玩家分群與旅程（假設，非研究 persona）

**UX-002：依行為提供可選引導，能力不是永久標籤。** 熟手也能使用完整解法；新手也能切到 Bash；無障礙偏好不決定難度或成績。

| 群／情境 | 動機與工作 | 可能障礙（待驗） | 支援與完成出口 |
| --- | --- | --- | --- |
| N 新手：未用過 shell 或只複製過命令 | 看故事、敢試第一個動作 | 不知道輸入位置、誤以為會改到自己的電腦 | 群島預設、可填入的指令、操作說明、免費提示、skip／代辦 |
| R 回流：玩過試玩或隔一段時間回來 | 找回上次脈絡，不重看全部教學 | 把 RA1 當完整機器備份、忘記分支與待辦 | 匯入摘要、現在位置／最後證據／下一步、可展開回顧 |
| X 熟手：能自行組合命令 | 直接診斷、探索分支與隱藏證據 | 把模擬當完整 Bash、被強制教學打斷 | Bash 連續輸出、相容性說明、關閉非必要導引、不自動代答 |
| E 活動：共用設備／主持人帶領 | 有界時間內體驗核心，帶走自己的紀錄 | 時間壓力、私人資料留在攤位、主持人共享紀錄誤匯入 | 明示活動計時、保存預覽、退出清理、host 共享標籤 |

無障礙需求（視覺、聽覺、動作、閱讀、注意力）跨以上四群；研究直接詢問輸入與呈現需求，不要求診斷或證明。

### 四條端到端旅程

| 旅程／階段 | 玩家行動與接觸面 | 產品回饋／恢復點 | 驗證問題與責任 |
| --- | --- | --- | --- |
| 新手：到達 → 第一動作 | S01 知道是模擬世界；S02 登入、讀信或列目錄 | 一個主引導，另一個是可選方向；空白 Enter 不受罰 | 能否自行開始？UX、RES |
| 新手：診斷 → 卡關 → 點燈 | S04 查看目標，S05 逐階提示／手冊，S02 嘗試 | 命令結果、任務達成、故事變化分開；完整解法需主動展開 | 知道下一步與原因？內容、QA |
| 新手：選擇調查 → 試誤或延期 → 離開 | S04/S06 可直接稍後調查 B0/B1，或進分支嘗試；S07 知識、S09 保存 | 延期保留免費回訪，不發卡；實際帶回合格知識而非任意檔案；保存模式與成功狀態可見 | 能區分延期、退出與親見證據？工程、RES |
| 回流：選紀錄 → 預覽 → 還原 | S01/S09 本機續玩或 RA1／新版匯入 | 來源、版本、可還原／不可還原項、平行紀錄；失敗不覆寫 | 是否理解「事件」與「完整狀態」？工程、UX |
| 回流：定位 → 補課 → 繼續 | S03 章節、S04 待辦／稍後調查、S05 回顧 | 已 skip 列「可回顧」，非 AC；B0/B1 可免費回訪，Ch3.5 在當前主線補訪，不靠讀回舊檔 | 能區分補訪與保存點還原，保留目前進度？RES |
| 熟手：直接操作 → 探索 → 比較 | S02 Bash、S06 分支、S07 證據 | 即時輸出、不搶回捲；不支援選項可查；同一引擎裁定 | 模式切換與真 Bash 預期？工程、QA |
| 活動：設定 → 遊玩 → 收尾 → 清理 | S01 明示 self/kiosk/host；S09 複製／預覽；S10 值班證 | 牆鐘只負責場次；不回寫主線衰退；共享紀錄非個人進度 | 主持可交班、玩家可帶走資料？主持、RES |

## 3. main loop、章節與長期節奏

**UX-003 主循環：** 情境／信件／異常 → 閱讀證據 → 提出猜測 → 在模擬世界操作 → 檢查輸出與狀態 → 對照原因 → 解鎖下一個問題／分支 → 保存／停下。每步均允許 `man`、回看、設定與退出；沒有「讀慢就變壞」。

| 節奏層 | 回饋設計 | 頻率／時間的地位 |
| --- | --- | --- |
| 每次命令 | 原始結果／錯誤、相關任務變更；stdout 非空或 rc=0 不等於解謎完成 | 提交後回饋；等待期間可看執行狀態與取消範圍 |
| 一個診斷段落 | 「知道了什麼／仍缺什麼」與可選下一步 | 原 2–3 分鐘是體驗假設；不以牆鐘強制插播或洩答案 |
| 一章 | 抵達與動機 → 短教學 → 開放調查 → 分支試誤 → 工單／關鍵修補 → 回顧／檢查點 | 原 25–40 分鐘需記錄快／中／慢實測及閱讀時間；不用速度代表理解 |
| 跨章 | 舊概念換情境、已解鎖證據可查、未完調查可回訪 | 原 4–6 小時非承諾；可分多次遊玩 |
| 終章前後 | 提醒未完調查、保留結算前存檔、當前主線補訪、確認抉擇；結局後另可還原保存點 | D14/D20；旅行與讀檔分開，不揭示未知結局條件，不用錯過 Ch3.5 懲罰回流 |
| 可選長期 | 1.0 知識交換／NPC；C1 另一組故事；M6 同步；M7 賽季 | 無每日登入義務、主線不綁賽季排名或競技貨幣 |

章節概念遞進沿原稿：Ch0 檔案／信件 → Ch1 日誌與管線 → Ch2 權限／輪值 → Ch3 郵件調查 → Ch3.5 時間推理 → Ch4 網路與 NPC 協作 → Ch5 診斷／行動 Boss → Ch6 備份與歷史 → Ch7 證據收束。後半情節、八空格、結局正文仍為 D10 的 blocking 未知。

## 4. 關鍵體驗規則

### UX-004 開場 mail 與 ls 的雙指示

現況 E12：INIT 說「你有一封信。指令是 mail。」；Q0-1 同時要求列家目錄。**提案：維持兩者合法，呈現一主一次，不造新的必過關。**

1. 未讀交班信時，主引導顯示「先讀交班信：`mail`」；Q0-1 留在任務區，標「也可以先看看家目錄：`ls`」。兩指示不輪播、不爭同一主按鈕。
2. 先 `mail`：記錄既有讀信事實，主引導轉 Q0-1。先 `ls`：正常計 Q0-1 達成，保留非阻塞「交班信尚未讀」入口，不退回第一題。
3. 可用已支援的等價讀信路徑；不要求點特定按鈕。對已讀旗標與 legacy 缺漏使用明確未知／可重讀，不偽造已讀。
4. Bash 只印一次整合引導；`game task` 可重查。快捷按鈕顯示「填入 mail／填入 ls」，填入後才送出。
5. 台詞變更是內容修訂提案（UI-COPY-001/002）；本輪未改原劇本。須作者確認與雙序列回歸。

### UX-005 提示與學習證據

- 主線操作說明、`man`、三階提示、重試、補救均免費；零鑰匙幣也可完成。完整手冊可直接查所有已開放命令與限制，提示不代替手冊。
- L1 指向證據，L2 說明概念／語法，L3 完整做法與原因；L3 由玩家主動展開（manual reveal），不由停留／讀長文自動解鎖展示。讀過仍可收合與重看。
- `skip`／代辦是「故事可繼續、練習待回顧」，保留原題與回顧入口；其後重看答案不當作 AC 或親自驗證。重新獨立完成可新增新證據，不能洗掉原 assistance 記錄。
- 主線工單顯示「故事工單已處理」和處理來源；`shell-local`、`assisted`、`program-local`、`program-online` 分開。Python runtime 未驗收時按鈕明示未開放，不以範例比對佯裝執行。

### UX-006 信任、分享與退出

- S09 預覽保存粒度：RA1/schema 1＝事件；本機 envelope＝需重播 journal；schema 2＝工程契約明列的 runtime/VFS／版本。不能宣稱 legacy 可復原從未記錄的檔案。
- 「完整」是資料一致性；「已重放」要有指定版本與驗證範圍，均非真人證明。不得顯示泛稱「已驗證玩家」。
- S08 分享先選「知識／便條交換」或「本人備份」或「試玩診斷」；顯示實際要包含的暱稱、便條、命令、輸入文字與劇透範圍。預設無上傳，取消無輸出副作用。
- 已有存檔匯入預設平行紀錄；知識合併與存檔同步不是同一個按鈕。好友證據不直接變成我的親自驗證／主線抉擇。
- 新版 durable（D17）先候選世界→IDB 原子提交→發布可見結果；quota 失敗舊 root／可見世界不變，可下載候選、重試或取消。只有玩家明選「僅此分頁繼續」才進 memory adapter／volatile，持續說明未保存至本機。現行 demo 的 best-effort 保存另標現況，不作新版預設。

### UX-008 延期、回訪與主線補查（D19/D20）

- B0/B1 邀請直接提供「現在調查」「稍後調查」，無須先進分支再 abandon。延期由核心記 `flag.b0.deferred`／`flag.b1.deferred`；`branchHandled(Bx)` 只投影 `done OR deferred`，供邀請 gate 使用，不是新的持久 type，也不代表任務已解或親自模擬。
- UI 稱「已選稍後調查／可免費回訪」，不稱「完成 B0/B1」。延期不發 K0/K1、不補造讀取／實驗證據；回訪入口留在 S03/S04/S06。回訪後依實際操作產證據，不因曾延期重領或失去取得合格證據的機會。
- 進分支後，merge／abandon 成功才記原 `done` 出口；merge 缺必要證據仍留原分支，abandon 不發卡。顯示「已返回主線」並另列帶回什麼，不用 `done` 自動推論取得卡或親自模擬；原 deferred 留作歷史。新版 `tag` 只收藏目前分支，保持分支中；退出是另一個明示操作。legacy 原規則保留並標版本差異。
- Ch3.5「前往補查」是**目前主線旅行**，保留其他章進度／當前世界；首次揭露不重演，獎勵不重發。B3b 是另開隔離實驗；線索可按 gate 帶回，F5 需回到目前主線合法取件或明示協助取得，不能把分支物品搬回，也不把協助稱為親自取得。
- 「還原保存點」另在 S06/S09 預覽舊狀態、還原範圍及保留目前紀錄方式，不能用它實作日常補訪。結算前保存點是復原保障；F5 正文取法、K4 完整條件及結局條件仍待作者，不由 UI 填造。免費回訪不收主線資源；若旅行有故事時間成本，依 pack 明示，與收費不同。

## 5. 共用問題與跨域決策台帳

頻率全為 **n/N 未知（未試玩）**；嚴重度 4＝阻斷／資料損失，3＝重大困難，2＝可恢復困難，1＝輕微，0＝非問題。嚴重度是風險估計，排程優先另由里程碑決定。S/M/L 成本見 §7。

| ID／位置 | 證據、發現與原則 | 嚴重度／信心 | 建議、責任／成本 | blocking 邊界與解除條件 |
| --- | --- | --- | --- | --- |
| UX-O01 開場 | E12 雙指示；狀態可見／一致性 | 2／高（程式）、體驗未知 | UX-004；作者＋UX＋FE／S | blocking 開場文案定稿；雙序列真人觀察後確認 |
| INT-O01 時鐘 | E06 與 D07/D17 的實作差距；ENGINE 已定 storyTimeMs 與 actionCostsMs | 3／高 | 依准入→固定成本→時鐘／排程→重查→行動實作；內容調校成本／Boss 節拍；引擎＋內容／L | 單位／順序已解，不阻塞契約；具體數值待實測，時間功能發布前驗零成本閱讀與取消回滾 |
| UX-O02 工單 | D05 結果分欄已定；TICKET §2.1 的 T0100 登記敘事矛盾、program comparator／runtime 仍待確認 | 3／高 | 作者定稱謂／新 pack gate 引用；判題完成 profile 與 runtime spike；作者＋判題／L | 只阻擋相應敘事定稿／程式執行開放；B1 branchHandled 已由 D19 裁決，shell／assisted 依契約先行 |
| INT-O02 資料交易 | ENGINE §3/§6.3、SAVE §6、D17 已定 durable／volatile、CAS／冪等／取消 | 4／高 | INT-004 驗候選、提交點、quota、取消競態與舊 root 保全；工程＋QA／L | 契約已解；實作與故障注入待驗，未通過不作可靠保存聲明。M6/M7 帳號／簽章／部署僅限制相應版本 |
| A11Y-O01 焦點 | E08 Bash input `outline:none`，prompt 色相同；E04 compact 跨點收合 | 3／中（風險） | 兩主題焦點替代、resize 復位；FE＋a11y QA／M | blocking 鍵盤發布驗收；待真瀏覽器重現，不宣告現行違規已證實 |
| A11Y-O02 長 log | E09 每字更新、整塊新增與舊 DOM 裁切；4.1.3 | 3／中 | 增量摘要＋可讀歷史，不全文重播；FE＋讀屏測試者／L | blocking 長 log／讀屏可用聲明 |
| UX-O03 後半故事 | D10/D14 八空格、隱藏結局正文缺 | 4／高 | 作者提供版本、觸發／排除條件；作者＋內容 QA／L | blocking 對應內容發布與完整結局驗收 |
| RES-O01 真實體驗 | E10/E11 自動走法非真人資料 | 3／高 | 執行 RES-001 起形成性研究；主持＋研究／M–L | blocking M0 擴製關卡與 M2 體驗判定 |
| UI-O01 裝置 | E10 真手機／Safari／讀屏未實測 | 3／高 | 裝置與輸入法矩陣；FE＋QA／M | blocking 手機 Ch0 支援聲明；完整手機主線列未驗 |
| UX-O04 協作文字 | D16 `wall` 與開放聊天衝突 | 2／高 | 先預定義交班訊息，保留相容性紀錄；作者＋工程／M | blocking 相關線上文案；nonblocking 離線主線 |
| UI-O02 資產／裝飾 | SVG 地圖正式資產尚無新版 | 1／低 | 文字島嶼表先行，裝飾圖另補；UX／S | nonblocking；不影響導航或資訊 |
| UX-O05 延期／補訪 | D19/D20 已定；舊 done／tag／回訪稱謂可能誤導 | 3／高（規則）、體驗未知 | UX-008、INT-008、ST28–29；作者＋引擎＋FE／M | 延期與旅行政策已解；稱謂／免費回訪／不發卡待驗；F5取法與K4條件併 UX-O03 對應內容阻塞 |

本組沒有另改 D01–D20。對原稿「schema 2 只加欄位」「付費 man」「無障礙可砍」「1.0 完整紅藍隊」「既已真人驗證節奏」的落差，均依 D09／D06／D12／D02／D04處理；保存順序、延期與補訪採 D17/D19/D20，不默默帶回舊假設。

## 6. 需求與驗收對照

| ID | 驗收（待執行） | 依賴／責任 |
| --- | --- | --- |
| UX-001 | 新手、回流、熟手各能說明目標、下一步與保存位置；失敗有恢復出口 | RES-003；UX／主持 |
| UX-002 | 群島↔Bash 切換不改遊戲進度／cwd／草稿；主題與字級獨立；無助力成績懲罰 | INT-001、UI-001；FE／引擎 |
| UX-003 | 每章有診斷→行動→回顧及可保存停點；閱讀／離線前後故事時間無差異 | ENGINE、CHAPTER；內容／QA |
| UX-004 | `mail→ls`、`ls→mail`、已讀匯入三路無重複獎勵、無矛盾主指示 | COMMAND、E12；作者／QA |
| UX-005 | 零幣可看 man 和 L1–L3、可 skip；長文停留不揭 L3；skip 回顧仍非 AC | TICKET、INT-005；判題／內容 |
| UX-006 | 壞匯入／durable quota 不改舊世界；只有明選才切 volatile；分享預覽與實際欄位一致，好友知識不偽裝親自完成 | D17、SAVE、MERGE、RES-004；工程／QA |
| UX-007 | 終章前目前main補訪；完整pin與世界在當前adapter提交才開選擇，明選volatile也可完成並持續標僅此分頁；ended後依SAVE §7.2另開main且保全原結局；未知正文不勾通過 | D14/D20/D23、ENGINE §4.3、SAVE、作者正文；作者／QA |
| UX-008 | 未進 B0/B1 即可延期，延期本身無 K0/K1／親自模擬；之後免費回訪可依實際操作產證據；tag不退出；merge/abandon出口與證據分欄；B3b線索回主線後才合法取F5／明示協助，無複製分支物品或重獎 | D19/D20、INT-008、ST28–29；引擎／作者／RES |

## 7. 交付依賴、成本與維護

- 閱讀順序：[INTERACTION_SPEC](INTERACTION_SPEC.md) → [UI_HANDOFF](UI_HANDOFF.md) → [ACCESSIBILITY](ACCESSIBILITY.md)；真人決策用 [PLAYTEST_PLAN](PLAYTEST_PLAN.md)。規則改動回寫 DECISIONS，文字／元件改動只更新其權威檔並列受影響 ID。
- 成本量級是**未校準估計**：S＝1 角色約 0.5–1 人日；M＝2 角色合計 2–5 人日；L＝跨引擎／內容／QA 5–15+ 人日。不是排程承諾，不能把各表重複依賴直接相加。M0/M1 實際工作量後修訂。
- 體驗切片：開場與基本操作（UX＋作者＋FE，M）→ 保存／時間／協作信任（工程＋UX＋QA，L）→ 中後段與結局（作者＋判題＋UX，L）→ 真機與真人驗證（QA＋主持，另見研究成本）。
- 就緒：來源盤點與文字規格可評審；真正待決為 §5 的作者正文／稱謂、內容數值調校與相應版本服務細節。已定時間、durable提交及延期／補訪政策不列全域阻塞。未開始：實作 QA、真人、輔助科技；此狀態不得改寫成發布核准。
- 已採用 design skill 的 runtime/corrections/connectors、Anthropic handoff、Cuellar design-ops／handoff-process／handoff-checklist、state／microinteraction 模板、design-qa／documentation-standards，以及 research／accessibility 分支必讀來源。僅移用與本案相符的欄位；沒有沿用「5 人發現 85%」、44px＝AA 或自動工具可認證等示例假設。

### 本輪同步紀錄

| 日期／基線 | 修改與理由 | 影響 ID／適用版本 |
| --- | --- | --- |
| 2026-11-02，ENGINE／SAVE／CHAPTER 工作稿、D17 | 校正 durable先持久化後發布、明選volatile、quota救援；採inputId／storageRevision／expectedStateHash、storyTimeMs及版本化成本；舊save固定packRefs | INT-002/004/005、UI-003/004/006、A11Y-005/008/012、RES-004；新版1.0，legacy另列 |
| 2026-11-02，D19/D20 | 補延期→免費回訪、tag不退出；主線補訪與保存點還原分開，F5不得由分支物品複製 | UX-007/008、INT-008、ST28–29、UI-003/006、A11Y-012、RES-004/005；新版1.0，正文仍待核定 |
