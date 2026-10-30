# 引擎需求清單（Ch0–Ch1 要能跑，至少要有這些）

這份清單由資料檔反推：劇本會用到什麼，引擎就必須提供什麼。驗證器用真的 bash 跑過 reference，所以「語意」以 GNU coreutils／grep 為準。

## 1. 指令

| 指令 | 必須支援 | 用在哪 |
|---|---|---|
| `ls` | `-a` `-l` `-la` `-li`（顯示 inode，硬連結兩邊相同）；多個路徑參數 | Q0-1、Q0-3；Ch3 預留 `-ltr` |
| `cd`、`pwd` | `~`、`..`、絕對與相對路徑 | 全章 |
| `cat` | 多檔；讀 stdin | Q0-2、Q0-4 |
| `grep` | `-r` `-R` `-c` `-n` `-v` `-i`；**基本正規表示式**：`^` `$` `.` `\.` `[...]`；多檔時印出 `檔名:行`；`-r` 要搜尋隱藏檔；退出碼 0/1 | Q0-4/5、Q1-1/3/4 |
| `head` `tail` | `-n N`、`-N` | Q1-2；lin-ticket 彩蛋 |
| `sort` | `-r` `-n` `-rn` `-k` | Q1-2 |
| `uniq` | `-c`（只合併相鄰相同行） | Q1-2 |
| `cut` | `-d 分隔字元` `-f 欄位`（`-d'['`、`-d:`） | Q1-2 |
| `wc` | `-l` | Q1-1 的替代解法 |
| 管線 `\|`、重導向 `>` `>>`、`&&` | 必須；管線要**串流**（見 §4） | Q1-2、Q1-4 |
| `echo` | 含 `> 檔案` | 多人離線便條 |
| `zcat` / `gzip -dc` | 讀 `.gz`（可在虛擬檔案系統裡直接存明文，標記為 gz） | 選擇性彩蛋 |
| `man` | `man <主題>`、`man -k <字>`、`man 7 solution`、`man ticket-0001`、`man fsck`（內容見 text/ 與 dialogue） | 提示系統 |
| `mail` | 顯示 `/var/mail/op` | Ch0 開場 |
| `finger` | `finger harbor-master` | 彩蛋 |
| `who` `wall` | 單人離線：`who` 只列自己與 init；連線：廣場共享 | Ch0 燈亮後 |
| `systemctl` | `start lamp`（要口令提示）、`status lamp` | Ch0 結尾 |
| `ssh <島>` | 渡海：印出延遲與風險，切換主機 | Ch0→Ch1 |
| `fsck <目錄>`、`fsck -y <目錄>` | 見 chapters/ch1 的 `fsck:` 區塊（檢查與修復的固定輸出與效果） | Q1-5 |
| `ln` | 硬連結；`ln <檔> ~/keep/` 用來「引用」遺物 | 遺物（選擇性，無獎勵、無提示） |
| `rm` | `-r` `-f`；在 main 上對 `/` 或 `~` 遞迴刪除要被攔下（INIT：「不行，這是 main。要不要開一條分支？」） | B0、彩蛋 |
| `sudo` | 一律 `Permission denied.`；Ch0 第一次附 `[init] lin 說過了。` | 彩蛋 |
| `close TICKET-0001` | `close: 權限不足（需要報告人或 root）。` | 彩蛋 |
| `submit sol.py` | 把檔案送判題（本機判題器或接自己的 OJ） | T0100、T0427 |
| `git` | `checkout -b <分支> [檢查點]`、`merge --knowledge`、`abandon`、`tag <名>`、`reflog`、`log --graph --all`（Ch0–1 只需前四個；也接受不帶 `git` 的 `merge --knowledge`） | B0、B1 |
| `iptables` / `fw` | 見 branches/B1.yaml 的 `firewall`；只在 B1 分支內有效；CIDR 比對要正確（`/24` 同時涵蓋 10.7.0.2 與 10.7.0.23） | B1 |

不支援的指令一律回 `bash: <指令>: command not found`，不要崩潰。

## 2. 資料格式的擴充（相對於設計稿 §10 的範例）

設計稿 §10 的四種檔（章節、工單、知識卡、對話節點）欄位**全部沿用**。本資料包額外增加：

