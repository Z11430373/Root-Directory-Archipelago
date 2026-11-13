# Demo validator 可攜性修復與獨立驗證

日期：2026-11-02。工作目錄：`C:\Users\user\Documents\《根目錄群島》`。

## 最新結果（owner 範圍擴大後）

第二階段已修復 LF 生成、實體／虛擬路徑橋接、Ch1 空 home、流程絕對路徑與
具名案例的檔案遍歷順序契約。Windows 與 Linux 均完成真實執行：

| 平台 | Python / zlib | Bash | root validator | demo validator |
| --- | --- | --- | --- | --- |
| Windows / Git Bash | 3.12.10 / 1.3.1 | 5.3.15 | exit 0，0 錯誤／0 警告 | exit 0，0 錯誤／0 警告 |
| Linux / 既有 Docker 映像 | 3.11.2 / 1.2.13 | 5.2.15 | exit 0，0 錯誤／0 警告 | exit 0，0 錯誤／0 警告 |

71 個 Bash 案例、7 個快題通過，流程規則覆蓋 **50/50**，walkthrough 全欄位精確一致。
兩端的 **83 檔資料 SHA-256 一致且執行前後零變更**；完整紀錄接續於文件末端。

第二階段明確 owner 範圍為 `tools/gen_logs.py`、`demo/tools/make_conformance.py`、
`demo/tools/flow_sim.py`、`demo/tools/validate_demo.py` 與本紀錄。
原始註解／使用者修改均保留；83 檔資料快照零變更。

**Python 實作已依主線要求凍結。** 主線獨立 Windows 重跑亦為兩個 validator exit 0、
0 錯誤／0 警告、83 檔 SHA-256 不變；原始輸出已唯讀核對：
[test-results-validators-current.txt](../demo-app/notes/logs/test-results-validators-current.txt)。
本 owner 已收尾，沒有待完成的 Linux 作業；收尾清理與環境紀錄見文件末端。

以下至「第二階段」標題前，保留第一階段的診斷與當時範圍限制，7 FAIL 是歷史基線。

## 第一階段結論

本輪實際重現 **8 錯誤、0 警告**；修復 `vectors.json` 的 zlib 表示誤報後，
完整重跑為 **7 錯誤、0 警告，validator exit 1**。剩餘失敗涉及參考工具的
世界生成、路徑映射、流程執行與 oracle 契約，不能據此宣稱 demo 全部通過。

本輪寫入僅限：

- `demo/tools/validate_demo.py`：保留原有使用者註解，新增窄範圍測資比較與 UTF-8 子程序管線。
- `references/VALIDATOR_PORTABILITY.md`：本紀錄。

未改劇本、YAML、text、testvectors、golden、其他 Python、app、build、package 或 app tests。
沒有執行任何測資 `make`，沒有安裝套件或設定持久環境變數。本輪結果獨立於主線 Bash/app 驗收。

## 環境與重跑方式

Windows / PowerShell；Python 3.12.10；zlib 編譯與 runtime 均為 1.3.1。
本輪 conformance 實際回報：
`GNU bash, version 5.3.15(2)-release (x86_64-pc-cygwin)`。

程序範圍設定（沒有 `setx` 或 User/Machine 設定）：

```powershell
$env:PATH = 'C:\Program Files\Git\bin;' + $env:PATH
$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
$env:TEMP = 'C:\Users\user\AppData\Local\Temp\opencode'
$env:TMP = $env:TEMP
python -B demo/tools/validate_demo.py
```

診斷／最後完整重跑再以 Python `TemporaryDirectory(prefix='validator_portability_',
dir=os.environ['TEMP'])` 建立唯一子目錄，將子程序的 `TEMP/TMP` 指向該目錄；
同程序的診斷另設 `tempfile.tempdir`。沒有使用共用固定暫存路徑。
完整驗證命令為：

```python
subprocess.run(
    [sys.executable, '-B', '-X', 'utf8', 'demo/tools/validate_demo.py'],
    env=dict(os.environ, TEMP=temp, TMP=temp),
    capture_output=True, text=True, encoding='utf-8', timeout=300,
)
```

## 已修復：壓縮表示誤報

`testvectors.py` 文件明訂比較解碼結構與結論，不要求跨壓縮實作逐位元相同。
原 validator 卻對整份重建 JSON 精確比對，將表示差異當成過期。

