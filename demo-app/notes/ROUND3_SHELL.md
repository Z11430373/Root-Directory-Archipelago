# 第三輪獨立 Shell／VFS 審查

日期：2026-10-30；基線為 0.2.0。**5 個已重現的新問題，均保留正常紅斷言；本代理未修改實作。**

## 範圍與驗證

- 已讀指定規格、`demo-app/FINDINGS.md`（根目錄沒有 FINDINGS.md）、`notes/world.md`、Shell／VFS／quests 及既有 world 測試；inode 事件另追到 Engine 的 Shell 接線。
- 僅新增本文件與 `test/round3-shell.test.mjs`；不改來源資料、Python 工具、原測資、既有測試、產物；未建置、未 commit。
- 基線：`node --test test/world.test.mjs` → **105 pass、0 fail、0 skip**，263 ms。
- 新測試：`node --test test/round3-shell.test.mjs` → **9 tests、4 pass、5 fail、0 skip／todo**，128 ms、exit 1。五項失敗均為 assert 的實際差異，不是工具缺失或故意期待 bug。
- S01／02／04／05 用現有 Git Bash／GNU 工具核對；Node 以 UTF-8 傳字串，子程序固定 `LC_ALL=C`、`LANG=C`，每次硬 timeout 3000 ms、輸出上限 100000 bytes。需檔案的 oracle 只用自行建立的 `C:/Users/user/AppData/Local/Temp/opencode/round3-shell-oracle-*` 隔離目錄，結束清除，未寫原資料。
- S03 以 `demo/flow.yaml:78–84,169–172` 的明確 inode／file.read 規則及真實 Engine 執行為準，不用 GNU 猜劇情。
- 沒做無上限 fuzz／ReDoS／壓力測試；沒有下載或安裝套件。未查 UI／a11y、session／save；不宣稱完整 shell 相容或安全稽核通過。

## R3-S01 — P1：無效 glob 範圍逸出為未捕捉例外

**位置**：`src/shell/exec.js:18–24,74–76`；目前只有 parse 在 `:53–54` 內被 catch。

- **輸入**：`echo [z-a]`。
- **預期**：stdout=`"[z-a]\n"`、rc=`0`、reads=`[]`，不丟例外。Git Bash 相同；此模式無匹配時保留原字面值。
- **實際**：`expandGlob` 建立 JS RegExp 時丟 `SyntaxError: Invalid regular expression: /^[z-a]$/: Range out of order in character class`；`execute` 沒有回傳 stdout／rc／reads。
- **影響**：白名單 `echo` 的普通文字可打斷整次命令處理；不是命令替換或外部執行，也未聲稱瀏覽器永久卡死。
- **修法方向**：glob 字元集合應有語法驗證／相容轉譯；無效、不匹配模式按 Bash 行為保留 literal。擴充展開階段的錯誤邊界，保證 `execute` 不向外洩漏 JS 語法例外。
- **紅測試**：`R3-S01: a nonmatching invalid glob range remains literal without throwing`；`assert.doesNotThrow` 正常失敗。

## R3-S02 — P2：下游不消耗 stdin，上游命令與重導向副作用被省略

**位置**：`src/shell/exec.js:89–109`，尤其 `:101–104`；`src/shell/commands.js:363–364` 將整個命令放入惰性 generator。

- **輸入**：`echo written > saved.txt | echo done`。
- **預期**：stdout=`"done\n"`、rc=`0`、reads=`[]`，`saved.txt` 內容=`"written\n"`。
- **實際**：stdout／rc／reads 相同，但 `saved.txt` 是空字串。下游 echo 不讀 input，包住重導向寫入的上游 generator 從未被拉取。
- **獨立 oracle**：接著 `; cat saved.txt`，GNU stdout=`"done\nwritten\n"`；本實作只有 `"done\n"`。同根因的有限補充探查：`echo old > victim.txt; rm victim.txt | echo done` 在 GNU 已刪檔，本實作仍留 `"old\n"`；該補充未另算新問題。
- **影響**：支援的管線可能顯示成功，實際未存出文字、未完成刪除；不是單純 stdout 排版差異。
- **修法方向**：將命令啟動／副作用與資料按需消耗分開；被重導向的 producer 要執行其寫入，不依賴下游是否讀取。**不要一律 drain 所有上游**，那會破壞既有 `head` 提早停止要求；需處理消費端關閉與命令生命週期。
- **紅測試**：`R3-S02: pipeline producers run side effects even when the consumer ignores stdin`；檔案內容 `"" !== "written\n"`。

## R3-S03 — P2：讀完後重新綁定硬連結，Engine 把讀取歸給沒讀過的 inode

**位置**：`src/engine/index.js:525–534`；Shell 已在 `src/shell/exec.js:58–63` 保存正確 `readEvents`，Engine 卻只取 `reads`，並在整行執行後重新查 inode。

