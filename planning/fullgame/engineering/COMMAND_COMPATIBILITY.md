# 命令相容性：GNU 子集與遊戲擴充

版本：0.2-draft｜2026-11-02｜**規劃基線，未實作；對照、性能與跨版本向量均尚未執行**。

本文件是命令拼法、支援範圍、排序與錯誤語意的權威。世界／時間／交易由 [ENGINE_CONTRACT](ENGINE_CONTRACT.md) 管理，格式與 hash 見 [SAVE_SCHEMA_2](SAVE_SCHEMA_2.md)，能力宣告見 [CHAPTER_PACK](CHAPTER_PACK.md)。不將「模擬 Bash」當成完整 Bash、GNU/Linux 或真實網路環境。

## 1. 現況邊界與相容策略

已讀 `demo-app/src/shell/{parse,exec,commands,bre}.js`、`src/vfs.js`、`src/engine/index.js`、`src/ui/shell-job.js` 及 [`ENGINE_REQS.md`](../../../ENGINE_REQS.md)。現有 parser／commands 是原生 JS；`build.mjs` 包入單檔 HTML；TS 命令 registry 尚待實作。

| 現況事實 | 不能據此宣稱 |
| --- | --- |
| parser 支援引號、部分展開、`\|`、`&&`、`;`、`>`／`>>`，拒 command substitution。 | 完整 shell grammar、process/job control、任意變數／腳本執行。 |
| `ls` 接受 alitr，mtime 為 metadata 字串；檔案 operands 仍先依名稱排序。 | 所有 GNU `ls -t` 排序／mtime 更新／tie 語意已完成。 |
| `sort` 實體化所有行，以 JS Number 做 numeric 比較，`-k` 是簡化取欄位。 | 任意精度 GNU numeric sort、多 key、百萬行 2 秒已實測。 |
| `cut -b/-c` 共用 Array.from 字元切片，BRE 翻成 JS RegExp。 | `LC_ALL=C` bytes 語意與所有 GNU regex 細節一致。 |
| pipeline 用 iterator，單管線各站 cwd 隔離但共用候選 VFS；Worker cancel 由 Engine 回滾整筆。 | 真 Bash 的並行時序與中斷寫檔回滾。 |
| `who/wall/submit/fsck` 等在來源需求中，許多故事指令由 flow 接管。 | 列在白名單／YAML 就代表一般 Shell 已實作完整能力。 |

新 profile ID：`ra-shell/1`。以「**宣告子集內與固定 reference 一致**」為目標，已知偏差不是放寬 oracle 的理由。legacy profile 凍結舊行為供舊存檔／walkthrough；新 profile 修正須列差異向量，不拿舊 ID 逐位相同作新語意驗收。

## 2. CommandDescriptor、入口與結果

| descriptor 欄位 | 定義 |
| --- | --- |
| `name` | 命令名稱。 |
| `family` | `gnu-subset`／`bash-subset`／`game-extension`／`minigit-subset`／`session-control`。 |
| `profileVersion` | 精確語意版本。 |
| `grammar` | 可解析的命令文法 ID，選項、重複選項、operand 數量皆封閉。 |
| `requiredCapability` | engine registry 已支援的 capability ID；pack 不可自行宣告執行碼。 |
| `worldAccess` | `read`／`write`／`branch`／`none`。read 仍可有閱讀／解題證據。 |
| `timeActionId` | null（零故事成本）或 pack.timePolicy 登錄的 action ID。 |
| `referenceProfile` | 固定 reference ID 或 null；extension 不假掛 GNU。 |

可解析 descriptor 範例（不是已建 registry）：

```json
{
  "name":"ls",
  "family":"gnu-subset",
  "profileVersion":"ra-shell/1",
  "grammar":"ls-alitr/1",
  "requiredCapability":"fs.list",
  "worldAccess":"read",
  "timeActionId":null,
  "referenceProfile":"gnu-c-utc/1"
}
```

執行結果邏輯形狀：`{stdout,stderr,rc,readEvents,writeEvents,dataflowRef}`。stdout/stderr 是 bytes stream，完成後各有 `{blobHash,byteLength}`，不是先累積巨大 JS string；UI 可有截斷視圖，judge/hash 必須看未截斷原 bytes。rc 是 0..255；exception／cancel 與普通 rc 分開。readEvents 依 ENGINE 的讀取當下 inode 快照；writeEvents 是 typed VFS mutation，不能由玩家自填。dataflowRef 為 null 或本次 `ticket-provenance/1` canonical trace 的raw blobHash，沿ENGINE §4.2提交到externalFacts／blobs；不是另一個graph權威。未定op.params等子schema按ENGINE §8.1阻塞，不能先產任意JSON當typed evidence。

## 3. Shell 文法與固定 bytes profile

### 3.1 baseline