獨立遞迴比較確認唯一差異為 `/reject/10/code`，案例名稱 `truncated_zlib`。
既有與重建案例的實測結果：

| 項目 | 既有 | 重建 |
| --- | --- | --- |
| RA1 CRC | 正確 | 正確 |
| 壓縮資料長度 | 809 bytes | 809 bytes |
| zlib header | `789c` | `789c` |
| `decompressobj.eof` | False | False |
| unused data | 0 bytes | 0 bytes |
| 部分解壓結果 | 1980 bytes | 1980 bytes |
| 部分解壓 SHA-256 | `c64694261133d932f6f2ce8f2c994e8affdbc4a7b067d86c53c88e43fe6fe085` | 相同 |
| `TV.check` | `[]` | `[]` |

修復方式：

1. `truncated_zlib_payload()` 驗 RA1/base64url 外殼、CRC、代碼／解壓上限、
   非空部分解壓、`eof=False`、無尾料。
2. `vector_contract()` 只在比較用副本中將此具名案例的 code 換為部分解壓 bytes。
   原始測資保持不變；所有其他 code、名稱、why、expect、結構仍精確比對。
3. 保留兩次重建的確定性／JSON 結構檢查；既有與重建測資都執行 `TV.check()`。
4. 只有上述契約相同才接受表示差異。不是以「兩者都會拋錯」取代案例比對。

這是針對已證實差異的窄修復；沒有對其他壓縮案例做廣泛正規化。
另為 conformance／flow 子程序加入 `-X utf8` 及父端 `encoding='utf-8'`，
並保留非零退出與 stdout/stderr 診斷，不再只將流程失敗報成無細節的「請 make」。

## 範圍外缺陷：仍維持 FAIL

### 1. Conformance：資料與 oracle 不是單純換行輸出

`make_conformance.build()` 與既有檔案共找到 47 個遞迴差異位置
（路徑鍵變更分別計為舊鍵缺席／新鍵出現）。

- `tools/gen_logs.py` 以平台預設 text newline 寫日誌，Windows 生成 **3315 個 CRLF**。
  實際 SHA：`21e970a31557b4df08ac23aa800ab67a1cb4065c098f232484da893cc0c377aa`。
  僅在記憶體 CRLF→LF 後 SHA 為
  `09a7fd1fbbabd2d78c49da7c3dc4d6c7cd052ac22af1a9e800f49041aaefdd4c`，
  與 golden 相同。這個 fixture 明訂 log bytes/hash 契約，不能忽略 hash 失敗。
- `make_conformance.py:145–149` 用 `os.path.relpath` 建虛擬路徑，Windows 得
  `/home\op\handbook.md`，不是 POSIX `/home/op/handbook.md`。
- **新增確認的實體世界缺陷**：`build_tree():99–109` 的 `home` 包含混用分隔符
  `...\ch1\home/op`，`os.walk` 回報 `...\ch1\home\op`。
  keep 集合的字串比較失敗，空的 Ch1 `/home/op` 被刪除。
  實際 `os.path.isdir(home)`：Ch0 True，Ch1 False；既有 dirs 6 個，重建只剩 5 個。
  這不是改比較時的斜線就能修復的差異。
- `real():121–122` 與 `judge():184–192` 用 Windows root 字串刪除 Bash stdout 前綴，
  但 Git Bash 回報 `/tmp/opencode/.../r`；pwd、grep 與 Q0-5 留下實體暫存路徑。
- `c0-29` 的 `grep -rl lin .` 順序依宿主檔案遍歷不同：
  golden 為 handbook → notes/.draft → notes/01-first-night → logs/lamp；
  Windows 為 handbook → logs/lamp → notes/.draft → notes/01-first-night。
  需明訂此案例的遍歷順序契約，不能將所有 stdout 全域排序掩蓋差異。
- `env.bash` 保存 Linux Bash 5.2.21 的 provenance，重跑為 Git Bash 5.3.15。
  版本資訊與行為契約應分開處理，但現有比較同時混有上述真實世界缺陷。

後續修正需涉及 `gen_logs.py`／`make_conformance.py`：LF 生成、實體路徑正規化、
POSIX 虛擬鍵與可靠的 Bash 實體路徑轉換；不應直接重寫 golden。

