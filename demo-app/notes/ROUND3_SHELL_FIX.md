# 第三輪 Shell 修復：R3-S01／S02／S04／S05

日期：2026-10-30。**四項已修復；原始 105 項 world 測試與原 9 項 round3-shell 斷言未修改。**

## 修改邊界

本代理只修改：

- `src/shell/exec.js`
- `src/shell/stream.js`
- `src/shell/commands.js`
- `src/shell/parse.js`
- 新增 `test/round3-shell-hardening.test.mjs`
- 新增本文件

未修改 Engine／VFS／main／UI、來源資料、參考工具、既有測試或 dist；未下載套件、未建置、未 commit。工作區中 Engine／main／UI 等同期差異屬主代理工作，未還原或覆寫。既有 Engine 測試的 T11 代碼輸出未產生 Git 內容差異。

## 修法與防回歸

### S01：無效 glob 不逸出 JS 例外

`exec.js` 在 glob 的 RegExp 編譯邊界捕捉 SyntaxError；如 `[z-a]` 這類無效範圍視為不匹配，保留原字面值，與已核對的 Bash 行為一致。此處只處理 glob，不放寬 BRE／命令替換規則。

控制涵蓋：無效範圍、不完整／不匹配 glob、正常範圍與反選、引號／跳脫 literal、無效 glob 作為重導向目標，以及多重匹配的 ambiguous redirect 不截斷原檔。

### S02：命令啟動與按需輸出分離

- `stream.js` 的 `startable` 啟動每個命令一次，最多暫存它的第一個輸出 chunk；之後交由下游按需拉取。
- 每個 pipeline 先準備重導向，再由左至右啟動各階段。因此即使下游 echo 不讀 stdin，無輸出的 rm／ln／cd 仍完成啟動、副作用與錯誤回報。
- 重導向 writer 會將自己的輸出送完到明確指定的檔案 sink，不靠下游來驅動。每個重導向依序開啟，較早目標的建立／截斷不被省略；開啟失敗時不啟動原命令。
- sink 寫入失敗由該 writer 記 rc／stderr；上游 iterator 關閉，Shell 仍可執行下一行。
- 多命令 pipeline 用共享檔案系統、獨立 cwd 的 Proxy view：管線中的 cd 不改 parent／兄弟命令 cwd；單獨 `cd ... && pwd` 仍改變後續命令 cwd。rm／ln／檔案寫入不因 cwd 隔離被錯誤丟棄。
- 最後關閉未消耗的 producer，**不一律 drain**。`cat | head -n 1` 及 `cat | head -n 1 > first.txt | echo done` 的 8-chunk 人工來源都只拉 1 chunk，且 finally 正確執行一次。既有 large.txt 的 head 惰性與 tail 定位測試也保持通過。

控制另涵蓋：被忽略輸出的 rm／ln、失敗 cd 的 stderr、開啟重導向失敗時不刪檔／不建連結／不 cd、append 與多目標重導向、管線最後一段 rc 與 `&&`、ignored producer 只啟動一次後關閉，以及 main 的 rm 保護仍執行且保留原檔。

### S04：逐來源切行，不破壞 cat 原始串接

`commands.js` 新增 `sourceLines`，每個來源各自建立 `lines` iterator，僅供 sort／cut 使用。前檔未結尾行在該來源結束，不與下一檔黏合。`cat` 繼續用原始 chunk 串接，不能藉修復文字工具而擅自插入換行。

控制涵蓋：未結尾檔案、空檔、多個檔案、缺檔後繼續，以及 stdin `-` 夾在兩檔中；同時驗證 sort／cut 與 cat 的不同語意。

### S05：Unicode 空白仍是 word data

`parse.js` 不再用 JS `\s` 切 token；以明確的 ASCII space／tab，以及既有單行解析器的 newline whitespace 規則切分。NBSP、全形空白、EM SPACE、BOM 字元在 quoted／unquoted word 及檔名中皆保留；ASCII tab 仍正常分隔參數。

## 明確的 pipe／相容性界線

這仍是同步、決定性的模擬 Shell，**不是完整 Bash／POSIX process／fd 模型**：

1. 啟動順序固定由左至右，先準備整條管線的重導向；不模擬真平行程序在讀寫／刪檔／建立連結之間的競態。
2. 使用 generator 關閉取代 kernel pipe buffer／SIGPIPE；未模擬 SIGPIPE 的退出狀態，也沒有加入 pipefail。對未被讀取的普通 producer，只保留首個 chunk 的啟動與讀取副作用，不保證與某次 GNU 排程的 read-ahead 量相同。
3. 「最多一個輸出 chunk」不等於每種工具只讀一個輸入 chunk。sort／wc 等工具為產生第一個結果可能需要讀完整來源；這是工具本身的語意，不是額外對所有 producer 強制 drain。重導向 sink 則必須讀完自己的 producer 才能完成存檔。
4. cwd 採 process-local view，但未加入完整 subshell、環境變數或任意指令執行；檔案 sink 仍用 VFS 路徑，不宣稱模擬真 OS 的開啟 fd／unlink 競態。
5. 原本的敘事指令由 Engine 接管，其 compound-command 整合未在這次擴充；S03 的 file.read 快照接線由主代理修，本代理未改 Engine。
6. 這次僅修 Unicode token 分割；不宣稱所有 grep／wc／sort Unicode 與 locale 邊界已完整 GNU 相容。未引號的貼上換行仍沿用原單行 parser 行為，不宣稱是 Bash 的多行 command terminator。

