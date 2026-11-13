# 九分支與 Ch5 診斷型 Boss 契約

版本：0.1｜2026-11-02｜狀態：**設計提案；現有資料、採用基線與待正文分列**。

玩家目標：在安全分支比較因果，用觀察、處置、驗證完成「回收波」，帶走能說明來源的知識。主線不以打字速度、亂殺行程或不可逆丟檔作通關條件。

## 1. 來源、依賴與所有者

依 [DECISIONS](../DECISIONS.md) D01、D06–D10、D14、D17、D19–D20。來源為 [原規劃 §4](../source/《根目錄群島》完整版規劃書.original.md)、[SCRIPT](../../../SCRIPT.md)、[B0](../../../branches/B0.yaml)、[B1](../../../branches/B1.yaml)、[K0](../../../cards/K0.yaml)、[K1](../../../cards/K1.yaml)、[world](../../../world/world.yaml)、[cast](../../../world/cast.yaml)、[charter](../../../world/charter.yaml)、[fragments](../../../world/fragments.yaml)。

**現況**：只有 B0/B1、K0/K1 來源檔；demo 可執行流程主要為 B0。現有 [Engine](../../../demo-app/src/engine/index.js) `branch_enter/exit` 複製／恢復 VFS，但 [VFS.clone](../../../demo-app/src/vfs.js) 共用 flags；一般 command 先推進世界 30 秒；[Shell](../../../demo-app/src/shell/commands.js) 尚無 `ps/top/kill/cp/trap`。現有 `end` 會停止試玩並只接受 save/help，並非回章能力。不得把需求清單當作已支援證明。

依賴：[ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md) 是 input、時鐘與交易次序權威；[SAVE_SCHEMA_2](../engineering/SAVE_SCHEMA_2.md) 是保存與 hash 權威；另依章節包、flag scope、知識交換／揭露 gate、無障礙輸入及 [MiniGit](../engineering/MINIGIT_SPEC.md) 命名空間隔離。本文的領域名稱是 logical model，下面明列落點，不另造 input、clock 或 evidence wire。

| 所有者角色 | 責任 |
| --- | --- |
| 敘事作者 | B2–B7/B3b、K2–K8 正文、F7 交付情境、結局必要／排除條件 |
| 關卡設計／內容工程 | 三階段 fixture、telegraph、等價解、回復與引導資料 |
| 引擎維護者 | scoped state、ProcessSim、事件排序、checkpoint／return、命令有限語意 |
| 存檔／協作 owner | 証據 provenance、原子 knowledge merge、resume 與去重 |
| UX／無障礙／QA | 診斷狀態、鍵盤與朗讀順序、錯誤復原、真人理解驗證 |

## 2. 九分支登記簿

「九分支」是 **B0、B1、B2、B3、B3b、B4、B5、B6、B7**；不是漏掉 B3b 的八條。未確認名稱、起點與充分條件用空缺，不編造正史。