- **前置**：正常 `Engine.start()`、輸入合法暱稱；初始 ch0、未點燈。
- **輸入**：`ln shelf/jar.txt temp.txt; cat temp.txt; rm temp.txt; ln shelf/cat.txt temp.txt`。
- **預期 stdout／rc／reads**：stdout 完整等於原 `readFile('shelf/jar.txt')`、rc=`0`、reads=`["/home/op/temp.txt"]`；讀取當下 `same_inode`=`["/home/op/shelf/jar.txt","/home/op/temp.txt"]`。應記 `jar` 發現，不應設定 `flag.demo.cat_dark`。
- **實際**：Shell 的上述 stdout／rc／reads／readEvents **全部正確**；但 Engine 最後變成 `jarDiscovered=false`、`unreadCatCredited=true`。它用命令結束時 temp.txt 已指向貓的 inode 派生 file.read。
- **影響**：合法硬連結讀法漏記真發現、憑空給未讀檔案的旗標，進而改變後續貓發現與 commit。只讀完再 unlink、不重建連結，也會漏掉 jar；不是 RA1 保存任意檔案的已知限制。
- **修法方向**：優先使用 Shell 回傳的 `readEvents` 及讀取當下 `same_inode` 快照；只對沒有快照的相容介面提供保守 fallback，不拿事後 inode 身分改寫先前讀取事實。
- **紅測試**：`R3-S03: file.read uses the inode alias snapshot from the actual read`；正常 deepEqual 顯示上述兩個布林都反了。

## R3-S04 — P2：多檔 sort／cut 把前檔未結尾行黏到下一檔

**位置**：`src/shell/commands.js:25–27,260,306`。

- **前置**：新檔 `first.txt`=`"b:2"`（無末尾換行）；`second.txt`=`"a:1\n"`。
- **輸入一**：`sort first.txt second.txt`。
  - 預期 stdout=`"a:1\nb:2\n"`；實際=`"b:2a:1\n"`。
- **輸入二**：`cut -d: -f1 first.txt second.txt`。
  - 預期 stdout=`"b\na\n"`；實際=`"b\n"`。
- **兩例 rc／reads**：預期、實際都為 rc=`0`、reads=`["/home/op/first.txt","/home/op/second.txt"]`。
- **oracle**：隔離目錄中用 `echo -n 'b:2' > first.txt; echo 'a:1' > second.txt` 建檔，GNU sort／cut 的輸出與上述預期相同。
- **影響**：使用 `echo -n` 建立合法文字檔後，多檔排序改變資料，cut 甚至靜默遺失下一檔欄位，不能靠最後退出碼察覺。
- **修法方向**：sort／cut 應逐來源切行、在來源邊界結束未完成的末行，再合併記錄；不要全域修改 `joinedSources` 去強插換行，因為 `cat` 必須保留原始位元組串接語意。
- **紅測試**：`R3-S04: sort and cut keep separate input-file line boundaries`；同一 deepEqual 保留兩個輸出差異。

## R3-S05 — P2：JS `\s` 將 Unicode 空白誤當 Shell 分隔符並改寫文字

**位置**：`src/shell/parse.js:30`。

- **輸入**：`echo x<U+00A0>y`、`echo x<U+3000>y`（中間各為一個 NBSP／全形空白，不是 ASCII space）。
- **預期**：stdout 分別=`"x\u00a0y\n"`、`"x\u3000y\n"`；兩例 rc=`0`、reads=`[]`。
- **實際**：兩例 stdout 都變成 `"x y\n"`；rc=`0`、reads=`[]`。tokenize 的 JS `\s` 切成兩個參數，echo 再以 ASCII space 串回。
- **oracle**：以 Node UTF-8 argv 傳原字元給 Git Bash、`LC_ALL=C`，兩例都保留原字元；不是 PowerShell 管線把文字轉成 `?` 的編碼假象。
- **影響**：Unicode 文字被靜默改寫；含 NBSP／全形空白的未引號檔名也可能被拆成多個不存在的運算元。已另以引號的 Unicode 文字／檔名做通過對照。
- **修法方向**：明確定義 Shell 的 ASCII token 空白／換行規則，別直接套用涵蓋 Unicode whitespace 的 JS `\s`；保留非 ASCII 字元資料。
- **紅測試**：`R3-S05: Unicode spaces are word data, not Bash token separators`；正常 deepEqual 顯示 Unicode 空白被換成 ASCII space。

## 通過的有限反向檢查與不列入項目

新檔另有 4 項通過控制，避免將所有相關功能都判壞：

1. `cat` 混用 stdin／多檔、缺檔後繼續處理、reads 僅含具名檔；重導向父目錄不存在時 rc 與短路行為正常，且不產生假讀取或父目錄。
2. 引號及跳脫保留 `; | &&`，失敗 `&&` 正確短路，具引號的 Unicode 文字／檔名來回一致。
3. main 上 10 組 `rm` 路徑別名、`-rf/-fr/-R`、分離選項、`--`、`$HOME/${HOME}` glob、混合運算元與 compound command，都保留原檔內容；**未發現這些案例能繞過主線保護**。
4. Q1-1 的 `grep -c`、`grep | wc -l` 及 `grep -inc` 三種有效做法皆得到相同通過判定及 access.log 讀取事件。

- `file_matches` 去除多個末尾換行的行為，`tools/validate.py:521,540` 也相同；存在規格／參考解讀空間，**不以個人偏好另報 bug**。
- 沒有把已記錄的 BRE 重複群組限制、正式版 120 萬行尚未實作重新計數。

## 重跑

在 `demo-app/` 執行（不使用會建置的 npm script）：

```powershell
node --test test/round3-shell.test.mjs
```

目前應為上述 5 紅、4 綠；主代理修正後請保留原斷言再重跑。此紀錄不代表之後其他代理已修正，也沒有替主代理重跑完整驗收。