- `LC_ALL=C`、`TZ=UTC`、無 color/pager；text tools 的排序、regex 字元類、欄位及 whitespace 依下述 bytes profile。VFS 可以保存一般 Unicode／任意 bytes；canonical JSON 規則不等於文字工具語意。
- 檔名與 shell source 是合法 UTF-8；shell token 分隔只認 ASCII space/tab 與未被引號保護的 LF。不把 NBSP／全形空格當 ASCII 分隔，不 trim 玩家原始對話值。
- text tools 基線使用無 NUL 的 bytes stream；遇 NUL 回 `CMD_BINARY_UNSUPPORTED`（rc2），不宣稱 GNU binary-file 自動模式。UTF-8 多 byte 內容原樣通過；`cut -b` 可產生非完整 UTF-8，UI 以安全預覽顯示，但 stdout bytes 不可被改寫。GNU C locale 的 `cut -c` 在本 profile 按 byte，不依 JS code point。
- 單行上限 64 KiB bytes、命令原始 UTF-8≤16 KiB；最多 256 tokens、32 pipeline stages、64 commands／一筆腳本；超限為引擎資源失敗，整筆回滾。所有界限為提案 profile 值，待量測後版本化，不靜默截斷。

### 3.2 支援／拒絕文法

| 文法 | 新 profile 行為 |
| --- | --- |
| 單引號／雙引號／反斜線 | Bash 子集；單引號全 literal；雙引號只在 Bash 規定的 `$`、反斜線等處處理 escape；空字串 operand 保留。 |
| `~`、`$HOME`、`${HOME}`、`$?` | 只支援這些展開；單引號／escape 禁止展開；展開一次，不讓 VFS 再次解釋 quoted `~`。不提供一般 assignment／field splitting。 |
| `*`、`?`、`[...]` | 未引號的 pathname expansion，C byte order；預設不匹配 dotfiles，顯式以 `.` 開頭才匹配；未匹配保留 literal。 |
| `\|` | 串流，下游提早結束必須關閉上游 iterator；exit status 為末站，無 pipefail。 |
| `&&`、`;` | 依序執行；&& 僅前 pipeline rc0 才執行下一個。 |
| `>`、`>>` | 依原始次序開啟每個目標；`>` truncate、`>>` append；父目錄必須存在，不偷偷 mkdir。 |
| `--` | 每個支援工具以它結束選項；`-` stdin operand 僅在工具明列處有效。 |
| `#` | 只在未引用的新 token 開頭作 comment；引號／token 中的 # 是文字。 |
| 引號外 LF | UI 批次拆成逐筆 command input，逐條 await；引號內 LF／反斜線續行保留。進入 choice／dialogue／ended 立即停批、剩餘留草稿。 |
| `||`、`&`、`<`、`<<`、fd 重導向、subshell、functions、loops、arithmetic、process substitution、command substitution、backticks | 明示 `CMD_SYNTAX_UNSUPPORTED` rc2，parse 全段後才動 VFS；不能落到宿主 shell。 |
| 未知 `$NAME`／`${...}`、brace expansion、`**` | 明示不支援，不能看宿主環境或猜 bash 展開結果；quoted literal 保留。 |

一行含 `;` 是同一 transaction；多行貼上拆出的各行是不同 transaction。第 k 行取消只撤第 k 行與停止後續；k−1 行已提交。legacy parser 把 LF 當空白的行為保留在舊 profile，不能以全域 replace LF→space 實作新版。

D24的跨命令`$?`讀取`branches[activeBranchId].runtime.shellStatus`，不是terminal物件或journal最後一筆。新／legacy／template初始化0；checkpoint fork複製來源值。每個pipeline在啟動時固定上一status供各站展開，完成後只以末站rc更新父shell；`;`／實際執行的`&&`下一段再展開更新值，短路不改值。空白／純comment input不產command.completed且保留status；parse error2、unknown127與普通非零結果成功commit後均保存。typed-only捷徑、query及非shell Input保留status；cancel／核心拒絕／durable失敗回滾。離開分支恢復main自己的值，compact／reload必完整保持。`grep -q absent /work/source.txt`的rc1之後，直接或compact／換宿主再`echo $? > /work/status.txt`均應寫`1\n`；同腳本與pipeline反例列ACC-17，尚未執行。

### 3.3 正常失敗、寫入與取消

`echo x > a; missing` 正常完成、rc127，a 保留；`missing > a` 的重導向按 Shell 開檔規則仍可能建立／截短 a。未知命令輸出只到 stderr（`bash: missing: command not found\n`），不能偽裝 stdout 解題結果。語法錯誤先於執行，整段不開檔。

已知工具不支援選項是正常 command error；前一個 `;` 命令的寫入仍保留，不誤稱整段沒做事。核心資源失敗／cancel 才回滾整個 input，含 redirections、flags、PRNG、clock、evidence。這是**遊戲原子取消 extension**，真 Bash 的 Ctrl+C 不撤銷已寫檔案。

