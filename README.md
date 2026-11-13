# 《根目錄群島》Ch0–Ch1 劇本資料包（v0.1.0）

燈塔島〈值班第一天〉與日誌港〈日誌港〉的完整劇本資料：檔案系統內容、lin 的信與 `.bash_history`、十個快題、兩張 OJ 工單、兩條分支與兩張知識卡、日誌產生器與驗證器。
文字給人讀的版本在 **SCRIPT.md**；給引擎讀的版本是各 YAML。

程式維護入口見 [SOURCE_GUIDE.md](SOURCE_GUIDE.md)：系統依賴、呼叫／資料流、存檔差異與資源清理責任。

## 完整專案與遊玩入口

此資料夾包含劇本資料、可遊玩的瀏覽器程式、建置工具、測試與文件。Bash 終端模式已整合在 `demo-app/`：

1. 開啟 `demo-app/dist/index.html`，可直接離線遊玩。
2. 在「模式」選擇 **Bash 終端**，輸入 `game start`；F2 返回群島模式。
3. 修改程式與重新建置請看 [demo-app/README.md](demo-app/README.md)；操作與整合紀錄請看 [Bash 終端驗收](demo-app/notes/BASH_TERMINAL.md)。

一般群島與終端風格皆採 just-bash，支援跨提交變數／函式、多行控制流程與重導向；終端風格另以真 xterm 呈現 ANSI。兩者均定位為 **Bash 相容模擬**，切換只改介面。驗收結果與歷史紀錄見 [Bash 終端驗收](demo-app/notes/BASH_TERMINAL.md)。

`demo-app/build.mjs` 會讀取上層劇本資料；開發與驗證時請保留目前完整目錄結構。原始碼、資料、測試、文件與建置產物均整合在這個專案資料夾內。

## 目錄

| 路徑 | 內容 |
|---|---|
| `SCRIPT.md` | 劇本全文（由資料檔自動展開），含憲章修訂史附錄 |
| `ENGINE_REQS.md` | 引擎必須支援的指令、check 型別、效能與決定性要求 |
| `AGENT_CHECKLIST.md` | 交給代理的驗收清單與回報格式 |
| `world/world.yaml` | 世界曆、GC、MOTD 條件行、資源起始值 |
| `world/charter.yaml` | **島嶼憲章 Rev 1–5**、傳說人物、現行版全文、lin 的未完成修憲案、舊設定保留清單 |
| `world/cast.yaml` | 角色（INIT、lin、GC、harbor-master、貓、ada、bo）與各自的祕密守則 |
| `world/fragments.yaml` | 金鑰碎片 F1、F2（F3–F8 登記代號） |
| `world/voice_guide.md` | 口吻守則、憲章幽默放在哪、全章日期數字 |
| `chapters/` | `ch0_lighthouse.yaml`、`ch1_logport.yaml`（檔案樹、檢查點、場景、三種遊玩層級） |
| `dialogue/` | `init.yaml`、`harbor_master.yaml`、`lin.yaml` |
| `quests/` | `ch0.yaml`、`ch1.yaml`（Q0-1…Q1-5，含 check 與 reference） |
| `tickets/` | `T0100`（值班簽到）、`T0427`（最常見的訪客）：題面、參考解答、錯誤解答、測資 |
| `cards/` | `K0`、`K1` |
| `branches/` | `B0`（alt/sandbox，平行）、`B1`（whatif/block-gc，假設） |
| `text/` | 所有較長的文字內容（`content_ref` 指向這裡） |
| `tools/` | `gen_logs.py`（日誌產生器）、`make_tests.py`、`validate.py`、`build_script_md.py` |
| `demo-app/` | 群島／Bash 終端應用程式、原始碼、完整測試、建置工具與離線產物 |
| `references/` | Bash 對照探針、開源原始碼研究、整合建議與研究副本清理紀錄 |

## 一鍵檢查
```
python3 tools/validate.py              # 需要 python3 + PyYAML
python3 tools/build_script_md.py > SCRIPT.md
```