| 分支 → 卡 | 章／目前已知 | 進入與取得條件狀態 | 提案驗證重點／正文阻塞 |
| --- | --- | --- | --- |
| B0 → K0 | Ch0；parallel；`alt/sandbox`；世界可以被安全地弄壞 | 來源起點 `ckpt/ch0-lamp`；讀到 `/lost+found/#0` 才可 merge K0；abandon 可結束體驗但不給卡 | 保留 main；記錄親自讀取與分支；K0 為 fork 已知必要條件，不推成充分條件 |
| B1 → K1 | Ch1；whatif；`whatif/block-gc`；GC 會對抗拒升級 | `ckpt/ch1-night`；看到 escalation 才可 merge；封其他 IP 不算 | exact 與 collateral 是同一機制的不同證據；GC/convoy CIDR 語意保留 |
| B2 → K2 | Ch2；「改寫」第三條；K2〈憲章為防囤積而生〉 | 憲章 legacy 記有 v2.5→v3.4 OOM 模擬；起點與完整 predicates 待正文 | 可先規劃權限改動前後比較 fixture，不能補出角色對話／歷史結果細節 |
| B3 → K3 | Ch3 郵局島 | 原規劃僅有配對；名稱、類型、起點、卡文待正文 | 搜尋／郵件證據練習可做非正史原型 |
| B3b → K4 | Ch3.5 排程礦坑支線 | 原規劃稱 merge/fork 需要此支線；完整卡條件待正文 | 明示虛擬時間推進、跨日／閏日；最終選擇前可回訪，不鎖死漏走玩家 |
| B4 → K5 | Ch4 網路群礁 | 原規劃配對；完整規則待正文 | 單人 NPC 補位，管線小關卡在 core；不要求完整 2.x relay 或真人 PvP |
| B5 → K6 | Ch5 記憶體沼澤 | 原規劃配對；B5 與三階段 Boss 的精確連動待正文 | 本文 ProcessSim 為玩法提案，不把 Boss 勝利直接當 K6/F7 充分條件 |
| B6 → K7 | Ch6 備份冰原 | 原規劃配對；內容待正文 | mini repo 內容證據與世界分支分離；不得用作者查找冒充 bisect |
| B7 → K8 | Ch7 根目錄 | 原規劃配對；名稱、卡文與隱藏結局條件待正文 | 分支嘗試不是主線 final choice；七片／八片僅已知必要門檻 |

每包新增時必填 `sourceVersion, branchType, entryCheckpoint, entryGuard, simulationRules, evidencePredicates, mergeAllowlist, exits, replayFixture, spoilerGate, recoveryCheckpoint`。未知 gate 不能先設 `true` 發布。

**D19已採用的B0/B1可選出口**：玩家在main直接選「稍後調查」，只寫main的`flag.b0.deferred`／`flag.b1.deferred`（登記為branch-progress），不需先開分支再abandon。`branchHandled(Bx)=flag.bx.done OR flag.bx.deferred`僅為章節gate投影，不新增第三份持久布林。deferred不發K0/K1、不寫親自模擬／分支觀察；進分支後成功merge或abandon才記原done出口。deferred可保留歷史，視圖在done後顯示實際已返回狀態；卡仍獨立看合格證據。已延期者保留免費再調查入口。這是版本化新規則，不能改稱舊YAML／legacy原本就如此。

## 3. onlyknowledge／no worldcarry

### 狀態分層（logical labels，不新增根欄位）

| Scope | 例子 | 回 main 規則 |
| --- | --- | --- |
| `world.branch` | VFS nodes/inodes、cwd、行程、排程、權限、防火牆、Boss phase、分支資源／局部旗標 | 全部留在分支快照；merge/abandon 均恢復 entry 時 main 快照 |
| `evidence.branch` | 誰在何分支用何版規則觀察何結果 | 僅通過 allowlist／版本／揭露 gate 的 evidence 可合併 |
| `progress.meta` | 分支已開、嘗試次數、已離開、tag、補救紀錄 | 可記進度但不宣稱親自驗證、世界被修好或得到碎片 |
| `knowledge.self` | 自己完成來源觀察／驗證的知識 | 留來源 actor、branch、outcome、驗證層級；不變成主線歷史事實 |
| `knowledge.peer` | 別人匯入的卡與其證據 | 可閱讀／提供調查方向；不提升為自己的操作能力或主線決策 |
| `decision.main` | 最終選擇、主線親自決策 | 只能由 main 的明確動作產生；不能被 branch/peer merge 覆寫 |

**遷移要求**：現有全域 flags 不直接擴大使用。為每個 flag 宣告 scope；legacy B0 的已知 durable effects 經明列投影保留。不得為避免漏旗標而把整個 branch.flags 聯集進 main。

D21：分支工單可產progress／證據，但不結故事獎、不發幣／reward.granted、不占root main獎勵鍵。scenario資源只由模板給定、留在分支；merge／abandon不帶餘額，root rewardLedger不還原成fork時舊值。先在sandbox解T後abandon，main首次解T仍領一次；main先領再回較早點不重發，重開main依SAVE §7.2。

