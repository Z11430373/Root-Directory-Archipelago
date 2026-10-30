# 第三輪整合 UI／無障礙檢視

## 範圍與方法

- 受測產品：〈根目錄群島〉離線單檔試玩版，基線 0.2.0，修復候選 0.3.0。
- 目標：**WCAG 2.2 AA 的局部檢視**，不是整站符合性認證。44×44 CSS px 列為額外操作建議／2.5.5 AAA；2.5.8 AA 為 24px 或符合間距／例外，兩者不可混稱。
- 方法：Chrome／Playwright 真 DOM、鍵盤／滑鼠事件、computed CSS 色值與幾何量測、可存取名稱／描述／焦點斷言；未安裝新套件，無 axe／Lighthouse 分數。
- 狀態：歡迎與貼碼、暱稱、指令、口令、投票、歷史輸出、閒置提示、動態 reduced-motion、兩種風格／主題、320／360／768px。原有 T12 涵蓋離線、HTTPS、結尾與存檔對話框。
- 沒有新增 Figma 檔、上傳產品畫面或移植外部設計。本輪是既有 DOM／CSS 與操作修復，不是重設計。

## 摘要與單一議題登錄

基線 `test/round3-ui.test.mjs` **8 tests，0 pass、8 fail、0 skip**，12.90 秒。斷言為正常預期，不使用 todo／expected failure；保留八項原斷言。以下「修復」必須與最終完整測試紀錄一起閱讀。

| ID | 影響／原始證據 | 對照準則 | 修復與驗收 |
| --- | --- | --- | --- |
| R3-UI01 | P1：連按 PageUp 第二次仍回到同一頁；scrollTop 4285→3864→3864 | 2.1.1 A 相關鍵盤可操作性；不單憑此宣告整項失敗 | `finish()` 無待播內容即返回；UI01 驗證可連續翻閱 |
| R3-UI02 | P2：讀者停在歷史頂端，idle hint 強拉到 4321 | 可預測性／可用性，不硬套不適用的準則 | follow-output 狀態尊重捲動；送出新指令才明確回到底部；UI02 |
| R3-UI03 | P2：桌機 details summary 停用 pointer，鍵盤卻能開關 | 2.5.6 AAA 相關輸入機制；一般一致性改善，不冒稱 AA 強制 | 移除 pointer 屏障與強制展開 CSS，保留原生 details；UI03 |
| R3-UI04 | P1：暗色貼碼欄邊界對背景僅 **1.91:1** | 1.4.11 AA 非文字對比 | 分離裝飾線／控制邊界 token；兩種風格、兩種主題皆測 ≥3:1；UI04 |
| R3-UI05 | P2 建議：手機 select 高21px、chips 高36px | 2.5.8 AA 需檢查間距／例外；44px 是額外推薦／AAA，不把所有小於44者報為 AA fail | 手機設定、快捷、執行與摘要擴大 hit area，保留水平快捷捲動；UI05 |
| R3-UI06 | P2：播放中切換 reduced-motion 沒有反應 | 偏好尊重／2.3.3 AAA 相關；文字揭露不等於已證明違反該動作動畫準則 | 訂閱 media change，立即完成文字，destroy 清 listeners；UI06 |
| R3-UI07 | P2：暱稱／指令／口令／投票均叫「終端機輸入」，Tab 行為無關聯說明 | 3.3.2 A、4.1.2 A 相關標籤與操作說明；不宣稱原本完全沒有 name | 動態名稱、可見 keyboard-help、aria-describedby、Shift+Tab 離開說明；UI07 |
| R3-UI08 | P2：貼碼失敗未標 invalid、未關聯錯誤／回焦點 | 3.3.1 A、3.3.3 AA 相關；原本已有文字錯誤，缺的是欄位關聯與恢復體驗 | aria-invalid、錯誤描述、聚焦欄位；UI08 |
| R3-UI09 | P2 新回歸：360×280切換Server後workspace底165px，輸入170.30–205.30px，中心命中grep按鈕 | 1.4.10 AA 相關重排／輸入可操作性；未單憑此宣告完整準則結論 | 加workspace最小高度，Server手機最小遊戲高度與群島一致300px；低高度可垂直頁面捲動，UI09驗證原始hit-test，不靠程式focus／scroll救援 |

## 實作與性能

- `src/ui/terminal.js`：保留一次一段文字的 live log／aria-busy；用 Text node 增量追加而非每 tick 重建完整 prefix，避免大型輸出的重複 O(n²) 前綴工作。Unicode 以 code point 處理；完成後內容不變。
- 保留1200行 DOM 上限，不修剪可攜存檔；刪除舊行時同時移除 detached animation queue，destroy 解除 scroll／click／media listeners。
- `src/main.js`：新指令明確 follow；名稱依輸入模式刷新；提供鍵盤說明與匯入錯誤語意。
- `src/ui/theme.css`、`server.css`：控制邊界 token 與裝飾線分開，手機 hit area／header 高度同步調整；不改劇情資料與存檔格式。
- `test/round3-terminal.test.mjs` 的最小 DOM instrument 只驗證增量追加、無動作 finish、監聽清理與 queue 上限；真實幾何／瀏覽器行為仍以 Playwright 測試為準。