管線各站 cwd 局部（`cd /x | pwd` 不改玩家 cwd），共用該交易候選 VFS。對同一 inode 的 pipeline 並行讀寫有真 shell 排程歧義，`ra-shell/1` 在執行前拒 `CMD_PIPELINE_RACE`；不得用穩定的單執行緒模擬結果冒稱 GNU 唯一結果。普通重導向如 `cat a > a` 使用開檔先 truncate 語意；跨站競爭 fixture 另列拒絕，不列精確 GNU 對照。

## 4. GNU／Bash 子集矩陣

以下皆是**要交付的支援合約，不是現況通過清單**。pack 只可引用已驗收 capability；未完指令回 unsupported，不留成功空輸出 stub。

| 命令 | 支援的最小文法 | 精確邊界／反例 |
| --- | --- | --- |
| `ls` | `-a -l -i -t -r` 可合併、多路徑、`--` | 依 §5 mtime 與 tie；未知 flags 拒絕。長列使用固定 UTC／long-iso 顯示 profile，不受目前日期切換年份格式。 |
| `pwd`、`cd` | pwd 無選項；cd 零或一 path，`~ .. /` | 無 symlink profile；cd 單命令改 cwd，pipeline 局部。`cd -`／stack 不支援。 |
| `cat` | 零或多檔／`-` stdin；`-u` no-op | 不補檔案尾 LF；多檔原 bytes 串接。`cat -n` 等未列選項拒絕。 |
| `grep` | `-r -R -c -n -v -i -l -h -H -q -F -e PAT -m N`、BRE；Ch3 可另登錄 `-A N` | rc0 有 match、rc1 無、rc2 error；此版無 symlink，r/R 同 traversal，含隱藏檔。`-s` 若實作須真的抑制檔案診斷，否則拒，不可悄悄忽略。 |
| `head`、`tail` | `-n N`、`-N`，N≥0，多檔、`-` | 主線最小子集只承諾非負行數；`-c`／`+N`／負數形式須獨立 capability 向量，不因 legacy 有分支就宣稱全支援。 |
| `sort` | `-r -n -s -u -t D -k KEY`（單 key），多檔、stdin | KEY=`N[.C][nr][,M[.D][nr]]`；重複 -k／多 key／-V/-g 拒絕。正確 field 及精度見下。 |
| `uniq` | `-c -d -u`，零或一 input | 只合併相鄰相同行；-c 的空格寬度對照 GNU；第二個 output operand 不支援，使用 >。 |
| `cut` | `-d D -f LIST -s`；獨立 `-b LIST`／`-c LIST` | D 恰一 byte；LIST 1-based 範圍／逗號／開尾，倒置／0 拒；不同 selection family 混用拒。無 delimiter 行除 -s 外原樣通過。 |
| `wc` | `-l -c`，零或多檔 | -l 計 LF bytes，非「顯示行數」；無尾 LF 不多算。-m/-w 另 capability，不能用 JS `\s` 冒充 C locale。 |
| `echo` | 無選項或前置 `-n` | 不解譯反斜線；-e/-E 明示不支援，不冒充 Bash 完整 echo。 |
| `ln` | `[-f] source dest`，只 hardlink 普通檔案 | 同 device 才能連，詳 §6；目的為目錄時使用 basename；`-f` 先驗有效 source 再決定取代，不能來源不存在仍刪 dest。 |
| `rm` | `-r -R -f`，多 operands | 主線 root/home/ancestor 保護為 extension；解析所有危險 targets 後整批拒絕，不先刪安全 operand。 |

`sort -n` 在 C locale 以 decimal 字串比較（ASCII blanks、可選 `-`、數字與 `.`）；不用 Number 浮點，長整數／小數不失精度；`+`、指數不是 -n 數字格式，按 reference 的非數值前綴規則處理。key 相等預設整行 C bytes 作 last-resort compare；`-s` 保留輸入次序；`-u` 按有效 key comparator 判重（不能把整行 fallback 當作「key 相等但仍不去重」）。reverse 與 key-specific r 的優先按固定 GNU fixture，不能臨場猜 XOR。

`-k` 的欄位界線需實作 GNU 定義：未指定 -t 時欄位包含前導 blanks，位置從欄位開始計；指定單 byte -t 時相鄰 delimiters 可產生空欄。不得 trimStart().split(/\s+/) 代替完整合約。若 M1 尚未完成 character-position keys，可將能力縮成明列更小子 profile、讓內容不使用它；不能收同文法卻輸出錯義。

BRE 基線：`^ $ . * [...] [^...]`、escaped literal、已登錄 POSIX C classes、受限 `\{m,n\}`；裸 `()+?{}|` 在 BRE 是 literal。群組／backreference／GNU extensions 只有獨立測資與有界 matcher 後才開放；未知 escape 回 unsupported，不直接拿 JS RegExp 猜。`-i` 只按 C locale ASCII case fold，不做 Unicode toLowerCase。`-E` 與 Ch3 `-A` 屬明示擴充 capability，未登錄時拒絕。

