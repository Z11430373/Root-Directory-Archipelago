# 獨立找碴：狀態轉換／續玩／時間邊界

日期：2026-10-30。新增本文件及 `test/critique.test.mjs`；**未改來源資料、實作、既有測試，未建置、未 commit**。主代理同期的風格／偏好修改不是本代理修改。

## 結論與版本

- 發現 **5 個有正常紅測試的新缺陷**；另有 1 個可重現、非阻塞的模式邊界問題。
- 最高優先是 CRIT-01／02：本機自己寫出的 journal 可能無法續玩，不是可攜 RA1 缺少任意 Shell 狀態的已知限制。
- 執行 `node --test test/critique.test.mjs`：**6 tests、0 pass、6 fail、0 skip、0 todo，7.16 秒，exit 1**。其中 4 個引擎／儲存測試、2 個真實 Chrome UI 測試。六項均為下述真缺陷，不是工具缺失或未捕捉瀏覽器錯誤。
- **本次結案時尚未修正**；不能再以先前 262/262 通過宣稱這些狀態安全。若主代理後續修正，應保留原斷言並補記重跑結果。
- 閱讀了 AGENT_BUILD_PROMPT、REPORT、FINDINGS、前次 `notes/qa.md`、main、Engine、UI、storage 及既有測試；未發現 AGENTS.md。
- 查驗時 HEAD 為 `eae8e8e`，有主代理的未提交風格修改。最後記錄的 dist SHA-256：`137d60e959ee983ee78ebf6cdc448c56e6d460413b7cb57b32430847ae4e7acb`。主代理會繼續建置，故此雜湊只是查驗快照。
- **未回報舊 prefs malformed 問題**；主代理已另行實作 sanitizePreferences。也沒有重開前次 QA-01 或縮屏任務文字回歸。

## 主架構師後續修復與回歸（保留上述原始找碴紀錄）

- 0.2.0 重建後實跑 **292/292 通過，0 fail、0 skip**，包含本檔原始 6 項斷言；完整結果見 `notes/logs/test-results-v0.2.txt`。首輪 6 紅是歷史發現，不改寫成當時已通過。
- CRIT-01／02：journal 依即時浮點端點安全合併，長休眠 elapsed 不截斷；舊分組資訊遺失時保留原始紀錄並提供明確救援，不放寬鏈尾比較。
- CRIT-03／04：同題 skip 確認、資料驅動必要事件預算；405 hint／重複分支後仍能完成與匯入。格式合法但已無預留空間的舊活動存檔會無副作用拒絕，不偽稱已修復。
- CRIT-05：暱稱階段停用 hint／save 快捷並加狀態守衛；真正鍵入 hint 當暱稱仍合法。
- CRIT-06：本機回放與貼碼都沿用原模式／event／seed；新增補充黑箱測試證明在 host URL 下 head 與可攜內容不變。
- 另驗證舊浮點紀錄救援備份不覆寫、引擎拒絕過滿碼不更換現有頁面／存檔，以及 kiosk 重置清除救援備份。原始規格／測資未修改。
- 本測試檔只調整可選 Playwright 載入與測試登記順序，避免此 Node 環境的收尾停滯；6 個回歸斷言未放寬、未移除。

## CRIT-01 — P1：合併浮點 tick 改變 commit 毫秒與 ID，使未竄改本機存檔無法回放

**位置**：`src/storage.js:34–39`；`src/engine/index.js:87,356–384`；`src/main.js:145–150,185–187`。

**重現**（直接使用應用程式相同的 Engine／appendAdvance API，無注入存檔）：

1. Engine.start()。
2. advance(0.5)，輸入暱稱 `critique`。
3. advance(0.25)、advance(0.25)、advance(0.0035)，輸入 `hint`。
4. 即時引擎逐筆執行；用 appendAdvance 寫操作紀錄，再建立另一 Engine 按紀錄回放。

**預期**：自己產生的 journal 回放後，每筆 commit（含 r／ID）完全相同。

**實際**：合併後最後一段為 `dt:0.5035`。即時 hint 是 `r:504, id:fdd83287`；回放變為 `r:503, id:2b658d8c`。加法分組改變 IEEE754 誤差，剛好跨過毫秒四捨五入邊界。main 的鏈尾比較因此會拒絕該 journal。

**測試證據**：`CRIT-01: coalesced fractional UI clock journal reproduces every commit exactly`，deepEqual 正常失敗，差異正是上述 r／ID。這是確定性的應用 API 回歸，不冒稱已在真實人手節奏的 sub-ms 瀏覽器時鐘重現；Playwright 假時鐘不能精準代表所有分數毫秒。