以上限制沒有透過 skip／todo、修改原斷言或把參考工具差異藏起來來宣稱通過。

## 實跑證據

1. **先新增測試再修實作**：最初新增的 13 項控制為 1 pass／12 fail；其後補上 sink 寫入失敗的清理測試。
2. 四項實作修復後：新增控制 **14／14 通過**；原 world **105／105 通過**。原 round3-shell 首輪只剩 S03 失敗，符合交由主代理處理的邊界。
3. 主代理的 S03 修改出現後，最後整合重跑：

```powershell
node --test --test-concurrency=2 test/world.test.mjs test/engine.test.mjs test/round3-shell.test.mjs test/round3-shell-hardening.test.mjs
```

**139 tests、139 pass、0 fail、0 skip／todo，916.9 ms、exit 0**：

| 測試檔 | 結果 |
|---|---:|
| `world.test.mjs` | 105／105 |
| `engine.test.mjs` | 11／11 |
| 原 `round3-shell.test.mjs` | 9／9（S03 含主代理修復） |
| 新 `round3-shell-hardening.test.mjs` | 14／14 |

- T10 的 digger／newbie／edge／timeup 皆逐筆比對原 says／commit 欄位、**commit ID** 與 summary，全部相同；T11 四碼 JS／Python 互通也通過。
- 有限 Git Bash oracle 再核對 pipeline cwd、失敗 cd、無效 glob 重導向、stdin 夾檔的 sort／cut／cat，以及額外 Unicode 空白；UTF-8 傳值、`LC_ALL=C`／`LANG=C`、每子程序 3000 ms 硬 timeout、輸出上限 100000 bytes。僅使用自行建立且結束清除的核准 temp 子目錄，沒有修改原資料。
- `git diff --check` 無輸出。未跑 UI／瀏覽器、完整所有測試檔或建置，不以本次 139 項替代主代理最後全套驗收。

## 整合 review 補強：同路徑重綁後再次實讀，保留兩份 inode 快照

### 獨立重現與正常紅斷言

位置：`src/shell/exec.js:75–82` 的 `read(path)`。原本 `readEvents.push` 與 legacy `reads` 一起包在 pathname 的 `readSet` 去重裡；主代理已改好的 Engine 雖正確使用快照，仍拿不到被 Shell 丟棄的第二份。

輸入：

```sh
ln shelf/jar.txt temp.txt; cat temp.txt; rm temp.txt; ln shelf/cat.txt temp.txt; cat temp.txt
```

- **預期**：stdout=`jar 原文 + 暗貓原文`、rc=0；`reads` 仍只含一次 `/home/op/temp.txt`。`readEvents` 按順序保留兩份：第一份 `same_inode=[jar.txt,temp.txt]`，第二份 `same_inode=[cat.txt,temp.txt]`（均為絕對路徑）。Engine 應發現 jar，並設定 `flag.demo.cat_dark`。
- **修復前實際**：stdout／rc／legacy reads 正確，卻只有 jar 的快照；Engine 的 jar 發現為 true、`cat_dark` 為 false。不是未讀檔案的誤報，而是第二次真實讀取漏記。
- 在既有新增的 `round3-shell-hardening.test.mjs` 補兩項正常測試後，修復前實跑 **14 pass、2 fail、0 skip／todo**。兩項都正常 assertion failure：缺第二份快照，以及 `catDark:false !== true`；不把測試初始化錯誤當作產品證據。

### 最小修復與控制

僅把 `readEvents.push` 移出 pathname 去重區塊：legacy `reads` 維持 unique，**每次 `read` 通知保留當下 inode aliases**。重複快照的 flow 事件去重沿用主代理現有 Engine，未修改 Engine／main／VFS，也不另加一套推測式 inode 去重。

新增兩項測試：

1. 指定 compound command 的 stdout、rc、unique reads 及兩份按序快照皆完整。
2. Engine 配對控制：重綁後**未讀**不給暗貓 credit；重綁後**有讀**才給。之後用正常指令點燈，再重複讀貓，只有先前真正讀過暗貓的情況完成 cat 發現；jar／cat 發現及亮貓 flag 的 commit 均不因重複快照而重複寫入。原 S03「重綁後未讀不能發現 cat」的既有斷言完全未改。

### 補強後實跑

同上四檔整合命令：**141 tests、141 pass、0 fail、0 skip／todo，739.4 ms、exit 0**。

- world 105／105、Engine 11／11、原 round3-shell 9／9、新 hardening 16／16。
- T10 四走法原 commit ID 全相同；T11 JS／Python 互通通過。
- 本次沒有建置或 commit；未改 Engine／main，也未覆寫主代理同期的 dist／UI 差異。
