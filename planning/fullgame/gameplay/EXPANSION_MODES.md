# C1 內容包與後續模式契約

版本：0.1｜2026-11-02｜狀態：**規劃提案；十四個候選練習不是七案七夜正史**。

## 1. 發布位置與可用證據

依 [DECISIONS](../DECISIONS.md) D01–D06、D08、D10、D13、D16：**C1 在 M5 主線發布之後**，包括白帽紅隊七案、守護夜班七夜、完整多人離線合併衝突關卡。C1 不是 M5 或 M6 的核心 gate；具備各自依賴後可與 M6 分開發布。

| 層／版本 | 本輪基線 | 不能誤算的範圍 |
| --- | --- | --- |
| 1.0／M0–M5 | 離線主線、有限便條／足跡／知識交換、NPC 補位；Ch4 NPC 管線小關卡 | 不包含完整十四包與完整多人衝突關卡；主線不依賴白帽外部審閱 |
| C1／M5 後 | 紅七包＋藍七包、成對事件視角、離線完整衝突教學 | 原七案／七夜正文未取得；本表不代替作者案件編號／台詞／人物 |
| M6／1.1 | 帳號、同步、重放基礎；C1 可先離線 | 不把競技排行、報告互評或真人共同值班說成已完成 |
| M7／1.2 | 賽季、OJ 橋接，依 [SEASON_SIM_SPEC](SEASON_SIM_SPEC.md) | 不以 C1 全十四包作 M7 唯一解鎖前提 |
| 2.x | 獨立完整管線接力、MUD／偵探／機房經營／課堂模式候選 | 沒有正文／需求的模式只留範圍，不能借「已有管線」宣稱可做完整 relay |

來源：[原規劃 §2、§6、§7](../source/《根目錄群島》完整版規劃書.original.md)、[SCRIPT Ch0/Ch1 的多人描述](../../../SCRIPT.md)、[ENGINE_REQS](../../../ENGINE_REQS.md)、[SOURCE_GUIDE](../../../SOURCE_GUIDE.md)、[world](../../../world/world.yaml)、[cast](../../../world/cast.yaml)、[charter](../../../world/charter.yaml)、[fragments](../../../world/fragments.yaml)、[B0/B1](../../../branches/B1.yaml)、[K1](../../../cards/K1.yaml)。

**現況**：repo 沒有可製作的七案七夜完整 YAML；只有 K1 `effects.where=blue.night2` 註記與 B1 collateral 概念。此已知指向保留，**不把下方某個 proposal 偷換成正式第二夜**。完整故事聖經連結正文未取得。真實案件、未知角色、GC 後期對話皆不補造。

| 所有者角色 | 交付責任 |
| --- | --- |
| 產品／規格整合者 | C1 scope、分包發布與 core 不依賴的證明 |
| 敘事作者 | 七案七夜正文、正式 ID、鏡像映射、彩蛋揭露 gate |
| 學習／關卡設計 | 十四份可玩的目標、fixture、誤解、替代解與報告回饋 |
| 引擎／協作 owner | 有界模擬、證據／修補／重試、離線匯入與衝突狀態 |
| QA／內容工程 | 語意 oracle、突變、golden／assisted／亂試 walkthrough |
| 真人外部審閱者 | 依原約定審閱白帽包；與作者不同、有相關背景；留下版本化紀錄 |

## 2. 同事件的紅藍鏡像

一個 `incidentFixture` 有一份客觀 ground truth、原始狀態、時間序列與可驗證 invariants；紅／藍各持**不同可見資料**與角色目標。鏡像不是把紅方結算畫面改顏色，也不是藍方只看紅方答案。

流程：

`選角色／範圍確認 → 蒐集可追查證據 → 提案並套用修補 → 同一 fixture 重跑正常與異常檢查 → 寫結案報告 → 對照另一視角（解鎖後）`。

