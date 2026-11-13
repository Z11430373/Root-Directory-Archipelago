# MiniGit：Ch6 受控歷史查證契約

版本：0.1｜2026-11-02｜狀態：**文件提案，未實作、未跑對照測試**。

目標：玩家能從小型 repository 的內容、親緣與可重做的測試，區分「哪一行最後被誰改過」與「哪一次改動首次使條件失敗」。不是完整 Git，也不是遊戲存檔分支引擎。

## 1. 基線、來源與所有者

- 決策依 [DECISIONS](../DECISIONS.md) D07–D11、D13。交付屬 M4／Ch6，但風險切片應先做有界研究，不能等到尾章才發現不可行；研究不等於 M0 真人關卡通過。
- [原規劃 §4、WP5](../source/《根目錄群島》完整版規劃書.original.md) 指定 `git log/blame/bisect`、`diff` 與 Ch6 仿 Git。
- [憲章](../../../world/charter.yaml) `patch_author`、`lin_touches_article_7`、`pending_amendment` 已知：Rev 5 提交者 lin，v4.7 的第七條最後修改歸屬 lin；條文作者 kestrel；草案被 CI 擋下。Rev 是憲章版次，v4.7 是世界版本標籤，不是 object ID。
- [SCRIPT 附錄](../../../SCRIPT.md) 與 [cast](../../../world/cast.yaml) 可驗以上事實；Ch6 完整查證流程、F8 差異檔正文與取得條件仍待作者。不能由 blame 推斷動機，更不能用 bisect 找「壞人」。
- **現況**：[Engine.execute](../../../demo-app/src/engine/index.js) 把 `git` 留給 flow；[demo flow](../../../demo/flow.yaml) 只有 B0 等故事指令，未提供 repository object model、blame 或 bisect。[SOURCE_GUIDE](../../../docs/SOURCE_GUIDE.md) 的 Python/Bash 參考不是 Git 參考實作。

| 所有者角色 | 責任／交付 |
| --- | --- |
| 引擎維護者 | revision parser、受控 object model、查詢與 bisect reducer、資源界線 |
| 內容工程 | repo fixture、版本與雜湊清單、predicate fixture、可讀錯誤 |
| 敘事作者 | 真實文本、提交摘要、揭露次序與 F8 gate；未確認資料不轉成正史 |
| QA／reference 維護者 | 固定 Git 環境、正負測資、合法替代解驗收、跨宿主重放 |
| 規格整合者 | 與章節包、Shell、schema 2、分支／知識證據契約定版 |

## 2. 三個領域不能共用 HEAD

| 領域 | 狀態、指令與效果 |
| --- | --- |
| 教學 MiniGit repository | Ch6 指定 VFS 根下的唯讀 commit/tree/blob/ref；`git log/blame/diff/bisect`。bisect 只切換教學檢視 revision。 |
| 遊戲時間分支 | `git checkout -b … ckpt/…`、`git merge --knowledge`、`git abandon`、故事 `git tag`、遊戲 reflog。這些是遊戲擴充；不聲稱是真 Git 語意。 |
| 遊戲存檔歷史 | schema 2 事件、檢查點與 SHA-256；不是 `.git` object，不能拿其 hash 當 repo revision。 |

**路由基線（COMMAND §7.2 已定）**：先以完整子命令文法區分。已知故事擴充永遠交時間分支服務；MiniGit 查詢依 cwd 尋找登記 repo，再驗 §4 的支援文法。repo 內的 DAG 查詢使用 `git log --topo-order --graph --all`；缺 `--topo-order` 回 MG_UNSUPPORTED，不 fallback 成時間線。repo 外僅已登錄的 `git log --graph --all` 走明示「遊戲時間線」；blame/diff/bisect 則 MG_NOT_REPOSITORY。畫面、輸出標題與 `help` 永遠列 `repositoryId / viewRevision / gameBranch`。模糊文法拒絕、不猜目標；教學 repo 不提供 `checkout`，bisect 自行持有 detached view。