### 2. 流程：模擬器確實未完成走法

獨立 `FS.run_walk('digger')`：`ended=False`、`branch='alt/sandbox'`。

- `flow_sim.py:179–181` 的 `to_virtual(home)` 得 `/home\op`。
  `cat shelf/jar.txt` 真正執行成功（rc=0，輸出標本內容），但讀檔事件的反斜線
  無法匹配 flow 的 POSIX 路徑，導致多個規則／節拍缺少。
- `flow_sim.py:673–691` 原樣將虛擬絕對路徑交給宿主 Bash：
  `ls /lost+found` rc=2、`cat /lost+found/#0` rc=1 且空輸出。
  同一時刻 `sim.vpath('/lost+found/#0')` 在暫存世界確實存在且可讀，內容為
  「每一個被刪掉的東西，都有人曾經引用過。」
  這個絕對路徑映射缺陷不只涉及 Windows 分隔符。
- cwd 回傳也使用宿主 Bash 路徑，現有 Python `os.path.isdir(new)`／root 比較
  未做 Windows↔Bash 路徑轉換；需由模擬器修正，不能替換預期 trace。

剩餘 7 項失敗：

1. conformance 與真 Bash 重跑不符。
2. digger 沒有走到結尾。
3. newbie 沒有走到結尾。
4. 節拍 s3b（lin.draft）未覆蓋。
5. 11 個規則未覆蓋：`r.first_night, r.draft, r.jar, r.cat_dark, r.cat_lit,
   r.cat_find, r.ticket_file, r.error_log, r.read_lost0, r.git_merge, r.ask_cat`。
6. 5 個對話未覆蓋：`init.demo_g_ferry_3, init.demo_g_merge_1,
   init.demo_g_merge_2, init.demo_g_merge_3, init.demo_vote_block`。
7. walkthrough 與參考模擬器重跑不符。

## 操作與回歸紀錄

1. 載入 debug 工作流程；唯讀查找 AGENTS.md（未找到）、`git status --short`、
   `git diff -- demo/tools/validate_demo.py`。目標檔先前只有使用者新增的說明註解。
2. 讀取 validator、testvectors、conformance、flow_sim、validate_flow、savelib 的相關實作，
   以及 root validator 的 materialize/run。紀錄實際位於
   `demo-app/notes/logs/test-results-project-data.txt`；第一次讀根目錄 `notes/...` 不存在。
3. 第一次執行未加 Git Bash PATH，在快題階段因找不到 bash（WinError 2）退出。
   加上上述程序環境後完整重現 8 錯誤、0 警告，exit 1。
4. 第一組唯讀探針：`TV.check(existing)`、`TV.check(TV.build())`、完整遞迴 diff、
   CRC／部分解壓指紋、`C.build()` diff、`FS.run_walk('digger')` 歷史與虛擬檔讀取。
   同時比較資料 SHA-256；此探針排除了所有 `.py`，79→79 檔，0 變更。
5. 第二組探針：`C.build_tree()`，檢查生成日誌 bytes、home 實體存在性與
   `bash -c 'pwd; printf "%s\n" "$HOME"'` 的實體路徑表示。
6. 使用 patch 修改上述唯一 Python 檔；沒有 monkeypatch 其他模組或改 golden。
7. 以記憶體探針執行定向回歸，全部斷言通過：
   - 原始／重建測資 `TV.check == []`，原始 JSON 不相等但窄比較相等。
   - 重建確定性成立；`vector_contract` 不修改來源。
   - 錯 CRC、不合法字元、完整串流、非 zlib、無部分內容、超過解壓上限皆拒絕。
   - 不同截斷 payload、why 變更、預期分數變更、其他 code 加空白、移除拒絕案例，
     窄比較全部仍判不相等。
8. `git diff --check -- demo/tools/validate_demo.py` 通過。
9. 修改後完整執行：validator exit 1，7 錯誤、0 警告，stderr 空；83→83 檔、0 變更。
   第一次包裝腳本最後用中文常值檢查摘要而失敗；獨立探針證明 PowerShell stdin 管線
   將該常值轉為 `???7 ????0 ???`。這是探針斷言問題，沒有修改 validator 來配合。
