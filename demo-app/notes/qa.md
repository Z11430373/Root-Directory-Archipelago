# 獨立 UI 補充 QA

日期：2026-10-30。只新增 `test/ui-extra.test.mjs` 與本文件；未改實作、既有測試、測資，未重建 dist，未 commit。

已閱讀 `demo/AGENT_BUILD_PROMPT.md`、`src/main.js`、`src/ui/terminal.js`、`notes/engine.md`、既有 `test/browser.test.mjs` 及相關流程規格。

## 實跑結果

首輪使用現有 `dist/index.html`、Windows Chrome、Node v24.19.0：**9 tests，8 pass、1 fail、0 skip，11.09 秒**，exit code 1。這不是整套 T12 通過宣告。

後續狀態：主代理已回覆在 `src/main.js` 加上 document click capture → terminal.finish，將重建 dist 並跑全套。**QA-01 標為「主代理已修正，待重建後回歸」**；本獨立 QA 尚未對修正後產物重跑，不能將首輪 8/1 改報為 9/0。依主代理安排，不重複執行全套。

### 主架構師最終回歸紀錄（非改寫首輪 QA 結果）

重建 `dist/index.html` 後，主架構師以瀏覽器環境變數啟用全部測試，執行 `npm.cmd test -- --test-reporter=spec --test-reporter-destination=notes/test-results.txt`：**262/262 通過，0 失敗、0 跳過**。本檔 9 項補充測試全部通過；外部點擊案例 629.58ms。QA-01 已關閉。完整證據在 `notes/test-results.txt`，原紅測試未修改斷言。

| 新增測試（名稱前綴均為 `T12-extra:`） | 結果與證據 |
|---|---|
| keyboard-only Q0-1, unique command/path Tab completion and real ls submission | 通過。從歡迎畫面用 Tab/Enter 開始，實際鍵入暱稱與指令；`pw` + Tab 精確成為 `pwd `，執行得到 `/home/op`；`l` 多候選不變，補上 `s` 再 Tab 精確成為 `ls `，Enter 後進 Q0-2；另驗 `cat han` → `cat handbook.md ` 並執行進 Q0-3。此路徑沒有 click/fill/focus。 |
| local resume retains uncommitted echo/append files and cd cwd over two reloads | 通過。echo、cd、append 前後 head 不變；兩次 reload/繼續後，新的 pwd 與相對路徑 cat 分別證明 cwd、原始檔內容與追加內容仍在。 |
| local branch resume retains cloned hardlinks/files/cwd without mutating main | 通過。main 建檔與硬連結；分支改寫連結、另建檔、cd，head 不變；reload 後分支名/cwd/兩個連結內容/分支檔均保留；abandon 回 main 後兩連結恢復原內容、cwd 恢復進分支前位置，分支獨有檔不存在。 |
| UI imports its own in-progress RA1 without changing head or portable state while clock is paused | 通過。在另一個全新 context 的歡迎 textarea 貼入本次 UI 匯出的 RA1，驗證原 head、暱稱、Q0-2 與提示階梯；再次匯出後，完整可攜 payload 相等。performance.now 全程暫停，不會因自動提示誤改 head。 |
| host really lights lamp then votes directly; typed/chip save and RA1 import preserve the choice | 通過。真正完成 Q0 五題，驗證燈從 inactive → 口令 → active 與地圖文字，立即進 CHOICE；匯出有 lamp_lit、ckpt/ch0-lamp、demo.in_vote，無 branch.enter/Ch1；面板及匯出顯示共享警語。typed save 與快捷 save 後 payload 不變、不產生 choice；同碼另頁匯入仍可 save 後投 block，恰有一筆正確 choice；原 host 頁亦可投 pass，值班證顯示放行。 |
| a non-submit key instantly finishes genuinely animated text | 通過。no-preference 下推進 24ms，先驗證文字確實由空字串變成未完片段；Shift 在不推進時間下補完全部三行，沒有送出指令。 |
| a terminal click instantly finishes genuinely animated text | 通過。同樣先證明有真實動畫，點終端機後，不推進時間即補完全部三行。 |
| a click outside the terminal also instantly finishes animated text | **失敗，QA-01。** 同樣條件下點頁首 edition，文字仍為 `['RO', '', '']`。保留正常失敗斷言，未 skip/todo 或削弱成只驗點終端機。 |
| prefers-reduced-motion renders all welcome text without a key/click to skip it | 通過。reduce 下，開始後不再觸發補完事件、不推進 clock，三行立即完整；暱稱提交後登入文字亦完整，aria-busy=false。 |

另外，清空 `RA_PLAYWRIGHT` / `RA_CHROME` 後執行同一檔：**0 pass、0 fail、9 skip**，exit code 0；跳過理由明示缺少 optional Playwright。此結果不算瀏覽器驗證通過。

## QA-01：終端機以外的點擊不會補完文字

- 狀態：**主代理已修正，待重建後回歸**。修正內容由主代理回報，非本 QA 已驗證；原紅測試保持不變。
- 對應要求：`demo/AGENT_BUILD_PROMPT.md` §6「可按任意鍵或點一下立即顯示完」，以及本次 QA 指定的點擊即完成驗證。
- 重現：系統未要求 reduced motion → 開新遊戲 → 歡迎文字仍在逐字顯示時，點頁首「試玩版〈第一夜〉」。
- 預期：與點終端機或按 Shift 相同，立即完整顯示所有待播文字。
- 實際：未補完；假時鐘在 24ms 暫停時，點擊前後仍只顯示 `RO`，其餘兩行空白。這不是等待不足：終端機內點擊及 Shift 的對照案例在同一個暫停條件下會完整顯示。
- 相關實作：`src/main.js` 的全域 keydown 會呼叫 finish；`src/ui/terminal.js` 僅在終端機 node 綁 click，頁首點擊沒有相同效果。供主代理修正參考，本 QA 未修改實作。
- 單獨重跑：`node --test --test-name-pattern="outside the terminal" test/ui-extra.test.mjs`（先設定下列瀏覽器環境變數）。

## 執行方式

在 `demo-app/` 的 PowerShell：

```powershell
$env:RA_PLAYWRIGHT = 'file:///C:/Users/user/AppData/Local/Temp/opencode/ra-browser-tools/node_modules/playwright/index.mjs'
$env:RA_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/ui-extra.test.mjs
```

## 方法與驗證邊界

- 所有遊戲操作經真實 UI、鍵盤或指令輸入。只讀 DOM、公開 data-head 及 UI 匯出的 RA1；未 import Engine/Save 實作、注入遊戲狀態或直接讀寫 localStorage envelope。RA1 只用 Node zlib 解讀公開 pack 格式，並不取代既有 CRC/完整性測試。
- 檔案斷言只看該次新指令產生的輸出，排除 command echo 與 reload 重播的舊文字，避免假陽性。
- 每個 context 在 app 載入前安裝並**暫停** clock；動畫案例才明確推進 24ms。只 install 假 clock 並不等於已暫停。
- 沒有重走既有 digger 全流程。分支案例僅點燈/分支/abandon；host 僅 seg1–seg4 與投票。
- 本輪未重驗 HTTPS、手機/真實軟鍵盤、Safari/Firefox/Edge、完整走法、T1–T11、clipboard/storage 拒用或網路/CSP 驗收；這些不能由本檔結果推稱通過。
- 「任意鍵」以非送出鍵 Shift 實測，不宣稱逐鍵窮舉；動畫與 reduced-motion 驗證的是歡迎/登入輸出，不是所有劇情節點。