共用證據 wire 沿 Engine §8：`evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash`，`sourceRef={lineageId,branchId,seq}`，evidenceId 沿 SAVE 的 `H("evidence",record 去掉 evidenceId)`，不自訂 ID／hash。分支候選放 `branches[id].pendingKnowledgeEvidence`，合格後才到 `knowledgeEvidence`。`evidenceType` 使用既有 `self-verified/peer-shared/simulated/legacy-projected`，不另增 observed／npc／assisted enum。

logical 映射：`factId/outcomeId/visibilityGate` 由固定內容集的 `ruleId` 對應資料解析；sourceBranch 用 sourceRef.branchId；角色來源以 sourceRef.lineageId 對應來源 profile，self/peer 是接收者視圖；NPC 代辦用既有 progress.resolutionMode=`assisted` 與已核定教學規則，不能冒用 self-verified。重放可信層級來自 SAVE assessment／receipt，不寫另一個 trusted 欄位。`progress.meta` 使用所屬分支的 `branch-progress` 登記與保存的分支歷史導出，`decision.main` 位於 main 的 `branch-world`，不能偷設全域 flags。

- 玩家視角文案：「你在分支看到……」「朋友的紀錄顯示……」「你已親自重做……」「主線仍維持……」分開。`credibility:1.0` 不能被 UI 解讀成真實身分證明。
- B1 exact/collateral 合併為同卡、不同 evidence facts；不因順序抹掉誤傷紀錄。重複匯入冪等；證據集合須交換律／結合律，不要求操作鏈尾相同。
- 卡可 unlock 觀察入口，不等於章節必經 gate 或充分結局條件。若後期 peer 卡超前，先封存來源索引並提供「尚未到可讀章節」；不在摘要、檔名或錯誤訊息洩漏內容。
- K1 對 Boss 的已知 `reveal_weakness` 可用額外解釋／可追查線索表現；沒 K1 的玩家仍有免費 man、現場證據、提示／代辦出口。不得把未取得 K1 寫成無法完成主線。

### 分支生命週期

| 狀態 | Trigger／guard | 原子效果與出口 |
| --- | --- | --- |
| main | B0/B1明示選「稍後調查」；對應offer可用 | 只寫main的flag.b0/b1.deferred，branchHandled成立；不建分支、不寫done、不發卡／親做證據；可免費再調查 |
| main | enter：已解鎖 checkpoint、版本可用、無交易進行、容量足夠 | 保存 main snapshot，建立獨立 branch runtime；顯示「模擬」＋名稱；先預留 return／save 容量 |
| active | 讀取／局部動作 | 所有 worldDelta 在 branch；只讀不推進時間；顯式 action 可推 branch clock |
| active | knowledge merge：有合格 evidence | 一次交易：去重合併證據、記exit與對應done、恢復main；B0/B1的done是准許出口進度，不攜回任意branch.flags；不能只合半張卡就切主線 |
| active | merge 缺證據 | 保持 branch，說明缺少哪一類觀察、提供免費線索／abandon，不提前寫 done／card |
| active | abandon | 記「曾嘗試／已返回」與對應done，恢復main；沒有卡／親見的推定。可再次進入／繼續調查 |
| active | tag | D19採用：收藏目前分支／保存標記，**保持當前分支，不寫done、不退出**；另行merge/abandon，不因收藏取得K或故事結局 |
| archived | reopen；版本可讀且資料尚在 | 載入副本；原封存不改動；缺包／失效報明原因並可回 main |
| pending | Ctrl+C／資料失敗／存檔容量錯誤 | 回 last-confirmed；不可停在 main VFS＋branch flags 的混合狀態 |

現有來源B0/B1把tag列exits，demo tag僅輸出標記；新版已由D19裁定「收藏不退出」，此語意不再待裁決，工程未驗。來源reflog TTL=3天不自動授權刪除：保存／pin／裁切依SAVE_SCHEMA_2，需明示保留範圍與時鐘政策；不得實際離線三天後刪唯一補救路徑。收藏功能不保證未實作的任意reflog還原能力。

