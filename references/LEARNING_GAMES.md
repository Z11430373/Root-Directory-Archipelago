# Bash／Unix 教學遊戲：實際下載、靜態研究與清理紀錄

研究日期：2026-11-02。研究者範圍：learning-games 子任務。

## 結論

- **原生 shell 的優先參考：`phyver/GameShell`。** 遊戲啟動真正的 Bash／Zsh，玩家操作真正的目錄與檔案；任務可以檢查結果，而不只比對輸入字串。適合當 Unix 操作與教學任務設計的對照標準。
- **瀏覽器教學整合參考：`saranormous/termgame`。** 原生 HTML／JS、可變更的記憶體檔案模型、命令 registry、任務 predicate、localStorage；是教學模擬，不是 Bash、PTY、Linux VM 或真套件管理器。適合參考瀏覽器的命令→狀態→教學回饋串接，**不能解決 Bash 語法相容性**。
- 兩個 repo 均已實際完成 `git clone --depth 1`，確認完整目前版本檔案樹、remote、SHA、授權與工作樹狀態。沒有只下載 README，也沒有把公開原始碼當成可任意移植的內容。
- 依使用者後續要求，副本從專案目錄搬到唯一暫存目錄；清理完成狀態見第 6 節。保留本報告作為來源證據與復現指引。

## 1. 搜尋、選擇與版本鎖定

先閱讀既有 [`demo-app/notes/GAME_REFERENCES.md`](../demo-app/notes/GAME_REFERENCES.md)，再進行網路搜尋與 GitHub 官方 repo/API/原始檔交叉確認。

