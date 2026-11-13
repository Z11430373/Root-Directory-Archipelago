# 完整版互動契約

日期：2026-11-02｜工作稿／未實作｜責任：互動設計、引擎、前端、判題、QA。

共用 brief、證據 E01–E12、風險台帳及估算單位見 [PLAYER_EXPERIENCE](PLAYER_EXPERIENCE.md)。採 [DECISIONS](../DECISIONS.md) D05–D09、D12–D20；工程欄位沿 ENGINE／SAVE 命名，畫面狀態是呈現投影，非另一套 wire schema，也不表示新 API 已實作。

依賴：[ENGINE_CONTRACT](../engineering/ENGINE_CONTRACT.md)、[SAVE_SCHEMA_2](../engineering/SAVE_SCHEMA_2.md)、[COMMAND_COMPATIBILITY](../engineering/COMMAND_COMPATIBILITY.md)、[CHAPTER_PACK](../engineering/CHAPTER_PACK.md)、[TICKET_JUDGE](../engineering/TICKET_JUDGE.md)、[MERGE_SPEC](../engineering/MERGE_SPEC.md)、[REPLAY_SPEC](../engineering/REPLAY_SPEC.md)、[MINIGIT_SPEC](../engineering/MINIGIT_SPEC.md)。

## 1. 互動模型與不變條件

**INT-001：同一世界、兩種操作面。** 群島的按鈕／面板與 Bash 的命令文字均讀同一投影、送同一引擎動作。`game …` 是工作階段控制，非 Bash 內建；其餘新增命令拼法以 COMMAND_COMPATIBILITY 定稿。

| 獨立狀態維度 | 值／規則 |
| --- | --- |
| 操作模式 | islands / Bash 終端；不是主題 |
| 呈現偏好 | 深色／高對比、small／medium／large、減少動態／輸出宣讀偏好；不入遊戲歷史 |
| 遊戲輸入 | 啟動器、暱稱、命令、口令、選擇、結算；每種有可見與可及名稱 |
| 動作生命週期 | 可編輯 → 已排隊 → 執行中 → 已提交／已取消／執行失敗；回應未知另列 |
| 保存 | durable：尚未建立、提交中、已保存、提交失敗、所有權衝突；volatile：明選僅此分頁、未持久保存；legacy demo 另依既有 best-effort 行為 |
| 內容包 | 未安裝、檢查中、下載中、驗證中、可用、更新待啟用、失敗／版本不相容 |
| 連線 | 離線／線上／認證到期；離線主線與登入狀態正交 |

- 模式切換不重播命令；保留 cwd、分支、進度、草稿、選取範圍與歷史。正在交易時先完成／取消至安全點再切換，不能重送同一動作。現況 E04 已保存部分 UI 狀態，執行中切換競態待驗。
- 常態輸出不搶焦點；玩家送命令才追隨新結果。回捲時顯示可達的「有新輸出／回到最新」而不是強制跳到底。
- 核心交易失敗／取消不發布候選獎勵；正常 shell rc≠0 可能仍有已提交的先前寫入或規則效果，依 ENGINE 裁定。故事任務、shell rc、程式判題、保存結果各有不同狀態。
- 常規查閱不用確認；覆寫、結算、資料交換使用具體預覽與確認。取消入口和主要按鈕一樣可鍵盤到達。

## 2. INT-002 三種時鐘（D07，唯一政策）

| 時鐘 | 權威／推進方式 | UI 呈現 | 暫停、閱讀與保存 |
| --- | --- | --- | --- |
| 活動牆鐘 | 主持的場次經過時間；既有 demo 有 14 分鐘提醒、15 分鐘收尾、投票寬限至 16 分鐘；kiosk 120 秒閒置是同層設備政策 | 明示「活動剩餘／場次時間」，不寫成故事時間；kiosk 閒置另用明確標籤 | 完整版活動包先選有／無時限及延長政策；到時提供保存與交班，不偷偷推故事或算未解題為 AC |
| 故事虛擬鐘 | `branches[id].storyTimeMs`，非負安全整數毫秒；明示 `time.advance` 或 pack 的 `timePolicy.actionCostsMs` 推進 | 操作前顯示「此動作將推進故事時間：{cost}」；顯示可換算秒／分，權威值仍為 ms；零成本查閱標「不推進」 | 閱讀、man、提示、設定、失焦、離線、下載等待不推進；Boss 預設診斷／行動節拍可暫停；保存記錄確定性值 |
| 線上賽季鐘 | M7 伺服器權威，含季節時區與收件／結算規則 | 顯示伺服器時間／時區及最後更新，離線顯示已過期資訊 | 閱讀不暫停共享世界；重連由伺服器說明已發生的變更；不得倒灌成離線主線衰退 |