## 4. 回訪、復原與能力證據不能混用

| 操作 | 保證／能力範圍 | 不代表 |
| --- | --- | --- |
| chapter return／Ch3.5普通回訪（D20採用，待實作） | 在**目前main時線旅行**，保留其他章進度與當前世界；B3b另外開隔離實驗。帶回的線索可指引目前main合法取件／明示協助，F5正文取法仍未知 | 不是restore舊snapshot／套模板、不重演首次揭露／重發獎、不用end返回；不能把B3b的F5或其他worldDelta複製回main |
| checkpoint restore | 恢復明確 snapshot＋版本，該次試誤留在診斷紀錄；可重做 | 不是任意時光旅行語法，也不證明學會題目 |
| `cp`（待實作） | 複製檔案 bytes 到新 inode；目的存在的覆寫規則要另驗 | 不等於硬連結、不共享後續寫入、不等於整世界 checkpoint |
| `ln`（已有有界 VFS 支援） | 同一 VFS 的兩 pathname 共用 inode；unlink 一名仍有其他引用 | 不是真實所有 GC 的通用避死術；Boss 的 root model 須明示為模擬 |
| `trap`（待需求確認） | 若採用，僅有界模擬腳本處理已支援訊號的 handler；需規定觸發、重入、取消與錯誤 | 不等於自動備份；不能捕捉 SIGKILL；現況無此能力，不能放入必經解 |
| `skip`／引導代辦 | 免費完成必要故事工序，寫 `assisted` 並保留再練入口 | 不是 task mastery、不是自己驗證、不是 program AC；不能代選 ending |
| `end` | 明確本段／本輪結束事件與結算；現況 demo ended 為鎖定終態 | 不是回章、回主線、暫停、恢復或取得卡；新主線須獨立設計 post-ending review |

主線七片可開門且只可選rebase/revert、八片為merge/fork必要條件來自fragments；其餘gate待正文。D20的Ch3.5補訪為main旅行，B3b隔離，F5只在main合法取件／明示協助取得。結算前pinned保存點是復原保障，不是日常回訪手段，也不因試探選項消失。F5正文、K4完整條件、隱藏結局正文未取得仍阻擋相應內容發布。

## 5. Ch5 三階段 Boss：可操作的非正史提案

**已知**：原規劃指定「回收波」三階段，Ch5 教 `ps/top/kill/ln`；K1 有 reveal_weakness；F7 登記藏法為「GC 本人保管」。**未知**：對話、GC 如何交付 F7、K6 內容、真相揭露與精確章節 gate。以下只有可換皮的測試關卡，不增加這些正史。

### 5.1 共用 model

保存落點為 `branches[id].runtime.bossStates[bossId]={schemaVersion:1,data}`；子 schema 必須先註冊，未知版拒執行。data 的提案欄位為 `{phase,mode,turn,processes,serviceChecks,evidenceIds,checkpointId}`，每項封閉型別／界線由此註冊版定義。`turn` 僅非負整數的有成本已提交動作序號，**不是時間**；唯一故事鐘是 `branches[id].storyTimeMs`。`pendingForecast`、總 memory 與 VFS 引用視圖由目前 state／固定內容純導出，不存另一份可矛盾的權威值；evidenceIds 只引用共用 evidence。

- `phase=observe|stabilize|verify|resolved|recoverable_failure`；`mode=diagnose|action_pending|paused` 為正交子狀態。`resolved` 只表示此 fixture 的技術任務完成。
- `ProcessSim` 登記 `{pid, incarnation, owner, essential, rssUnits, growthPerScheduledEvent, lifecycle, signalHandlers, openBuffers}`；增長由共用 runtime.scheduler 的 dueStoryTimeMs 事件驅動，不能靠 turn 暗藏第二個鐘。記憶體是整數模擬單位，不能用 UI 毫秒當資源。openBuffers 是有界模擬內容／blob 引用，不是跨交易保存真 VFS 的已 unlink 開啟 handle。
- 引用視圖從 portable VFS 的 `deviceId/inodeId/entries` 與 pack 宣告的 simulated roots 導出；同島／同 device 才能 hardlink。路徑硬連結數和程序 buffer 引用不同；不聲稱真實檔案系統 nlink 就等同所有 tracing GC root。
- 首個 fixture 容量、增長率、需驗證步數均為平衡參數。提案兩個明示驗證步看趨勢，至少一個正常服務 check；數值由內容包提供，不能寫成已測通關時間。

