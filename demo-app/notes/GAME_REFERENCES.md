# 終端遊戲／UX 參考查證

查證日期：2026-10-30。用途：研究參考，不是功能規格、授權核可或實作承諾。

## 範圍與證據標準

- 本輪只新增這份文件，未修改遊戲、來源資料、測試或其他代理文件，未 commit。
- 專案前提由任務提供：離線、單檔、原生 JavaScript、約 15 分鐘故事 CLI；新 Server 純文字風格與既有群島卡片介面並存。下列參考不授權改規則、依賴、劇情或部署路線。
- 查閱官方／作者頁、repo README、少量架構原始碼與開發日誌；沒有安裝、啟動外部遊戲或執行下載腳本。互動描述以文件／程式證據為準，不假裝是完整試玩心得。
- `websearch` 對本批查詢均未回傳結果；改以 `webfetch`、DuckDuckGo HTML 搜尋及 GitHub API 找到作者來源，再交叉核對。Google 回傳存取提示，Bing 回傳不相干結果，均未當成作品證據。「本輪未查得」不等於不存在。
- 下方均提供可追溯 URL；使用者原資料中的 `<cite>` 編號不能替代來源。頁面名稱、關數與功能可能更新；作者宣稱與原始碼證據分開標註。
- **真命令名稱 ≠ 真 shell；真 Linux ≠ Bash；WASM ≠ Linux VM；容器 ≠ VM。** xterm 或其他終端介面也不單獨證明背後有 shell。
- 授權欄只記看到的檔案／宣告，不是法律意見。可看、免費玩、公開 repo、AI 生成都不等於可無條件複製；本輪不匯入任何程式、圖像、音樂或文本。

## 一覽

| 作品／已辨識身份 | 執行路線與證據強度 | 授權現況 | 對本案主要價值 |
| --- | --- | --- | --- |
| Deadlock OS — Lholhe 的 itch.io 遊戲 | Godot；作者明確區分標準模擬與桌面可選 Docker 真 Linux；有 Web 版，但其容器連線方式未知；不是已證實 Bash | 未查得作品重用授權／官方 repo | 低門檻啟動、清楚標示模式、只填動詞的教學 chips |
| Sudo Sanctuary — vonhoon | Pygame＋Pygbag 瀏覽器 Python／WASM 路線可確認；遊戲命令處理層、Bash／Linux VM 均未證實 | 未查得明確重用授權／官方 repo | Guided／Hints／Expert、內建 cookbook；功能數為作者自述 |
| Teach Terminal — Arsen／Arsen-Gevorgyan，Hack Club 平台作品 | 瀏覽器 JS 自製指令＋記憶體假檔案系統，作者與程式均確認 | repo 未見 LICENSE／API 未列授權 | 講解→實作→成功、文字步驟狀態、可收合教學面板 |
| GameShell — Pierre Hyvernat、Rodolphe Lepigre | 真 bash session；本機、自解壓 shell 封存、Docker、Codespaces | GPLv3 | 目標／檢查／重置分離、可恢復進度、逐任務回饋 |
| filesystem-ghost — sazarDev／sazardev repo | Go TUI＋自製命令層＋Afero 記憶體 VFS，非遊戲內真 Bash | MIT；音樂等資產仍需個別核對 | 輸入建議、歷史、簡明狀態與主題；避免壓力懲罰探索 |
| terrr — frgmt0 的 Rust 套件 | 原生 Rust TUI、模擬終端、虛擬檔案系統；非真 shell | manifest／README 寫 MIT，但 README 又稱刻意不開源，有矛盾 | 純文字異常與不可靠系統敘事的節奏，不宜當正確 shell 教材 |
| cmdchallenge — jarv | Web UI→Go 服務→Docker 執行／快取；真伺服器端命令，非瀏覽器 shell VM | MIT；OpenMoji 等另有來源 | 一題一目標、鍵盤操作、主動查看多種解法 |
| Terminus — mprat／Michele Pratusevich 等 | Web 版以 JS room／item 方法解析指令，模擬冒險世界，非 Bash | GPLv2 | 空間導覽、就地說明、參數補完；勿照教其幻想縮寫 |
| Bashcrawl — GitLab slackermedia 專案 | 玩家在真 POSIX 環境操作下載的資料夾／檔案／腳本；另列 Binder 遠端終端 | GPLv3 | 房間＝資料夾、現地短說明、每次只教少量動作 |
| clmystery — Noah Veltman | 資料檔＋玩家自己的真命令列；不是內建 shell 或 VM | MIT | 調查動機驅動檔案閱讀／查找、按需提示、工具小抄 |