- 紅方要證明「此配置／邏輯如何導致觀察到的問題」，以模擬器提供的狀態操作重現，不需真攻擊程式；最終仍須提出修補並驗證正常用途。
- 藍方從告警／交班片段縮小原因，修補後驗證效果與副作用，報告誤判、殘餘不確定性與回復條件。
- 範圍確認是可操作合約：列可讀資產、可變更資產、可用動作、目標與復原點；玩家確認該版 scope 後才能寫入。規則版本未變不反覆要求長篇宣誓。越界動作在模擬中拒絕、列理由與有範圍的替代檢查；記本包事件，不改主線信用或扣主線資源。
- 同一 incident 的角色 snapshot、seed、contentVersion 相同；兩方報告可互相引用，但 evidence visibility 依角色／劇透 gate。沒有另一位真人也能由玩家換角色或 NPC 補位完成。
- 關卡回饋以「被改變的結果／服務是否恢復／反例還在不在」為主；短報告用結構化欄位並可寫補充，不靠背誦安全口號得分。

## 3. 每個紅／藍章節包的製作模板

每一案／夜都要各有一份模板實例；共用 incident 不免除角色自己的 acceptance。欄位為**章節包compiled content的擴充提案**，不是在[CHAPTER_PACK](../engineering/CHAPTER_PACK.md)封閉manifest任意加欄；role/mirror/scope/report需先註冊content schema，sourceMap／releaseStatus／packRefs沿共用格式。prototype/author-approved/reviewed為製作流程標籤，發布仍用manifest的draft/rc/released。

| 欄位 | 必填內容與用途 |
| --- | --- |
| `packId / role / status` | proposal 用 `proposal.red.<slug>` 或 `proposal.blue.<slug>`；未核正文不取正式案號。role=red/blue、status=prototype/author-approved/reviewed/released 分開。 |
| `sourceMap / canonBlockers` | 每項已知設定來源、待正文項、作者核定版；禁止拿 placeholder 當台詞發行。 |
| `incidentId / mirrorPackId` | 同一事件 ground truth hash、兩邊 fixture 的共同部分與各自可見部分；正式對應待作者。 |
| `prerequisites / exits` | 概念先備、能力 profile、免費補課／skip／返回；不能要求主線結局或真人在線。 |
| `learningOutcome / misconception` | 一個可觀察學習行為、一個可用反例推翻的誤解；不只列指令名。 |
| `scopeContract` | 資產 allowlist、可讀／可改範圍、動作、版本、重設點；當前角色有何權限。 |
| `initialSnapshot / generator` | 決定性 seed、時間單位、雜訊生成規則、ground truth manifest、資源上限。 |
| `evidenceTasks` | 證據 paths／event IDs、因果鏈、至少兩條合法取得方式（確有語意等價才列）、來源／時間／版本。 |
| `repairActions / rollback` | 有界變更集合、前置 guard、可預覽差異、可復原 snapshot；紅／藍角色可能不同但最終 invariants 相同。 |
| `verificationSuite` | 原異常重現、修補後異常消失、正常用途仍成立、誤傷／遺漏反例；檢查狀態效果，不只命令字串。 |
| `reportTemplate / rubric` | scope、觀察、證據引用、原因假說、修補 delta、驗證結果、限制／回復。缺證據精確指出哪一格，而不是泛稱「請更專業」。 |
| `hints / assisted` | 免費三階提示，完整解法主動展開；代辦項、玩家自做項分欄，提供再練。 |
| `cooperation` | solo／NPC／peer 的分工、離線交換 artifacts、匯入預覽、衝突與缺人出口。 |
| `rewards / unlocks` | 本包完成徽記或已核定視角彩蛋；self／peer／assisted 分開。不發主線必要碎片、不改主線結局充分條件。 |
| `acceptance / mutations` | 本文 EXP-/包內本地測試 ID、golden/assisted/錯誤重試、破壞證據與過度修補突變。 |
| `reviewReceipt` | 真人審閱者角色、與作者不同的聲明、包 hash、日期、問題／處理結果；無紀錄不可標 reviewed。AI 審查另列。 |

報告判定只驗「可由 fixture 確認的欄位」。自由文字由玩家自己留存／自願分享；語句優美不是通關必需。推論不能冒充 ground truth；不確定項可誠實寫「未證實」並完成已要求的驗證。

## 4. 候選學習矩陣：紅七包（全部 proposal）

