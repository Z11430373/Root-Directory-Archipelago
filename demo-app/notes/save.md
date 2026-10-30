# 存檔／安全實作

範圍僅為 `src/save/`、`vendor/pako*`、`test/save.test.mjs` 與本檔；未修改來源資料、其他代理的檔案或 package 依賴，沒有 commit。

## API（`src/save/index.js`）

- 同步：`canonical(value)`、`crc32(text|Uint8Array)`（回傳 unsigned integer）、`newSave(nick,seed,pack?,event?)`、`seal(save)`、`pack(save)`、`checkShape(save)`、`fold(save)`、`score(save,cfg?)`。
- 非同步：`commitId(parent,body)`、`addCommit(save,kind,data,r,t=0,chapter='ch0',branch='main')`、`unpack(object)`、`exportCode(save)`、`importCode(code)`、`verifyChain(save)`、`level(save)`、`toFullgame(save,rules?)`、`card(save,rank?,cfg?)`、`importFile(jsonText)`。
- `verifyChain` 回傳 `[ok,badIndexOrNull]`；`level` 回傳 `[intact|suspicious|broken,reasons]`。匯入函式回傳存檔本體，並不額外添加未列入白名單的完整性欄位。
- `fold.flags` 為 `Set`；其餘狀態與 score 欄位沿用 Python 的 snake_case。`card` 回傳與 Python 逐字一致的純文字，DOM 請用 `textContent`。
- 額外匯出：`CodeError`、`plausibility(save)`、`fmtTime(seconds)`、`inflateBounded(bytes,limit?)`。
- `newSave` 和 `addCommit` 是可信引擎的建構函式，依 Python 不逐筆重新驗證整份存檔；`addCommit` 快照 data，回傳新 commit。所有匯入在返回前均驗證形狀。
- **與 Python 相同，新增 commit 後 `head` 不會自動刷新；請在 autosave、完整性評估、匯出前呼叫 `seal(save)`。** `pack` 也會呼叫 seal。呼叫者須依序 await addCommit，不能對同一存檔並行追加。
- `exportCode` 驗證既有鏈，再壓縮、立刻重新匯入並比對 head／重建鏈。失敗丟 `CodeError`（`code='export_self_check'`），附 `rawJSON` 供 UI 警告及下載原始 JSON；不把損毀檔靜默洗成完整代碼。
- 所有 `importCode`、`importFile`、`unpack` 失敗均轉為 `CodeError`。UI 應 catch，顯示錯誤但維持原本遊戲狀態，不顯示成成功匯入。
- 使用主建置提供的 `DATA.yaml`，鍵為 `demo/demo.yaml`、`demo/integrity.yaml`、`demo/import_rules.yaml`；runtime 不讀磁碟／網路。

## 壓縮庫及安全界線

- 已用 `npm.cmd pack pako@2.1.0 --pack-destination C:\Users\user\AppData\Local\Temp\opencode` 取得官方 npm tarball。
- npm 公布 SHA-1：`266cc37f98c7d883545d11335c00fbd4062c9a86`；vendor 為未修改的 `dist/pako.esm.mjs`（226,347 bytes）與原始 MIT `LICENSE` → `vendor/pako.LICENSE`。zlib 授權註解亦保留在 ESM 原檔。
- 沒有新增 runtime/package 依賴。瀏覽器以 Web Crypto SHA-256 雜湊；Node 測試注入 `crypto.webcrypto`（必要時）。
- `Inflate({windowBits:15,chunkSize:4096})` 僅允許 RFC1950 zlib；自訂 onData 在每塊輸出超標時立即 throw，不使用 `pako.inflate()` 先完整解壓。
- 保留輸出不超過 262,144 bytes；檢測溢位時最多另產生一個 4,096-byte 塊，即中止，不保留該塊。5MB 測資的錯誤附 `inflatedBytes`，測試斷言它不超過 266,240 bytes，並斷言耗時 <1秒。
- 壓縮輸入逐 byte 餵入（代碼長度已限制），使第一個串流結束點可見，避免 pako 高階 API 自動接續第二個 zlib 串流。gzip、raw deflate、尾隨垃圾／零、串接串流、壞 Adler32、截斷、無效 UTF-8、BOM 均拒絕。
- token-aware JSON parser 在解析當下限制深度、字串及節點數；拒絕浮點語法（即使 `1.0`、`1e0` 最終等於整數）、NaN／Infinity、超出 JS safe integer、重複鍵（含 escape 後同名）、`__proto__`／`constructor`／`prototype`。
- 嚴格檢查 meta／commit／data／packed wrapper 的鍵、完整 commit hash 欄位、六元素 packed row、整數時間與累加上限；400 筆上限及所有形狀在重算雜湊前檢查。packed 的 branch/chapter sentinel 僅接受整數 0，不接受 false/null/空字串。
- Python bool 是 int 的子類，JS 必須使用嚴格型別；schema、seed、t/r、dt/dr、hint.n 不接受布林，end.time_up／hint.full 不接受數字。
- `fold.seconds` 實作整數毫秒的 ties-to-even 捨入，避免 JS `Math.round` 和 Python `round` 的 .5 差異。