10. 改用 ASCII `line.startswith('  FAIL ')` 計數再次完整重跑；確認 7 FAIL、0 WARN、
    沒有 vectors freshness FAIL，包裝腳本 exit 0，validator 仍正確 exit 1。
    stdout 保留全部未通過項目；資料再次 83→83 檔、0 變更。
11. 新增本紀錄，最後對兩個可寫檔執行 `git diff --check`，並核對已知暫存清理。
    最後檢視將成功訊息釐清為「各自 CRC 正確」（CRC 值隨壓縮 bytes 改變），
    並避免將未知的 golden 產生端 zlib 版本說成已確認；僅文字修正，未再重跑完整驗證。

83 檔快照範圍：`world, chapters, dialogue, quests, tickets, cards, branches, text, demo`，
排除 `demo/tools` 與 `__pycache__`；涵蓋測資與工單參考解。SHA 快照只留記憶體。

## 暫存清理與未驗邊界

以下唯一暫存目錄由 `TemporaryDirectory` 清理，離開後皆確認不存在：

- `C:\Users\user\AppData\Local\Temp\opencode\validator_portability_d6pm02mz`
- `C:\Users\user\AppData\Local\Temp\opencode\validator_portability_awouegj1`
- `C:\Users\user\AppData\Local\Temp\opencode\validator_portability_i9epw1_2`
- `C:\Users\user\AppData\Local\Temp\opencode\validator_portability_tco6ovjb`

第一組診斷與兩次修改後完整執行，清理外層前即確認內部剩餘項目為 `[]`。
第二組 `build_tree` 探針由外層 context 清理生成世界。
最初兩次直接執行的隨機子目錄名稱未記錄；已審查其 finally 清理路徑，
但不宣稱另外逐個核對，也沒有廣掃／刪除其他工作的暫存。

未執行 Linux/macOS、root validator 重跑或任何 app/npm 測試。
既有 root validator 0 錯誤／0 警告是前輪紀錄，不是本輪新增的驗證證據。

## 第二階段：擴大 owner 後完成修復

### 實作

- `tools/gen_logs.py`：主日誌、輪替日誌與 manifest 明示 UTF-8／LF 寫檔。
  Windows 上真實生成的 bytes 直接吻合 golden hash，不在比對端替換換行。
- `make_conformance.py`：共用 `host_path()`／`virtual_path()` 區分 native host 路徑與
  POSIX 虛擬鍵；home 與 keep 集合使用一致的 native 正規形式，祖先走到 root 即停。
  Ch0、Ch1 的 `/home/op` 均實際保留。
- `run_world_bash()` 讓 Bash 在世界 root 執行 `pwd -P`，取得該 Bash 自己的實體路徑。
  這同時處理 Git Bash `/tmp` mount 與 Linux，沒有猜測 `/c/...` drive 規則。
  HOME 由此 root 與虛擬家目錄組成，回傳 cwd 以 POSIX 相對路徑轉回 native host。
- 固定測資使用絕對路徑的 `cat`／`ls`／`cd` 透過 Bash function 映射其路徑參數。
  Bash 本身完成分詞、引號、管線與命令執行；已展開的 HOME 不重複加 root。
  此橋接供現有可信 oracle 使用，保持原有非 chroot／非完整 VFS 的工具定位。
- stdout 只移除完整世界 root 前綴，保留 `/` 與路徑邊界；不改同前綴兄弟路徑。
  語法錯誤沒有狀態 marker 時採用真實程序退出碼。
- `flow_sim.py` 共用上述橋接；vpath 的 `~`／相對路徑以 home 為準，事件鍵永遠 POSIX。
  遞迴 grep 的虛擬絕對檔名直接映射回世界，不再先試讀宿主絕對路徑。
- `conformance_contract()` 僅對完整識別
  `(id='c0-29', chapter='ch0', cwd='~', cmd='grep -rl lin .')`
  使用含行尾的行多重集合（Counter）。內容、重複次數與行尾皆保留。
- Linux 實測另定位 `c0-26`／`grep -r lin notes shelf` 的兩個檔案遍歷順序差異。
  `grep_file_blocks()` 僅用於此完整具名案例：`notes`、`shelf` operand 順序保持有序；
  每個 operand 下的檔案區塊無序，每檔匹配行維持有序且連續。
  完整行、檔名前綴、重複次數與行尾全部保留。其他案例仍逐字比較，不全域排序 stdout。