下表 slug 是**技術原型識別碼，沒有既有案號含義**。僅使用可造的小檔案／事件 fixture；正式順序、角色、地名、標題與既有七案對應均待正文。

| proposal slug／同事件 | 紅方目標與可玩任務 | 證據→修補→驗證→報告 | 需要的能力／典型錯解 |
| --- | --- | --- | --- |
| `scope-ledger`／inc-scope | 從資產清單與操作日誌判明哪些資料在本次授權範圍；找出一筆錯誤套用規則 | grep/cat 清單對照路徑→在 sandbox 修正單一 scope entry→重跑允許與拒絕案例→報告影響資產與界線 | 字面路徑與表格 check；不是任意掃描。錯解：把目錄前綴相似當同資產 |
| `permissions`／inc-perm | 用模擬角色查「誰能讀／寫」，證明過寬權限造成錯誤共享 | `id/ls -l`＋角色 read probe→最小權限修補→三個角色正常工作與越權均驗→附權限前後表 | 待 Ch2 權限模型。錯解：全部 chmod 000，使正當交班也失效 |
| `boundary-match`／inc-match | 對請求 fixture 比較精確匹配與過寬規則，顯示正常流量誤傷 | grep 錨定、CIDR 對照→縮小模擬規則→異常／正常／GC 類型分別驗→列 false positive 與漏判 | 復用 B1 CIDR 思路；不是正式第二夜。錯解：前綴或 /24 一律封 |
| `input-contract`／inc-input | 給有界表單資料（空字串、邊界值、重複值）觀察規格不一致 | 測試表與結果→修正宣告式 validator 條件→跑正負邊界表→報告可接受範圍與未涵蓋型別 | 新增純資料 evaluator；不執行 payload。錯解：拒絕所有非範例值 |
| `backup-freshness`／inc-backup | 比對 manifest、版本與內容，證明「存在備份」不等於可恢復 | tar 清單／diff／checksum→選完整且一致的 snapshot 並修備份設定→restore drill＋資料核對→列可恢復版本與缺口 | 依 Ch6 有界 archive。錯解：只看檔名日期或壓縮檔存在 |
| `schedule-overlap`／inc-schedule | 在整數虛擬鐘重現兩個工作覆蓋彼此輸出的情境 | 排程表＋同時點事件→調整互斥／順序設定→跨日、重送、同 tick 測試→交代順序與恢復 | 待 Ch3.5 scheduler profile。錯解：刪掉必要工作或換成本機時間 |
| `handoff-drift`／inc-handoff | 從兩份合法但不同版本的交班設定指出不相容假設 | diff＋引用原始 requirements→合成候選設定→服務及相容測試→帶版本的變更／回復報告 | 完整離線衝突模型。錯解：最新時間戳覆蓋全部，遺失一方必需設定 |

## 5. 候選學習矩陣：藍七包（全部 proposal）

| proposal slug／同事件 | 藍方初始線索與可玩任務 | 證據→修補→驗證→報告 | 鏡像差異／典型錯解 |
| --- | --- | --- | --- |
| `scope-ledger`／inc-scope | 值班佇列出現不屬此服務的請求；先用 scope 清單分流，找錯配原因 | 事件／資產交叉引用→修派送映射→本服務與外部範圍均按規則處理→交班列仍未接手項 | 紅方從清單主動查；藍方從錯誤佇列回推。錯解：把看不到的資產標已處理 |
| `permissions`／inc-perm | 正常值班角色失敗、另一角色卻可讀；重建 access matrix | `id`／權限／拒絕紀錄→精確修補→合法角色通、其他角色拒→報告回復條件 | 藍方須保留服務可用，不能單看阻擋數。錯解：對所有角色開滿權限 |
| `boundary-match`／inc-match | 告警混有固定探測和正常車隊；分類後測規則副作用 | 日誌證據＋來源類別→最小範圍規則→正常車隊與已知探測仍可辨識→報告誤判／未知 | 保留 K1 對正式 `blue.night2` 的既有註記，這個 proposal 對應仍待核。錯解：看到 GC 一律當入侵 |
| `input-contract`／inc-input | 合法工單因邊界值被拒，另有不合格式的值被放過 | 比對規格／拒絕理由→修 declarative rule→正負樣本＋未見過合法值→報告資料品質與可回復舊資料 | 藍方處理服務與資料一致性。錯解：只修單筆 fixture 字串而不修規則 |
| `backup-freshness`／inc-backup | 恢復後少一段資料；查哪個 snapshot 與 manifest 不一致 | 前後檔案／版本證據→選恢復點＋驗證備份策略→完整 restore drill→明列遺失窗口與復原版本 | 不以還原成功提示代替驗證。錯解：從更新但殘缺的副本覆蓋完好資料 |
| `schedule-overlap`／inc-schedule | 凌晨交班偶爾重複結算；用 tick／job ID 找重送或競爭 | 對照 scheduler log→設定有界互斥與 idempotency→同 tick／重跑／失敗重試測試→報告下一班觀察點 | 藍方查重複／失敗造成的結果，紅方先構造重現。錯解：只把排程延後幾秒 |
| `handoff-drift`／inc-handoff | 接收兩位離線同伴的修補，單獨皆通、一起服務壞 | 並列 base／local／peer delta→選擇或合成→完整合併後測試→交班列採納與未採納理由 | 測共同結果而非只看雙方 AC。錯解：知識集合聯集就當設定 merge 完成 |