| 新欄位／新檔 | 作用 |
|---|---|
| `files[].variants`（`if` + `content_ref`） | 同一路徑依旗標切換內容（例：燈亮後的貓） |
| `files[].hardlinks`、`fragments.yaml` | 碎片以硬連結實作；`ls -li` 要顯示同 inode；`link_time` 決定 Ch7 的拼接順序 |
| `chapters[].scenes` | 只用來展開成 SCRIPT.md，引擎可以忽略 |
| `quests/*.yaml` 的 `check` | 判斷快題完成（型別見 §3）；`reference`/`negative_references` 給驗證器用 |
| `branches/*.yaml` | 分支規則、模擬結果表、離開條件 |
| `dialogue/*.yaml` 的 `variants`、`keywords`、`expect_input` | 條件變體、話題關鍵字、需要玩家輸入口令 |
| 旗標命名 | `flag.<名>` 或 `flag.<分支>.<名>`；全部在 YAML 裡出現過即視為已宣告（驗證器會檢查「被使用但沒人設定」） |

## 3. 快題 check 型別

| 型別 | 意思 |
|---|---|
| `ran_regex` | 玩家執行過符合 regex 的指令（比對指令字串，不比輸出） |
| `output_contains` | 任一符合 `cmd_regex`（可省略）的指令，標準輸出含 `text` |
| `output_last_line_equals` | 該指令輸出的最後一個非空行 == `value` |
| `output_line_contains_all` | 輸出中有一行同時含 `values` 的全部字串 |
| `file_matches` | 目前工作目錄新建、且不是 access.log 的檔案：每行符合 `all_lines_regex`，行數 == `line_count` |

`{manifest.X}` 取自日誌產生時算出的 manifest（見 §5）。`wrong_output_hints` 讓「差一點」的輸出得到針對性的提示（例：`grep -c 404` 會多算）。

## 4. 效能與串流

- `access.log`（約 120 萬行）**不得整份載入記憶體**：用種子惰性產生，以區塊／行迭代器提供給 `grep`、`cut`、`sort`、`uniq`、`head`、`tail`、`wc`。
- `sort | uniq -c` 在 120 萬行上必須在瀏覽器內 2 秒內完成（可對「cut 出日期」這類低基數結果做雜湊計數的最佳化，只要輸出與真的 sort/uniq 相同）。
- `tail -n 1`、`head` 不得讀完整份檔案。
- 小測資模式：`lines_per_day=300`，用於單元測試與驗證器。

## 5. 決定性與日誌產生

- 隨機一律用 **mulberry32(seed)**（`tools/gen_logs.py` 有逐位元的參考實作），seed 來自存檔；瀏覽器與伺服器必須得到相同結果（伺服器要重放驗證）。
- 引擎移植 `gen_logs.py` 時**只需遵守不變量 I1–I7**（寫在檔案開頭），不必與 Python 輸出逐字相同；但同一份存檔在兩個宿主上必須逐字相同。
- 產生日誌時同時算出 manifest：`n404`、`n_grep404_naive`、`busiest_day`、`busiest_count`、`n_0200`、`n_gc`、`n_ip_prefix_naive`、`top3`、`n_appeal`。快題的 check 靠它。
- 足跡：單人離線加入玩家與 ada、bo；多人離線加入對方暱稱（`--peer`）；連線由真實活動決定，但 GC 的 02:00:00 固定。

## 6. 存檔（commit）欄位（Ch0–1 會寫入的）

沿用設計稿 §1：`id / parent / branch / actor / chapter / action / delta / flags / items / knowledge / t`。此資料包新增的 `flags` 見 `python3 tools/validate.py` 輸出；`items` 有 `F1`、`F2`、`R0`、`R1`（遺物引用）；`knowledge` 有 `K0`、`K1`。
檢查點：`ckpt/ch0-start`、`ckpt/ch0-lamp`、`ckpt/ch0-end`、`ckpt/ch1-start`、`ckpt/ch1-night`、`ckpt/ch1-end`。

## 7. 判題

- 本機判題器：逐行比對，行尾空白忽略；時限／記憶體上限來自工單檔；結果文案用設計稿 §6 的世界內說法（AC / WA / TLE / MLE / RE / CE）。
- WA 時若符合 `common_wrong`，在原本的 WA 文案後附 INIT 的提示（見 dialogue/init.yaml 的 judge_wa_*）。
- 接自己的 OJ：`judge.oj_problem_id` 目前是 `null`；填入題號即可，測資與限制維持一致。