**影響**：不必長時間遊玩或竄改；一個提示 commit 即可觸發。若原先沒有另外匯出，本機精準續玩被拒，任意 Shell 檔案只能留在無法讀取的 journal。

**建議**：統一整數時間基準／精度，或不要改變即時與回放的 advance 分組。不要透過略過 head 比對、修改既有存檔 ID 或放寬測試掩蓋問題。這是 JS 本機 adapter 新缺陷，不是來源 RA1 格式限制。

## CRIT-02 — P1：休眠／分頁凍結超過 45 分鐘，寫出自己必拒的 journal

**位置**：`src/storage.js:26–39`；`src/main.js:136,185–195`。

**玩家重現**（Chrome file://，假時鐘模擬單次一小時 timer suspension，不是真等一小時）：

1. 自助模式開始，輸入暱稱。
2. 執行 `echo SLEEP_VALUE > notes/sleep.txt`。
3. Playwright `page.clock.fastForward(3600000)`，模擬暫停後一次補跑 timer。
4. 出現時間到結尾，面板仍顯示「● 已自動存檔」。
5. 重新整理，按「繼續上次的存檔」。

**預期**：按照原本 15／16 分鐘規則結束，仍可恢復原 head；不因瀏覽器喚醒的 tick 太長失去精準續玩。

**實際**：「本機操作紀錄格式錯誤，請改用存檔代碼。」不能進入遊戲。appendAdvance 可直接寫 `{type:'advance',dt:3600}`，checkJournal 卻明確拒絕 `dt>2700`。自動存檔只檢查 JSON 能寫入，沒有保證可讀回。

**測試證據**：
- `CRIT-02: one-hour browser suspension creates a valid, lossless local journal`：checkJournal=false。
- `CRIT-02 browser: a saved shift survives one-hour suspension then reload/continue`：實際 UI 錯誤文字導致斷言失敗，無 console/pageerror。

**建議**：寫入端拆分長區間或以可安全回放的結構記錄；保持總 elapsed time，不可直接截成 2700 秒。讀寫驗證必須一致。也應提供既有失敗 envelope 的保全／恢復方案，而不只是要求玩家拿出從未匯出的代碼。這不是 RA1 格式的已知限制。

## CRIT-03 — P2：上一題殘留的 skip 確認，會跳過下一題

**位置**：`src/engine/index.js:57,310–326,482–489`。

**玩家重現**：輸入暱稱 → `skip`（只確認，尚未跳題）→ 一秒後 `ls`（正常完成 Q0-1）→ 一秒後 `skip`。

**預期**：Q0-2 第一次 skip 只詢問是否跳過；需要第二次確認。

**實際**：Q0-2 立即寫 skip commit，active 變成 Q0-3。先前 Q0-1 的 skip_pending 只存時間，任務完成時未清除，也沒有綁題目 ID。

**測試證據**：`CRIT-03: skip confirmation from a completed quest cannot skip the next quest`，實際 active=`Q0-3`，預期 `Q0-2`。

**建議**：確認綁定 `{questId, at}`，任務結束／active 切換時失效；仍保留同一題 10 秒內兩次 skip 的正常功能。

**分類**：新發現的真實轉換缺陷；來源 `demo/tools/flow_sim.py:576–580` 也只存時間，屬參考實作繼承問題，**不是既有測資對照失敗，也不是 FINDINGS 已列的限制**。修正應記錄這個保守偏離，不改來源／測資。

## CRIT-04 — P2：重複合法 hint 讓自己的 save 超過硬上限，所有續玩／匯入途徑失效

**位置**：`src/engine/index.js:329–352`；`src/save/validate.js:33`；`src/main.js:135,189–195`。

**重現**：開始並輸入暱稱；每秒輸入 `hint`，共 405 次；仍在 15 分鐘內，接著匯出／重新整理續玩。也可以一直按可用的「下一階提示」按鈕。這是壓力邊界，不聲稱是典型玩家節奏。

**預期**：重複支援的操作不應產生連自己都拒絕的 save；至少到達安全預算前要明確停止無新資訊的重複事件，並保留結尾所需空間。

**實際**：階梯 n 雖封頂 3，每次仍寫 hint commit。405 次後有 407 commits；exportCode 拒絕「commit 數量不合規則（上限 400）」。原始 JSON 也被同一 checkShape 拒絕，本機續玩在入口即拒絕；writeLocal 卻仍可顯示已自動存檔。不能以「提供原始 JSON」當成可恢復的保底。

**測試證據**：`CRIT-04: repeated supported hint input never makes the app own save unimportable`，407 commits，exportCode 丟 CodeError。