搜尋包含 `GitHub termgame bash browser shell game license`、`GitHub phyver GameShell bash game license official`、`"termgame" "github" shell`，以及 GitHub [repository search API](https://api.github.com/search/repositories?q=termgame)。`termgame` 有許多同名射擊／遊戲引擎專案；本報告只指 Sarah Guo 的教學作品，不混用其他 repo。

| 項目 | GameShell | TermGame |
| --- | --- | --- |
| 作者／上游身份 | README 列 Pierre Hyvernat、Rodolphe Lepigre；GitHub API `fork=false` | README 署名 Sarah Guo，repo 的 LICENSE 同名；README／CNAME 指向 `termgame.ai` |
| 確認的 clone URL | `https://github.com/phyver/GameShell.git` | `https://github.com/saranormous/termgame.git` |
| 實際 HEAD | `63ae30982cf28ec7de1a4de23b85d15eccc031d8` | `2a9ddc2480ac98499aacd6a51ddbe6d1f3749596` |
| commit 日期（Git 原值） | `2026-09-21T12:43:35+02:00` | `2026-03-28T08:48:58-07:00` |
| 淺層／可達 commit 數 | `true`／`1` | `true`／`1` |
| `git ls-files` 數量 | 922 | 18 |
| 搬移後工作樹 | `git status --porcelain` 空陣列 | `git status --porcelain` 空陣列 |
| 授權 | GPLv3：README 宣告＋根目錄 `LICENSE` | MIT，Copyright (c) 2026 Sarah Guo |
| 程式完整性範圍 | 本版啟動程式、lib、scripts、missions、文件、授權皆已取得；不包含作業系統工具與完整 Git 歷史 | 本版 HTML、完整 `src/`、測試、package manifests、授權皆已取得；未下載 devDependencies |

固定版本來源：

- GameShell：[檔案樹](https://github.com/phyver/GameShell/tree/63ae30982cf28ec7de1a4de23b85d15eccc031d8)、[README](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/README.md)、[LICENSE](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/LICENSE)。
- TermGame：[檔案樹](https://github.com/saranormous/termgame/tree/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596)、[README](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/README.md)、[LICENSE](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/LICENSE)。

另查過 [TryBash 官網](https://trybash.github.io/)、[trybash/game](https://github.com/trybash/game) 及其 `package.json`：遊戲與 `bash-emulator` 分庫，遊戲依賴另庫 `gh-pages` 分支；這輪最多兩份 clone，未下載該組專案。`termgame` 的自足式 JS 教學程式更容易對照本案，但其 shell 簡化程度也更高。沒有把未下載候選列為已取得成果。

## 2. GameShell：真正的 Bash／Unix 操作

以下均為上述 SHA 的 **repo 相對路徑與行號**；副本清除後可使用固定版本連結查看。

### 原生 shell 證據

[`start.sh:172–195,552–616`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/start.sh#L172) 選擇 Bash／Zsh、設置遊戲 HOME，最後 `exec $GSH_SHELL`；[`scripts/generate_rcfile:8–25`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/scripts/generate_rcfile#L8) 產生 `.bashrc`／`.zshrc` 並載入遊戲函式。它沒有在 JavaScript 裡重造 `cd`、管線與 shell parser。

`missions/basic/04_mkdir_chest/static.sh:3` 以真正 `mkdir -p` 建立教學目錄；其 `check.sh` 使用 `find`、`test -d` 檢查資料夾。此處「真檔案系統」不是 VFS 宣傳名稱。

| 面向 | 可定位的程式位置 | 已由靜態原始碼確認／可借鑑原則 |
| --- | --- | --- |
| 任務目標 | `scripts/_gsh_goal:5–40`；`missions/basic/04_mkdir_chest/goal/en.txt` | 目標讀取與任務完成檢查分離；可重看目標，並支援逐任務翻譯與 pager |
| 任務生命週期 | `lib/gsh.sh:187–303`（`__gsh_start`）、`:364–489`（`_gsh_check`／`__gsh_clean`） | `static/init/check/clean` 分工；check 的 exit status 決定成功或失敗，成功記錄後進下一關，失敗清理後重新開始本關 |
| 結果判定 | [`missions/basic/01_cd_tower/check.sh:3–15`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/missions/basic/01_cd_tower/check.sh#L3)；[`missions/basic/04_mkdir_chest/check.sh:3–49`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/missions/basic/04_mkdir_chest/check.sh#L3) | 前者比較正規化 cwd；後者檢查資料夾存在、名稱、數量、位置。可借「判結果、提供精確原因」，不必強制唯一指令拼法 |
| 不是全都只判結果 | `missions/pipe_intro_book_of_potions/04_pipe/check.sh:6–34`；`scripts/fc-lnr.sh:75–78` | 有關卡讀取前一條歷史命令、檢查是否含 `tail`，再以 `eval` 重跑並比對輸出。不能概括成所有等效命令都通過；本案不宜照搬重新執行歷史命令的方式 |
| Prompt | [`lib/gshrc:15–18`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/lib/gshrc#L15)；`missions/basic/03_cd_HOME_throne/treasure.sh:3–13` | 預設 PS1 顯示目前 mission，另有任務獎勵修改 prompt。任務狀態與 cwd 等資訊可作為 prompt 設計參考 |
| Help／man | `lib/gsh.sh:638–646`；`lib/gshrc:94–106`；`i18n/gsh-help/en.txt`；[`man/man1/gsh.1:30–81`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/man/man1/gsh.1#L30) | 短 help、完整 help、任務 goal 各自負責不同層次。repo 內確有 roff manpage；`man/README` 指向生成來源 `i18n/source/gsh-commands`。未實測 `man gsh` 是否已加入環境搜尋路徑 |
| Progress／resume | `lib/gsh.sh:28–43,433–461,492–531`；[`scripts/_gsh_pcm:6–15`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/scripts/_gsh_pcm#L6)；`scripts/_gsh_save:10–14,42–59` | `missions.log` 記錄 START／CHECK_OK 等事件，從事件推導目前任務；封存式 save 會打包遊戲資料。**直接從 Git 工作樹執行時不走相同封存存檔路線**，`_gsh_save` 明確拒絕含 `.git` 的根目錄 |
| History | [`lib/bashrc:3–17`](https://github.com/phyver/GameShell/blob/63ae30982cf28ec7de1a4de23b85d15eccc031d8/lib/bashrc#L3)；`scripts/fc-lnr.sh` | 使用真正 Bash history，獨立 `HISTFILE`、50000 筆限制、忽略連續重複命令；歷史與課程進度日誌分開 |
| Completion | `lib/bashrc:23–28`；`lib/zshrc:38–42`；`missions/intermediate/03_tab_spider_lair/goal/en.txt:19–26` | `complete -W` 補 `gsh` 子命令；一般檔名補完由 shell 負責。關卡教材介紹 Tab／Tab-Tab；`check.sh:9–35` 檢查檔案結果與時間，不直接偵測是否真的按了 Tab |
| 上游驗收例子 | `missions/basic/04_mkdir_chest/test.sh:6–29` | 包含錯位、多建等失敗場景與成功場景，可借驗收案例設計；本輪僅閱讀，沒有執行 |

### 適合本案的用法

1. 把「執行命令的語意」與「這個任務是否完成」拆開；完成條件優先看 cwd、檔案內容與目錄結構。
2. 分清目標、命令說明、重置與驗收。錯誤訊息可指出哪個條件未達成。
3. 用 GameShell 作為原生 shell 行為對照，不將 shell history 重新執行、20 秒限制、失敗自動重置當成必須採用的遊戲規則。
4. 真 shell 並不等於隔離沙箱：`lib/gshrc:74–91` 只是偵測玩家離開遊戲目錄並提醒回去。README 的 Docker／Codespaces 是另一種執行環境；本輪沒有建立它們，也未做隔離驗證。

## 3. TermGame：瀏覽器模擬與檔案狀態整合

[`src/lessons.js:46–133`](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/src/lessons.js#L46) 初始化 `state.files`，每個路徑對應 `type/content`；[`src/commands.js:405–540`](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/src/commands.js#L405) 的 `pwd/ls/cd/mkdir/touch/cat/nano/source` 讀寫該模型。這確實有可觀察的虛擬檔案互動，但**不接主機檔案系統、不啟動 Bash**。教材偏 macOS／`.zshrc` 與 coding-agent 工作流，也不是通用 Bash 課程。

| 面向 | 可定位的程式位置 | 已確認的實作與限制 |
| --- | --- | --- |
| 瀏覽器整合入口 | [`src/app.js:493–543`](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/src/app.js#L493)；`src/commands.js:394–400,965–1000` | form submit → `executeCommand(raw, commandContext)` → registry handler → `updateQuests/saveState/render`；context 傳入檔案、輸出、編輯器與 renderer 函式，沒有 PTY／WebSocket shell bridge |
| 路徑與檔案 | `src/app.js:346–390`；`src/commands.js:413–458,498–540`；`src/app.js:545–567` | `normalizePath` 處理 `~`、相對／絕對路徑、`.`、`..`；`listDir` 列直接子節點；editor 儲存回 `state.files[path].content` |
| 任務判定 | `src/lessons.js:185–248`（`buildQuests`）；[`src/app.js:392–428`](https://github.com/saranormous/termgame/blob/2a9ddc2480ac98499aacd6a51ddbe6d1f3749596/src/app.js#L392) | 每題有 `helper/commands/check(state)`；掃描 predicate 後設定 `questsDone`。部分看結果（cwd、檔案／旗標），但第一題仍比對 `lastCommand === "which node"`；不能宣稱全面接受等效解法 |
| Prompt | `src/app.js:148–165,334–340` | 已送出命令前綴為 `${state.cwd} $`，由同一 cwd 狀態產生，方便理解操作位置；不是 Bash 的 PS1 |
| Help／man | `src/commands.js:405–407`；`src/app.js:267–284,319–321`；`src/lessons.js` 的 `getActiveHintIds/getConcepts` | `help` 從 registry 自動列出命令；術語庫與當前任務提示分開。**沒有註冊 `man` 指令** |
| Progress／save | `src/app.js:56–89,169–265`；`src/lessons.js:1,131–132` | localStorage `termgame-v2` 存完整 state；讀取時合併基礎狀態，無效 JSON 回初始狀態。顯示完成數與 Done／Current／Locked，而不是只有顏色 |
| History | `src/app.js:16,530–543`；`:330–331` | `lastCommand` 只存單筆上一命令，↑ 回填；`terminalLines` 保存輸出逐字稿。**逐字稿不是可上下巡覽的歷史堆疊**；沒有 shell `history` 指令、↓ 巡覽或持久化 recall index |
| Completion | `src/app.js:247–253`；`src/commands.js:935–959,989–995` | 有點擊範例貼入（不自動執行）與未知命令的 edit-distance 建議；**未見 Tab／路徑補完實作**。不要把 typo hint 當作 completion |
| 上游測試 | `tests/playtest.js:107`（`runFlow`）、`:518`（`runPart3ReloadTests`）、`:598–649`（skip 測試） | 可參考跨重載恢復、前置條件、skip 後狀態一致性的測試分類；沒有執行或宣稱通過 |

### 對「不像 Bash」的具體判斷

`src/commands.js:980–982` 只是 `command.split(" ")`，不能拿來當 shell tokenizer：引號、跳脫、連續空白、管線／重導向／命令鏈沒有一般化處理。`git` 等分支更有整句字串相等判斷（`:645–694`）。

`npm`／`brew`／`node`／`curl` 多為切換旗標或回覆預寫文字；例如 `node sort-downloads.js` 只設定 `state.script.ran` 並印結果（`:614–641`），不真的執行腳本或移動那些 Downloads 檔案。`open` 則可透過 `src/app.js:486–490` 建立 Blob HTML 新視窗來預覽範例 JS；這不代表 npm server 或 shell 已實際啟動。

**推薦借的是狀態與教學層的介面**：命令註冊表、自動產生 help、單一 cwd/files 真相、任務 predicate、按需術語提示、可恢復進度。若本案要更接近 Bash，仍需獨立處理 tokenizer、檔案語意、管線／重導向、history 與 completion；此 repo 不提供完整解法。

## 4. 授權與未驗證範圍

- GameShell 的 GPLv3 是確認的上游授權，**不是本案已符合其衍生／散布條件的結論**。本輪只保留研究敘述與檔案位置，沒有移植程式、關卡、敘事或 ASCII art；日後直接複製／改作前須確認本案授權相容性與 GPL 義務。README 致謝 Joan Stark，藝術素材不因根目錄 LICENSE 就免除來源核對。
- TermGame 為 MIT；若未來複製實質程式片段或內容，應附上 Sarah Guo 的 copyright 與完整 MIT 許可聲明。本輪沒有移植程式、遊戲文案或圖像。
- 沒有跑任何上游 `start.sh`、`test.sh`、npm install、build、dev server、Playwright、Docker、Codespaces，也沒有執行教材內命令或在瀏覽器開啟遊戲程式。
- 不宣稱已玩過全部關卡、已驗證 Bash 相容矩陣、鍵盤／無障礙／跨平台行為、網站在線狀態、隔離安全、依賴供應鏈或所有第三方資產授權。
- `git status` 空白只代表搬移後上游工作樹未被改動，不是可執行性或安全性測試。

## 5. 實際操作紀錄

### 5.1 建立（發生於使用者要求改用暫存目錄之前）

工作根目錄：`C:\Users\user\Documents\《根目錄群島》`。

初讀 `references/` 不存在；每份 clone 前另以 `Test-Path -LiteralPath $target` 守門：已存在則只讀 `git -C $target remote -v`，不存在才建父目錄及 clone。實際兩個目標均走建立分支，輸出各一行 `Cloning into ...` 且命令成功：

```powershell
New-Item -ItemType Directory -Force -Path 'references/upstream/learning-games' | Out-Null
git -c core.autocrlf=false clone --depth 1 https://github.com/phyver/GameShell.git 'references/upstream/learning-games/GameShell'
git -c core.autocrlf=false clone --depth 1 https://github.com/saranormous/termgame.git 'references/upstream/learning-games/termgame'
```

確切原始路徑：

- `C:\Users\user\Documents\《根目錄群島》\references\upstream\learning-games\GameShell`
- `C:\Users\user\Documents\《根目錄群島》\references\upstream\learning-games\termgame`

`-c core.autocrlf=false` 是單次 Git 命令參數，未使用 `git config --global`。clone 自有 `.git/config` 等資料會隨副本刪除。

### 5.2 搬移到唯一暫存目錄

後續使用者指定研究完清理，故搬移本輪親自新建的兩份 clone，沒有另 clone 第三份：

```powershell
$tempRoot = 'C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-learning-games-20261102-6e81c2f4'
if (Test-Path -LiteralPath $tempRoot) { throw 'Refusing to reuse existing temporary directory.' }
New-Item -ItemType Directory -Path $tempRoot | Out-Null
Move-Item -LiteralPath 'references/upstream/learning-games/GameShell' -Destination "$tempRoot\GameShell"
Move-Item -LiteralPath 'references/upstream/learning-games/termgame' -Destination "$tempRoot\termgame"
```

實際研究路徑：

- `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-learning-games-20261102-6e81c2f4\GameShell`
- `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-learning-games-20261102-6e81c2f4\termgame`

搬移後 `Test-Path`：兩個暫存 `.git` 均 `true`，兩個原始 clone 目錄均 `false`。

對各暫存副本執行的只讀 metadata 查驗：

```powershell
git -C $repo remote get-url origin
git -C $repo rev-parse HEAD
git -C $repo rev-parse --is-shallow-repository
git -C $repo rev-list --count HEAD
git -C $repo ls-files
git --no-optional-locks -C $repo status --porcelain
```

結果已列第 1 節。靜態閱讀使用 read／grep／網路文字擷取；沒有 source、import 或啟動第三方程式。

## 6. 清理與刻意保留

**已完成清理。** 刪除前再核對暫存目錄僅有本輪的兩個子目錄，以及各自 origin／HEAD 完全符合第 1 節。實際執行的刪除核心如下；`$expected` 是第 1 節兩組 Name／Origin／Commit，刪除前的檢查失敗會直接停止：

```powershell
$tempRoot = 'C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-learning-games-20261102-6e81c2f4'
$expected = @(
  @{ Name = 'GameShell'; Origin = 'https://github.com/phyver/GameShell.git'; Commit = '63ae30982cf28ec7de1a4de23b85d15eccc031d8' },
  @{ Name = 'termgame'; Origin = 'https://github.com/saranormous/termgame.git'; Commit = '2a9ddc2480ac98499aacd6a51ddbe6d1f3749596' }
)
$children = @(Get-ChildItem -LiteralPath $tempRoot -Force -ErrorAction Stop)
if ($children.Count -ne 2 -or @($children | Where-Object { $_.Name -notin @('GameShell','termgame') }).Count -ne 0) { throw 'Unexpected temporary contents; refusing cleanup.' }
foreach ($item in $expected) {
  $repo = Join-Path $tempRoot $item.Name
  $origin = git -C $repo remote get-url origin
  $commit = git -C $repo rev-parse HEAD
  if ($origin -ne $item.Origin -or $commit -ne $item.Commit) { throw "Identity mismatch: $repo" }
}
foreach ($item in $expected) {
  Remove-Item -LiteralPath (Join-Path $tempRoot $item.Name) -Recurse -Force -ErrorAction Stop
}
[System.IO.Directory]::Delete($tempRoot)
```

也檢查了本輪最初建立的空父目錄，僅在空目錄時刪除；實際結果為已刪：

```powershell
$oldParent = Join-Path (Get-Location) 'references\upstream\learning-games'
if (Test-Path -LiteralPath $oldParent) {
  if (@(Get-ChildItem -LiteralPath $oldParent -Force).Count -eq 0) {
    [System.IO.Directory]::Delete($oldParent)
  }
}
```

| 清理後 `Test-Path -LiteralPath` 查驗 | 實際結果 |
| --- | --- |
| 暫存根目錄下 `GameShell` | `false` |
| 暫存根目錄下 `termgame` | `false` |
| `C:\Users\user\AppData\Local\Temp\opencode\ra-upstream-learning-games-20261102-6e81c2f4` | `false` |
| 專案 `references/upstream/learning-games/GameShell` | `false` |
| 專案 `references/upstream/learning-games/termgame` | `false` |
| 專案 `references/upstream/learning-games` 空父目錄 | `false`；回傳 `removed empty directory created by this task` |
| `references/LEARNING_GAMES.md` | `true`，刻意保留 |

**已清除**：兩份 clone 的程式、資產與 `.git`，本輪唯一暫存根目錄，以及本輪建立且確認為空的 learning-games 父目錄。

**刻意保留**：本報告、原有研究筆記、共用 `references/`／`references/upstream/` 與其他代理的檔案。未刪除專案程式或其他人的內容，未執行 `git add`／commit。

**環境紀錄**：本輪未安裝套件、啟動服務、永久修改 PATH、Git global、shell profile 或系統設定，因此沒有上述安裝／設定的回復步驟。Git clone 自己產生的 repo 設定已隨副本移除。以上是本輪操作與指定路徑的查驗，沒有做全機快照或逐檔比對，**不宣稱整台電腦已逐位元還原**。

**平台管理紀錄未清理／未驗證**：OpenCode 會話與工具紀錄仍由平台管理；網路工具曾自動保存大型 GitHub API 回應於 `C:\Users\user\.local\share\opencode\tool-output\tool_19b8be5db001ZPcXwC1Ds8JVdR`。這不是 repo 副本，未越界刪除工具管理儲存，也未掃描平台的其他快取。

## 7. 日後重現（本節命令未於本輪執行）

重新研究時使用新的唯一暫存目錄。`clone --depth 1` 的 HEAD 會隨上游更新，故以下範例另鎖定本報告 SHA；保留舊 SHA 可抓取的前提是 GitHub 仍提供該物件。

```powershell
$root = Join-Path 'C:\Users\user\AppData\Local\Temp\opencode' ('ra-upstream-learning-games-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
git -c core.autocrlf=false clone --depth 1 https://github.com/phyver/GameShell.git "$root\GameShell"
git -C "$root\GameShell" fetch --depth 1 origin 63ae30982cf28ec7de1a4de23b85d15eccc031d8
git -C "$root\GameShell" -c core.autocrlf=false checkout --detach 63ae30982cf28ec7de1a4de23b85d15eccc031d8
git -c core.autocrlf=false clone --depth 1 https://github.com/saranormous/termgame.git "$root\termgame"
git -C "$root\termgame" fetch --depth 1 origin 2a9ddc2480ac98499aacd6a51ddbe6d1f3749596
git -C "$root\termgame" -c core.autocrlf=false checkout --detach 2a9ddc2480ac98499aacd6a51ddbe6d1f3749596
# 僅讀檔與 Git metadata；研究完後只刪除此輪新建的 $root。
Remove-Item -LiteralPath $root -Recurse -Force
Test-Path -LiteralPath $root
```

不可將上述清理命令的 `$root` 換成共用暫存根目錄、工作專案或別人的下載資料夾。