`git merge --knowledge` 不執行 Git merge、不移動 repo ref；`git bisect reset` 不撤回世界事件或已讀知識；結局名稱 rebase/revert/merge/fork 也不等於取得相應 Git 寫入權限。

## 3. 有界資料模型與輸入界線

以下上限是**首個切片假設**，需以實測再定，不是已達成效能：每 repo ≤64 commits、每 commit ≤2 parents、≤32 refs、≤32 檔／tree、每 blob ≤64 KiB、所有去重 blob ≤2 MiB、單檔 ≤2,000 行。超限在章節包建置時拒絕；執行端仍檢查，不能無限載入。

| 記錄 | 必要欄位與不變量 |
| --- | --- |
| RepoManifest | `repositoryId, packVersion, objectFormat, referenceVersion, rootPath, objectsHash, supportedFeatures`；fixture 以 `objectFormat=sha1` 固定 Git object IDs，**不影響存檔 SHA-256**。 |
| Commit | 真 Git 產生的完整 `oid`、有序 `parents[]`、`treeOid`、author 與 committer 分開、各自 timestamp＋offset、message；parents 順序具語意，禁止自行按時間重排。 |
| Tree | repo-relative UTF-8 path → `{blobOid, mode}`；第一版僅一般文字檔 mode `100644`；禁止 path traversal、重複 path、大小寫碰撞。 |
| Blob | UTF-8 位元組、LF；保留末行是否有換行，不自動正規化空白。NUL／二進位、symlink、submodule 不納入此版。 |
| Ref | 完整名稱 → commit OID；支援 branch refs 與 lightweight tags；拒絕循環 symbolic refs、annotated tags／peeling。`HEAD` 指向預設 branch 或 bisect view。 |
| BisectSession | repo／版本、原 view、good/bad/skip sets、當前候選、predicateId＋version、已觀察結果、狀態；與 VFS working files 分離。 |
| EvidenceRef | repo／版本、commit OID、path、blob OID、行範圍或 diff hunk、predicateId/result（若有）、來源 actor 與驗證層級；引用須能回到原資料，不只存輸出文字。 |

提交圖須無環、所有 parent/tree/blob/ref 必須存在。跨 repo 同名 ref 不相等。壞 object／未知版本不可退化成空 repo 或補假 parent；返回 `MG_DATA_INVALID` 並保留玩家現有狀態。

### Revision 語法

- 接受完整 40 hex OID、唯一縮寫（至少 7 hex）、`HEAD`、明確 branch/tag 名稱。
- 支援 `R^`／`R^1` 第一親、`R^2` 第二親、`R~N` 連續 N 個第一親；`~0`／`^0` 表示該 commit。N 上限為 repo commits 數。
- 名稱同時是 branch 和 tag 時要求 `refs/heads/…` 或 `refs/tags/…`；縮寫碰撞為 ambiguous，不能選第一個。
- 要求不存在的第一／第二親、越過根、未知 ref 各報可區別錯誤；`^0` 是前述自身規則，不當成不存在的 parent。`R:path`、`@{…}`、`:/…`、`A...B`、revset 排除、任意 pathspec magic 不支援。
- `-- <path>` 的 path 是 repo-relative literal；此版不處理 glob／rename 跟隨。cwd 不在登記 repo 回 `MG_NOT_REPOSITORY`。

## 4. 指令語意矩陣

「支援」是下列明列文法；更多 Git 選項一律明示 unsupported，不靜默忽略。