**已讀現況差異：** main `syncClock` 將牆鐘差額送入引擎；engine `feedCommand` 另有 `advanceWorld(30)`，連查閱也經該入口。完整版必須以新契約分類動作，不能僅隱藏畫面倒數。原 demo 歷史時間與 commit ID 留在 legacy 路徑，不重算舊鏈。

單位與推進入口已由 ENGINE §3／§5、CHAPTER `timePolicy` 定義；**INT-O01 只追蹤具體動作成本／Boss 節拍數的內容實測調校**，按 pack 版本發布，不再列為全域契約阻塞。有成本行動與 Boss 均依 D17「准入與固定成本→候選故事鐘／排程→重查條件→行動」，UI 預告不能倒成先執行後扣時。UI 不送定期 `time.advance`；COMMAND 已定 `game time status`／`game time advance --ms <N>`，仍待實作。提示等待提醒若使用 UI 牆鐘，只能顯示「需要提示嗎」，不能推故事／揭完整答案／寫競技負債。

`query`（狀態、地圖、提示列表、補全、預覽）不改 `stateHash/seq/PRNG/storyTimeMs/journal`。玩家實際 `cat/grep` 屬 `command.execute`，時間成本 0，但可以新增 `file.read`、證據與 journal／seq；主動展開提示也可依 ENGINE 記 `hint.viewed`，時間仍為 0。不得把「閱讀零時間」誤寫成所有閱讀都零狀態變更，或把背景預讀當成玩家已取得證據。

驗收：對同份存檔，分別停留手冊、失焦、關閉再開、下載失敗後等待；純 query 與等待前後的世界 hashes／時鐘不變。另驗實際讀檔可留證據但故事鐘不變；明示行動依契約只增加一次。有成本的命令即使正常 rc≠0 仍可提交時間成本，取消／核心錯誤／durable commit 失敗則整筆回滾。活動與線上時鐘測試分開，不能要求伺服器也因閱讀暫停。

## 3. INT-003 鍵盤、IME 與貼上

| 輸入／快捷鍵 | 現況（E03/E07） | 完整版契約／驗收 |
| --- | --- | --- |
| Enter | 兩面皆提交；IME `isComposing`／229 直接返回 | 組字確認只完成組字；compositionend 後不得產生額外提交；實測注音／拼音／日文 IME |
| Shift+Enter | 原生 textarea 換行 | 維持；可選取、剪貼、撤銷草稿，不觸發引擎 |
| Tab／Shift+Tab | Tab 補全；Shift+Tab 離開輸入 | 保留可見說明；增設可關閉「Tab 補全」的鍵盤偏好（提案），關閉時 Tab 正常移焦且有明示補全按鈕／等價操作 |
| ↑↓ | 歷史與草稿；多行內保留原生垂直移動 | 到首／末行才走歷史；恢復草稿與游標；口令不進可見歷史 |
| Ctrl+R／Esc | Bash 反搜歷史；Enter 採用、不執行，Esc 返回草稿 | 搜尋中標角色／結果數或無結果；不在 log／其他欄位攔截；IME 期間不攔 |
| Ctrl+A/E/U/K/W | Bash 行首末／刪段與字 | 保留 Bash 模式契約；群島不自動套整組 Readline；提供原生編輯偏好以避輔助科技衝突（提案） |
| Ctrl+L | Bash 清顯示，不清進度／歷史 | 只清目前 transcript 呈現；明示可查歷史／章回顧，不當刪檔 |
| PageUp/PageDown | 捲動紀錄 | 回捲不跟隨輸出；不觸發任務／失去草稿；低高度仍可回輸入 |
| F2／模式選擇 | Bash F2 返回群島，保留草稿 | 不把 F2 當唯一出口；`game mode islands` 與模式選擇可用 |
| Ctrl+C（選取文字） | 保留複製 | 文字選取優先於中斷；不可攔 OS/AT 組合鍵；也提供執行中可見取消入口 |
| Ctrl+C（無選取） | Bash 取消輸入／Worker；群島僅特定口令處理 | 真正可取消範圍依 §4；不是全產品、所有網路交易皆可撤銷 |