每對共用 incident ground truth；不能讓同一 fixture 在紅方稱「已刪除」、藍方卻仍出現而無事件解釋。共用測試應指出**狀態差異**；角色的 evidence 發現路徑可以不同。候選順序按「scope→權限／匹配→資料契約→備份／排程→交班」為教學提案，未經真人驗證。

## 6. 互動狀態、失敗與回復

| 狀態 | Trigger／guard | 下一狀態與回饋 |
| --- | --- | --- |
| unloaded／locked | 開包；版本、必要能力可用 | loading；缺包可返回／保留主線，不送假的 remote request |
| scoped | 閱讀本次 scope、確認版本 | investigating；顯示可用資產和同義操作；scope 未確認只能讀 |
| investigating | 收集可引用 evidence | 可反覆查看、排序、註記；閱讀免費不推虛擬時間；空結果說明搜尋範圍 |
| repair-draft | 選有界修補與理由 | 顯示差異、受影響服務、回復點；取消返回 investigating |
| applying | 共用 expectedStateHash／角色權限吻合 | 依Engine先准入固定成本、推時間／scheduler、重查guard後套用，完成至verifying；正常rc失敗保留已經過的時間，核心錯誤／取消回last-confirmed |
| verifying | 執行原異常與正常案例 | 失敗列哪個 invariant＋證據，回 repair-draft；成功到 reporting |
| reporting | 必填欄位與 evidence refs 可解析 | completed 或指出缺項；自由文字不送外部判題；不是只點「已修好」 |
| completed | 換角色／再練／自願交換 | 自己與 peer 完成分開；彩蛋依作者 gate；返回主線無 worldDelta |

任何階段：unsupported 動作不當作成功、不扣主線資源；中斷／timeout 回原子邊界；離線重開依已保存的 snapshot／version 恢復，保存失敗須明示並可匯出。舊回應不可套到新 incident；同完整inputId依[ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md)冪等，跨頁用SAVE storageRevision CAS。evidence採共用EvidenceRecord／sourceRef與既定hash，本文的報告、scope、角色可見性為logical內容欄位；不可再造另一種知識證據wire。完整解法只在玩家主動展開時顯示，跳過以progress.resolutionMode=`assisted`記錄，不能留下永遠不通過的報告門檻。

輸入沿既有群島／Bash 模式，按鈕只是同一指令／動作的捷徑。原生按鈕、可讀標籤與鍵盤順序；scope、diff、驗證結果不靠 hover／拖拉。新增結果用短摘要通知，不移走輸入焦點；長報告可分段讀。音效／觸覺不必需；無必需動畫、減少動態直接更新。沿深色／高對比與系統字型，不新增未驗證 token／斷點。

## 7. 多人離線與完整衝突關卡

### core 的有界交換

