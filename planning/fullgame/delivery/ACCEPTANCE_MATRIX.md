# 需求—風險—驗收矩陣

版本 0.2｜狀態：測試設計，表內遊戲案例本輪均未執行。

目的：讓下一位實作／審查者能指出「哪個承諾由什麼證據支持」。本矩陣用跨域 ACC 編號串接領域規格；領域文件內 ENG/SAVE/PACK/JUDGE/UX/NAR 等細項仍由各自文件維護。

依據：[決策](../DECISIONS.md)、[狀態](../STATUS.md)、[工作包](WORK_PACKAGES.md)、[真人計畫](../ux/PLAYTEST_PLAN.md)。

## 1. 證據分層與目標

| 層 | 要證明的事 | 工具／方法 | 不可推稱 |
| --- | --- | --- | --- |
| 文件 | 引用存在、範圍一致、JSON示例可解析、未知有標記 | 本地檔案檢查＋獨立語意審查 | 遊戲已實作、劇情已獲作者批准 |
| 純規則／性質 | 狀態轉移、權限、判題、知識集合性質 | 固定向量／生成式性質／獨立參考 | UI可用、真人理解 |
| 整合 | 存檔／VFS／章節／判題接點正確 | Round-trip、故障注入、版本矩陣 | 全平台與長期營運穩定 |
| 端到端 | 核心玩家路徑可完成並恢復 | 真瀏覽器，少量高風險完整路徑 | 人類閱讀時間、學習成果 |
| 人工／輔助科技 | 讀屏、鍵盤、手機輸入與放大可操作 | 指定裝置、瀏覽器、讀屏器版本 | 未測組合的完整符合性 |
| 真人形成性 | 動機、理解、卡點與回訪行為 | 主持觀察、遷移題、簡短訪談 | 小樣本統計代表性、全年留存 |

覆蓋目標按風險設定：所有持久狀態轉移至少有成功、拒絕及中斷／失敗案例；每條結局有滿足條件與各重要缺條件反例；每個聲稱支援的命令選項有對照及明確不支援案例。不以全站行數覆蓋率取代這些契約。

## 2. 跨域驗收案例