### 5.2 節拍與時間

1. 預設 **診斷模式**：`ps`、有界快照 `top`、讀 log/man、看引用、提示、設定全部 cost=0。`top` 是明示「單次模擬快照」，不假裝宿主 live process monitor。
2. 玩家選一次變更（如 `kill -TERM PID`、`ln`）或明示 `time.advance`；以共用 `inputId/expectedStateHash/branchId` dispatch。**依 Engine §5／§6.2：先解析／准入並固定 pack actionCostsMs → 候選狀態先推 storyTimeMs 並 drain 到期 scheduler → 重查當下 guard → 執行命令 → 規則／判題 → 原子提交**，之後回 diagnose。成功提交有成本輸入時 turn 加1，沒有 action-first 特例。
3. 文法錯誤、unsupported 或准入即能判斷的無權限不花時間；**已准入後因 scheduler 改變世界而失敗的正常 rc≠0，時間仍已經過**，結果清楚標示；cancel／核心錯誤／保存 commit 失敗才整筆撤銷。合法但選錯可造成可復原失敗，沒有「5 秒內打完否則掉血」。
4. pause 不停真人牆鐘，只停止此 Boss 接受推進；失焦／離線也不產生新步。讀到很久、輔助科技慢讀不會影響勝負。resume 回前一步診斷態，不補發欠下的回收波。
5. forecast 在動作前列**「本次有成本動作執行前會發生……」＋到期時間／原因／受影響對象**，另列命令成功後的預計效果，兩段不混稱。未知原因可顯示「尚未診斷」與可查資料；不能預告無根據百分比。若回收就在本次成本區間內，這次才送 TERM／建立 ln 已來不及阻止它，必須在較早邊界處置或恢復 checkpoint；關卡需提供足夠先行診斷／行動窗口。

### 5.3 三階段操作表

| 階段 | 觸發／guard、玩家目標 | 可操作行為與 evidence | 成功轉移／telegraph／失敗復原 |
| --- | --- | --- | --- |
| I：觀察增長 | 進入 fixture、checkpoint 已可恢復；辨認增長來源和必要服務 | `ps` 讀 owner／pid incarnation；`top` 比對兩個預置採樣；grep log 查重試／配置原因。允許不同讀取順序；提交「哪個程序／哪個證據」 | guard：引用至少一個程序觀察和一個原因紀錄，因果一致→II。錯判顯示矛盾的 service／memory 數據，仍留 I。預告為「下一步哪個程序還會增長」，非「趕快殺最大者」 |
| II：穩定服務 | I 證據成立；降低增長且保留必要服務 | 在回收邊界之前對自己擁有、非 essential 的 fixture worker 送 `TERM`；檢查 handler 完成與 buffer flush。若有等價「停止重試／修設定」動作，需先在本包登記同等 invariants，不能假稱現有 Shell 已有它 | guard：目標增長降至設定界線、必要服務 alive、buffer 已處置→III。TERM 接受後若需延後 flush，排入未來 dueStoryTimeMs，由後續輸入的命令前 scheduler 執行；KILL 沒有 handler。殺錯合法程序→recoverable_failure；GC／PID1／他人程序拒絕 |
| III：驗證引用與回收 | II 成立；保留必要資料、確認回收後服務正常 | `ls -li`＋read 觀察引用；在回收邊界前把關卡資料 `ln` 到同 device 的模擬 root 目錄；若新增 `cp` 路徑，要求 bytes 等價＋獨立 inode＋驗證新副本。明示推進回收／檢查，讀前後報告 | guard：資料 readable、必要服務 pass、記憶體於宣告事件內不再越界→resolved。telegraph 列本次命令執行前會回收的候選及引用理由；到期前未建立引用不能靠同次 ln 倒救。必要資料損失可恢復 phase checkpoint；不摧毀 main 或唯一 F7 |

