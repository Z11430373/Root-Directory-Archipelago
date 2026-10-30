# 流程引擎整合筆記

## API
- `src/expr.js`: `evaluate(source,{flags,vars,funcs}) -> boolean`，`ExprError`、`tokenize`；無 eval。
- `src/engine/index.js`: `new Engine({seed=5,event='demo-event-1',mode='self',onOutput})`。
- `await start()`、`await feed(raw,dt=0)`、`await advance(dt)`；dt/now/t0 是秒，commit.r 是毫秒；呼叫必須依序 await。
- 公開 `save, flags(Set), active, quests, mode, nick, world, branch, vfs, now, t0, ended, trace, ladders`。`mode=null|['input'|'choice',ref,node]`；建構時的模式保留在 `runMode`。另有 `inputMode` getter。
- `onOutput(text,kind)`：台詞 literal 後綴換行，`text_ref` 保留檔案原始換行；kind 為 dialogue/stdout/stderr/system/hint。`outputs` 保存同樣的 `{text,kind}`。
- `await summary()` 對應 walkthrough.summary；所有存檔函式除 newSave/score/fold 都以 async 呼叫。
- `await restore(save)`、`await Engine.fromSave(save,options)`：不增加 commit、不 seal、不改 head；重建可推知狀態。正式 save 不記任意 shell 檔案修改、讀取歷史、無 commit 的輸入/指令及 INPUT 口令狀態，無法精準還原這些；本機繼續須用主程式 envelope journal 重播。
- `advance` 直接排程門檻時刻，支援小數秒跨界；將多次 advance 合併不改變 commit.r、提示順序或台詞。已新增 29.75→30.25、839.85→840.15、899.85→900.15、959.85→960.15 與單次 960.15 秒的一致性測試。

## 保守遵循參考／測資的差異
- E-01：flow.quests.on_done 字面上是先效果後 task；Python 與測資是先 task/skip，再 say、sets、gives、checkpoint。採測資。
- E-02：flow.commits.order_within_event 寫 merge→card，實際 rules、Python、測資為 card→flag.k0→flag.b0.done→merge→branch.exit。採 rules/測資。
- E-03：Python tick 只在 mode=None 發 idle，CHOICE 也不自動提示；保留以免 timeup/newbie 多出 hint commits。INPUT 同樣不觸發 idle。
- E-04：Python say 忽略 lines/if/text_ref/vars/delayed；JS 實際印出台詞、依次數顯示口令提示、插值及延後三個有效指令印出三明治，不添加 say/commit，因此原軌跡不變。
- E-05：branch_exit 恢復進分支前 cwd（Python 行為）；文件寫 main 的 ~。一般走法進分支前本來就是 ~。
- E-06：host/host_led 強制 event='host-led'；lamp_success 保留 lamp/map/ckpt，省略 branch_offer；lamp_lit 的 flag.set 完成世界變更後直接 demo_vote，再投票結尾，不捏造 B0 或 Ch1 完成紀錄。UI 須標示共享存檔不供正式版匯入。
- E-07：restore 只能推知任務/旗標/世界/分支/提示階梯/投票；若分支已有 lost0_created，保守重建空 notes 與 /lost+found/#0，不能知道原先是刪整個家目錄或僅 notes。未記錄口令 INPUT 不可猜造；回到命令模式，可重新 systemctl start lamp。
- E-08：正式 save 不含最後一次無 commit 指令的 world_t/clock/idle、skip 待確認及 delayed 倒數；匯入從最後 commit 的 t/r 及零閒置起算。journal 能還原這些；一般貼碼匯入無法保證完全同一個畫面。
- E-09：CHOICE 的 save/help 依 flow 規格開放（Python 會當作無效選項）；不推進 world_t，不增 commit。結束後同樣只開放 save/help。

## 測試
- 已先建立 T5、T10 四走法、T11（輸出 notes/codes.txt 並直接跑 Python check_codes.py）。
- T5 已實跑通過（25 一致案例、6 必錯案例，另有型別/非短路斷言）。
- `node --test test/engine.test.mjs`：11/11 通過，包括 T10 四條走法的完整 says / 每筆 commit(kind,data,branch,chapter,t,r,id) / summary，以及 T11、真實台詞/if/變數/delayed、階梯、host、restore 與小數秒。
- `python -X utf8 demo/tools/check_codes.py demo-app/notes/codes.txt`：四碼皆完整，順序 digger / newbie / edge / timeup，分數與稱號及耗時全部與 T10 相同。

| 走法 | commits | head | 分數 | 耗時 |
|---|---:|---|---:|---|
| digger | 57 | f894961f | 200 | 6:21 |
| newbie | 67 | 60ed4984 | 60 | 14:56 |
| edge | 50 | 7476db7c | 115 | 3:59 |
| timeup | 61 | be87be2e | 60 | 16:00 |

- 整合實跑 `npm.cmd test`：248 tests、247 pass、0 fail、1 skip（T12 瀏覽器測試未啟用）；這不是 T12 通過宣告。
- Windows PowerShell `npm` 會命中被 execution policy 擋住的 npm.ps1，使用 npm.cmd；Python 外層控制台如出現亂碼，使用 `-X utf8`，測試 spawn 已設 PYTHONIOENCODING=utf-8。