- `env.bash` 保留實際生成版本並在 CLI 與 demo validator 顯示 current／golden provenance，
  僅從行為比較的副本中排除版本；`LC_ALL` 與全部行為欄位仍需相等。

### 第二階段診斷與回歸操作

1. 重新讀取四個 owner Python 與既有 golden，檢視原有 diff 後使用 patch 修正。
2. 直接呼叫 `C.build()` 與 `FS.build_vectors()`，不寫 testvectors：
   - conformance 精確遞迴差異由 47 處降至 2 處：`cases/29/stdout` 行順序與 `env/bash`。
   - `conformance_contract(old) == conformance_contract(new)`。
   - walkthrough 全部欄位精確一致，差異 **0**；不對 code／commit／trace 做正規化。
   - digger/newbie/edge/timeup 均 ended=True；commit 數 57/67/50/61；
     head 分別為 `f894961f`、`60ed4984`、`7476db7c`、`be87be2e`。
3. 對 conformance 契約做記憶體負向變異：缺行、重複行、改行內容、缺末尾 newline、
   非 unordered 案例重排行、rc／cmd／locale／log hash 變動，全數仍判不相等。
   原測資副本未被修改；僅指定 unordered 排列與合法 Bash provenance 改變可相等。
4. 在包含空白與中文的暫存世界驗證 LF bytes/hash、兩章 home、POSIX 鍵，全部通過。
   第一次 bridge 邊界測試額外抓到 `cat |` 被附加的狀態回報續接為合法管線。
   已改成 `builtin eval -- "$1"`，將原命令作獨立 argv 解析，避免吞掉回報程式。
5. 修正後重跑全部路徑／狀態回歸：
   - `/lost+found/#0`、含空白／中文的 quoted absolute 檔名讀取正確。
   - `cd / && pwd && ls /lost+found` 回傳虛擬 `/`；跨命令 cwd 正確更新。
   - `cd`、`~/handbook.md` 回到家目錄且不重複加 root。
   - missing file rc=1、`cat |`／`cat &&` rc=2、尾端 comment 不吞 marker、`exit 9` rc=9。
   - Sim cwd native↔POSIX 來回與 `file.read` 事件路徑正確。
6. Windows 連續完整執行 root 與 demo validator，均 exit 0、stderr 空、0 錯誤／0 警告。
   root 約 4.50s，30 萬行參考解 0.48s；demo 約 48.28s。
   71 個 Bash 案例、7 個快題通過；流程規則 **50/50** 覆蓋，walkthrough 精確相等。
   同一程序記憶體 SHA-256 快照 **83→83 檔，變更／新增／刪除 0**。
7. 查詢既有 Linux 執行環境：`wsl --list --quiet` 不可用；Docker daemon 為 Linux。
   唯讀列出本地映像，選用已存在的 `ojcheck:1`，沒有 pull／build／安裝套件。
   探針確認 Linux、Python 3.11.2、PyYAML 6.0.3、zlib 1.2.13、`/usr/bin/bash`。
8. Linux 執行設定：`docker run --rm --pull=never --network=none --read-only`；
   repo bind mount `/workspace` 為 read-only，唯一核准的 host 暫存目錄映射到
   `/validation-temp`，`TMPDIR/TEMP/TMP` 均指向它。設定不寫 pycache／UTF-8。
   沒有掛載 Docker socket或修改現有服務。
9. Linux 第一個外層 shell 在 120s 逾時，未取得完整驗證輸出，**不計為通過**。
   確認該唯一容器已不存在，暫存目錄空，隨後移除空目錄。
   以較長時限背景重跑，等完成通知，不輪詢驗證結果。
10. 背景重跑於 1100s 外層逾時，仍未取得 validator 結果，**不計為通過**。
    當輪隨機目錄尾端 `_` 使原先取尾碼方式得到空字串，容器名稱實為
    `validator-portability-`；確認不存在，context 清理的暫存亦不存在。
    後續容器名稱改用獨立 `uuid.uuid4().hex`，不從暫存名稱分割。
11. 唯讀確認 Docker context 為本機 `desktop-linux`／named pipe。
    20s 啟動探針分別只掛載 ASCII 暫存目錄與專案目錄，兩者都在容器建立前逾時，
    stdout/stderr 空且 inspect 找不到容器。這是 Docker Desktop bind-mount 啟動阻塞，
    不是已觀察到的 validator 失敗；沒有修改 Docker 設定或服務。