| ID | 玩家承諾／來源 | 測試類型與正向案例 | 必要反例／失敗情境 | 通過證據／關卡 |
| --- | --- | --- | --- | --- |
| ACC-01 | 長篇可續玩；PLAYER_EXPERIENCE | E2E＋真人：章中保存、隔日重開，摘要指向同一問題與分支 | 閱讀歷史、輸入草稿、已有不同分支；摘要不洩未見線索 | 實際狀態、畫面、觀察；M2/M5 |
| ACC-02 | 新版可攜保存；SAVE_SCHEMA_2 | 整合：修改檔案／cwd／hardlink、開分支、匯出至另一環境還原 | 檔名有空白／Unicode、別名共享inode、分支同名不同內容 | 狀態摘要與可觀察讀取一致；M1 |
| ACC-03 | 舊 RA1 誠實遷移；SAVE_SCHEMA_2 | 對照：既有接受向量保留原碼／ID，僅帶白名單進度 | 沒有journal、未知任意檔案、host共享紀錄、只有舊完成旗標 | 不補造檔案／AC；來源與缺失可見；M1 |
| ACC-04 | 匯入失敗不傷現有進度；INTERACTION_SPEC | E2E：預覽候選，確認成功後才換活躍紀錄 | 壞CRC、格式錯、錯版本、取消、儲存配額不足、同時另一頁更新 | 原紀錄byte/state不變，錯誤焦點與備份出口；M1/M5 |
| ACC-05 | 快照與歷史的承諾；SAVE_SCHEMA_2、REPLAY | 整合：genesis重算；未簽合法baseline的完整tail可驗但genesisAvailable=false；授權起點另驗 | 改快照／版本、缺tail、把未簽baseline當season起點、重開main假稱原連續歷史 | 精確coverage／來源；SAVE §7.2新槽保全原ended；M1/M6 |
| ACC-06 | 章節包完整與離線；CHAPTER_PACK | 整合：下載完整manifest及依賴後啟用，斷網可玩 | 少一檔／hash錯／中途取消／更新中斷／空間不足 | 舊版本仍可用；新包不半啟用；M1/M5 |
| ACC-07 | 獨立章節活動誠實入場；CHAPTER_PACK | E2E＋主持：starter含前情與必要能力複習 | starter不能授予親自通關徽章／競賽收據，未知前章正文不亂補 | 入場可理解、來源標記可追蹤；各章 |
| ACC-08 | 主線時鐘不懲罰閱讀；ENGINE_CONTRACT、D17 | 規則＋E2E：讀信、查提示、開設定、失焦與離線不偷推鐘；有成本動作准入後先排程、重查再行動 | 排程使原目標失效；成本不能因重查失敗回滾成免費探測；活動與賽季鐘不被故事pause凍結 | 三時鐘及執行次序逐欄證據；M1/M3 |
| ACC-09 | 故事工單與程式 AC 分開；TICKET_JUDGE | 整合：shell-local、assisted及可用program profile分別解決故事需求 | 只讀範例、舊未知flag、runtime未開、偽造結果、錯誤profile | 來源、角色評語、能力／AC與gate相符；M2 |
| ACC-10 | 判題可診斷且可取消；TICKET_JUDGE | 規則＋整合：多種正確解可通過；file.edit經同一交易保存；counting provenance跨指令與重開仍可查 | 超時／超資源／取消競態；編輯hash衝突；讀來源再echo固定答案；缺provenance blob／偽造stdout | 無半套結果、不重領、錯誤可修；M2/M7 |
| ACC-11 | 知識聯集收斂；MERGE_SPEC | 性質：A⊔B、B⊔A；(A⊔B)⊔C；A⊔A知識投影一致 | 證據ID同但內容衝突、包版本不相容、重複獎勵 | 比較知識投影，不要求歷史head相同；M3 |
| ACC-12 | 協作／同步不冒名；MERGE_SPEC | 整合：peer資料預覽、同人共同祖先快進、真正分歧保留雙方 | 同暱稱不同run、peer投票被當本人記憶、超前卡片、斷線重試 | 不覆寫、不越章、不把peer當親自操作；M3/M6 |
| ACC-13 | 歷史調查語意；MINIGIT_SPEC | 對照：固定repo的log/blame/bisect與真正工具支援子集一致 | 最後改行者不等於肇因者、未提供predicate、unsupported DAG/選項 | 查詢結果與錯誤一致；S-05/M4 |
| ACC-14 | 重放不是只驗hash；REPLAY_SPEC | 整合：固定規則重算每步狀態、關鍵效果及OutputRecord輸出 | 自洽偽造結果鏈、越權動作、seed/版本錯配、只改presentation、缺輸出閉包 | 不合法歷程被拒，合法歷程只得相符來源標記；M6 |
| ACC-15 | 競賽授權與單次結算；REPLAY_SPEC、D18 | API／帳本：一grant一份受理proof；同turn／起始版本的有效工作聚合後一次CAS、逐單收據 | 過期或跨主體nonce、WA後重用grant、系統重試重複結算、把同批第二人誤拒為stale、批次取消／期限邊界 | 排除無效項後重算；收據、帳本及區塊原子一致；M6/M7 |
| ACC-16 | 賽季可診斷；SEASON_SIM_SPEC | 性質＋模擬＋真人：固定seed重現指標，健康參數不誤報 | 10倍稅率／無衰退配合已定失衡門檻、新人晚入、考試週、大小隊 | 每次診斷有具體指標；真人資料另列；M7 |
| ACC-17 | 兩操作模式同一世界；UI_HANDOFF | E2E：群島↔Bash保留進度、cwd、草稿與歷史 | IME Enter、暱稱/口令/投票、貼多行停在互動題、Ctrl+C選字複製 | 行為一致，顯示偏好不改遊戲證據；M1/M5 |
| ACC-18 | 無障礙與閱讀；ACCESSIBILITY | 人工＋自動：鍵盤完成核心流程、長log增量宣讀、縮放與手機Ch0 | 焦點丟失、逐字朗讀轟炸、顏色唯一資訊、鍵盤被Tab困住、軟鍵盤遮輸入 | 指定平台/AT實測與未驗範圍；M1起/M5 |
| ACC-19 | 正史與新提案分開；SOURCE_MAP | 文件＋作者：每個核心事實有來源，提案有標籤 | 猜k值、把八片當八空格、編造GC台詞或隱藏結局、生成稿當獨立證據 | 來源矩陣及作者提供正文；各章/M4 |
| ACC-20 | 伏筆與五結局；REVEALS_AND_ENDINGS | 模型＋E2E：各結局最小合法路徑及完整回收 | 缺必要K0/K1、只有peer資料而未作必要主線行動／最終選擇、缺其他條件、隱藏條件未知、早期UI洩數量 | 五條確切條件與正反證據；不因peer來源擅加未知的親解門檻；未知不打勾；M4 |
| ACC-21 | mtime謎題公平；COMMAND_COMPATIBILITY | 真工具＋內容：各碎片inode/mtime可解釋、排序後取得有來源答案 | 建新hardlink、修改內容、F2修復、匯入、同時戳、缺碎片 | 不把mtime當藏片建立時間；必要復原可用；M4 |
| ACC-22 | 分支／Boss能復原；BOSS_AND_BRANCHES、D19–20 | 規則＋E2E：B0/B1 直接延期仍可離章且無卡、之後補訪；觀察→有成本動作前排程→行動→回饋；Ch3.5 本時線旅行並主線取 F5 | branch內F5直接帶主線、日常回訪還原舊世界、任意kill、延期卻記親自操作、tag意外退出 | 世界隔離、延期／退出／證據分開、原因可讀；M2/M4 |
| ACC-23 | 支援矩陣不過度宣稱；ROADMAP | 交付審查：每個對外支援平台有具體版本與成功紀錄 | Chrome通過推成Safari通過、自動窄窗推成實機手機、舊測試當本輪 | 發布文字與實際證據對齊；M5 |
| ACC-24 | 故障時保存與交接；WORK_PACKAGES | 整合＋人工：容量／中斷／壞版本時有可理解出口 | 靜默丟進度、成功字樣先於寫入、救援檔覆蓋原檔、活動starter混正式紀錄 | 可回復流程與證據；M1/M5 |
| ACC-25 | C1紅藍案例完整；EXPANSION_MODES | 內容＋功能＋真人審閱：證據→修補→驗證→報告 | 僅簽守則就過案、紅藍重複同關、未知案號當正史、審閱欄空白 | 每案自身驗收與真人審閱；C1 |