## 這一版的幾個決定（沒有人叫我決定的，我替你定了）

1. **舊內容全部保留。** kestrel v2.4 的七條憲章原文成為 Rev 1；Ch2 的口令句、`amend-7.draft`、「lin 是第七條最後修改者」都照舊。幽默憲章 Rev 2–5 是疊在上面，不是取代。
2. **憲章負責好笑、世界負責冷。** 笑點只從憲章條文、harbor-master 的傳聞、日誌的 WARN/ERROR 出來。
3. **lin 的修憲案** 是這次新增的主線伏筆：他週五下午提交「第十條：root 由八位守鑰者各持一片、k-of-8 簽核」，被 CI 擋下（第七條矛盾＋週五下午＋貓罷工）。所以他才改走工程路線：把 root 拆成硬連結。merge 結局等於讓第十條真的通過。Ch0 只留兩處伏筆（`.draft.txt` 的 P.S.、`.bash_history` 最後三行）。
4. **Ch0–1 不透露碎片總數。** 只出現 `KEY-FRAG[1]`、`[2]`。驗證器有劇透護欄。
5. **手冊刻意不寫「GC 不得被封鎖」**（第六條的前半句）。玩家在 B1 真的封鎖時，模擬才亮出這一句。
6. **日誌的彩蛋層**：申訴日（憲章第八條）、`rotated/access.log.1.gz` 裡 lin 離開那晚的足跡（同一秒在兩座島：看著 GC，並替燈塔熄燈）。
7. **標準眨眼貓** 在 Ch0 是一個會變狀態的檔案：燈熄時罷工，燈亮後復工。

## 故事聖經（已同步，只新增沒有刪）

故事聖經文件已加到第 19 版：年表 lin 列、Ch2 憲章（Rev 5 疊在 v2.4 原文上）、`amend-10.draft` 遺物、Ch6 blame 揭露的新段落，另新增「附錄 A：島嶼憲章修訂史（Rev 1–5）」。舊內容都還在。

## 試玩版〈第一夜〉（活動用，15 分鐘，可存檔）

放在 `demo/`。是正式版資料的嚴格子集（ID 不改），存檔格式與正式版同一個 schema，所以之後可以直接匯入。

| 檔案 | 看什麼 |
|---|---|
| `demo/DEMO_DESIGN.md` | 設計書：時間軸、發現、分數、存檔與匯入、風險 |
| `demo/DESIGN_DECISIONS.md` | 這一輪補的缺口、我替你定的預設值、誠實的極限、還要你決定的事 |
| `demo/AGENT_BUILD_PROMPT.md` | **給實作代理的完整提示詞**（範圍、技術決定、規格、驗收 T1–T12、回報格式） |
| `demo/flow.yaml` | 流程規格：事件→動作規則、引導階梯、運算式、對話執行期 |
| `demo/integrity.yaml` | 匯入的安全規則與可信度分級 |
| `demo/EVENT_KIT.md` | 活動主持包：前中後流程、收代碼、出統計 |
| `demo/DEMO_AGENT_CHECKLIST.md` | 真人試玩與活動前的驗收清單 |
| `demo/demo.yaml` | 設定本體 |
| `demo/testvectors/` | 對照答案：存檔（vectors）、真 bash 指令案例（conformance）、流程走法（walkthrough） |
| `demo/sample/` | 範例代碼、值班證、40 人統計 |

```
python3 demo/tools/validate_demo.py            # 試玩版自動檢查（含流程走法、測資、真 bash 一致性）
python3 demo/tools/flow_sim.py run digger      # 用參考模擬器走一條路線
python3 demo/tools/check_codes.py codes.txt    # 檢查前端匯出的代碼能不能被參考實作讀懂
python3 demo/tools/simulate.py golden digger   # 印出一份黃金路徑的代碼＋值班證
python3 demo/tools/savelib.py aggregate codes.txt
```