| 指令 | 實際語意、輸出與限制 |
| --- | --- |
| `git log [--oneline] [-n N] [R]` | 預設 R=`HEAD`，從 R 走可達祖先；第一版無明示排序只接受線性 ancestry，沿親緣倒序，不用 author 名字或世界 Rev 排序。無 R 不代表所有 refs。空 repo 顯示「尚無 commit」。 |
| `git log [--oneline] --topo-order [--all] [--graph] [R]` | DAG 查詢入口。child 在 parent 前；`--all` 是所有登記 refs＋HEAD 可達集合，去重。graph 表達有向 parent 邊而非單純時間軸。tie-break 與字元輸出使用固定 reference fixture；可接受的拓撲排序見 §7。 |
| `git log -p [R] -- <path>` | 線性 ancestry，列 path 實際變更與各 commit 對其唯一 parent 的 patch；root 對空 tree。只有訊息變更不算檔案變更。遇 merge ancestry 拒絕，不能偷偷 first-parent 簡化。 |
| `git blame [-L start,end] [R] -- <path>` | 線性 ancestry，對 R 的既存行回溯，顯示最後引入該行的 commit、author、原始／目前行號。新增相鄰行造成行號移動不能錯歸給新作者；`-L` 為含端點的一基行號。不是整檔作者、不是最後一次 commit 的作者、也不是道德／法律責任。 |
| `git diff A B [-- <path>]` | 比較兩棵 tree 的內容快照；不要求 A 是 B 祖先，B→A 反向。顯示增／刪／改與 unified hunk；檔案順序固定 UTF-8 byte order。沒有變化 stdout 空、rc=0；有變化預設也 rc=0。 |
| `git diff --exit-code A B [-- <path>]` | 同上；無差異 rc=0、有差異 rc=1；錯誤是另一類，不把 rc=1 誤判執行失敗。工作目錄／index diff、rename detection 與三點 diff 不提供。 |
| `git bisect start <bad> <good>` | 建立線性可測區間，good 是 bad 的祖先且不同。至少有一個 good、一個 bad，兩者 predicate 同版；保留原 view，不改可寫 VFS。 |
| `git bisect good [R]`／`git bisect bad [R]` | R 預設當前 view；記錄使用者依測試觀察作出的分類，再縮小候選集合。R 必須在此 session 區間，矛盾分類拒絕且不丟原資料。標記本身不代表判題正確。 |
| `git bisect skip [R]` | 排除目前不可測 revision；不等於 good。若無法唯一定位，回候選集合 `INCONCLUSIVE`，不能假報「找到首個壞提交」。 |
| `git bisect log / reset` | log 列本次分類與順序；reset 結束 session、還原原 view；重複 reset 無副作用。 |

`-n` 必須為有界非負整數；`-L` 超範圍、不存在檔案、空 path 均明確報錯。`blame --reverse/-M/-C/-w`、`bisect run`、fetch/push/clone、任意 commit/rebase/merge/reset、hooks、外部 diff/textconv 都 unsupported。此版不讓玩家貼任意程式當 predicate。

**Merge DAG 邊界**：保留真實有序 parents，支援 log/graph 與指定兩個 tree 的 diff、`M^1/M^2`；blame、log -p path simplification、bisect 不跨 merge。不能把 merge 第二親丟掉再宣稱通過真 Git。未來若 Ch6 正文必需 merge blame 或 merge bisect，須先擴充 profile 與 reference 測資；不得由內容包越權開啟。

## 5. Bisect 的教學與狀態契約

### Predicate 不是作者搜尋

**非正史測試 fixture 提案**：8 個線性 commits，定義 `P(tree)=所有宣告引用在該快照都能解析`；測試回傳 good（成立）、bad（不成立）、untestable（資料版型不支援）。另設一行由作者 A 改措辭、由作者 B 的另一檔刪除引用造成 predicate 失敗：blame 該行與 bisect 結果刻意不同。

章節包登記純資料 predicate（如固定引用解析規則），「執行檢查」與已定捷徑 `git-check <predicateId>` 均送單獨 command.execute，零故事成本，依 COMMAND §7.2 核對 repo/view／版本後產生報告。**不能假裝 `git bisect` 自己會判定好壞**：檢查不自動分類、不發 F8/K7；玩家另送 good/bad。離線只允許內建、有界 evaluator，不能傳任意執行碼。

本版 bisect fixture 須證明區間為單一 good→bad 邊界；fixed bad endpoints 不代表中間單調。內容驗證器窮舉區間，若存在 good→bad→good 則拒絕此題，或改成逐版本診斷題。玩家可提出錯誤分類；系統記錄並提示與可重做報告矛盾，不發知識證據；不得無聲改答案。