1.0 可交換便條、最後有限足跡與知識證據，匯出先預覽暱稱／便條／命令分享範圍；知識去重與 provenance 依協作契約。沒有對方也可 NPC 補位。來源 .bash_history／便條承諾須由 schema 2 與匯出策略落實，RA1 缺少任意檔案不能補造。

### C1 完整衝突關卡（proposal）

交付一份 bounded 三方資料：`baseSnapshot + localDelta + peerDelta + requirements + tests`。建議第一關為 inc-handoff 的設定衝突，兩邊各修一個真問題、合併後產生可診斷矛盾；玩家必須找出兩個需求、保留原始版本、提出合成 delta、驗證再交班。

- `knowledge union` 的交換／結合／冪等不能套用到任意檔案 merge：世界改動仍不隨知識回 main。
- `unresolved → candidate → tested → accepted` 是本關狀態；沒有通過 tests 不寫「已解決」。可保留未採納版本與理由；字串標記清完不是通關判準。
- 匯入重複同 artifact 只處理一次；相同 base 的 delta 可交換比較；不同 base/version 應標明不相容，不用 last-write-wins 偷覆寫。
- 同題可有不同合法合成結果，只要滿足 invariants 與可重放。主線卡集合可一致而本關玩家決策不同，不要求兩位玩家事件鏈尾相同。
- 單人可用 NPC 預置對應版本；peer 缺席、惡意空檔、資料毀損均可拒絕並繼續本機 fixture。發行不必等待朋友寄回。

## 8. Ch4 core 管線與 2.x 完整 relay

| 項目 | Ch4 NPC 管線小關卡／core | 完整 relay／2.x proposal |
| --- | --- | --- |
| 玩家目標 | 用既有管線連接資料轉換，觀察上游／下游影響 | 多位參與者擁有各 stage，協調 schema、順序、延遲及失敗 |
| 狀態 | 一個確定性本機 fixture，NPC 提供有界輸入／輸出 | participant/stage ownership、交接、離線 artifact、可能線上同步 |
| 成功 | 單人可做完整 end-to-end 驗證 | stage 契約＋組合驗證＋缺人接管＋版本衝突均成立 |
| 依賴 | Ch4 指令與串流／取消語意 | 獨立需求研究、協作／同步、超時補位、完整持續執行資源預算 |
| 縮減出口 | NPC 文本／固定管線，不改主線學習目標 | 先做非競技離線 stage 交換；未驗不得掛「即時多人接力」 |

## 9. 白帽模式的原安全與審閱契約

沿原規劃 §6，**以下只限定白帽紅／藍模擬模式**：虛構資產、無真網路出口、純設定／邏輯 fixture、不執行玩家任意程式、不提供可直接使用的利用程式／payload／shellcode。判定看有界指令與狀態、scope、修補與報告。文件保留網段／本地虛構識別碼用途要明示。

`program-local`／`program-online` OJ 屬另一執行契約，不能借此段宣稱所有遊戲永不執行程式；也不能因 OJ 支援 Python 就讓白帽包得到任意程式／真網路能力。T0100／T0427 保留原題，執行可行性按 D05 獨立驗收。

每個白帽發布包須有原約定的內容檢查與**真人外部審閱**：與作者不同、具相關背景者閱讀實際包版本，記錄疑慮與處理。AI、lint、突變測試只能輔助，不能勾成真人。尚無審閱者或正文時，包留 prototype／未發行；主線 M5 與 M6 可依自身關卡繼續。

自動內容檢查範圍沿原規劃：真實資產／公開 IP（文件保留網段例外）／真實漏洞利用步驟及程式內容須抓出；僅模式內執行，不能掃到 OJ 原題就一律禁用。測試器不把字串掃描成功當作完整人類內容判斷。

## 10. 驗收（未執行）