## 驗收證據與限制

- 初輪修復候選：UI08項全過；連同既有 Styles／UI-extra為26/27，一項既有 reduced-motion 測試發現初始 aria-busy 遺漏。已補初始 `false`，未改其斷言。
- 第二次定向回歸：本輪10項 UI、5項 Terminal instrument、既有9項 UI-extra，**24/24 通過，0 fail、0 skip，9.00秒**。補充控制含錯誤編輯後清除、檔案與貼碼欄位分別標錯、Shift+Tab 真正離開輸入欄，以及連續排隊動畫跟隨／歷史閱讀不跟隨。
- 後續獨立交叉review確認UI09新回歸；最初測試呼叫scrollIntoView後會通過，因為程式捲動overflow:hidden可掩蓋問題。改為符合真操作順序的幾何檢查後穩定紅，再修CSS；此修正測試setup沒有放寬預期，反而移除測試對產品的意外救援。
- 首次完整0.3.0候選驗收363項362過／1敗；UI09與本輪全部UI、Terminal控制都通過。唯一失敗為kiosk救援副本清除，屬存檔guard整合，不能用此結果宣稱全套已綠；原始逐項輸出另存`test-results-v0.3-first.txt`。
- 第二次完整候選364項363過／1敗，kiosk清除正反控制均過；原T12在縮屏後立即查details的open時抓到斷點事件更新延遲。補window／visualViewport resize的同步斷點更新入口，僅真正跨斷點才改開合（不因鍵盤高度變化重設使用者選擇），並加暫停clock下反覆跨斷點控制。原T12斷言不改；輸出保留`test-results-v0.3-second.txt`。
- 第三次完整候選366項365過／1敗：原T12已過，但主代理新寫的反覆斷點控制要求`setViewportSize()`返回就完成JS事件處理，desktop反向失敗。追加ResizeObserver亦無法保證該前提，已撤回無效產品改動，交由獨立代理核對原生事件時序；不把「多跑一次綠」當已診斷。
- 獨立代理時序探查：沒有mock clock也出現寬度1280／matches=false／open=false而resize、change、RO紀錄皆尚未送達；先訂閱原生resize，事件microtask讀DOM的8次控制皆正確，未推進clock。故不成立的是新測試同步oracle，不是已證實的lastCompact錯態。只校正新控制setup為原生事件屏障，保留相同open斷言；原T12及八項基線UI斷言完全不改。修復並未加入產品輪詢或任意等待。
- 三次候選失敗輸出分別保留於`test-results-v0.3-first.txt`／`-second.txt`／`-third.txt`；不把診斷過程改寫成一路全綠。
- 本輪最終完整驗收：**366/366 通過，0 fail、0 skip，33.58秒**，見`test-results-v0.3.txt`。本文件所有九項UI與補充控制已通過；不代表下列未測項也通過。
- 相同產物／條件再次完整驗收仍為**366/366、0 fail、0 skip，33.08秒**，見`test-results-v0.3-repeat.txt`；未變更原T12或其斷言／時限。
- 最終完整結果以 `test-results-v0.3.txt` 為準；歷史 0.2.0 的292綠不能當本輪新斷言證據。
- **未測**：NVDA／VoiceOver 的實際宣讀與 live-region 更新節奏、Safari／iOS／Firefox／Edge、真實手機觸控與螢幕放大、forced-colors、真人15分鐘閱讀節奏、涵蓋所有 WCAG 準則的完整稽核。不用 ARIA 屬性或一張 accessibility snapshot 代替讀屏實測。
- 固定15／16分鐘規則可能涉及 **2.2.1 A Timing Adjustable**。是否屬 essential timing 例外尚未確認；本輪無權擅改原始規則，不能因此宣稱產品符合 WCAG 2.2 AA。

## 建議後續驗證

1. Windows NVDA＋Chrome／Firefox 與 iOS VoiceOver 實測 log、口令、投票、錯誤焦點、dialog／回焦點。
2. 真機觸控、200%／400% 放大與 forced-colors；必要時另建正常紅測試再修，不放寬現有斷言。
3. 由產品／無障礙負責人決定計時規則的可調整方案或可佐證的例外，再談完整符合性。

無外部議題建立或發布；此文件與 Shell／狀態議題彙入 `FINDINGS.md`，避免另產生重複的設計報告。