### 2.1 跨域反例的固定驗收補充（全未執行）

下列不新增ACC編號；納入既有案例的必測步驟。技術終章使用明標非正史fixture，不以缺正文掩蓋工程出口。

| 審查反例／ACC | 操作與必要斷言 |
| --- | --- |
| V-INT-02；ACC-09/11/22 | sandbox先解T→abandon→main首解T：分支progress有效但無故事幣／reward effect／ledger寫入，main領一次；先main領→較早分支→merge及compact後重試仍不重領；reopen-main繼承已領鍵，餘額不從原ended多帶回。 |
| V-INT-03；ACC-01/06/07 | genesis鎖Ch0/Ch1 manifests但只裝Ch0 bytes；Ch1完整水合後同lineage續章，安裝自身stateHash／seq／ledger不變。取消／壞hash／quota／過期expectedStateHash留Ch0；不把缺Ch1的舊目錄升版當正常續章。 |
| V-INT-04；ACC-02/05/24 | 9 MiB canonical state准入拒絕；最大可准入state＋現有pins可建立下一必要終章snapshot；單blob8 MiB邊界、總32 MiB、檔64 MiB與checkpoint／JSON計數預留同驗。journal segment在完整record邊界分段，單record超8 MiB提前拒絕；quota失敗另測，不能混同格式上限。 |
| V-INT-04末步補例；ACC-02/05/24 | bytes富餘但prepare後缺最後一筆record名額、JSON values名額或depth界時，在playing S准入即拒；已知／未知policy同G≤65536及逐維界，恰界可過、超界拒。核snapshot base64／封裝／重複保存實際容量，已知選項取逐維最大；final不得偷偷compact／增blob或內容副作用。 |
| INTREV-09；ACC-05/12/20/24 | ended→reopen-main/1新saveId／lineage、seq0／空tail／genesisAvailable=false，完整P世界可玩、E已領ledger繼承、來源不冒新親驗。原ended逐byte保全，兩槽可匯出；缺pin、源revision改動、target已占／CAS／取消失敗不切active；memory與durable皆驗。 |
| V-INT-09-R1；ACC-05/10/12/20/24 | P舊lineage seq120 counting→新lineage seq1同bytes file.edit：新writer必literal，不能被舊高seq覆蓋；未覆寫仍保留counting。含hardlink別名、清快取／compact／reload／再次reopen；E晚於P的trace即使在blobs也不進writer視圖。 |
| INTREV-10；ACC-14 | fixture含兩command、stdout／stderr及對話：改stream bytes、rc或任一陣列內序必拒；只換跨stream／presentation合流展示次序可同digest，報告不得稱已比總序。 |
| INTREV-14；ACC-05/14/15 | 未簽合法compact baseline＋完整tail得到partial-compatible及精確起訖、genesisAvailable=false、來源未證；同資料season-challenge須CHECKPOINT_UNTRUSTED。只自洽hash但壞invariant／閉包仍拒。 |
| V-INT-16；ACC-15/16 | start=1800000000000、now=1800000060000：兩服務epoch seasonTimeMs=1800000060000、elapsed=60000、turnId=1；恰等expiresAt／resultDeadline拒。UTC午夜／02:00／季內週界及毫秒wire不截斷。 |
| V-INT-19；ACC-20/24 | 持續IDB SecurityError、memory/hash/export可用；durable失敗保留原狀，明選volatile後完整memory pin→review→ended→另開main成功。全程標僅此分頁，匯出／還原包含必要pin；下載不自動升durable。 |
| V-INT-20；ACC-02/05/14/17 | `/work/source.txt`為`hit`＋LF；grep -q absent得到rc1後，直接與compact／新宿主reload再echo $?寫status.txt均為`1`＋LF且state/effects/output一致；同腳本、pipeline末站、短路／空白、typed／query保留、parse rc2、cancel／提交失敗與branch隔離皆驗。 |

