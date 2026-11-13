# 敘事來源地圖與權威邊界

版本：0.2-draft｜2026-11-02｜狀態：文件規格；來源盤點完成，衝突待裁定，未實作。

## 目的與依賴

讓主筆、關卡作者、工程與驗收者能逐項回答「這是既有事實、推論，還是本輪新提案」。本文及 `narrative/` 是作者用文件，含劇透，不得整包放入玩家可讀手冊。

- 規劃權威：[DECISIONS](DECISIONS.md)，特別是 D05–D11、D14、D16、D19–D20。
- 歷史需求：[原始完整版規劃書](source/《根目錄群島》完整版規劃書.original.md)；實際封存位置是 `planning/fullgame/source/`，不是 repo 根目錄的 `source/`。
- 領域規格：[主題與角色](narrative/STORY_ARC.md)、[九章節拍](narrative/CHAPTER_BEATS.md)、[揭露與結局](narrative/REVEALS_AND_ENDINGS.md)、[口吻與文案](narrative/VOICE_AND_COPY.md)、[主筆對獨立反方的實際回應](narrative/AUTHOR_RESPONSE.md)。
- 跨領域依賴：[SAVE_SCHEMA_2 §5.2](engineering/SAVE_SCHEMA_2.md#52-投影映射使用原白名單不補造事實)：舊 checkpoint 名稱可提供正式模板再進場能力，不等於能還原舊世界 snapshot。

## 1. 權威不是單一排序

| 要判斷什麼 | 採用來源 | 衝突處理 |
| --- | --- | --- |
| 本輪範圍、付費／時間／協助路徑 | `DECISIONS.md` | 高於原始規劃的舊設計；修改須由整合者登記 |
| 既有角色、世界、Ch0–Ch1 文字 | `world/`、`chapters/`、`dialogue/`、`text/`、`branches/`、`cards/` | 檔案存在是來源證據，不代表所有規則已在產品實作；來源互撞時開缺口，不擅自選一個抹去另一個 |
| 展開後的閱讀順序 | `SCRIPT.md` | 生成閱讀本；回查 YAML/text，不把沒有展開的遺物當不存在 |
| 試玩內容與匯入原約定 | `demo/demo.yaml`、`demo/flow.yaml`、`demo/import_rules.yaml` | 僅描述試玩／舊版契約；新版依 D09 保留舊資料，不憑空補出經歷 |
| Ch2–Ch7 已有的零星設定 | 世界設定中的明文、原始規劃章節表 | 只認明文範圍；「預留 ID／路徑提示」不等於完整關卡或結局條件 |
| 完整故事聖經 | 原附件所連結的外部故事聖經 | 來源被指定為正史基準，但目前需登入、未取得正文及版本；不聲稱已讀、不重試繞過、不從連結標題推論內容 |
| 新增情緒節拍、同伴個性、回訪文案 | 本輪 `narrative/` 的「提案」段落 | 經作者核准前不得升格為正史或編成發布資料 |
| 實際已上線能力 | 對應程式與實測紀錄 | 劇本、介面文案、代理審查均不能代替執行證據 |

**狀態標記**：`S`＝可回查的來源陳述；`B`＝本輪採用的規劃基線；`I`＝有根據但未證實的解讀；`P`＝新提案；`U`＝未知／衝突。S 不等於「已實作」，B 不等於「正史」。一段同時有 S 與 P 時必須拆開標示。

## 2. 基線檔案索引

以下行號是本輪閱讀定位；後續來源變動時應以 ID／節點再定位。

| 來源 ID | 檔案與定位 | 能支持的主張／限制 |
| --- | --- | --- |
| SRC-01 | [原始規劃](source/《根目錄群島》完整版規劃書.original.md) §1、§4、§7，L90–115、L188–211 | 九章順序、B/K 對應、四結局＋隱藏的範圍；分鐘、人數與版本安排含舊目標，依 D01–D04 修訂 |
| SRC-02 | [SCRIPT.md](../../SCRIPT.md) Ch0、Ch1、附錄 A/B | 已展開的主要場景、關鍵台詞、憲章；不是後半正文 |
| SRC-03 | [cast](../../world/cast.yaml) L6–51、L60–70 | lin 的身分與揭露章、INIT 的祕密、GC 的 Ch1 出場限制、harbor-master 的傳聞、ada/bo 補位；後兩者沒有既定人格弧線 |
| SRC-04 | [charter](../../world/charter.yaml) L23–116、L121–167 | Rev 1–5、v2.4 原句、amend-7／amend-10、lin v4.7、CI 三項失敗與 merge 的制度意義 |
| SRC-05 | [fragments](../../world/fragments.yaml) L8–36 | F1/F2 值、F3–F8 預留島與路徑提示、七／八片必要門檻；`link_time` 說法依 D11 待校正 |
| SRC-06 | [voice_guide](../../world/voice_guide.md) L1–50 | 冷世界／憲章幽默、雙重讀法、前期禁洩資訊、世界曆；與個別台詞的細微衝突另列 |
| SRC-07 | [K0](../../cards/K0.yaml)、[K1](../../cards/K1.yaml) | `ending.fork` 明文要求這兩張卡；K0 的 Ch7 窺門、K1 的 Ch5 破綻效果已登記；實際觸發與其餘條件未齊 |
| SRC-08 | [B0](../../branches/B0.yaml) L42–69、[B1](../../branches/B1.yaml) L31–94 | merge 必須先有證據；abandon 可完成分支退出而不授卡；B1 三種結果不等於真實歷史 |
| SRC-09 | [ch0](../../chapters/ch0_lighthouse.yaml) L22–59、[ch1](../../chapters/ch1_logport.yaml) L19–78 | R0/R1、F1/F2、檢查點與舊離章條件；`T0427` 是舊必要項，不自動等於新版 Python 必修 |
| SRC-10 | [init](../../dialogue/init.yaml) L120–177、[lin](../../dialogue/lin.yaml)、[harbor](../../dialogue/harbor_master.yaml) | 節點 ID 與舊觸發；`init.t0100_ac`、`init.ch1_done` 需 D05 遷移規格 |
| SRC-11 | [R0 原文](../../text/ch0/first-night.txt)、[B0 證據原文](../../text/ch0/lost0.txt)、[R1 原文](../../text/ch1/lin-ticket.md) | 「確認」與引用保存主題；R1 含 lin 的 WA/TLE/AC 過往，不能改成玩家本次成績 |
| SRC-12 | [匯入規則](../../demo/import_rules.yaml) L19–64 | Q0 保留；Q1-1/Q1-3 需重做但 GC 名字記憶保留；B1 投票不帶成完成；R0/F1/K0 有明文 |
| SRC-13 | [demo](../../demo/demo.yaml) L73–94、L153–187、[flow](../../demo/flow.yaml) `quests.skip` | 試玩只有 B0/K0/F1；skip 套用故事狀態但寫 skip 而非 task；活動稱號／分數不是結局條件 |
| SRC-14 | [world](../../world/world.yaml) L7–38、L61–77 | 世界曆、鐘塔、GC 探測與閏日 cron；鑰匙幣／舊提示費與 D06 不同 |
| SRC-15 | [試玩 INIT](../../demo/dialogue/init_demo.yaml) `demo_vote`、`demo_end_card` | block/pass 只記預告；註解提 Ch5 遺物的「燈我幫你留著」，沒有完整正文、遺物 ID 或結局條件 |

`SCRIPT.md` 是上述資料的生成展開，不能與 YAML 算成兩份獨立佐證。`demo/import_rules.yaml` 的 `create_on_import` 在新版只映射「可由正式模板再進場」，來源標 `legacy-projection`；缺歷史時不能宣稱 `ckpt/ch1-night` 還原了玩家當夜的原 VFS。

## 3. 已知／推論／提案帳

| 議題 | S：來源已知 | I：可供解讀，不當證明 | P/B：本輪處理 | U：不得填造 |
| --- | --- | --- | --- | --- |
| 熄燈 | lin 在 2031-10-27 02:00:00 停止燈；玩家 41 天後登入 | 時間重合值得追查 | P：讓「不是意外」改變玩家追查動機 | lin 熄燈的完整動機、當夜全貌 |
| lin | v4 最後一任 Admin；Ch2 揭露；只留下物件 | 叮嚀可讀作前任的照顧，也可讀作有意安排 | P：信任由依賴轉為有條件理解 | 生死、歸來、後半自白 |
| INIT | PID 1；在挑人；TICKET-0001 報告人，Ch7 揭露 | 狀態句中開始出現主體性 | P：到後期學會交班而非替人決定 | 挑人完整動機、隱藏結局發言 |
| GC | 世界設定稱免疫系統；Ch1 只有探測；封鎖造成模擬升級 | 玩家可能把規則誤認為惡意 | P：衝突由「打敗它」轉向檢查可回收條件 | Admin 被回收的完整因果、揭露章與細節 |
| harbor-master | 吹牛；K1 後承認自己擋過；lin 信使他動搖 | 不可靠敘述可源於羞愧或自我保護 | P：讓玩家把他從權威變成可查證的同伴 | 後半去向、死亡／背叛等事件 |
| ada／bo | 單人 NPC 補位；Ch0–1 僅足跡 | 協作可讓三人簽核不只是三個按鈕 | P：ada 查邊界、bo 查交班；詳見角色文 | 固有性格、私人身世、必然存亡 |
| 分支 | B0 平行、B1 假設；只合併知識；K0/K1 要有證據 | 失敗能降低玩家畏懼 | B D08：世界與知識分開，來源可追溯 | B2 之後的完整劇本、K3–K8 正文 |
| 憲章 | Rev 5 現行、Rev 1 舊口令保留；第十條未通過 | 法規兼有保護與侷限 | P：玩家學習「理解理由不等於免責」 | 未經確認的新法條、其他結局制度 |
| 結局 | rebase/revert/merge/fork 名稱；七／八片限制；K0/K1 → fork 必要 | merge 呼應 art10 是來源明示，不是所有結局道德排名 | B D14：可回訪結算前存檔 | 四結局全文、其餘充分／排除條件、隱藏名稱與全文 |
| 遺物 | R0、R1 與引用保存；amend-7、amend-10 文件名 | 留住他人的工作可與主題呼應 | P：回訪確認「讀過／保存引用」兩種事實 | R2 以後編號、全收集獎勵、隱藏結局所需數量 |

## 4. 衝突／變更要求登記（不覆寫來源）

| ID | 衝突與證據 | 文件層採用方式 | 解除責任／影響 |
| --- | --- | --- | --- |
| NAR-C01／O-N08 | SRC-03 指 Ch3 揭露八片、Ch6 揭露修憲被擋；SRC-04 卻要求 Ch2 草案全文，含八位、k-of-8；Ch0 P.S. 已說 CI 不行 | P 推薦 Ch2 保留存在／位置，全文延至 Ch3，Ch6 驗證理由；承認改了「Ch2 全文」的出場要求，待作者裁定 | 故事作者＋整合者；阻擋 Ch2 全文及 Ch3/Ch6 gate。具體代價見 AUTHOR_RESPONSE §10，不以只遮 UI 解決 |
| NAR-C02 | `init.ch1_done` 要 `flag.t0427_done`；D05 不可把 shell／代辦當 Python AC | 主線看「故事工單已處理」的語意條件；程式成績另欄。保留 T0427 與既有旗標的原始來源記錄 | 判題／存檔規格作者＋整合者；影響離港、匯入、T0100 彩蛋觸發，不能只改一句文案 |
| NAR-C03 | SRC-05 把 `ls -ltr` 解成硬連結名稱建立時間 | 遵 D11：規劃使用檔案 mtime；撤回 mtime 證明藏片時間的推論；保留舊資料待成套校正 | 引擎／內容作者；須驗題解、同 inode 別名、F2 修復、匯入、同時戳；亦連動 O-N05 |
| NAR-C04 | INIT「也可以不開」與 Ch0 `B0_exited`／`flag.b0.done` 必要條件並存；B1 舊規則可延後但離港需 done | B D19 已裁定：兩支皆可主線明選稍後，記 `flag.b0.deferred`／`flag.b1.deferred`；`branchHandled=done OR deferred`。merge／abandon 才 done，tag 不退出 | 規劃語意已定，待實作與反方重核；延期不發卡／不造親驗，有效 peer 卡仍可提問但不自動產生 done |
| NAR-C05 | voice guide 限 INIT 自稱，T0100 實際有兩句「我」，另有三明治彩蛋；「lin 不說笑話」與 R0 原文亦有張力 | 已有逐字台詞列例外；新寫作遵克制規則，不回頭刪舊句、不用字數掃描判正史錯誤 | 敘事編輯；影響口吻驗收而非主線 gate |
| NAR-C06 | 原規劃「Ch3.5 可選不等於可稍後」與 D14 可在最終選擇前補完不同 | B D20 已定目前 main 旅行；B3b 是隔離實驗，main 合法取件／明示協助才得 F5；保存點僅作復原保障 | 旅行語意已定，F5 正文取法、K4 完整條件仍 O-N04；不重跑前章、不以分支物品補 main |
| NAR-C07 | SRC-08 B1 備註說先讀 lin 信，場景卻在 Q1-3 就可分支 | 保留兩種進場順序；未讀信版本不說「lin 已邀請」，讀後回訪再補呼應 | 敘事＋引擎；影響 B1 開場變體與回訪，不強迫改既有檢查點 |
| NAR-C08 | Ch0 的 `wall` 廣場與 D16 暫無開放聊天不同 | 1.0 為具名 NPC、本機便條及明示交換；線上預定義交班僅後續候選，原廣場設定保留於版本相容性紀錄 | 整合者；不宣稱 `wall status` 已可用、真人在線或對方已讀 |
| NAR-C09／O-N07 | T0100 選修，卻說沒登記燈不算亮；INIT 點燈已登記 | P 推薦選修工單改為修復後續使用的登記工具；原題／ID 保留，修正否定本次點燈的背景句 | Zien／故事作者批准敘事意義；判題／存檔拆故事修復與 program AC |
| NAR-C10／O-N05 | CI 貓罷工失敗、失敗後拆片、F1/F2 舊時間、熄燈後貓罷工構成條件式時序衝突 | 建直接證據與推論約束表；不新增罷工／重跑事件，mtime 改義也不宣稱已解環 | 作者提供提交／檢查／記錄日期或正式修訂；阻擋 Ch6 完整因果定稿 |
| NAR-C11／O-N06 | 三人簽核、七片門、八片、k-of-8 的效力不明 | 分操作建表；卡與片不當同意票；k、第三／十條、重建權限未填 | 作者定授權模型；阻擋完整結局制度驗收 |

### 交叉定位：NAR-C01–08 不是 O-N01–08 的重新編號

| 本地衝突 | 共享決策／未知編號 | 實際落點與當前狀態 |
| --- | --- | --- |
| NAR-C01 | O-N08；背景依 O-N01 | REVEALS_AND_ENDINGS §2、AUTHOR_RESPONSE §10；全文延後是推薦，待作者 |
| NAR-C02 | D05；T0100 的相關意義另屬 O-N07 | VOICE_AND_COPY §4.2–4.3、AUTHOR_RESPONSE §5；故事／AC 分開已定，文案修訂與映射待驗 |
| NAR-C03 | D11、O-N04/O-N05 | REVEALS_AND_ENDINGS §7、AUTHOR_RESPONSE §7；mtime 語意已定，資料／時序未解 |
| NAR-C04 | D19；沒有新增 O-N 未決 | CHAPTER_BEATS §1–3、AUTHOR_RESPONSE §5；done／deferred 規劃已定，待實作重核 |
| NAR-C05 | 口吻來源例外；沒有對應 O-N 編號 | VOICE_AND_COPY §1；保留既有例外，新句遵克制，屬編輯驗收 |
| NAR-C06 | D14/D20、O-N04 | REVEALS_AND_ENDINGS §6、AUTHOR_RESPONSE §6；旅行語意已定，F5/K4 正文未解 |
| NAR-C07 | 既有場景順序／分支備註；沒有獨立 O-N 編號 | CHAPTER_BEATS §3；依是否讀信分入口，後續資料包驗順序，不虛構讀信經歷 |
| NAR-C08 | D02/D15/D16；沒有獨立 O-N 編號 | VOICE_AND_COPY §4.4–5、AUTHOR_RESPONSE §8；1.0 來源／受眾明示，線上能力另定 |

| 共享未知 | 敘事負責文件／解除者 |
| --- | --- |
| O-N01 外部正文版本 | 本文 §1–3、STORY_ARC §3；Zien／指定故事作者提供可讀版本 |
| O-N02 八空格 | REVEALS_AND_ENDINGS §5、NAR-310；作者定謎題，工程／互動驗呈現 |
| O-N03 隱藏結局 | REVEALS_AND_ENDINGS §5、NAR-305；作者給名稱／正文／條件後驗可達 |
| O-N04 後半 F/K／結局條件 | CHAPTER_BEATS §4–10、REVEALS_AND_ENDINGS §5–7；作者＋內容資料包 |
| O-N05 CI／貓／拆片時序 | NAR-C10、REVEALS_AND_ENDINGS §7.2、AUTHOR_RESPONSE §7；作者補證／修訂 |
| O-N06 授權模型 | NAR-C11、REVEALS_AND_ENDINGS §3、AUTHOR_RESPONSE §2；作者定制度 |
| O-N07 T0100 登記意義 | NAR-C09、VOICE_AND_COPY §4.3、AUTHOR_RESPONSE §5；作者批准背景與觸發修訂 |
| O-N08 Ch2 草案揭露 | NAR-C01、REVEALS_AND_ENDINGS §2、AUTHOR_RESPONSE §10；作者裁定全文範圍／時點 |

## 5. 驗收與未知責任

| 驗收 ID | 可執行的檢查 | 通過證據 |
| --- | --- | --- |
| NAR-001 | 後半每個具體事件、角色新個性、未有來源的台詞都標 P；來源事實可反查 SRC | 逐段審讀的定位表；沒有「作者可能本來這樣想」作證 |
| NAR-002 | 對照 B0/B1/B2/B3/B3b/B4/B5/B6/B7、K0–K8、F1–F8、R0/R1、T0100/T0427 與 `ending.fork` | 無改號、無把 B3b 改成 B4；預留 ID 未被宣稱已有完整資料 |
| NAR-003 | 搜尋本輪所有 `ls -ltr` 說明與 Python AC 文案 | mtime／D11 有明確註記；故事處理不等於程式 AC |
| NAR-004 | 複核 NAR-C01–C11 與 O-N01–O-N08 的交叉定位，與 DECISIONS 對照 | 每個衝突有責任、影響與狀態；未私自改共用決策 |
| NAR-005 | 檢查來源可讀性及外部聖經版本 | 本地證據與未取得正文分開；無登入頁推導出的「正史摘要」 |

以上是驗收規格，不是全數通過宣告。作者需解除 **O-N01–O-N08**：外部正文、八空格、隱藏結局、後半條件、CI／貓／拆片時序、三人／片數／k 授權、T0100 登記意義、Ch2 草案揭露順序。B0/B1、Ch3.5 的規劃契約已由整合者採 D19/D20；引擎、判題與存檔負責落實及 C02/C03、checkpoint 投影對照。真人是否感到「被信任、願意回訪」仍未測，交 M0 與後續章節試玩，不能由代理互評替代。