12. 改以 stdin 傳送只含驗證所需來源的 tar；宿主 archive 放在核准唯一暫存目錄，
    容器用 `--tmpfs /validation-temp:rw,size=512m`，映像仍 read-only、network none。
    此輪不使用 bind mount；容器來源／runtime 都在記憶體暫存，隨 context 與 `--rm` 清理。
    解開前後對 83 檔核對 SHA-256，確認與宿主原始資料逐位元一致。
13. Linux 首次成功啟動的完整驗證：root 0 錯誤／0 警告，1.82s，30 萬行解答 0.71s；
    demo 1 錯誤／0 警告。獨立重跑 `C.build()` 的精確 diff 只有：

    ```text
    cases/26/stdout
    golden: notes/.draft.txt:                                  —— lin
            notes/01-first-night.txt:                                  —— lin
    Linux:  notes/01-first-night.txt:                                  —— lin
            notes/.draft.txt:                                  —— lin
    ```

    此輪 83 檔宿主資料仍零變更，容器與暫存全部清理。
14. 針對已證實的 `c0-26` 新增上述每檔有序區塊契約，不改命令／測資／golden。
    定向回歸確認：檔案區塊換序可相等；缺行、重複行、改內容、少末尾 newline、
    檔內行換序仍不相等；operand 倒序、同檔區塊不連續、非預期檔名前綴直接拒絕。
    非具名案例的 stdout 仍嚴格比對，來源 fixture 不被修改。
15. 針對最後的 conformance 比較變更，Windows 與 Linux 並行重跑完整 demo validator：
    **兩端均 exit 0、stderr 空、0 錯誤／0 警告**；Linux 額外的絕對路徑、cwd、HOME、
    `cat |` rc=2 探針全部通過。root 的程式與依賴自其通過後沒有再改，未重複跑 root。
    Windows 83→83 零變更；Linux 接收的 83 檔與宿主一致，執行前後也完全一致。
    runtime 清理後為 `[]`，容器記憶體目錄、宿主 archive 與容器均已刪除。
16. 最後檢視 diff，對五個 owner 檔執行 `git diff --check`，逐一核對已知暫存不存在，
    `docker ps -a --filter name=validator-portability` 無剩餘容器。

### 第二階段暫存紀錄

均位於 `C:\Users\user\AppData\Local\Temp\opencode`，唯一前綴為
`validator_portability_v2_`：

- `nboc7vue`：直接 conformance／walkthrough 比對；內部清理後 `[]`，外層已刪除。
- `f48c2xto`：第一組契約／路徑回歸，語法錯誤斷言失敗時由 context 清理。
- `mwejg1z4`：修正後全部路徑／狀態回歸通過，外層已刪除。
- `_t5u5glz`：Windows root/demo 完整驗證；內部清理後 `[]`，外層已刪除。
- `16086wgv`：Linux 首次外層逾時；容器 `validator-portability-16086wgv` 已不存在，
  讀取確認目錄空後，以 `Remove-Item -LiteralPath` 只刪除此空目錄。
- `79s1xj2_`：Linux 第二次外層逾時；context 清理後確認不存在，容器亦不存在。

另使用下列核准唯一宿主暫存目錄，均已清理：

- `validator_portability_mount_m7nfki3s`：兩個 bind-mount 啟動探針，context 清理。
- `validator_portability_linux_z0r1igby`：首次 stdin/tar Linux root/demo 實測，archive 與 context 清理。
- `validator_portability_final_wiphszmz`：Windows 最終 demo 驗證，runtime 空後清理。
- `validator_portability_linux_xwfzyot3`：Linux 最終 demo／路徑探針，archive 與 context 清理。

最後一次 Linux 容器名稱為 `validator-portability-e9d88680fe6049f0abca1ebb521d31fd`，
前次失敗驗證與差異探針容器分別為
`validator-portability-9c2fe582e2be409d83216d90b9a812f2`、
`validator-portability-2b010405306849ec9741fb23c9578dd9`；各自執行後均確認不存在。
沒有刪除／重建任何既有映像或其他容器，沒有持續背景測試工作。

## 凍結交接與最後清理確認

### Linux 作業狀態與必要限制