`grep -A N` 的 Ch3 工作包須處理相交 context windows 去重、match/context 行號分隔、群組 `--`、多檔 prefixes，不能只多印 N 行便宣稱 GNU 相容。無結果不等於來源檔不存在；stderr 與 rc 分開。

## 5. mtime 排序與證據保全

採 D11；來源 [`world/fragments.yaml`](../../../world/fragments.yaml) 和 ENGINE_REQS 仍寫 link_time，本輪只立新合約，不更改來源。

1. `ls -t` 依**檔案 inode 的 mtimeMs 降冪**；相同 mtime 依名稱 C UTF-8 bytes 升冪。`-r` 反轉整個有效排序，故 `ls -ltr` 是 mtime 升冪、同時戳名稱降冪。多個 file operands 也用同排序；不能只有目錄內容正確。
2. bytes comparator 不用 localeCompare；合法 UTF-8 scalar 名稱的順序與碼點 lexicographic 相容。目錄 header／檔案組順序沿固定 reference fixture，`-l` 顯示到分鐘不代表比較精度只到分鐘。
3. 每片 F1..F8 是各自 inode；同片不同名稱共享 mtime。建立第二個 hardlink 不改 file mtime，更新 shared ctime 與父目錄 metadata；ctime 也不代表建立時間。
4. 寫入內容改 mtime 為虛擬 epoch＋當前 storyTimeMs；零成本的兩次寫入可能同 ms，不能加牆鐘或假時間避免 tie。`ls -t` 不讀單獨 link creation log。
5. F2 `fsck` 恢復 entry／原 inode 時保留有來源的 original mtime；真的內容修補要明示是否恢復來源 bytes／metadata。匯入 schema2 保留現況 mtime；legacy 模板重建標來源快照時間，不能聲稱恢復了未保存的玩家編輯歷史。
6. PACK 的 `fragmentSource` 與不可變 evidence snapshot 保留原始 bytes／mtime／來源版本。live 檔案被玩家修改後，顯示目前值及可查來源；不得靠靜默修正 mtime 保證解題順序。
7. 若劇情需要唯一先後，tie fixture 必須被內容驗證器指出；補充分辨證據由作者提供，不以 F 編號偷排。mtime 只能作檔案內容版本的時間線索，**不能證明 lin 的硬連結藏片行程**，也不能自行消除 CI／貓罷工的 N12 時序缺口。

正反對照必含：a/b 同 inode、a/c 不同 inode 同 mtime、建新 link、寫內容、F2 修復、schema2 roundtrip、legacy 重建、正確與刻意錯誤 source time。原始證據與現況排序各有 expected，不把其中一份覆蓋另一份。

## 6. Hardlink、island 與遊戲引用

採用**工程基線**：一 island 一 device；這不是已取得的故事正史，須與敘事主筆確認地理／檔案系統比喻。VFS 保留 deviceId，將來若核定多 island 同 device，須有版本化 mount policy 與跨章 fixture；不能只因「渡海」推斷真 Unix 裝置。

- 真 hardlink 身份是 `(branchId,deviceId,inodeId)`；同一裝置內多 path 共用內容、mode、mtime、read-only 與 link count。跨 device `ln` 回 rc1／`CMD_CROSS_DEVICE_LINK`，對應 EXDEV 語意，不複製檔案假裝連結。
- `ssh <island>` 只切換虛擬 mount／主機上下文，不發 TCP；回原 island 的檔案還在。相同路徑字串在兩島不是同一檔。
- 全群島收藏可採遊戲的**引用 token**（指 island/device/inode/content hash 的版本化來源）或明示複本，但不得把 token／copy 叫 POSIX hardlink。1.0 `ln` 只在當島 `~/keep/` 建真連結；跨島總覽聚合已持有 token，不能拿另一島來源直接 `ln` 成同 inode。
- token 的取得／GC 保護語意需內容登錄：只對來源仍存在的引用是否算持有、source 被 unlink 後是否保留收藏，都不能憑工程自行當成 F1–F8 正史。發布關卡必須有可達的主線取件流程。
- 分支的 hardlink 只保護其分支；knowledge merge 不帶回實體 inode、碎片持有或物品權限。複製 bytes 不代表複製來源身份／歷史證據。

此基線在 [NARRATIVE_DEBATE N09](../reviews/NARRATIVE_DEBATE.md) 的「島是否不同 filesystem」問題仍待作者映射確認；ENGINE/SAVE 的 device 欄位不預先寫死敘事答案。

## 7. 遊戲 extensions 與 session-control