**多行貼上：** 貼上只寫草稿，不執行。Enter 才按 parser 的引號外換行切成序列；引號內換行／反斜線延續保留。完整 JSON 匯入走單一資料負載，不被分行。逐條 await；進入口令、選擇、結算或換操作面時暫停，剩餘文字留草稿並標「尚有 {n} 條未執行」。不能把下一條命令自動當密語或投票。

重複 Enter／點擊在 pending 時忽略再次提交並顯示原工作狀態；保留同一 `inputId` 與完整 input，不製造第二個獎勵。命令正常結束但 rc≠0 是一個結果，不等於引擎交易失敗；重導向／串接的副作用遵從 ENGINE §6.3 與 COMMAND_COMPATIBILITY，不擅稱全無改動。

現況限制：群島草稿 maxlength 4096；Bash textarea 可達 1,048,576，但一般單條命令仍限 4096 字元。新版 ENGINE `command.execute.payload.raw` 已定 **UTF-8 ≤16 KiB**，不可用 textarea 的字元 maxlength 假裝驗 bytes；每筆派送前檢查，超限保留草稿並標明實際 bytes／上限。對話節點、存檔與分享資料按各自契約，不混用一般命令上限。不可見字元／八空格另見 A11Y-009，未確認正文前不自動 trim／正規化謎題輸入。

## 4. INT-004 交易、取消與重複提交

**新版預設 durable（ENGINE §6.3、SAVE §6）：** 候選世界尚非可見世界；必須先完成 IDB 原子提交，才能發布結果與任務變化。

```text
草稿 --明示提交--> 排隊 --guard通過--> 隔離執行，產生候選世界/輸出/journal
  ├─候選有效--> 同一 IDB transaction：CAS + 寫入完整引用閉包 + 新 active root
  │               ├─成功（commit point）--> 發布可見新世界/輸出 --> 已保存
  │               └─quota/I/O失敗（abort）--> 舊 root/可見世界不變；本次尚未提交
  │                                           ├─重試或下載候選救援檔
  │                                           ├─取消候選，回原進度
  │                                           └─明選「僅此分頁繼續」--> memory adapter
  ├─例外/預算失敗--> 回復本交易 --> 顯示錯誤與恢復出口
  └─cancel(inputId) 在 commit point 前生效--> 回復本交易 --> 已取消

已明選 volatile：候選 --> memory adapter 原子提交 --> 發布結果；持續標「未保存至本機」
現行 demo（legacy）：引擎交易完成 --> best-effort 本機保存；失敗時新世界可仍在記憶體
線上送出後斷線 --> 結果未知 --> 以原 submissionId 查詢（依服務契約），不換 ID 盲重送
```

durable 失敗不得發布候選的任務完成、獎勵、時鐘或成功輸出；只能展示明標「尚未提交」的候選救援資訊。下載候選不等於接受候選為 active，也不等於已持久保存。等待玩家選擇期間保留草稿並暫停新的寫入；查閱舊世界可用。重試前重查原 `expectedStateHash`、`expectedRevision` 與前次 `saveHash`；若過期則重新預覽，不能套新 token 強寫。明選 volatile 後才把完整候選提交至 memory adapter；原 durable root 保留，關頁後不能承諾恢復本頁後續進度。