| ID／owner | 正例 | 反例／突變的必要結果 |
| --- | --- | --- |
| EXP-01／整合者 | M5 core 能獨立建置與通關；C1 未裝／未審閱不阻擋 | 任一主線 gate 要 red/blue completion → 失敗 |
| EXP-02／作者 | 十四個 proposal 保留標記與待正式映射；每個正式 ID 有正文來源 | 未知案號、七夜順序／台詞自動補成正史 → 內容驗收失敗 |
| EXP-03／內容 QA | 七紅＋七藍各填完整模板、各有任務／修補／報告 | 只有題名或只列「遵守守則」→ 非可製作章節包 |
| EXP-04／QA | 同 incident seed/version 的 ground truth 一致，角色只差可見證據 | 紅藍內容互斥卻無事件原因 → 拒絕建置 |
| EXP-05／關卡 QA | 每個修補同時通過異常與正常案例 | 全拒絕／全開放／刪光工作恰好過「無告警」→ 測試失敗 |
| EXP-06／引擎 | scope 外動作拒絕；所有操作只觸模擬器 | 注入真網路、任意程式執行、錯誤 dispatcher → 模式 capability 測試失敗 |
| EXP-07／報告 owner | 證據可回查，修補 delta／驗證結果對得上 | 複製另一 seed 結果、編造已測、只有完成按鈕 → 不標已驗證 |
| EXP-08／QA | 合法不同查詢／修補順序皆按結果驗；回放可重現 | 唯一命令串／自由文字關鍵詞通關 → 失敗 |
| EXP-09／協作 | 離線三方衝突需合成＋驗證；重複匯入冪等 | last-write-wins、清空衝突標記即 pass、peer world 帶 main → 失敗 |
| EXP-10／UX | 沒朋友可用 NPC，免費提示／代辦／重試，分享前預覽 | 等回信才可通關、強制送全文到遠端、代辦當 self → 失敗 |
| EXP-11／QA | Ch4 本機管線可獨立驗證、2.x relay 另列依賴 | 因缺真人 relay 阻擋 Ch4、把單條 pipe 當完整多人 → 失敗 |
| EXP-12／發布 owner | 白帽包 hash 對應真人審閱紀錄與處理結果 | 以 AI 回覆／lint 代替真人勾選 → C1 包不得發布，不影響主線 |
| EXP-13／QA | 內容規則只在白帽包 capability profile 生效 | 原 OJ 程式題被白帽「不執行程式」全面覆蓋 → 規格衝突 |
| EXP-14／引擎 | 中斷、資料損毀、舊版本、同完整inputId重送沿共用Engine/SAVE復原且不重發獎勵 | 半套修補／輸入重放兩次／未保存卻聲稱已保存 → 失敗 |
| EXP-15／UX／真人測試 | 兩角色都能說明證據、修補與服務驗證；鍵盤可完成 loop | 只會背守則／看答案過關、角色理解全靠猜台詞 → 修關卡，不以自動代理完成率代替 |
| EXP-16／內容 QA | 既有 K1→blue.night2 註記保留且等作者核對 | 任選 proposal 稱「已還原原第二夜」或移除來源註記 → 失敗 |

## 11. 依賴、停止與縮減

| 條件 | 停止／縮減 | owner／解除條件 |
| --- | --- | --- |
| 正文／正式順序未知 | 可製作上述非正史技術原型；不可宣稱七案七夜已完稿 | 作者提供版本化正文，逐包對照 |
| 無真人外部審閱 | 白帽原型不公開發行；core 繼續 | 發布 owner 找到符合原約定的審閱者並留下紀錄 |
| 模擬能力成本過高 | 先做 scope/perms/match 中已具能力的一對鏡像切片；十四包總數作目標，分包交付，不偽稱完整 C1 | 整合者批准 partial C1 命名與完成清單 |
| 衝突狀態／匯入不穩 | C1 完整關卡延期；core 保留既定有界交換 | 協作 owner 通過 EXP-09/14 |
| 真人分工需求未驗 | 2.x relay 暫停，保留 Ch4 NPC 小關卡 | 獨立真人試玩與服務預算證據 |

**需主代理裁決**：EXP-O01 正式七案七夜正文與 proposal 映射；EXP-O02 原規劃「七縮三」不能引用未知案號選保留包，應以核定學習覆蓋選擇；EXP-O03 共用章節包的 role/mirror/scope/report 欄位；EXP-O04 便條／足跡分享格式與 schema 2／協作契約；EXP-O05 K1 的第二夜效果在非正式 candidate 中只保留參照、不自行定義懲罰數值。所有者皆為工作角色，不表示已有人員到位。