| 命令 | 明示語意／路由 | 限制 |
| --- | --- | --- |
| `man <topic>`、`man -k <term>`、`man 7 solution` | 遊戲內唯讀手冊／主動解法展開；時間0 | 不呼叫 OS man；不能自動展開全解或收主線提示費。 |
| `mail`、`finger harbor-master` | 已宣告 VFS／NPC 資料 | `mail` 不送信、finger 不碰真網路；讀取可記故事證據。 |
| `who`、`wall` | 自己／NPC／有來源交換足跡；wall 的離線便條與線上預定義交班分開 | 原 wall 廣場構想保留相容性註記；未做連線時不得說已廣播給真人。自由線上聊天不在1.0。 |
| `systemctl start lamp`／`status lamp` | 固定故事服務與口令流程；status 時間0 | 不是主機 systemd，不接受任意 service。 |
| `ssh <island>` | 版本化渡海動作，成本讀 pack | 不執行 host SSH、不接受任意 URL／port。 |
| `fsck [-y] <root>` | 指定關卡的診斷／修復 reducer；-y 才改世界 | 不執行 OS fsck；F2 修復 mtime／inode 要有 fixture。 |
| `sudo`、`close TICKET-0001` | 原故事拒絕／對白，應保留原內容來源 | 不提升宿主權限；close 的故事權限失敗不是程式 judge verdict。 |
| `submit <path>` | TICKET_JUDGE 按已選 route 處理 | 無 Python runtime 回不可用；不能以程式碼字串比對假 AC。 |
| `hint`、`skip` | 免費引導／主動代辦 preview；skip 綁 ticket/邀請與 state revision | 不用十秒閱讀期限；代辦／略過不能造親自驗證、K0/K1 或 AC。 |
| `git checkout -b <name> [ckpt/…]`、`git merge --knowledge`、`merge --knowledge`、`git abandon`、故事 `git tag`／`reflog` | 遊戲時間分支服務 | 非真 Git checkout/merge；只帶合格知識，缺 snapshot 不假還原。 |
| `iptables`／`fw` | B1 受控 firewall reducer；CIDR 必須以32-bit正確比對 | 僅在宣告分支作用；不能改真防火牆，/24 不能只比 IP 字串前綴。 |
| `edit <path>` | 遊戲編輯器入口；開啟是 query，套用只送 `file.edit {islandId,path,expectedContentHash,content}` | inline UTF-8≤64 KiB、時間0；覆寫驗state／content hash及inode權限，工單工作檔產literal→write trace與ticket.provenance.recorded，不產計數證據。 |
| `game time status`／`game time advance --ms <N>` | 前者 query；後者映射 `time.advance`，N為十進位正整數 | 不把 Bash `wait` 偷改成世界時間；成本與最大值由 ENGINE/PACK。 |
| `game confirm <confirmationId>`／`game cancel <confirmationId>` | 接受／取消具名 preview；確認綁定 expectedStateHash、對象與 action kind | 不是任意執行 token；狀態變更後需重新 preview。 |
| `game mode`、`game save`、`game import`、`game help`、`game exit` 等既有 session 指令 | UI/session adapter，完整子命令清單沿既有 Bash notes 再版本化 | 不送給 shell 當世界命令；匯出／設定不推故事鐘。 |

`file.edit` 精確payload與TICKET §5.2／ENGINE §3.2一致；不以內容hash代替inline content，不把開editor當玩家已讀。`edit <path>`由session adapter開啟查詢視圖，apply才記一筆typed input；不可再重複記command.execute，也不能嵌在pipeline／`;`／`&&`裡。來源 `game` 指令原屬 UI adapter，這兩個新增時間命令仍由 adapter**轉成同一 typed Input**，按鈕不能走直接改 clock 的捷徑。

### 7.1 D19/D20 的具體拼法與 typed mapping

| 拼法／按鈕 | 唯一對應 | 守衛／效果 |
| --- | --- | --- |
| 邀請選項「稍後調查」；Bash `game choose branch.offer.B0 defer`（B1同形） | `choice.select {choiceId:"branch.offer.B0",optionId:"defer"}` | main且該choice可用；只加對應deferred，無done、無K0/K1。game choose只是session adapter，不是Bash內建。 |
| `git checkout -b NAME ckpt/ID` | adapter從pack選scenario後建立`branch.create {branchId,scenarioId,source:{kind:"checkpoint",checkpointId,checkpointStateHash}}` | checkpoint必可讀且完整hash固定；省略ckpt僅使用當前邀請明示的default entry，無default則報錯。legacy模板入口使用source.kind=template-entry，輸出明示新模板非過去還原。 |
| `git merge --knowledge`／`merge --knowledge` | `branch.leave {mode:"merge-knowledge"}` | 先驗證據，再只套對應exitSummary done、合格知識與回main；不足則留原branch。 |
| `git abandon` | `branch.leave {mode:"abandon"}` | 返回main並套對應done，無卡／物品攜回。 |
| `git tag NAME` | `command.execute` 的branch.tag reducer | NAME為1–64 ASCII `[A-Za-z0-9._/-]+` 的邏輯名稱，不作磁碟path；重名`CMD_TAG_EXISTS` rc1，不能覆蓋。保存輸入前snapshot與tag，留在目前branch。 |
| `ssh cronmine`／地圖「回訪排程礦坑」 | 都送`command.execute {raw:"ssh cronmine"}` | main當前世界旅行，依pack route/成本；不讀checkpoint、不重置其他島。B3b另開分支；F5只在main合法取件。其他島同登錄route grammar。 |
| `ending prepare`／結算檢視按鈕 | `command.execute {raw:"ending prepare"}` | 經核定完整policy後pin beforeState快照，成功才開story.ending；未知正文不可啟用。 |
| `game choose story.ending return-investigation` | `choice.select`同名choice/option | 關review回當前main；不restore，之後可ssh補訪。 |
| `game choose story.ending ENDING_ID`／最終確認按鈕 | `choice.select`，optionId為已核定ID | 完整條件＋expectedStateHash＋pinned snapshot可用才提交；未核定ID不提供、不推測。 |