| 邊界 | 可承諾的取消 | 不可承諾／顯示 |
| --- | --- | --- |
| 未提交草稿 | 清空或取消此次編輯，沒有遊戲變更 | 不等於刪掉先前命令歷史 |
| Bash Shell Worker 執行中（現況） | Worker 終止，Engine 回復**這次 feed 交易**的 VFS／狀態；未成功命令不入 journal | echo／可見命令歷史可保留；先前已成功的命令不回復；真 Bash 不會如此回復寫檔 |
| 多行序列第 k 條 | 取消第 k 條與停止後續派送；前 k−1 條成功已提交 | 不能顯示「整段已復原」；新版剩餘草稿保留為提案，現況取消會清除該批未執行草稿 |
| 本機重播（現況 Bash） | Ctrl+C 回啟動器，保留原始 envelope，不將部分重播落盤 | 不稱恢復成功、不刪救援備份 |
| 群島同步 Shell（現況） | 不宣稱執行中可搶占中斷；只有已實作口令取消 | 完整版重工作需共用可取消 runner／明示不可取消階段，M1 工程決策 |
| 新版 durable，commit point 前 | `cancel(inputId)` 成功撤銷候選 VFS、flags、PRNG、storyTimeMs、證據、scheduler、seq、journal 與未發布輸出；清理工作資源 | IDB abort／quota 也保留舊 root 與可見世界；不能稱「操作已完成」 |
| 新版 durable，commit point 後 | 已提交世界可正常備份；取消回 `ENG_ALREADY_COMMITTED` | 不倒退已提交狀態；UI observer 失敗不等於存檔失敗，不重做 input |
| 已明選 volatile，memory commit 後 | 可匯出目前記憶體世界；下一筆仍走交易／取消邊界 | 不稱已保存至本機；取消不撤銷先前 memory commit，不自動覆寫舊 durable root |
| 現行 demo，交易完成但保存失敗 | 可另存備份；已提交世界仍可能存在記憶體 | 此 best-effort 現況不作新版 durable 契約；文案只在該終態使用 |
| 下載／包驗證（提案） | 提交前取消丟棄候選；保留現有已驗證包 | 作業系統已開始的檔案下載不可保證撤回 |
| M6 同步／M7 線上判題 | 送出前可取消；送出後依伺服器回覆／查詢確認 | 不把停止等候寫成伺服器已撤銷；結果未知不能盲目換 ID 重送 |

同一交易的完成與取消競態以 coordinator 的 commit point 裁定；按下取消不等於取消已生效。畫面不能同時顯示兩種終態。接收結果須核對目前工作階段、`inputId` 與候選基線；過時結果不得改目前世界。普通 Shell 的重新主動輸入可用新 `inputId` 再次執行，但任務獎勵、知識匯入、結局選擇依工程冪等鍵去重，不以整段命令字串全域去重。原 journal 仍在時，同 ID＋同完整 input 回原結果；同 ID 不同內容拒絕，已裁切紀錄不靠盲重送猜結果（ENGINE §3）。

### 4.1 工程接點與呈現映射

| UX 用語／用途 | 權威欄位／來源 | UI 綁定規則 |
| --- | --- | --- |
| 本機這筆操作（原 request） | ENGINE `inputId`；取消為 `cancel(inputId)` | 排隊、執行、取消、結果引用同一筆；不新增 `requestId` 作另一套引擎身份 |
| 畫面世界基線 | ENGINE `expectedStateHash`、`branchId` | 由預覽當時世界取得；不把目前 hash 偷填給舊確認 |
| 本機保存版本（原 revision） | SAVE root `{storageRevision,saveHash,generationId}` | durable compare-and-write 用 root revision＋saveHash；不是遊戲 `seq` 或 Git revision |
| 匯入／合併候選 | SAVE staging `stagedImportHash`、`expectedRevision`、前次 `saveHash` | `expectedRevision` 固定為預覽時的目標 root `storageRevision`；候選與確認一起固定，過期重預覽 |
| volatile 的過期保護 | ENGINE `expectedStateHash`、`inputId` 與目前工作階段 | 不偽造 durable `storageRevision`；畫面明示 memory adapter，之後轉持久化仍須重新驗 root |
| 故事／程式結果 | ENGINE `storyStatus,resolutionMode,programVerdict,evidenceRefs` | 取 `progress[ticketId]`；代辦／shell 結果不得產生 program AC；profile 等詳情由 TICKET 提供 |
| B0/B1 延期／邀請 gate | D19 `flag.b0.deferred`／`flag.b1.deferred`、`branchHandled(Bx)` | 由核心記旗標，handled 僅查詢 `done OR deferred`；UI 不新造 branch type，也不由 handled 推得證據／卡片 |
| 工作檔套用 | TICKET §5.2／ENGINE `file.edit {islandId,path,expectedContentHash,content}` | 編輯器開啟是 query；套用才送有界文字input，預期新檔 hash=null；不可直接改 VFS，衝突保留草稿，bytes與blob保存由核心處理 |
| 線上工作身份 | TICKET／REPLAY `submissionId`，另帶其服務要求的 attempt／challenge 引用 | 與本機 `inputId` 分層；收到合法結果再用新的 `ticket.resolve` 輸入接納，不把取消視圖當撤銷伺服器工作 |

MERGE／TICKET／REPLAY 草稿中的 logical DTO 名稱由 owner 對齊上述共用欄位；UI 不另造持久型別。M6/M7 的帳號、收據簽章及部署細節僅限制該版本開放，不阻塞 1.0 的 durable／時間契約。

