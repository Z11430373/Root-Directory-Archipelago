# 第一夜：整合契約

資料包為唯讀來源；不修改任何現有 YAML、text、測資或 Python 工具。

## 分工
- 主架構師：package.json、build.mjs、src/data.js（產生）、src/main.js、src/ui/、整合與 REPORT.md / FINDINGS.md。
- 存檔代理：src/save/、vendor/pako*、test/save.test.mjs、notes/save.md。
- 世界代理：src/vfs.js、src/loggen.js、src/shell/、src/quests.js、test/world.test.mjs、notes/world.md。
- 流程代理：src/expr.js、src/engine/、test/engine.test.mjs、notes/engine.md。

## 共用資料
`src/data.js` 匯出 `DATA`：`{yaml: {'demo/demo.yaml': parsedObject, ...}, text: {'text/ch0/xxx.txt': exactUtf8Text, ...}}`。
build.mjs 從資料包根目錄讀取並產生此檔；測試前先 `npm run data`。

## 存檔 API（src/save/index.js）
- canonical(value), crc32(text), async commitId(parent,body)
- newSave(nick,seed,pack?,event?), async addCommit(save,kind,data,r,t=0,chapter='ch0',branch='main')
- seal(save), pack(save), async unpack(object), async exportCode(save), async importCode(code)
- checkShape(save), async verifyChain(save), async level(save) => [level,reasons]
- fold(save), score(save), async toFullgame(save), async card(save), async importFile(jsonText)
- 保持 Python 參考的 camelCase 對應語意；fold 的 flags 使用 Set。

## 世界 API
- `createWorld(chapter='ch0', seed=5, flags=new Set())` 從 src/vfs.js 匯出，回傳 VFS。VFS 包含 cwd/home、resolve(path)、exists(path)、empty(path)、readFile(path)、writeFile(path,text)、clone()；可加方法。
- `execute(raw,vfs,{flags,branch,...}={})` 從 src/shell/exec.js 匯出，回傳 `{stdout,stderr,rc,reads}`；reads 是讀到的絕對路徑陣列。同步執行，VFS.cwd 就地更新。敘事／hint／skip／git 等由 Engine 處理；Shell 對其回空輸出（lamp status/mail 例外）。
- `generateLogs({seed=5,linesPerDay=100,days=30,npc=true}={})` 從 src/loggen.js 匯出 `{accessLog,errorLog,manifest}`。
- `checkQuest(check,raw,output,manifest,vfs?)` 從 src/quests.js 匯出 boolean。
- 請世界代理自行在 notes/world.md 記錄補充介面，流程代理可直接讀其檔案。

## 流程 API（src/engine/index.js）
- `new Engine({seed=5,event='demo-event-1',mode='self',onOutput?}={})`
- async start()：發 session.start
- async feed(raw,dt=0)：先推進 dt 秒再送出輸入
- async advance(dt)：虛擬時鐘；瀏覽器由主程式換算 wall clock 秒數呼叫
- 屬性：save, flags(Set), active, quests, mode(input/choice/null 或可辨識 tuple), nick, world, branch, vfs, now, t0, ended, trace, ladders
- `onOutput(text,kind='dialogue')` 供介面；trace 含 ['say',ref]；async summary() 供 T10
- 流程以 Python 行為與 walk 測資為準；超出測資但規格要求的顯示、延遲對話等也要實作。衝突記入個人 notes，不改來源。

## 驗收
先寫測試；T1–T4 / T5–T9 / T10 依序作為整合閘門。代理不要 commit；主架構師統一里程碑提交。不得測試通過就誇大成完整驗收。