adapter處理 `git checkout/merge/abandon` 的typed轉換必須保留使用者原輸入作非權威顯示，而journal.input以**最後typed input**為唯一重放資料；不得同時再記一筆command.execute以免重做。`ssh`、`git tag`、`ending prepare`本身則是command.execute的已登錄extension。GNU pipeline／`;`內不接受這些跨世界流程指令：回 `CMD_SYNTAX_UNSUPPORTED`，讓一次選擇只有一個明確目標；普通文字工具仍可串接。不增加另一組chapter travel/tag/ending根schema。

### 7.2 MiniGit 路由裁決

採 [MINIGIT_SPEC](MINIGIT_SPEC.md) §2／§4 收斂後的固定順序：

1. 先按**完整、無歧義 extension 文法**判 `git checkout -b ...`、`git merge --knowledge`、`git abandon`、故事 `git tag NAME`／`git reflog`，交時間分支服務；即使 cwd 在 repo 內也相同。`git log` 不列入此優先覆蓋清單。
2. 其餘 `git log/blame/diff/bisect` 先以 cwd 解析登錄 repository；若在 repo，交 MiniGit，**再驗該 MiniGit profile 文法**，不得因驗證失敗 fallback 成遊戲時間線。
3. repo 內 DAG 查詢的合法形式為 `git log --topo-order --graph --all`（旗標次序可依parser正規化）；`git log --graph --all` 缺 `--topo-order` 回 `MG_UNSUPPORTED`，附合法用法，不能當成已支援的 DAG 查詢。
4. repo 外僅已登錄的 `git log --graph --all` 走明示「遊戲時間線」的查詢；repo 外 blame/diff/bisect 回 `MG_NOT_REPOSITORY`，其他模糊文法拒絕。不得同時觸發兩服務。

MiniGit 不提供 repo checkout 或真正 write repo 操作；其 oid 與 save commitId 完全不同。Git 2.47.2 reference仍是候選，image/binary digest未取得，維持MINIGIT的後續spike，不在本輪安裝或聲稱對照通過。

**必要 predicate 動作定名：`git-check <predicateId>`**，family=`game-extension`、capability=`minigit.predicate-check/1`、時間0，輸入是單獨的 `command.execute`，不得放進pipeline／`;`。

- cwd必須在登錄repo，predicateId必須由該repo的固定pack宣告，版本與viewOid一起凍結。以input.expectedStateHash驗目前view／bisect session；不接受任意命令、Python、path-to-executable或 `git bisect run`。
- reducer以目前view tree執行內建有界predicate evaluator，回 `good`／`bad`／`untestable`＋原因／reportHash；結果記入對應runtime.miniGitStates的已觀察結果，發 `minigit.predicateChecked`。不自動替玩家執行 `git bisect good/bad`，也不發F8/K7或結局。
- report的來源包含repositoryId、完整viewOid、predicateId/predicateVersion、固定內容集；referenceHash／evidence按MINIGIT schema保存。未知predicate回 `MG_PREDICATE_UNKNOWN`，版本不符回 `MG_VERSION_UNSUPPORTED`，技術資源錯誤不是bad，cancel撤銷本次report／session效果。
- GUI「執行檢查」同樣送上述command，按鈕不走第二套 evaluator。測試fixture可用 `git-check references.resolve`；這只是非正史predicate ID示例，不宣稱Ch6正式題已定稿。

### 7.3 後續章節 capability，不預先冒稱可用

Ch2 `chmod/id`、Ch3 `find/grep -A`、Ch3.5 `crontab/at`、Ch4 `ping/traceroute`、Ch5 `ps/top/kill`、Ch6 `tar/gzip/zcat/diff` 必須各交 descriptor、效果 schema、資源界限與正負 fixture 才能登錄。網路／程序／排程一律是遊戲 extension；`tar/gzip/diff` 若宣稱標準檔案語意，須提供真格式 bytes 對照，不能以「.gz 標記但實存明文」當真正 gzip 相容。現有 ENGINE_REQS 容許該捷徑只保留 legacy／明示遊戲 profile。