**建議**：執行端遵守 hard limit，處理已飽和的重複階梯並保留之後必要 commit 預算；不要放寬匯入 400 上限、修剪已存在的 hash chain，或只把失敗訊息藏起來。

**分類**：來源參考亦每次顯示都寫 hint，屬尚未記錄的「合法操作可越過來源存檔安全界線」整合缺陷；需要實作端政策，不修改來源 hard limit。

## CRIT-05 — P2：尚未輸入暱稱時點 hint／save，會偷偷用指令當暱稱開始遊戲

**位置**：`src/main.js:104–106,180–183`；`src/engine/index.js:402–419`。

**玩家重現**：按「開始值班」→ 停在「暱稱 >」→ 點快捷列的 hint，或面板「下一階提示」。另一個相同路徑是點 save。

**預期**：尚未登記暱稱時，不可把「求助／存檔」介面當作玩家輸入暱稱。可停用這些動作或顯示先輸入暱稱。

**實際**：hint 被提交到 INPUT，登記成 `op-hint`、啟動計時、寫 started commit；save 則登記成 `op-save` 並立刻開存檔框。若本機本有另一份存檔，這個原意只是求助的點擊還會覆寫它。

**測試證據**：`CRIT-05 browser: hint shortcut cannot silently register hint as the player nickname`，原 `data-head=''` 變成 `e10de7e4`，提示符為 `op-hint@lighthouse:~$`。

**建議**：暱稱 INPUT 狀態下停用兩種 hint 按鈕及 save 快捷；不要改「玩家真的鍵入 hint 作為合法暱稱」的引擎格式規則，也不要影響口令 INPUT 可用指令離開的功能。這是 UI 新缺陷。

## CRIT-06 — P3／非阻塞：換成 host URL 後，仍提供無法成功回放的個人存檔

**位置**：`src/main.js:73,142–150`。

**玩家重現**：自助模式輸入暱稱 → `systemctl start lamp` → `lamp-before-sudo` → 在同一 context 開相同頁面加 `?mode=host` → 按仍顯示的「繼續上次的存檔」。

**預期**：要明確選擇沿用原執行模式，或在歡迎畫面說明該存檔屬其他模式；不能把自己造成的回放差異說成玩家存檔壞了。

**實際**：「本機重播的鏈尾不同。請改用存檔代碼或 JSON。」新的 host runtime 在點燈處增加投票 commits，卻拿它和原 self head 比。回到原本 self URL 還可續玩；**未觀察到這個失敗本身刪掉原存檔**，所以不是 P1 資料丟失。

**證據**：獨立 Playwright 真 UI 探查，原 self head=`6861a703`，host continue 後上述錯誤、game hidden=true。沒有留下對未定跨模式政策過度設限的紅測試。

**建議**：統一保存模式／目前 URL 模式的優先政策；對不相容模式預先提供「以原模式繼續」而非嘗試錯誤重播。規格未定義跨模式搬移，這項不應阻擋已定功能交付。

## 反向檢查與驗證邊界

- **失敗匯入不覆寫既有本機進度：本次探查通過。** 先用 UI 建 `notes/import-guard.txt`，刷新後貼錯 CRC 的 `RA1-nope-deadbeef`，收到 CRC 錯誤；再按繼續，原 head 相同，新一次 cat 輸出 `IMPORT_GUARD_QA\n`。沒有把此處誤報為缺陷。
- 探查過 320×568、280×653、812×375、760×280、768×300 的遊戲版面：本次未看到水平溢出。矮視窗有垂直頁面捲動，不能因此宣稱「輸入無法使用」；未列審美／非阻塞版面偏好。
- 看到 Shell `rm` 的逐指令 main 保護，沒有把單純 compound command 當成可繞過保護的假漏洞。
- 沒有重跑完整 262 項、HTTPS、Safari／iOS、Firefox／Edge、真實軟鍵盤或螢幕閱讀器；本輪不對它們追加通過宣稱。沒有確認新的 XSS／外洩漏洞，不等於完整安全稽核通過。
- 原已記錄的 RA1 不含任意檔案／cwd／未記錄輸入、BRE 子集、純前端不能防作弊、真人節奏尚未驗證，均不重報成新 bug。

## 重跑

在 `demo-app/` PowerShell（**不經 npm test，避免由本代理重新建置**）：

```powershell
$env:RA_PLAYWRIGHT = 'file:///C:/Users/user/AppData/Local/Temp/opencode/ra-browser-tools/node_modules/playwright/index.mjs'
$env:RA_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --test test/critique.test.mjs
```

沒設瀏覽器工具時，兩項 browser 測試會明確 skip；不算通過。四項單元回歸不依賴外部瀏覽器，仍會檢查真正不變量。