## 5. INT-005 狀態／轉移清單

共通：loading 顯示真實階段；有可量測 bytes／步數才用百分比，否則「處理中」。錯誤持續至處理／取消，不自動消失。沒有網路也能繼續已下載主線；缺權限只限制對應功能。

| 狀態 ID／起點 | 觸發、guard → 終點 | 回饋／focus | 恢復、取消、資料規則 |
| --- | --- | --- | --- |
| ST01 首訪空紀錄 | start → 暱稱 → ready | 明示模擬世界；聚焦暱稱 | 未確認前不覆蓋上次紀錄；可回入口 |
| ST02 正常命令 | submit 且非 busy → pending → adapter commit 成功 | 原結果＋任務變化摘要；送出者回輸入，使用者已移焦則不搶回 | durable：IDB 成功才發布；volatile：memory 成功但仍未持久保存；儲存失敗走 ST12，核心錯誤走 §4 |
| ST03 命令成功但未解謎 | rc=0、puzzle predicate 未滿足 → ready | 「指令已執行；目前任務仍待完成。可查看目標。」 | 不自動提示完整解法、不偽造失敗；可查看證據／man |
| ST04 故事工單成功但程式未 AC | shell-local／assisted 只滿足 story gate → story-ready | 「工單已處理（本地狀態／代辦）。程式題尚未通過。」 | 保留原題／回顧／執行可用性；不改原題 AC |
| ST05 未知命令 | command 不在支援集合 → ready | 原錯誤＋最多一個可信建議與 man/help；焦點留輸入 | 不自動執行建議；重試保留可編輯文字 |
| ST06 已知命令不支援選項 | 工具回正常 option error → adapter commit／ready | 「此版本不支援 {option}。已支援用法：{link}。」 | 不假裝成功；同 input 中先前分號命令的寫入仍可能提交，不稱整段未改動；核心失敗另走回滾 |
| ST07 任務／搜尋無結果 | 結果空集合 → empty | 目標／搜尋條件及「無符合項」；有清除條件入口 | 不與內容下載失敗混為一談；不跳走焦點 |
| ST08 匯入候選驗證中 | 選檔／貼碼提交 → validating | 顯示來源格式、步驟；只讀預覽 | 工作區／原檔不變，可取消；候選不得自動落盤 |
| ST09 匯入失敗 | 格式／CRC／鏈／版本／預算不符 → error | 指出原欄位、aria-invalid、支持碼；焦點來源欄位 | **原始存檔、journal、VFS 不覆寫**；可保留原檔／另選檔；不宣稱都能修復 |
| ST10 legacy 降級恢復 | reader 可讀但缺 runtime → preview | 列可恢復事件與缺失檔案／cwd；資料分級另顯示 | 明示確認才建新紀錄，保留來源；無法備份時不宣稱安全升級 |
| ST11 本機重播失敗 | journal 重播異常／摘要不同 → recovery | 返回入口，原始備份、事件救援說明 | 先保留原始 envelope；「只還原事件」明確損失粒度；救援失敗不覆寫 |
| ST12 本機保存不可用 | durable storage 拒絕／quota → transaction abort，候選待處理 | UI-COPY-010「本次尚未提交」；可重試、下載候選、取消或明選「僅此分頁繼續」；原焦點不突跳 | 舊 active root／可見世界不變，不自動續玩候選。明選 volatile 才發布 memory commit，持續 UI-COPY-024；legacy demo 已完成但保存失敗用 UI-COPY-026。下載不可用時按資源上限提供可選取文字，不能假稱完整輸出 |
| ST13 跨分頁所有權衝突 | `storageRevision/saveHash` CAS 不符 → write-paused | 停止本頁 durable 寫入，提示重新預覽；focus 不離開輸入 | 保留兩份，先匯出本頁／候選、查看另一頁或重載；不可拿新 revision 強寫舊候選 |
| ST14 內容未下載 | 進入未水合章 → missing-pack | 顯示run已鎖manifest、大小與「本章未下載」 | 按PACK §3.2補齊目標閉包後同lineage續章，安裝不改seq／進度；失敗返回已裝章。目錄未含的新章另提示需明示遷移 |
| ST15 內容更新失敗 | 候選下載／雜湊／相容性失敗 → old-ready/error | 說明尚未啟用；若舊版可用則顯示目前版本 | 保留舊包與存檔，不混用資產；成功 activation 也不改進行中 `save.packRefs`，新遊戲可用新版，舊檔換版需明示遷移／新 lineage 並保留原件 |
| ST16 知識匯入預覽 | peer package 合法 → review | 已擁有／可新增／尚未解鎖而封存／不相容，各有數量 | 展開前保護劇透；明示來源與共享欄位；取消不寫入 |
| ST17 知識匯入提交 | 確認且資格仍有效 → merge-result | 「新增 {n}、已擁有 {m}、封存 {k}」；回來源控制 | 交換律／結合律／冪等只驗知識集合；不帶朋友世界或主線選擇；重複不發獎 |
| ST18 同步歧路（M6） | 兩邊有效且非快轉 → divergent | 本機／遠端的章節、版本、最後動作、待保存；不以日期判勝負 | 保留平行紀錄，明示選哪份繼續；知識合併獨立，不能自動最後寫入勝出 |
| ST19 認證到期／離線（M6） | 同步未授權／網路斷 → local-only | 「仍可離線遊玩；同步尚未完成」 | 本機保存成功才說已保存；回登入可取消、不丟草稿；不鎖主線 |
| ST20 結果未知（線上） | 已送出但回覆丟失 → unknown | 原 `submissionId` 的工作狀態與「查詢結果」，不顯示失敗可重送 | 同 ID 查詢／去重；收到終態才提示處理結果 |
| ST21 終章確認 | `ending prepare`的完整pin＋新狀態在當前adapter提交成功→review | 列保存點、儲存模式、未完項及返回；初焦點標題／保守選項 | durable失敗走ST12，不自動降級；明選volatile後完整memory pin可繼續，持續UI-COPY-028並可匯出；缺pin／hash／closure仍擋確認 |
| ST22 終章提交 | 明示選項確認、expectedStateHash有效且adapter commit成功→ended | 選擇已記錄、保存模式、回顧及「另開結算前主線」 | durable／memory各驗CAS；重複不多記抉擇。另開走SAVE §7.2，預覽新lineage／起點／已領獎不重發，保留原結局；失敗不切active |
| ST23 skip 待確認 | 第一次 skip → scoped-confirm | 題名、後果、取消；焦點留確認區／Bash 提示符 | 綁 quest ID＋`expectedStateHash`；durable 提交另驗 `storageRevision/saveHash`。換題／取消使確認失效；完整版不用十秒閱讀期限，legacy 保留原規則 |
| ST24 skip 完成／回顧 | 確認 → assisted/story-ready | 「已代辦／跳過，可回顧」，非「已掌握」 | 解法回看不發 AC；可另一次練習取得親自證據 |
| ST25 重複提交 | pending 同操作／已知結果 → 原工作／既有結果 | 「正在處理這筆」或「已處理」 | 不重扣、不重發、不跳過下題；原始 command 可見 |
| ST26 取消 | 提交前取消／取消成功 → ready | 說明取消範圍與先前已完成項；restore focus | 清理 Worker／listener／候選；提交後取消改回報已完成，見 §4 |
| ST27 提示完整解法 | L1→L2→玩家展開 L3 | 標階數、免費、完整做法與原因；焦點不跳解答底端 | 重複展開不重發事件／代辦；讀長文不自動升 L3 |
| ST28 B0/B1 延期→回訪 | 主線邀請→明選「稍後調查」→提交 deferred；之後明選「前往調查」→依核心開分支 | 稱「已選稍後調查／可免費回訪」，不稱完成；焦點回邀請來源／回訪入口，兩模式等價 | 不必先進分支abandon；只依核心flag及branchHandled投影，不發K0/K1或親自模擬。回訪後按實際證據判定，保存／取消走§4；tag不退出 |
| ST29 Ch3.5 主線補訪 | 目前主線→明選「前往Ch3.5補查」→旅行→必要時另開B3b實驗→回主線合法取件／明示協助 | 顯示目前主線位置與進度，B3b標隔離實驗；F5來源與實際取得分開，未知條件不揭露 | 保留其他章進度／當前世界，不載舊保存點、不重演首次揭露／重發獎；線索可帶回，分支物品不可複製；還原保存點另走預覽確認 |