## 8. Reference harness 與判題接點

提案固定 Bash 5.2.37、GNU coreutils 9.5、GNU grep 3.11，`LC_ALL=C,TZ=UTC`；**尚未取得 binary/container digest、尚未安裝／執行，須由 QA 在開始向量前固定**。若環境供應不同版本，先更改 referenceProfile 與差異表，不把本機任意版本稱已驗證。

每個 fixture 保存 `{fixtureId,profileVersion,toolVersions,imageDigest,environment,initialVfs,argvOrScript,stdinHash,expectedStdoutHash,expectedStderrHash,expectedRc,expectedVfsEffects}`。GNU long listing 的 user/group/time/block-size 等所有顯示條件顯式固定；可用 typed projection 比 inode 等價類，但原 stdout 也要存，不能刪有意義空白讓錯結果過關。

三類驗收分開：

1. **真 GNU/Bash 子集**：原 bytes／rc／VFS effects 對照；reference 使用可信固定 fixture，不能把玩家任意字串交宿主 Bash。Windows 沒 Bash/coreutils 時列缺工具，不標通過。
2. **遊戲 extensions**：依 pack 的確定性 transition fixture 比狀態、effects、時間與拒絕邊界；不聲稱 GNU 有相同故事語意。
3. **合法解判題**：依 [TICKET_JUDGE](TICKET_JUDGE.md) 的來源／資料流／結果語意接受不同管線與中間工作檔；不能只 `ran_regex` 匹配唯一答案。查過來源再 echo 固定計數不等於 counting provenance；T0100 合法 echo 則依題目範圍接受。

依 [MERGE_SPEC](MERGE_SPEC.md) 的足跡 overlay 不修改既有 judge source snapshot；判題輸入以 generatorVersion／seed／logicalContentHash 固定。UI 截斷 stdout 不影響結果；replay 必須重算 bytes 與 effects，不相信自填 readEvents。

跨命令 `read → cut → sort → uniq-c → write` 的trace parents／artifact按SAVE §7.1保留；literal／editor重寫（即使相同bytes）不能沿用舊writer。單dispatch最多一個ticket/profile trace，多profile工作檔須拆成明示inputs，否則准入回ENG_TICKET_SCOPE。輸出比較使用REPLAY的OutputRecord/1與rawsha canonical bytes；JournalRecord不加output欄位。ReplayAssessment、MiniGit report／部分producer子schema仍有ENGINE §8.1的實作前阻塞，命令名稱定版不代表能力已實作。

百萬行串流／外部 sort／2 秒均為 ENGINE/PACK 的**待量測提案**。head 可提早停止，tail 使用可驗索引；sort 不能一般性宣稱不讀全部資料。僅低基數等價最佳化可省排序，但要與完整 reference 結果一致，不用測資答案表取代執行。

## 9. 錯誤碼與 stderr

| code | rc／交易 | 玩家可見回應 |
| --- | --- | --- |
| `CMD_NOT_FOUND` | 127，正常結果 | `bash: <name>: command not found`；最多一個建議，不代執行。 |
| `CMD_SYNTAX_UNSUPPORTED` / `CMD_SYNTAX_INVALID` | 2；解析前無寫入 | 指語法位置及支援用法。 |
| `CMD_OPTION_UNSUPPORTED` | 2，正常結果 | 已知命令不支援此選項；不可空輸出 rc0。 |
| `CMD_BINARY_UNSUPPORTED` | 2，正常結果 | 說明目前文字 profile 不支援 NUL。 |
| `CMD_CROSS_DEVICE_LINK` | 1，正常結果 | `Invalid cross-device link`，說明島內連結界限。 |
| `CMD_MAIN_PROTECTED` | 1，整個 rm 操作拒絕 | 明示 main 保護與分支入口；不修改先前已完成的其他腳本命令。 |
| `CMD_PIPELINE_RACE` | 2，該 pipeline 未執行 | 說明不支援同 inode 跨站讀寫競爭，建議分步。 |
| `CMD_CAPABILITY_UNAVAILABLE` | 2，正常結果 | 目前 engine／pack 未開放；不讓主線只能走此路。 |
| `CMD_TAG_EXISTS` | 1，正常結果 | 收藏名稱已存在；保留原snapshot與目前分支，不退出。 |
| `ENG_CANCELLED` / `ENG_RESOURCE_LIMIT` | 非普通 rc；整筆回滾 | 分別說已取消或超預算，本次未提交。 |

file-not-found／permission 等 runtime errors 依工具的固定 rc（grep/ls 通常2，cat/rm/ln通常1），錯誤細節由 descriptor 的 error profile 控制。不把 shell rc1 當 program WA，也不把 command rc0 當題目成功。

## 10. 正負驗收與跨版本向量（尚未執行）