**禁止以剩餘記憶體最低值單獨評勝**。全 kill 即使數字變小，服務／資料 invariants 不成立也不過。保留 PID 1 與 GC 的拒絕規則，理由是 owner／憲章與模擬界線，不是「Boss 無敵」。不可拿 PID 數字相同就殺到重建後另一個 incarnation。

### 5.4 結束與復原

resolved 寫 `technicalResolution` 與可重放 evidence，進入作者核定的後續節點；沒有正文時原型停在「技術驗證完成」，不生成 F7、K6、GC 台詞或真相。

recoverable_failure 提供三條免費路徑：查看原因／在 sandbox 繼續診斷、恢復本階段 checkpoint、由引導代辦此階段並標 assisted。代辦仍展示因果摘要，不替玩家宣稱已掌握；之後可重練為 self evidence。任何路徑不得關掉結算前主線回訪。

## 6. 關鍵互動四段契約與邊界

| 互動 | Trigger／rules | Feedback | Loops／modes／退出 |
| --- | --- | --- | --- |
| 推進節拍 | 明示按鈕／同義命令；loaded、diagnose、共用 expectedStateHash 相符 | 現況與成本；「本次有成本動作執行前會發生……」先列；結果分列時間事件與命令效果 | 提交後回 diagnose；同完整 inputId 重送依 Engine journal 回原結果，不重跑；未知結果先查記錄 |
| 送訊號 | 明確 signal＋pid/incarnation；permission、supported signal、phase guard | target 身分／處置結果／未處理原因；TERM pending 與 stopped 不混稱成功 | 可取消尚未接受 action；接受後用復原 checkpoint，不宣稱 Ctrl+C 能撤掉已提交事件 |
| 暫停／恢復 | 任意非原子提交中可暫停；提交中先完成或回滾 | 「已暫停；讀取免費；尚未執行下一步」 | 恢復到診斷態；無自動計時／過場連續跑 |
| 回主線 | merge／abandon、有效 entry snapshot | 將帶回的證據清單與「世界復原」結果 | 失敗留原狀；返還焦點到命令列；從已退出狀態重試不重發卡 |

完整狀態補充：

- **empty／locked**：無可讀 evidence 顯示原因與入口；未解鎖只說所需章節，不泄露未知卡文。
- **loading／offline missing**：載入版本中禁止寫動作，閱讀既有資料可用；包缺失可取消／返回，不能生成假程序。
- **unauthorized／invalid**：錯 owner、未知 signal、非整數 PID、過長字串、過期 incarnation 在准入時可知則拒絕且零時間。若是命令前 scheduler 使目標死亡／變更，正常失敗仍提交經過的時間與事件，不執行錯誤目標；不可一律聲稱零 worldDelta。
- **concurrency／stale**：同 session 入口序列化；使用共用 inputId、expectedStateHash 與 SAVE storageRevision CAS，舊 Worker 結果不能套用新 phase；多分頁衝突停止自動覆寫，不另造 expectedStateVersion。
- **timeout／cancel**：計算資源 timeout 是技術錯誤，不是玩家敗北；回復 transaction、保留可匯出 last-confirmed。重啟載入成功才說「已保存」。

互動使用既有群島／Bash 兩模式與同引擎；可見原生按鈕等價命令，Enter/Space 操作、Tab 邏輯順序、Escape 關閉非必要面板並回原焦點。常規輸出只禮貌朗讀摘要，不每行搶焦點；錯誤訊息留存可再讀，狀態不只用顏色。音效／震動無必需；動態為非阻塞、減少動態時立即更新，無倒數動畫。觸控目標以 44 CSS px 為設計建議，WCAG 2.2 AA 檢查仍依 24 CSS px／間距規則；本輪未驗證實機無障礙。