## 6. INT-006 四段式微互動規格

各項均涵蓋 trigger → rules → feedback → loops/modes；聲音與震動一律非必要，文字是完整渠道。

| 互動 | Trigger／帶入資料 | Rules／退出條件 | Feedback／無障礙 | Loops／生命週期 |
| --- | --- | --- | --- | --- |
| 提示展開 | 任務提示按鈕／hint；帶任務名及已展開階 | 查閱不推時鐘；L3 有明示標籤，無費用；返回保持草稿 | 展開區域 aria-expanded；一次宣讀階名，不整章重播；不自動聚焦答案 | 首次說明可收合；回流保留已看範圍，重看免費；無自動 retry |
| 命令提交 | Enter／執行；帶 raw、`inputId,expectedStateHash,branchId`，coordinator 固定保存基線 | IME guard、UTF-8 bytes／能力檢查、序列化；有效候選走 adapter commit，正常 rc≠0 也可提交；取消見 §4 | 即刻執行中標記；durable IDB／volatile memory 提交成功才發布結果；busy 可請求取消 | 新手可填入、熟手快捷；按住 Enter 不排多次；錯誤由人重試 |
| 保存與分享 | save／匯出；帶格式與用途 | 凍結一致快照→欄位預覽→主動輸出；不自動上傳 | 成功只稱「已建立／已送出下載」，不稱檔案已落到磁碟；剪貼成功才稱已複製 | Clipboard 拒絕則選取文字；再次匯出可生成同狀態，不能重獎 |
| 知識匯入 | 選 peer package；帶來源、版本、可新增數 | 驗證→劇透分級預覽→確認→資格重查→去重提交 | 結果分類表，保留輸入來源；取消回觸發點 | 重複匯入零新增；失敗只手動 retry；不能自動升親自證據 |
| 終章抉擇 | 選項進確認；帶當前狀態摘要 | 結算前快照可用才提交；有返回調查／取消 | 文字摘要、未完項、保守初焦點；不靠顏色區別結局 | 回訪檢查點另開有效歷史；不自動覆掉原結局 |