| ID | 正例／期望 | 負例／預期 |
| --- | --- | --- |
| CMD-001 | 相同 bytes fixture 在固定 GNU 與新 profile 的支援語意吻合。 | 未列選項／命令／syntax 明確拒，不能成功 stub。 |
| CMD-002 | quotes、空字串、escaped HOME、NBSP、未匹配 glob 正確。 | second expansion、Unicode whitespace 偷切 token、宿主 env 洩入皆失敗。 |
| CMD-003 | multi-line 逐筆 commit、遇 choice 停批；引號內 LF 保留。 | 將剩餘命令當密語／投票、全域 trim 八空格皆失敗。 |
| CMD-004 | head 提早關閉 iterator；管線末站 rc、&& 正確。 | 為清理而 drain 全來源、pipeline cd 改玩家 cwd、危險競爭偷偷執行皆失敗。 |
| CMD-005 | `missing > a` 與 `echo x > a; missing` 有正確寫入／stderr。 | 一般 rc 非零誤回滾；cancel 卻留下部分寫入皆失敗。 |
| CMD-006 | `ls -ltr` file operands／dir 同一 mtime 排序，tie 反向名稱固定。 | 用 alias 建立時間／fragmentId 排序或只對 dir 正確皆失敗。 |
| CMD-007 | hardlink 共內容／mtime，unlink 一個名稱仍能讀另一個。 | 跨 device 偷 copy、不同碎片合 inode、跨 branch 共 mutable inode 皆拒。 |
| CMD-008 | F2 修復、匯出匯入後保存原證據與現況 mtime。 | 修復／匯入用 Date.now 重寫時間，破壞順序卻不告知皆失敗。 |
| CMD-009 | sort 長整數、小數、key ties、-s/-u 與 GNU 一致。 | Number 精度丟失、`-u` 比整行 fallback、錯 key blanks 被抓到。 |
| CMD-010 | grep BRE literal +／\|、C locale -i、無結果rc1；cut byte split 正確。 | JS regex 誤把 + 作量詞、Unicode lowerCase、wc無尾LF多算皆失敗。 |
| CMD-011 | edit只在apply產生inline四欄typed input／literal provenance；恰64 KiB與CRLF原樣保存、零故事時間。 | UI直接改VFS、超64 KiB／以blob-only替代content、手寫counts冒稱資料流計數皆失敗。 |
| CMD-012 | GNU 子集／extensions／MiniGit／session-control 顯示與路由分明。 | 故事 git 改 repo ref、repo bisect 改時間分支或 save head 皆失敗。 |
| CMD-013 | 每片 mtime 只支持來源可證的檔案時序。 | 以它證明綁島旅程、補造 N12 事件順序不通過內容驗收。 |
| CMD-014 | game choose B0/B1 defer、git abandon/merge、tag、ssh cronmine、ending的GUI映射同一typed input。 | 同時記typed與raw雙事件、tag退出、旅行restore、缺正文可選ending皆失敗。 |
| CMD-015 | repo內帶topo-order的log交MiniGit；repo外既定graph/all交時間線；git-check保存指定view報告且不自動分類。 | repo內缺topo-order不fallback；未知predicate/任意執行/以技術timeout當bad皆拒。 |
| CMD-016 | 分階段工作檔的trace在外部facts閉包重建，改UI截斷不改OutputRecord digest。 | 未定op.params收任意JSON、跨profile覆蓋factId、清快取後counting結果不同皆拒。 |

跨版本清單：V-CMD-L1 legacy parser/mtime/sort/rc vectors 固定舊行為；V-CMD-L2 legacy→ra-shell/1 差異清單（不追求同舊 ID）；V-CMD-N1 固定 GNU bytes→Browser/Node；V-CMD-N2 未知 commandSetVersion 拒執行；V-CMD-N3 可用 capability 隨 pack 版本改變，舊存檔仍固定舊 registry；V-CMD-N4 mtime/tie/F2/跨島 policy；V-CMD-N5 file:// Worker cancel 與靜態站相同 effects。未取得工具 digest 的向量不得標成已跑。

## 11. 交付與待驗 spike

交付者需產出文法 schema、descriptor registry、bytes stream evaluator、資料流證據、固定 reference manifest／正負 fixtures、跨版本差異及 unsupported help；跟現有模組逐步移植，不另建 UI 私有 executor。高風險 spike：有界 C-locale BRE、GNU sort key 精度、外部排序 scratch、file:// cancel、碎片 mtime 原資料修訂、跨島 device 敘事映射。

與 [INTERACTION_SPEC](../ux/INTERACTION_SPEC.md) 對齊 16 KiB 命令上限、自訂時間命令、具名確認／取消、多行提交範圍；與 [REPLAY_SPEC](REPLAY_SPEC.md) 對齊輸入原 bytes／完整輸出 hashes／版本；與 [MINIGIT_SPEC](MINIGIT_SPEC.md) 對齊 repo 文法及 typed runtime。所有 spike 未有結果前僅是實作工作，不是相容性或性能聲明。