> **本輪不建議直接把本案換成 Docker、VM、WASM、Go、Rust、Pygame 或第三方終端套件。** 這是依本案單檔／零網路／依賴限制作的架構判斷，不是聲稱這些技術無法製作終端遊戲；本輪優先借鑑學習回饋與資訊呈現。

## 1. Deadlock OS

### 官方來源與同名排除

- [Lholhe：作品／demo／下載頁](https://lholhe.itch.io/deadlock-os)
- [作者日誌：Docker Is Now Optional — Just Download and Play](https://lholhe.itch.io/deadlock-os/devlog/1647584/docker-is-now-optional-just-download-and-play)
- [作者日誌：Rank Up, ECHO, and Critical Breaches](https://lholhe.itch.io/deadlock-os/devlog/1696105/update-rank-up-echo-and-critical-breaches)
- [同名排除：Shivam96530/DeadlockOS](https://github.com/Shivam96530/DeadlockOS) 的 README 是作業系統 deadlock 視覺化作業，不是 Lholhe 的終端解謎遊戲。亦不可混成 Valve 的 Deadlock。

### 查證結果

- itch.io 的作者是 **Lholhe**，狀態 In development，標示 Godot，提供 Windows／Linux 下載與 HTML5 遊玩入口。
- 作者說標準模式使用內建終端模擬；偵測到 Docker daemon 時自動改用拋棄式隔離 Linux 容器，終端有模式指示。這是兩條不同執行路線，不應沿用早期「必須安裝 Docker」描述。
- 容器路線有第一方明確架構說明，但本輪未獨立啟動驗證；容器裡究竟是 Bash、ash 或其他 shell 未查明。Web build 的存在不證明瀏覽器可直接使用本機 Docker，也不證明內含 Linux VM。
- 最新查閱日誌明列 Academy→Critical Breach、ECHO 回饋角色、語法關卡可點的 command-verb chips、Docs menu。作品首頁仍留 `[N]`／`[X]` 等模板占位字，**關卡數、時長及首頁未填的提示規格不能當定案**。
- 未查得官方原始碼 repo 或可重用程式／劇情／美術的授權。Name your own price 只是取得遊戲的方式。

### 可借鑑／不照抄

- **互動**：提示 chip 只補指令動詞，不自動送出整個答案；保留玩家理解參數的機會。
- **教學**：明確寫出「模擬支援範圍」，比把所有東西都稱為真 Linux 更誠實；錯誤後才提供短提示。
- **視覺**：低干擾模式標籤與就近 Docs 入口，可轉譯為 Server 的短文字，不必引入大型桌面 UI。
- 不複製 ECHO 人格台詞、Academy／Breach 內容、等級命名、畫面、圖標、音效；不把計時 XP／廣告獎勵移植成 15 分鐘故事的既定機制。

## 2. Sudo Sanctuary

### 官方來源

- [vonhoon：Learn Linux bash with Sudo Sanctuary (WIP)](https://vonhoon.itch.io/sudo-sanctuary)
- [作者頁](https://vonhoon.itch.io/)
- [作品頁實際嵌入的啟動 HTML](https://html-classic.itch.zone/html/16406686-1536349/index.html?v=1782543029)（部署 URL 可能變更，應由作品頁重新取得）

### 查證結果與限制

- 第一方頁面自述 40+ 指令、pipe、Tab／歷史／剪貼簿、25 levels＋final boss、五幕、cookbook、三種教學模式、存取進度、多語系與 CRT 效果。這些是**作者列出的功能**，非本輪逐關／逐指令驗收結果。
- 作者明寫 **Pygame＋Pygbag、完全在瀏覽器執行**，並揭露 Claude／Gemini 協助製作。
- 嵌入 HTML 可見 Pygbag 0.9.2、Python 3.12、`pythons.js`、`cli-game.apk`、WASM 模組載入相關註解。可確認瀏覽器 Python／Pygbag 執行路線；`.apk` 在此是該啟動器的包名，不能誤當 Android 專屬執行證據。
- **「every command ... is real Linux」「No fake prompts」及標題中的 bash 是行銷說法，不構成 Bash 二進位、Linux kernel、VM、PTY 或伺服器端 shell 的證據。** 本輪未找到官方 repo／指令執行層證據，故保持「shell 實作未知；未證實真 Bash」，也不反向宣稱已證明全部是假指令。
- 未查得明確的程式／故事／素材重用授權；免費 HTML5、AI 協助都不替代授權。

### 可借鑑／不照抄

- **教學**：Guided→Hints→Expert 的支援程度可作比較；cookbook 與卡關提示應分工，前者查語法，後者幫理解目前任務。
- **互動**：命令歷史與補完降低打字成本；不能因宣稱支援 pipe，就承諾本案導入完整 shell 語法。
- **視覺**：CRT／震動只是氣氛選項；對本案以清晰靜態文字為優先，研究不代表採用特效。
- 不抄 janitor_temp、GHOST／WZRD、雙導師信任抉擇、五幕關卡、對白、ASCII 圖或成就；不因題材相似混成 filesystem-ghost。

## 3. Teach Terminal（Hack Club 平台作品）

### 身份鏈與官方來源

- [Hack Club Stardance：Teach Terminal by @Arsen，project 43792](https://stardance.hackclub.com/projects/43792) 明確連到下列 demo 與 repo。
- [作者 repo：Arsen-Gevorgyan/teach-terminal](https://github.com/Arsen-Gevorgyan/teach-terminal)
- [作者 demo](https://arsen-gevorgyan.github.io/teach-terminal/)
- [記憶體檔案系統原始碼](https://github.com/Arsen-Gevorgyan/teach-terminal/blob/main/docs/filesystem.js)
- [教學內容／預期命令資料](https://github.com/Arsen-Gevorgyan/teach-terminal/blob/main/docs/lessons-data.js)

### 查證結果

- 是 **Arsen 的參與者作品，由 Hack Club 平台展示**，不是 Hack Club 官方維護的 Bash 或官方課程。`teach.hackclub.com` 是另一個 TEACH initiative 頁面，不是本遊戲。
- README 明寫「Simulates」，列出 fake Linux filesystem；程式以 JS class、Map、內容字串及權限欄位建立檔案樹，足以確認自製模擬，不是 Linux VM／Bash。
- 作者頁列 25 課：Introduction、Navigation、Files、Text & Redirection、Permissions；有 Free Exploration／Guided Path、課程卡片與 localStorage 進度。
- 教學浮窗有 **Lecture→Practice→Success** 三階段；步驟用 `[x]`／`[>]`／`[ ]`，實作時另有 PRACTICE 文字與色彩，能收合／隱藏／重播。作者特別記錄每課開始重置模擬檔案系統，解決重玩衝突。
- 最新查閱作者日誌把 grep／head／tail、pipes 與 shell operators 列為 Next Steps。不可把規劃誤寫成已實作。部分更早日誌還提 Final Mission，最新說第 25 課改成祝賀頁；應以版本上下文區分。
- repo 根目錄未見 LICENSE，API license 欄未列授權；公開原始碼不代表可直接複製。

### 可借鑑／不照抄

- **最貼近本案的教學 UX 參考之一**：提示與終端並存、明確狀態、可收合，不必離開輸入區翻長篇教學。
- 文字進度標記適合 Server；群島卡片可保留豐富呈現，兩風格共享資訊而不必長得一樣。
- 值得研究「先解釋概念，再做一個動作，再回饋結果」；**不宜照搬固定 expected command 的驗收方式**，否則會把不同但有效的操作誤判成錯。
- 不抄課程文案、畫面、主題配色資產或程式；不搬帳號／密碼輸入門檻、25 課課程結構與強制解鎖順序到短篇故事。

## 4. GameShell

### 官方來源

- [phyver/GameShell：README、作者、安裝與授權](https://github.com/phyver/GameShell)
- [使用手冊：目標／檢查／重置／存檔](https://github.com/phyver/GameShell/blob/master/doc/gameshell.md)
- [GPLv3 授權檔](https://github.com/phyver/GameShell/blob/master/LICENSE)

### 查證結果

- README 指出由 Université Savoie Mont Blanc 教學需求發展；主要開發者 **Pierre Hyvernat**、**Rodolphe Lepigre**，原始概念是設定標準 bash session，定義任務與完成檢查。
- 本機可跑自解壓 `.sh`／`bash start.sh`；有 Linux／macOS／BSD 支援說明，以及 Docker、Dev Container／Codespaces 路線。這裡的 Docker 是包住真 shell 的可選環境，不是用 JavaScript 模擬 shell。
- `gsh goal` 重看目標；`gsh check` 檢查任務、成功進入下一題、未成功則重置；`gsh reset` 提供復原；`gsh help` 說明。退出可產生 `gameshell-save.sh` 恢復進度；預設 Docker 啟動方式另有不存檔限制。
- GPLv3；README 特別致謝 Joan Stark（jgs）的 ASCII art。**專案授權不應被當成所有第三方藝術都可免確認重製的保證。**

### 可借鑑／不照抄

- **最有價值之一：把「目前要做什麼」「我做到了嗎」「怎樣回復」分開。** 可作為本案既有說明與回饋的檢視準則，不必新增同名命令。
- 確認成功後才給短祝賀／下一步，避免只回傳通用「OK」而不說改變了什麼。
- 視覺參考在於可掃讀任務文字、少量終端裝飾；不用搬城堡世界與 ASCII 圖。
- 不照搬失敗自動重置、教師密碼才能跳題、全班紀錄與自解壓腳本架構；故事狀態一旦被重置可能傷害探索體驗。

## 5. filesystem-ghost

### 官方來源

- [sazardev/filesystem-ghost：作者 repo／README](https://github.com/sazardev/filesystem-ghost)
- [VFS 實作](https://github.com/sazardev/filesystem-ghost/blob/main/internal/adapter/filesystem/vfs.go)
- [命令處理層](https://github.com/sazardev/filesystem-ghost/blob/main/internal/adapter/commands/handler.go)
- [MIT 授權檔](https://github.com/sazardev/filesystem-ghost/blob/main/LICENSE)

### 查證結果

- 同名以 repo owner **sazardev** 與描述「A Cyberpunk Command Learning Game」確認；不是 Ghost 部落格系統的 storage adapter，也不是 Sudo Sanctuary。
- Go 原生 TUI，README 列 Bubble Tea、Lip Gloss、Bubbles、Afero；`go install .../cmd/ghost@latest` 為官方安裝方式。
- `NewVirtualFS()` 實際呼叫 `afero.NewMemMapFs()`，維護遊戲 folders／files maps；讀寫與權限在該層處理。因此**遊戲內命令是模擬操作，不能把 README 的 real Linux commands 當成真 Bash**。原生程式可讀取音樂／設定也不代表命令能操作主機任意檔案。
- README 自述 9 級、逐步解鎖指令、alert／noise、狀態／背包、魚式 inline suggestion、Tab、右鍵方向鍵接受建議、歷史、六種主題、可調難度與音樂。未逐項試玩驗收。
- 專案 MIT；音樂與其他素材來源本輪未逐檔查明，不推定可全數搬用。README 的音樂安裝段落亦有「需另裝」與「已內嵌」不同說法，不把它當可靠部署範本。

### 可借鑑／不照抄

- **互動**：讓補完候選與已輸入命令有視覺區別，按鍵明示如何接受；不要替玩家自動送出。
- **教學**：就近列目前可用動作，清楚說明 status 與故事狀態的關係。
- **視覺**：用少量高對比標籤／對齊文字顯示狀態，較適合 Server；色彩不可是唯一訊號。
- 不抄 Ghost collective、2077 公司滲透設定、關卡代號、口號、ASCII／音樂／圖像。不把「多打指令增加偵測」直接移植：這可能懲罰初學者看 help、列目錄與自由探索。

## 6. terrr

### 可追溯來源與身份

- [crates.io 套件頁](https://crates.io/crates/terrr)（套件發布入口）
- [docs.rs：0.1.1 作者上傳的 README／套件說明](https://docs.rs/terrr/0.1.1/terrr/)
- [發布包 Cargo.toml.orig](https://docs.rs/crate/terrr/0.1.1/source/Cargo.toml.orig)
- [發布包原始碼目錄](https://docs.rs/crate/terrr/0.1.1/source/src/)
- [Lib.rs 索引](https://lib.rs/crates/terrr) 僅用來發現作品；該站自稱非官方索引，不當作作者背書。

### 查證結果與矛盾

- 套件 owner／README credits 指向 **frgmt0**；查到版本 0.1.0／0.1.1，發布日期 2025-02-25。不要混成搜尋結果中的 Steam Workshop 條目或泛稱 terrr 的帳號。
- Rust 原生終端程式，manifest 列 crossterm／ratatui 等。README 明說 simulated terminal、virtual filesystem、不存取玩家真實檔案；標準 Linux-style commands 是遊戲介面，不是真 shell。
- 官方安裝說明是 `cargo install terrr` 後執行 `terrr`。README 的 `github.com/yourusername/terrr` 是**占位 URL，不是已確認的作者 repo**。`terrr.frgmt.xyz` 在 README 中屬未來計畫，本輪未確認可用官網。
- README 一邊說「intentionally not open-source」，另一邊寫 License MIT；manifest 同樣是 MIT，docs.rs 亦提供發布包 source。記錄這個**授權／意圖表述矛盾**，不擅自替作者解釋，也不據此搬程式或故事。

### 可借鑑／不照抄

- **敘事**：系統文件、回應語氣與少量異常可共同透露真相，不一定要另開角色對話框。
- **節奏**：正常、可預測的輸出先建立可信感，異常才有辨識度；不要讓每行都 glitch。
- **視覺**：短促異常文字可轉化為靜態訊號；長篇刪除線／組合字不適合中文可讀性、複製與輔助科技，不能把「看不清楚」當難度。
- 不抄 TERRR 系統、Dr. Elena Novak、隱藏指令／謎底、恐怖敘事或特殊文字資產。「必須打破終端規則」只適合敘事討論，不可讓玩家誤學 shell 行為。

## 7. cmdchallenge

### 官方身份鏈與來源

- [官方 demo：cmdchallenge.com](https://cmdchallenge.com/)
- [官網直接連到的 repo：GitLab jarv/cmdchallenge](https://gitlab.com/jarv/cmdchallenge)
- [README：架構、啟動方式與輸入行為](https://gitlab.com/jarv/cmdchallenge/-/raw/master/README.md)
- [作者 jarv：From serverless to server](https://jarv.org/posts/from-serverless-to-server/)
- [授權檔](https://gitlab.com/jarv/cmdchallenge/-/blob/master/LICENSE)

### 查證結果

- 官網與作者文章相互連結，身份可靠。不是泛稱 command challenge 的任意練習站。
- 作者文章說明 Go 服務處理請求、啟動 Docker 容器並以 SQLite 快取；現行 README 同樣有 runner images 與本機 Compose 路線。可確認**伺服器端真命令／容器路線**，不是全在瀏覽器中的 JavaScript shell 模擬。
- 作者提到 single VM 是部署服務的主機，**不是每位玩家瀏覽器有一台 Linux VM**。本輪未逐項稽核 runner、隔離安全或部署版本，不把快取回應等同每次都新開真 shell。
- 現行 README 描述前端 native DOM／ES modules；實際網站明列 Enter 執行、Shift+Enter 換行、Up/Down 歷史、Tab 補完、double Tab 候選、Shift+Tab 離開命令欄。頁面有 View Solutions。
- MIT 專案；官網另列 OpenMoji，不推定第三方圖像與程式授權完全一致。

### 可借鑑／不照抄

- **UX**：一屏聚焦一個目標、一次輸出與下一步；提供主動展開的解法，而不是預先洩漏答案。
- **鍵盤可用性**：補完與焦點離開機制都需有明確規則；避免 Tab 成為輸入區的鍵盤陷阱。這是檢視本案的候選準則，不是已認定本案有 bug。
- **教學**：可比較不同有效解法的想法；實作若只接受字串相等會失去這點。
- 不照搬具體題庫、通關圖樣、OpenMoji 或 UI；不引入 Docker／Go 服務／網路呼叫，不把整體故事切成無關的刷題序列。

## 8. Terminus

### 官方來源與歧義

- [作者 repo：mprat/Terminus](https://github.com/mprat/Terminus)
- [README 連出的 demo](https://mprat.github.io/Terminus/)
- [Web 入口與作者 metadata](https://github.com/mprat/Terminus/blob/master/Web/index.html)
- [Web 指令分派／說明／補完](https://github.com/mprat/Terminus/blob/master/Web/static/javascript/Game.js)
- [GPLv2 授權檔](https://github.com/mprat/Terminus/blob/master/LICENSE.md)

### 查證結果

- 本文指 Linux-learning 冒險遊戲，不是同名 terminal emulator、Terminus 字型、TerminusDB 或其他遊戲。
- Web HTML metadata 列 **Shawn Conrad、Michele Pratusevich**。repo 也有 Java 目錄；本輪實際查的是 **Web 版**，不把它與其他實作混為一談。
- Web 版載入 jQuery Terminal、GameState／Room／Item 等自製物件；`Game.js` 把輸入拆成 command／args，再呼叫當前 room 的方法。這是 JavaScript 冒險模擬，不是 Bash 或 Linux VM。
- 開場提示 ls 看周遭、cd 移動、cd .. 返回、less 互動、pwd 定位；有 man 說明、歷史與依場景的路徑／物件補完。demo 對文字擷取器僅顯示圖像框，因此具體行為以 source 為證，不宣稱完整實測 demo。
- GPLv2。具體房間插圖與依賴仍應核對個別來源。

### 可借鑑／不照抄

- **互動**：用「現在在哪、能去哪、能看什麼」降低第一分鐘迷路；就地說明勝過一開始塞全部命令。
- **視覺**：地點圖像與終端分工的概念，可比較群島卡片與 Server 純文字如何呈現相同位置資訊；不是要求新增圖。
- **重要限制**：其 ls／pwd 有幻想式助記、less 可讀取／對話，與真 Unix 定義不完全相同。可借世界導覽方式，**不要抄錯縮寫或宣稱語意完全等同 shell**。
- 不搬房間、角色、世界地名、故事、解謎鏈、插圖與台詞；也不為了補完照搬舊版 jQuery 套件。

## 9. Bashcrawl

### 官方來源與鏡像辨識

- [原專案：GitLab slackermedia/bashcrawl](https://gitlab.com/slackermedia/bashcrawl)
- [README：本機與 Binder 玩法](https://gitlab.com/slackermedia/bashcrawl/-/raw/master/README.md)
- [入口 scroll：第一個現地教學](https://gitlab.com/slackermedia/bashcrawl/-/raw/master/entrance/scroll)
- [GNU GPLv3 授權檔](https://gitlab.com/slackermedia/bashcrawl/-/blob/master/LICENSE)
- [GitHub notklaatu/bashcrawl](https://github.com/notklaatu/bashcrawl) 自述是上述 GitLab 的 mirror。其他同名 fork／browser trainer 不自動代表上游提供相同路線。

### 查證結果

- GitLab owner／專案與 README 足以辨識本作品；本輪不另外推定帳號背後的真實身份。
- README 要玩家解壓後在自己的真終端 `cd` 到 entrance，`cat scroll` 開始；遊戲建立於**真資料夾、文件與可執行腳本**。名稱 Bashcrawl 不表示教學只限 Bash；作者寫的是 POSIX（Linux／BSD／UNIX）terminal。
- README 另列 Binder 啟動遠端 Terminal，並說明 session 暫時、斷線會重置；不是 Web 前端純 JS 模擬，也沒有證據可稱客戶端 WASM VM。本輪未實測 Binder 服務可用性。
- 重新解壓可重玩。macOS 解壓可能讓所有檔案變成可執行的警告，反映真檔案權限是玩法的一部分；不適合直接轉成本案的平台依賴。
- GPLv3，沒有將上游下載／解壓到本專案。

### 可借鑑／不照抄

- **教學**：第一張 scroll 只介紹 ls、cd，先讓玩家完成一小段探索，再引入新概念。
- **資訊架構**：說明存在於正在探索的地點；「需要時讀附近文件」可成為現有故事節奏的檢視方式，而非改寫來源資料的理由。
- **視覺**：純文字也能以短段落、範例與固定寬度排版建立空間感。
- 不抄地下城、卷軸、寶物、路線、腳本、措辭；不把整個資料夾執行／刪除／解壓重置流程搬進瀏覽器。

## 10. clmystery（The Command Line Murders）

### 官方來源

- [Noah Veltman：veltman/clmystery](https://github.com/veltman/clmystery)
- [教學小抄](https://github.com/veltman/clmystery/blob/master/cheatsheet.md)
- [MIT 授權檔](https://github.com/veltman/clmystery/blob/master/LICENSE.md)

### 查證結果

- README 直接署名 **Noah Veltman**、連作者網站與 GitHub。此處指原作，不混稱其他人的網頁重製版或翻譯 fork。
- 玩家 clone／下載資料，在自己的終端 `cat instructions` 開始；以真工具查閱／搜尋真文字資料檔。repo 不是一個內建 Bash 實作，也沒有 VM／WASM 的必要。
- repo 有小抄、八個 hint 檔與獨立 solution；小抄講路徑、Tab、grep、head／tail、管線、重導向及多種等效解法。這些是可確認的教材設計，不代表本案應全部支援。
- MIT。repo README 的大型 ASCII artwork 有署名痕跡，仍應逐素材核對；本輪不複製任何畫作或案件資料。

### 可借鑑／不照抄

- **最有價值之一：玩家先有「要查清一件事」的動機，再需要查檔與篩選資訊。** 命令不是孤立測驗，而是查證手段。
- **教學**：小抄、逐步提示與答案分開，可保留不同熟練度玩家的主動權；不用把每次錯誤都變成強制教學。
- **視覺**：證據文件的格式／標題就能形成故事，純文字無須堆大量裝飾。
- 不搬 Terminal City／TCPD、兇案人物、線索資料、謎底、提示文案、ASCII 圖；不把本案原始劇情改寫成偵探故事。

## 最值得保留的三個參考

1. **Teach Terminal：教學資訊狀態清楚且可收起。** 與原生 JS／瀏覽器情境最接近；可以只借「講解／練習／完成」「已做／目前／未做」的呈現原則。作者／Hack Club 身份鏈已找到，不再是無來源名稱。
2. **GameShell：目標、完成確認、復原各自清楚。** 重點是玩家能理解回饋，不是把真 shell 或 gsh 命令搬入本案。
3. **clmystery：用查證需求驅動探索，提示按需取用。** 最適合比較 15 分鐘故事的閱讀與操作是否互相支持；不需要採用原案情節。

補充：cmdchallenge 的焦點逃離／補完規則非常值得列為鍵盤 UX 檢視；Deadlock OS 最新 command-verb chips 是精準但不給完整答案的提示例子。

## 不能沿用的未證實描述

- **Sudo Sanctuary 是真 Bash／真 Linux VM**：未取得可靠實作證據。只有 Pygame／Pygbag／瀏覽器 Python 路線可確認；「真 Linux 指令」不是證明。
- **Deadlock OS 必須 Docker／所有版本都是容器**：與作者目前說明相反。標準模式是模擬；桌面可選容器。網頁版如何接容器、具體 shell、關數與時長未知。
- **Teach Terminal 是 Hack Club 官方 shell／支援完整 Bash**：錯誤歸因。是 Arsen 的展示作品；自製 JS 模擬；pipes 等在查閱日誌仍屬規劃。
- **filesystem-ghost 在遊戲內執行真 Linux commands**：名稱相同不等於執行相同；程式已顯示記憶體 VFS。
- **terrr 有已確認的 GitHub 官庫／授權狀態完全清楚**：README 的 repo 是占位；MIT 與「不開源」說明矛盾，必須保留。
- **Terminus／Bashcrawl 的任意 browser fork 就是原版架構**：不能跨版本、分支與作者合併證據。
- **免費／公開／AI 製作可直接搬資產**：沒有此種概括授權。

## 三個後續候選改進（僅供主代理與使用者評估）

### A. 可收合的情境教學／任務摘要

- 原則：重看目標、目前一步、按需語法幫助；Server 用短文字，群島沿用卡片，不改來源敘事。
- 參考：Teach Terminal 的狀態標記、GameShell 的 goal、clmystery 的小抄與提示分離。
- 評估問題：是否降低第一分鐘迷路；會不會遮住輸入／過早洩題；既有資訊是否已足夠，應先檢視而非直接新增。

### B. 輸入輔助與鍵盤規則檢視

- 原則：補完只減少打字，不自動送出／洩漏參數答案；歷史、候選、焦點離開方式能被理解。
- 參考：cmdchallenge 的 Shift+Tab／double Tab、filesystem-ghost 的 inline suggestion、Deadlock OS 只填動詞的 chips。
- 評估問題：新手是否知道下一鍵；純文字風格能否不用特效表達候選；輔助科技與既有操作是否衝突。先盤點目前行為，不預設缺少功能。

### C. 指令後的結果與錯誤資訊更精確

- 原則：分清語法錯誤、合法但未達目標、成功且狀態改變；提示先概念再語法，不把既定答案字串當唯一成功條件。
- 參考：GameShell 的顯式檢查、clmystery 的多路徑推理、Teach Terminal 的 Success 回饋。
- 評估問題：不改規則／劇情下能否讓玩家看懂發生什麼；是否會因提示新增劇透；能否維持兩種介面相同的遊戲真相。

以上三項皆是候選研究／驗證方向，**沒有直接實作承諾，也沒有授權改動原始資料、增加依賴或更換執行環境**。