**動態提案（尚無共用 motion token）：** 常規變更 0ms；可選面板淡入 120ms ease-out，不移動／縮放；錯誤持續且不抖動；Bash 結果立即顯示。reduced-motion 一律 0ms、停止平滑捲動與逐字輸出；播放中改系統設定即完整顯示。上述是 UI 時長，不是第四種遊戲時鐘；不得阻塞輸入或延後提交。

**等待與超時：** 提交當下立即提供執行中；沒有可信進度不顯示假百分比。timeout／資源上限由工程契約提供，UI 不新造另一個截止時間；超時和取消走不同錯誤 ID，原檔不動。讀取可明示重試；寫入先查結果，不能默默輪詢重送。

## 7. INT-007 焦點、resize 與離開

- 群島：進頁標題／主控制 → 終端輸出 → 輸入 → 任務／提示／保存，實際 DOM 順序須與斷點後閱讀順序一致。Bash：捲動紀錄 → live prompt → 鍵盤說明／可達退出；不新增假側欄。
- Dialog 僅群島高後果預覽用；長內容初焦點標題（可程式聚焦），取消返回原觸發控制。Bash 用具名文字確認；COMMAND 已定 `game confirm <confirmationId>`／`game cancel <confirmationId>`，不突然開圖形 modal，未實作時不宣稱可用。
- resize 不提交、不重播、不改草稿／選取。若焦點在將收合的任務面板內，先保留展開；必須收合時轉到該面板 summary 並播「面板已收合」。不能將焦點留在 hidden 元素或一律拉回輸入。
- 同斷點手動展開意圖持續；跨斷點預設只在不藏焦點時套用。軟鍵盤出現只調視覺高度，不等同進入新遊戲。
- 返回入口前報保存模式與結果；durable 失敗可留在原進度、處理候選或明確退出，不能默認接受未提交世界；volatile 提醒本頁後續進度尚未持久保存並提供匯出。瀏覽器原生返回／關頁不能保證攔截或自動下載，主流程需早提供保存。

### INT-008 延期、收藏、補訪與還原

依 D19/D20，ST28–29 是畫面流程，不增加持久型別。B0/B1 延期提交後，任務清單保留「稍後調查」及免費回訪入口；`branchHandled` 不映射成 story resolved、親自模擬或卡片已取得。核心已登錄 `storyProgression` 保存回應細節，gate 仍只查 main 的 done/deferred，不另設可寫 handled。進入分支後 merge／abandon 成功才記原 done，原 deferred 保留作歷史；merge 缺證據留原分支，abandon 不發卡。是否取得 K0/K1 另依真實證據；`tag` 只收藏，焦點留目前分支，回饋「已收藏，仍在此分支」。不能收藏後暗自跳回 main。