WP1-A/B/C責任／依賴表是INTREV-15的文件解除證據；實作向量與原始expected hashes由各包產出，不能拿本表文字冒充已執行。

## 3. 相容性矩陣最低組合

| 維度 | 必測代表 | 預期界線 |
| --- | --- | --- |
| 舊可攜檔 | 完整、可疑、損毀、host、未結束、分支中 | 不放寬既有硬拒；可恢復範圍依legacy契約 |
| 新可攜檔 | 同版、已支援舊版、未知新schema、未知pack | 同版round-trip；已知遷移明示；未知保留原檔拒執行 |
| 分支來源 | 自行操作、引導／略過、peer、starter | 語意分開，不冒稱同等經歷 |
| 更新 | 舊遊戲新內容、新引擎舊存檔、下載失敗 | 不混用不相容版本，不半更新 |
| 執行平台 | 開發Node、目標桌機瀏覽器、file://活動包、HTTPS站點 | 體驗與生成結果可核對；不預設所有Web API相同 |
| 手機／AT | 真實軟鍵盤、至少指定NVDA或VoiceOver組合 | 每項記版本和測試人，未測保持未知 |
| 系統狀態 | storage停用/配額滿、clipboard拒絕、worker取消、重複分頁 | 誠實回饋與保存出口；best-effort不能寫成全域原子 |

## 4. Oracle 與突變設計

- **語法／工具語意**：固定 GNU 工具版本、locale、時區與可信測試環境。遊戲擴充不呼叫真系統去猜答案。
- **跨語言**：Python與JS用同資料的相同錯誤不算獨立證明；加入手推小例與原工具對照。
- **存檔**：比較重建可觀察狀態；禁止只把writer產物送回同一writer後判相同。
- **判題**：使用已知錯解（例如IP字串排序與數值分段排序差別）、不同正解和偽造證據。
- **結局**：每個重要必要條件缺一應拒絕；「全部卡都有」不是預設充分條件。
- **經濟**：先定失衡指標與門檻，再選壞參數；健康控制組不可全被判失衡。
- **UX**：觀察玩家如何找下一步，不只查DOM上是否有一個按鈕。

突變報告列被殺、存活、不適用與oracle待修，不要求不具語意的100%數字。必要不變量的代表突變未被抓到，對應工作包不可驗收。

## 5. 真人與自動測試的判定

形成性五／八人目標源於原企劃，並非統計保證。新手／熟手、完整／跳過／助教介入要有分母。學習遷移與情節理解獨立於完成時間，詳細任務與建議門檻由 PLAYTEST_PLAN 負責。

測試失敗不能靠刪案例、鬆斷言、修改舊答案或換成虛擬時間掩蓋。若oracle本身有錯，保留原失敗與修正理由，再讓獨立審查者核對。

## 6. 記錄與停止條件

每次驗收記錄：規格／程式／內容版本、環境、案例ID、預期、實際、結果、證據路徑、限制與處理人角色。

本輪文件交付只需完成來源封存比對、連結／格式檢查及跨代理語意審查；不為文件修改重跑整套遊戲測試。後續只重跑受影響案例與依賴回歸，修正或新發現才擴大範圍。