| 狀態 | 觸發、guard | 動作／下一狀態／回饋 |
| --- | --- | --- |
| idle | start；有效端點、支援線性區間 | `active`，列區間與候選數，view 切到候選，故事虛擬鐘不推進 |
| active | 測試目前 view | 保持 active；輸出 good/bad/untestable 與原因，不自動分類 |
| active | good/bad；無矛盾、R 在區間 | 原子記分類、算下個候選；尚有候選→active；唯一→found |
| active | skip | 標不可測；仍可縮小→active；邊界無法唯一→inconclusive |
| found | 提交證據；boundary 前 good、該點 bad 有同版測試 | 發可查證 evidence；重複提交不重複獎勵；發現不等於 F8 或結局完成 |
| inconclusive | 查看候選／補測先前 skip／reset | 可補測恢復 active；取消回 idle，保留讀過的報告來源 |
| 任意 | 非法命令、資料缺損、取消尚未提交工作 | 無半次狀態更動；返回 error＋下一步，保留 last-confirmed session |
| active/found | reset／離開 repo | reset 還原 view；離開只暫存 session，回來提示當前 view，不暗自重開 |

## 6. 依賴與互動交接

依賴：[ENGINE_CONTRACT](ENGINE_CONTRACT.md)、[SAVE_SCHEMA_2](SAVE_SCHEMA_2.md)、章節包版本／完整性驗證、Shell AST dispatch 與分支隔離。§3 的 RepoManifest/BisectSession/EvidenceRef 是領域契約，不另建 save 根格式。

保存映射：`branches[id].runtime.miniGitStates[repositoryId]={schemaVersion:1,data}`，data 存原view、當前view與bisect session的有界規則狀態；唯讀objects由精確pack refs／blob閉包引用。未知子schema版本拒執行。共用dispatch使用Engine的inputId、expectedStateHash、branchId；時間只讀branches[id].storyTimeMs，MiniGit不加另一個鐘。

**ENG-SUB-DOMAIN 阻塞**：上述 data、minigit.changed.data、predicate report blob 的完整封閉 wire schema／bounds 尚待本領域細化；ENGINE 已定 minigit.predicateChecked 六欄與命令路由，不能因外殼有版本就接受任意 JSON 或宣稱 MiniGit 已可施工至發布。先補 schema／fixtures，再實作 evaluator。

§3 的 EvidenceRef 是**邏輯定位資料**：共同 EvidenceRecord 使用 `evidenceId,cardId,evidenceType,sourceRef,ruleId,contentSetHash`；sourceRef是`{lineageId,branchId,seq}`，evidenceId沿SAVE算法。repo/OID/path/行段/predicate結果由該ruleId、固定內容與來源journal的讀取／比對結果可回查；如需持久附件，先註冊有界blob payload並以標準hash引用，不把整個EvidenceRef直接塞入共用封閉record。self／peer／simulated依MERGE接收者視圖，不因讀到朋友的repo輸出升格。

資料流：`共用 Input → 命令 AST → repository resolver → bounded semantic evaluator → stdout/stderr/rc + viewDelta + 可定位結果 → Engine effects／標準證據 → SAVE journal`。只讀命令無VFS／世界操作，但可產生發現、evidence與seq；bisect改註冊runtime的view。只有UI背景query才是state/seq/journal全部不變，不能把預讀當玩家已閱讀。所有MiniGit命令故事成本0；若未來新增有成本動作，一律先推時間／scheduler再重查guard執行，沿Engine §5，不自定次序。transaction須由呼叫者序列化。

