# 世界層整合備忘

## API（保持 ARCHITECTURE.md 契約）
- `createWorld(chapter='ch0',seed=5,flags=new Set())`；`flags` 保留參照，`readFile` 每次依目前旗標選取內容變體，點燈後不必重建世界。
- VFS：`cwd`、`home`、`chapter`、`manifest`；`resolve`、`exists`、`empty`、`readFile`、`writeFile`、`clone`。
- 補充：`mkdir(path,{recursive=true}={})`、`isDirectory(path)`、`isFile(path)`、`list(path=cwd,{all=false}={})`（回名稱陣列）、`filePaths()`、`dirPaths()`、`stat(path)`、`sameInodePaths(path)`、`link(source,dest)`、`remove(path,{recursive=false,force=false,preserveHome=true}={})`、`iterChunks(path)`、`iterTailLines(path,count)`（直接從尾部找行）。
- `writeFile(path,text,{append=false,parents=true}={})` 預設建立父目錄，供 flow 的 `create_file` 使用；shell 重導向改用 `parents:false`，不會憑空建立路徑。
- `clone()` 深複製 inode/目錄/內容變動，但保留 clone 內硬連結關係；旗標 Set 仍共用（flow 規定全域旗標）。
- `execute(raw,vfs,{flags=vfs.flags,branch='main'}={})` 同步回 `{stdout,stderr,rc,reads}`；額外 `readEvents` 為 `[{path,same_inode:[...]}]`，`reads` 只放實際命名的絕對路徑、同次輸入去重。
- `execute` 不發 flow 事件、不寫 commit、不切換世界/分支。`mail` 回信件並記讀取；`systemctl status lamp` 回目前狀態。其他敘事指令留給 Engine（包括 sudo/close/man ticket-0001），避免重複輸出。
- `merge --knowledge` 是 flow 明訂的白名單例外；`block`、`pass` 離開 choice mode 回 command not found。
- `generateLogs` 同契約，另接受 `now='2031-12-07'`、`nick='op-zien'`、`peers=[]`、`lines_per_day` 別名；額外回 `rotatedLog` 方便檢查 I7。
- `checkQuest(check,raw,output,manifest,vfs?)`；`file_matches` 只看 cwd 內新建檔（不含原始檔/access.log）。

## 發現／取捨
- W-01：章節 ch0 明列空 `/lost+found`，但 T6 參考產生器會把所有非 home 空目錄刪除（不只 ch1）。以測資為準，初始 ch0 不保留它；flow create_file 會自動建父目錄。
- W-02：ENGINE_REQS 允許只守日誌不變量，但本次採較嚴格 AGENT_BUILD_PROMPT T8，必須 sha256 和整份 manifest 一致，不跳過日誌案例。
- W-03：正式版 ENGINE_REQS 的 zcat/gzip/who/wall/fsck/submit 等不在 demo 的 29 指令白名單；遵循 flow/demo 的範圍，不把它們偷偷開放。`man fsck` 仍能讀資料包手冊；其他敘事 man 交 Engine。
- W-04：只實作試玩版的小日誌規模；檔案內容使用字串儲存，管線採惰性 chunk/line iterator，head 提早停止、檔案 tail 從尾部反查，sort 必須緩衝排序資料。未聲稱達成正式版 120 萬行惰性生成及 2 秒效能要求。
- W-05：BRE 必要子集（錨點、點、跳脫點、字元集合、星號）及 GNU 單字元 `\+`/`\?`、interval、非重複群組均支援；非必需的「群組後接重複量詞」保守拒絕，降低 JS RegExp 巢狀重複卡住 UI 的風險（並非完整 ReDoS 保證）。未跳脫的括號/加號/問號/大括號/管線字元，在 BRE 中保持 literal。不是完整 bash/完整 GNU grep 相容層。

## 狀態
- 已先建立完整 T6–T9 測試，初跑因模組尚未實作而紅，之後補實作。
- T6 逐檔 UTF-8 sha256、完整檔案/目錄集合；T7 全 71 案例（含 15 個日誌案例），T8 完整 sha256 + 每個 manifest 欄位；T9 七題所有 pass/fail，均不選案例、不 skip。
- 額外測試：硬連結 clone 隔離、動態貓變體、rm 防護（含 $HOME/*）、notes hidden/absent、讀取事件與 inode 別名、引號/短路/不安全語法拒絕、BRE、cut/sort/uniq、head 惰性及 tail 定位、新檔判題。
- 額外直接執行未改動的 Python 參考程式取得 seed 0/1/4294967295（含 npc=false、300 lines/day）之 access/rotated sha256，再以固定測試比對。
- 最終 `node --test test/world.test.mjs`：105 tests、105 pass、0 fail、0 skip（279.5 ms）；日誌 sha256=`09a7fd1fbbabd2d78c49da7c3dc4d6c7cd052ac22af1a9e800f49041aaefdd4c`。
- 整合 `node --test test/*.test.mjs`：252 tests、251 pass、0 fail、1 skip（既有 T12 browser opt-in），2.41 秒；包含 T10 四走法與 T11 Python 互通均通過。此為目前快照，其他代理若續改仍須主代理重跑。
- 沒有修改資料來源／參考工具／測資，沒有 git commit。