| 呈現動作 | ENGINE §4.3 已定映射（尚未實作） |
| --- | --- |
| 稍後調查 B0/B1 | `choice.select`，choiceId=`branch.offer.B0`／`branch.offer.B1`、optionId=`defer`；時間0，只記延期，不先進分支 |
| 免費回訪／退出 | `branch.create` 依核心 scenario／snapshot／template 入口；退出 `branch.leave`；來源模板與實際保存點還原分開標示 |
| 收藏目前分支 | `command.execute` 的 `git tag <name>`；pin 輸入前 snapshot 成功才回報，時間0、不退出 |
| Ch3.5 主線補訪 | `command.execute` 的 `ssh cronmine`；已登錄route／guard／包完整且未ended時可用，成本依pack |
| 結算前返回調查 | `choice.select`，choiceId=`story.ending`、optionId=`return-investigation`；解除等待選擇、回playing，之後主線旅行，不restore |
| 結局後重開結算前main | 宿主SAVE §7.2 `reopen-main/1`；新saveId／lineage、seq0恢復baseline，原ended槽保全，獎勵ledger繼承；不是sandbox |

Ch3.5 的「前往補查」保持目前主線進度並走旅行規則；若有故事時間成本，事先取 pack 顯示。B3b 回來只接納允許線索，F5 仍要在目前主線合法取件或明示協助；不得以分支已持有自動授予 main 物品。S06/S09 的「還原保存點」另顯保存點版本、還原範圍與目前紀錄保留方式，確認才更換世界。終章前「返回調查」使用前者，結局後「還原結算前保存點」使用後者。

## 8. 驗收與就緒

| ID | 具體驗收證據 | 責任／成本（假設） |
| --- | --- | --- |
| INT-001 | 同存檔兩模式做同動作，狀態效果一致；切偏好不增加遊戲 commit，草稿選取不丟 | FE＋引擎／M |
| INT-002 | §2 三時鐘；query 零變更、實際 cat/grep 可產證據但零時間、成本取固定 pack、行動一次推進、legacy 原 ID 不變 | 引擎＋內容＋QA／L |
| INT-003 | 真 IME 組字、引號多行、進口令停批、選取 Ctrl+C、Shift+Tab 退出；每例錄實際環境 | FE＋QA／M |
| INT-004 | 分例注入取消／完成競態、重複 Enter、rc≠0、durable quota。quota時舊root、VFS、flags、PRNG、時鐘、seq、journal、可見輸出不變；候選可下載但不自動發布；明選volatile才memory commit且不顯已保存；正常rc≠0可提交；CAS失敗重預覽。legacy另列fixture | 引擎＋QA／L |
| INT-005 | ST01–ST29 每列有可重現 fixture、期望終態、focus、恢復出口；沒有將未測列勾通過 | 各功能工程＋QA／L（依賴不重複加總） |
| INT-006 | 五個微互動皆可鍵盤操作、reduced-motion 完整資訊、分享取消零輸出；無假保存文案 | FE＋UX／M |
| INT-007 | 760px 前後／軟鍵盤／200% 與400% 縮放，焦點可見、草稿完整且不意外執行 | FE＋a11y QA／M |
| INT-008 | 未進B0/B1可延期、取消不記deferred、成功不發K0/K1；免費回訪、tag不退出、done不冒充證據；Ch3.5旅行保留其他章狀態，B3b不帶物品，主線F5取件／協助無重獎；舊點還原是獨立確認 | 引擎＋作者＋FE＋QA／M，與UX-008去重 |

契約已對齊：INT-O01 的整數毫秒／版本化成本、INT-O02 的 durable／volatile／取消／重複提交，不列全域未知阻塞。成本數值與節拍仍待內容實測；原子提交與競態仍須實作驗收，未通過不得宣稱可靠保存。blocking 範圍：UX-O02 作者 gate／稱謂與程式 runtime 各自開放前、UX-O03 對應結局正文；M6/M7 服務接點依該版本驗收。nonblocking：面板 120ms 動態、進度圖樣細節，可用即時文字先行。現況 E03–E11 提供程式與歷史自動化依據；所有新版交互與真人／真機表現仍待驗證。