- 閱讀 log/blame/diff、man、設定、停留、失焦均免費且不前進主線鐘；計算較久時顯示「正在比較」及取消，取消不留下半個 session。
- 空 repo、未選 path、無差異分別顯示上下文；不存在／未載入 pack 不是「沒有歷史」。離線包缺失提供返回上一章／保留存檔；不聲稱已下載。
- 鍵盤 Enter 與既有命令捷徑共用 evaluator；清楚標示 repo 與遊戲 branch。更新結果不搶輸入焦點；用可讀短摘要通知候選改變，可再讀完整內容。無需音效或震動，不能用閃爍當唯一差異提示。
- 使用現有深色／高對比與系統字型；長 diff 可水平閱讀但保留行號／檔名。動作無必需動畫，減少動態時立即更新；新視覺 token／斷點不在本契約臆定。

## 7. 固定真 Git reference 與合法解

參考工具正名為 **upstream Git（GNU/Linux 環境）**，不是 GNU 專案的獨立「GNU git」。提案固定 **Git 2.47.2**；不可用開發機的任意最新版本代替。

reference manifest 必須記錄 `git --version` 完整值、binary SHA-256、OS／container image digest、fixture generator 版本、Git config 與輸入 bytes。建置 image digest／binary hash **尚未取得，屬啟動 reference 的阻塞**；本文件沒有安裝或執行此版本。

固定條件：`LC_ALL=C`、`TZ=UTC`、空白乾淨 HOME／system config、`core.autocrlf=false`、`core.quotePath=false`、`color.ui=false`、pager 關閉、mailmap 關閉、diff algorithm=myers、indent heuristic 關閉、rename detection 關閉；禁用 hooks、外部 diff、textconv、replace refs。固定 author/committer 身分及日期，不使用現在時間。reference harness 僅執行可信 fixture argv，不把玩家原始命令交宿主 Shell。

三類 oracle 分開：

1. **精確輸出**：線性 log、已登記 blame porcelain、固定 patch profile、rc／錯誤分類。保留原始 reference 輸出；若 UI 格式另排，先做明列的 parser projection，不能刪掉有意義空白以「通過」。
2. **語意對照**：DAG 可達集合與 parent 邊、diff 還原 B tree、blame 的來源 commit/行。拓撲合法的不同 tie order 不算錯；本引擎同版同輸入仍須選固定 tie-break，原始 Git 順序與 MiniGit 順序都存測資以供追查。
3. **任務解法**：可先 diff 再 log、可不同順序讀取、bisect 可合法挑另一個中點；判定 evidence 指向同一可驗證 boundary／內容，不比對整段指令字串或最少步數。不要求不同合法解得到相同事件鏈尾；要求各自都可原序重放、狀態效果符合自己的事件。

同一事件序列＋repo/engine/predicate 版本＋seed，瀏覽器與 Node 的語意投影／state hash 必須一致。不得以玩家輸出文字自證答案，也不得把 repo object hash 誤當真人證明。

## 8. 小切片、風險與停止條件

| 時點／責任 | 可獨立交付的小 slice | 停止／縮減規則 |
| --- | --- | --- |
| M0 有界可行性研究／引擎＋QA | 一個非正史 8-commit 線性 repo，行號位移、重複行、刪檔／新增、bisect 與 blame 結果分離；reference 設計與成本估算 | 若 parser／行歸屬不能和固定 reference 對齊，先縮減資料 profile，不能偷偷把 blame 寫成作者查表 |
| M1 介面切片／存檔 owner | 中途 bisect 匯出匯入、取消、branch restore 互不污染 | 未能精確恢復 view／evidence version，禁止把 MiniGit 放進必經敘事 gate |
| M2 前／內容＋QA | 加一個雙親 merge，只驗 log／tree diff 與 unsupported 邊界 | 超出有界上限或需要完整 Git 才成立，退回受控唯讀 archive 查證設計並交整合者裁決，保留 Ch6 學習目標 |
| M4／作者＋QA | 作者核定的憲章／備份 fixtures、劇透 gate、主線替代通關路徑 | 正文缺漏阻止敘事發布；不能從演算法 fixture 自造 F8／K7 真相 |

## 9. 驗收（均未執行）