## 7. 驗收與證據（未執行）

| ID／owner | 正例 | 反例／突變必須結果 |
| --- | --- | --- |
| BRANCH-01／內容 QA | 登記九個唯一 B→K 配對，含 B3b→K4、B4→K5 | 漏 B3b／卡號偏移／重複 ID → 建置失敗 |
| BRANCH-02／引擎 | 分支刪檔、改權限、signal、時間推進後 abandon/merge，main VFS/runtime hash 保持入口世界值 | 任一 world flag、金錢、行程、碎片攜回 → 失敗；僅允許明列 meta/evidence 差異 |
| BRANCH-03／QA | B0 真讀 lost0 才 self K0；B1 escalation 才 self K1 | 單執行命令字串／封錯 IP／abandon → 不發卡；仍可主線補救 |
| BRANCH-04／協作 | exact/collateral 任意合併順序保留兩個 facts，重送不加卡／獎勵 | 覆蓋誤傷紀錄、peer 變成 self、鏈尾不同即判錯 → 失敗 |
| BRANCH-05／敘事 QA | peer 證據顯示「朋友紀錄」，到章才可讀 | 提前摘要暴露 F7／結局；把模擬說成主線過去被改寫 → 失敗 |
| BRANCH-06／存檔 | merge 中斷／容量不足保持完整 branch 或完整 main | 只轉場未存卡／只存卡未恢復世界 → 交易驗收失敗 |
| BRANCH-07／引擎 | chapter return、checkpoint、cp、ln、trap、skip、end 分別有能力宣告 | 不支援 cp/trap 卻給必經任務、用 end 當返回、skip 算 mastery → 失敗 |
| BRANCH-08／QA | 結算前以目前main旅行補訪Ch3.5；其他章世界／進度保留，B3b隔離；F5在main合法取件／明示協助，重訪不重揭露／發獎 | 日常回訪改載舊世界／入口模板、分支F5攜回、漏走支線須重跑全遊戲、選項試看就ending → 失敗 |
| BRANCH-09／QA | tag收藏後仍在原branch且done不變；SAVE pin／裁切與reflog保留範圍可查 | tag突然退出／發卡／寫done、三天沒開遊戲就丟唯一補救 → 失敗；D19已解語意、工程未驗 |
| BRANCH-10／存檔 | legacy flags 依明列映射升級，未知來源保持未知 | 把所有歷史 flags 全域合併、補造已驗證身分 → 失敗 |
| BRANCH-11／引擎／敘事QA | main直接延期B0/B1，只寫各自deferred；branchHandled=done OR deferred可前進；再調查仍免費；merge/abandon才done | 延期自動開分支／寫done／發K0/K1／稱親做、用branchHandled當卡取得或mastery → 失敗 |
| BOSS-01／內容 QA | I→II→III→resolved 每步有 trigger、guard、因果觀察 | 未診斷就全 kill，或僅 memory 降低就勝利 → 不成立 |
| BOSS-02／引擎 | man/read/top、暫停、失焦、離線 24h 後相同 phase/tick/world | wall clock 或輸入字數導致掉資源 → 失敗 |
| BOSS-03／內容 QA | 每次執行前可讀本次成本區間的命令前到期事件、對象／原因，命令效果另列 | 把命令後效果誤稱已先阻止同時點回收、無預兆回收必要檔 → 失敗 |
| BOSS-04／引擎 | TERM 按已登記 handler 流程 flush，KILL 不執行 handler | trap 捕獲 SIGKILL、亂殺 essential／GC／他人成功 → 失敗 |
| BOSS-05／QA | 只殺可處置 worker 且服務 pass；兩個等價診斷順序均可過 | 硬編碼一條命令走法、pid reuse 錯殺 → 失敗 |
| BOSS-06／VFS owner | ln 同 inode、cp 新 inode；刪一 link 仍可讀，最後引用回收依 model | cp 當引用計數、ln 當 copy、混同 buffer root → 失敗 |
| BOSS-07／存檔 | 各階段失敗可重試／恢復／代辦；匯出中途後重放相同 | 復原消耗必需貨幣、代辦發 program AC、丟 main 唯一資料 → 失敗 |
| BOSS-08／引擎 | 同完整 inputId 重送、舊 Worker 回應、並行 click 依 Engine/SAVE 只接受一次 transition | 另造第二套 hash／預期版本／冪等鍵、雙 turn／雙獎勵 → 失敗 |
| BOSS-09／敘事 owner | resolved 只進作者核定節點；F7/K6 的完整 gate 另驗 | 自編 GC 對話或把技術成功自動發 F7 → 不得發布 |
| BOSS-10／UX／真人測試 | 新手能描述一次「觀察→原因→處置→驗證」，鍵盤及慢讀能完成 | 只會背 kill 或把 GC 當惡意敵人 → 修正關卡；模擬 walkthrough 不代真人證據 |
| BOSS-11／引擎 QA | fixture 時間0、動作成本1000ms、回收due=2000ms：先執行ln在1000ms完成，下一次推進2000ms時資料保留；從1000ms才ln則先回收，重查guard後失敗且時間為2000ms | action-first使到期當步ln／TERM倒救，或正常rc失敗倒退時間 → 失敗；取消同次輸入須連時間／scheduler全部回滾 |
| BOSS-12／存檔 QA | runtime.bossStates已註冊schemaVersion/data可跨宿主roundtrip，storyTimeMs唯一、turn只計序號 | 另存virtualTime、未註冊子schema被忽略、序號驅動隱藏時鐘 → 失敗 |