- 背景作業 `sh_19bb61f50001PisrE6iU1WIcE5` 已收到 completed 通知，exit 1；
  具體失敗為 `subprocess.TimeoutExpired`（Docker bind-mount 呼叫超過 1100s）。
  該作業沒有取得 validator 結果，不當作通過。對應的容器與暫存已清理，詳見上述精確名稱。
- 最終 Linux 通過證據來自後續已完成的同步 stdin/tar＋tmpfs 執行：root、demo 均
  exit 0／0 錯誤／0 警告；83 檔資料傳入前、傳入後、執行後 SHA-256 一致。
  Linux Bash 5.2.15、Python 3.11.2、zlib 1.2.13；不是將 Git Bash 誤稱 Linux。
- Linux 結果適用於既有 `ojcheck:1` 映像與記憶體暫存檔案系統。
  Docker Desktop bind-mount 啟動阻塞仍是此環境的限制，未宣稱已修復；沒有安裝或更新環境。
  macOS 與其他 Linux 發行版未驗；本工具的固定案例橋接不是完整 chroot／通用 Shell 引擎。
- npm／UI 最終驗收由主線進行，本報告不替代其結果。主線獨立 Windows 原始紀錄已連結於首頁。
- 凍結指示後，只有本 owner 報告寫入；只做唯讀輸出、雜湊、清理與環境核對，未再啟動驗證實驗。

### 精確清理核對

最後再次逐一 `Test-Path -LiteralPath` 上列 **14 個已記錄的完整宿主暫存路徑**，
全部為 False，包含第一次／第二次 bind-mount 逾時、mount 探針與最終 source.tar 所在目錄。
沒有按前綴批量刪除，也沒有動到主線暫存。

`docker ps -a --filter name=validator-portability --format '{{.Names}} {{.Status}}'`
輸出為空；已命名的成功、失敗、差異探針容器均無殘留。
最初無名環境探針使用 `--rm` 且正常退出，未記錄 Docker 自動名稱，不冒稱另有逐名核對。
tmpfs `/validation-temp` 隨所屬容器移除；沒有新增 Docker volume。
早期兩次直接 validator 的隨機暫存名稱未記錄，其證據限制仍維持第一階段所述。

### 環境變動

所有測試設定只作用於 PowerShell/Python 程序或容器環境：`PATH`、`PYTHONUTF8`、
`PYTHONDONTWRITEBYTECODE`、`TEMP`、`TMP`，以及子程序的 `TMPDIR`、`HOME`、`LC_ALL`、
`RA_WORLD_ROOT`。沒有 `setx`、User/Machine 環境設定、profile／registry／Docker 設定變更。

凍結後另開 shell，唯讀核對 Process／User／Machine 三個範圍：

- `PYTHONUTF8`、`PYTHONIOENCODING`、`PYTHONDONTWRITEBYTECODE`、`TMPDIR`、`HOME`、
  `LC_ALL`、`RA_WORLD_ROOT` 三範圍皆未設定。
- Process 與 User 的 `TEMP/TMP` 為 `C:\Users\user\AppData\Local\Temp`；
  Machine 為 `C:\WINDOWS\TEMP`，沒有遺留本任務的 opencode 子目錄覆寫。
- 三範圍 `PATH` 均不以測試加入的 `C:\Program Files\Git\bin;` 為前綴。
- 沒有 pull/build 映像、安裝 Python／Bash／套件、啟停既有 Docker 服務或修改主線 build。

### 凍結時 owner Python SHA-256

由 `Get-FileHash -Algorithm SHA256` 唯讀取得，供交接定位實作版本：

| 檔案 | SHA-256 |
| --- | --- |
| `tools/gen_logs.py` | `190f90e3f70579c1f3fae6c0e41e3c9b2769cc80290479ffba73337c65d2d26a` |
| `demo/tools/make_conformance.py` | `81ff34713631e6c63483ea4d006dc59523f8a60d4ccb8ff9f4ab5db08bb98456` |
| `demo/tools/flow_sim.py` | `0c01e38d527e11fc8a31203e23e710144b177b70925da4d23db735230bb4de78` |
| `demo/tools/validate_demo.py` | `5cd1a4856723c0a270e8f2649a5456f1eac5f47ad8fc82e96f76d92a43c81d41` |