| ID／所有者 | 正例／操作 | 反例或突變與必須結果 |
| --- | --- | --- |
| MINIGIT-01／QA | 同版 fixture 的 commit/tree/blob/ref 引用全可解析 | 缺 parent、循環 DAG、偽 OID、越界 path → 建置與載入拒絕，不修補資料 |
| MINIGIT-02／引擎 | `R^2` 到第二親、`R~2` 沿第一親兩次 | 把 parents 排序、`^2` 當祖父 → 對照失敗；未知／碰撞 ref 無狀態更動 |
| MINIGIT-03／QA | log 列正確可達集合；兩種合法 topo tie order 都可判語意等價 | 輸出遺漏第二親、以 timestamp 猜 parent → 失敗；無明示排序的 DAG 查詢回 unsupported |
| MINIGIT-04／QA | 新增首行後，未改舊行仍 blame 原 commit／author | 把整檔最後提交者套每行、把 committer 當 author → 失敗 |
| MINIGIT-05／QA | diff A B、B A、空檔／缺尾 LF／刪檔，套 patch 可重建目標 | 把新增和刪除顛倒、吞末行、rename 自作推論 → 失敗 |
| MINIGIT-06／引擎 | `diff --exit-code` 差異 rc=1 可被管線使用 | 把差異當執行錯誤或無差異當 rc=1 → 失敗 |
| MINIGIT-07／QA | predicate 有唯一邊界；另一個合法中點路徑也定位它 | 只按作者／訊息選「壞提交」、good→bad→good fixture → 不得發通過證據 |
| MINIGIT-08／QA | skip 無法唯一定位時列候選，可 reset／補測 | 把 skip 視為 good、矛盾標記覆蓋舊結果 → 失敗 |
| MINIGIT-09／引擎 | merge log/graph、`diff M^1 M` 成功 | merge blame／bisect、hook、網路、任意執行 → 明確 unsupported，零副作用 |
| MINIGIT-10／存檔 | bisect 中途保存／載入、取消／重試，語意與 view 一致 | 換 pack／predicate 版本重放 → 版本錯誤／遷移入口，不沿用舊結果 |
| MINIGIT-11／QA | 不同合法查詢順序、輸出格式、解法都能提交可重放 evidence | 必須逐字等同唯一 walkthrough 才過題 → 驗收失敗 |
| MINIGIT-12／引擎 | bisect reset 只還原 repo view；knowledge merge 只回傳證據 | 移動遊戲 main、攜回教學檔或重寫故事選擇 → 失敗 |
| MINIGIT-13／QA | 長時間讀 log、開 man、失焦不推主線鐘；鍵盤可取消 | 打字速度決定 bisect 失敗、動畫擋輸入 → 失敗 |
| MINIGIT-14／作者 | Ch6 引用對得上來源版次，Rev／v4.7／OID 有別 | 將 blame 當判決，或未確認 F8 細節標成正史 → 內容驗收失敗 |
| MINIGIT-15／QA | 固定 reference 版本＋hash 可重建精確 fixture | 只寫「真 git 通過」沒有 argv／環境／輸入／輸出 → 證據不足 |
| MINIGIT-16／存檔 | 已註冊runtime.miniGitStates子schema及objects閉包可跨宿主還原；查詢閱讀有標準來源引用 | 自訂HEAD改遊戲branch、未知子schema被當任意JSON略過、背景query發卡 → 失敗 |

## 10. 整合裁決清單

1. **MG-O01／規劃已解、實作待驗／引擎整合者**：COMMAND §7.2 已定完整 extension→cwd repo→MiniGit profile 驗證、repo外時間線及 git-check；本文件§2/§5已同步，不再有兩個路由方案。man／錯誤與跨服務負向fixture仍待實作。
2. **MG-O02／高／敘事作者**：取得 Ch6／F8／K7 正文與所有必要條件；目前只能做非正史技術 fixture。
3. **MG-O03／中／QA**：批准固定 Git 2.47.2 reference image 與可分發測資授權；選版本是提案，不是已建置證據。
4. **MG-O04／高／章節包 owner**：若正文必需 DAG blame／bisect，先擴 profile／工時，再核章節；不能降低語意驗收或假稱完整 Git。