## 8. 跨文件裁決／風險登記

| ID | 證據／風險 | 嚴重度／信心 | 建議、owner、解除條件 |
| --- | --- | --- | --- |
| BR-O01 | 現有全域 flags 與 D08 的 no worldcarry 有落差 | 高／已讀程式確認 | 引擎與 schema owner 定 scope/legacy 投影，BRANCH-02/10 通過 |
| BR-O02 | tag收藏不退出已由D19裁決；保存／TTL／重開能力依SAVE政策 | 語意規劃已解；實作未驗 | 引擎／SAVE owner實作並過BRANCH-09；原YAML／legacy保留，不把來源TTL當自動刪除權限 |
| BR-O03 | readonly 命令現況也 advanceWorld(30) | 高／已讀程式確認 | 共用時間契約將查詢 cost=0；與 Boss tick 統一單位，BOSS-02 通過 |
| BR-O04 | Ch5/F7/K6 及後半完整 gate 未取得 | 阻塞敘事發布／高 | 作者提供版本化正文；原型仍可進行，禁止推論補寫 |
| BR-O05 | cp/trap/chapter return/end 各非現有統一能力 | 高／已讀 Shell/Engine 確認 | 引擎 backlog 各列能力與測試，先做核心 checkpoint/return；trap 非必經，不以提示假裝已支援 |
| BR-O06 | 結局需要哪些 self／peer 知識還沒有完整規則 | 高／待正文 | 與敘事／協作 owner 統一必要條件和 provenance；不能由此文件定所有充分條件 |
| BR-O07 | D20裁定Ch3.5本時線旅行＋B3b隔離＋main取件；F5正文／K4 gate未取得 | 回訪語意規劃已解；內容／工程未驗 | 引擎／敘事owner通過BRANCH-08並取得正文；不再將旅行／restore／模板入口混稱回訪 |
| BR-O08 | D19裁定B0/B1延期、done與卡分離 | 規劃已解；敘事稱謂／工程未驗 | 引擎／敘事owner通過BRANCH-11，反方重核「你親做／你聽說／稍後調查」文案 |

本輪只有文件與來源檢查，驗收表沒有通過紀錄。三階段數值、真人完成率與學習成效均待試玩。