## 參考矛盾／保守解讀（供主代理併入 FINDINGS）

1. **F-S01：`savelib.check_shape` 未拒絕 commit 多餘鍵，也未檢查 id/parent、demo/demo_id/head 的完整型別。** 依 integrity 的嚴格 shape 與安全要求補齊；缺少或格式不合法的 hash 欄位直接 CodeError，有合法 hash 格式但鏈對不上才是 broken。未封存的 JSON 可以省略 head（T4 正是如此），packed 代碼必須含 head。
2. **F-S02：Python `schema == 1` 會讓 true 過關，`unpack` 會把 false/null/空字串當成 branch/chapter 的 0，dt/dr 布林也可能累加。** 與 integrity「布林不可當數字」矛盾，採嚴格 int／0；原測資無此差異。
3. **F-S03：Python JSON 解析接受重複鍵及任意精度整數，只有 parse_float／parse_constant 被攔截；部分錯誤型別會拋 TypeError 而非 CodeError。** 加 token-level 安全限制、ASCII／64 字元／深度／節點數、safe integer 與完整異常轉換。不能只靠 JSON.parse reviver 判斷數字原始語法。
4. **F-S04：Python `_inflate_bounded` 不處理 unused_data，pako 預設也會接續多個串流。** 本版拒絕尾隨資料及多串流，避免未受檢查的壓縮尾端；不影響任何規範匯出。
5. **F-S05：Python `verify_chain` 只在 head 為 truthy 且非空 commits 才對帳。** 本版只要 head 欄位存在就與鏈尾（空鏈為 null）嚴格對帳；矛盾的 null／空鏈 head 標記 broken，不給徽章。
6. **F-S06：Python JSON 檔入口容許 4×262144 個字元，但代碼入口是 262144 bytes。** 本版檔案與代碼統一 262144 UTF-8 bytes，避免大輸入與字元／byte 差異；400 筆合法存檔不受此收緊影響。base64url 亦要求 canonical padding bits。
7. **F-S07：Python `export_code(pack(save))` 可重建損毀鏈；重新輸入後 head 不同仍只回 broken，沒有 export self-check。** 本版依建置提示的強制自檢規則，不輸出被洗白的代碼，提供 rawJSON 錯誤屬性；損毀 JSON 仍可匯入、繼續單機遊戲及下載原始 JSON。
8. **F-S08：正式版匯入工具和 prompt 同時說試玩版端「只繼續自己的存檔」，但驗收 T2 要比對 fullgame。** 保留純資料轉換 `toFullgame` API 供精確測試，不實作正式版遊戲入口。host-led 的不供正式版匯入屬主 UI／流程模式政策，存檔形狀沒有新的 mode 欄位，未擅自添加白名單外欄位。
9. **F-S09：`add_commit` 不處理既有 head；`seal` 的契約是匯出前呼叫。** 維持此參考語意，整合端須在持久化／匯出前 seal。不要把尚未更新的 head 當作儲存狀態給 level。

## 測試實錄

- 先建立 T1–T4，再執行得到缺少 `src/save/index.js` 的紅測試；之後實作。
- `node --test test/save.test.mjs`：**129/129 通過，0 skipped，最後一輪約 2.03 秒**（Node v24.19.0；Python 3.12.10）。Python 子程序用 `-B`，不產生額外 bytecode 檔。
- T1 規範化／commit id／CRC 全部相同；T2 的 9 accept + 3 suspicious 以完整物件 deepEqual 逐欄比較每個 expect（包含 fullgame），並逐案測代碼回存；T3 的 30 reject 全為 CodeError；T4 的竄改 JSON 接受但 broken／unverified／無徽章及 perks。
- 最後一輪原始 T3 zip_bomb 約 **5.96 ms**；另有串流超限輸出量／262144 正好邊界測試。
- 測資外另含數字 token、bool、重複鍵、原型欄位、packed shape、meta／hash／commit keys、非字串 API 輸入、循環物件、getter、RFC1950 包裝／尾端／checksum、UTF-8、data 快照、Python round、空存檔、各 commit kind、head 邊界及 export fallback。
- `Interop: JS exports and card text agree with Python savelib for every accepted vector`：12 份 JS 匯出由真實 Python `savelib.import_code` 接受，所有 expect（含 fullgame）及 card 純文字逐字相同。**這是存檔互通測試，不冒稱 T10/T11 四條 Engine 走法已完成。**
