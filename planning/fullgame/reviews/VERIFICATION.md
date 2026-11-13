# 本輪文件驗證紀錄

日期：2026-11-02｜狀態：語意有限重核完成；最終結構結果見末節。

## 已執行：來源封存

以 PowerShell `Get-FileHash -Algorithm SHA256` 比較使用者下載目錄附件與工作區封存：兩者相同。

```text
附件：C:\Users\user\Downloads\0\《根目錄群島》完整版規劃書.md
封存：planning/fullgame/source/《根目錄群島》完整版規劃書.original.md
SHA-256：2a1aaa762616446f748d14582f3e5010a563113d6211951c5c92d264df497cff
```

工作副本已修改，預期與原稿不同；不把工作副本的雜湊當作原稿證據。

## 文件檢查方法

在倉庫根目錄執行：

```powershell
node planning/fullgame/reviews/check-docs.mjs 'C:\Users\user\Downloads\0\《根目錄群島》完整版規劃書.md'
```

[檢查腳本](check-docs.mjs)只讀取檔案，檢查本地行內 Markdown 連結／標題錨點、圍欄閉合、JSON 語法、README 索引覆蓋、決策／工作包／ACC 編號及原稿雜湊。它是本文件包的輕量檢查器，不解析全部 Markdown 語法；語意一致性由獨立審查另查。

## 第一輪結構檢查（撰寫中）

- `node --check planning/fullgame/reviews/check-docs.mjs`：通過語法檢查。
- 首次執行檢查器：32 份 Markdown、357 個本地連結、11 個 JSON 區塊；JSON 語法、圍欄、索引與編號沒有報錯。
- 結果為 **exit 1，尚未通過**：15 處連結指向仍在撰寫的 `AUTHOR_RESPONSE.md`、`COMMAND_COMPATIBILITY.md`、`INTEGRATION_REVIEW.md` 三檔。這是中途檢查結果，完成稿仍須重跑。
- 同次檢查再次確認附件與封存 SHA-256 相同。

## 收尾進度

七位代理主筆與審查稿均已收齊。跨域0.4 §8列十項殘留，整合者採D21–D25後由同一審查者0.5關閉八項；最後補齊04逐維容量預留及09跨lineage writer因果順序，0.6 §10確認**20項指定規劃反例全部已解**。歷史判定保留，不改寫成初稿原本沒有問題。所有遊戲驗收仍未執行；各次結構檢查分時登錄。

## 第二輪結構檢查（整合中）

UX、敘事及互通完成稿到齊後再執行同一命令：**35 份 Markdown、429 個本地連結（含 8 個標題錨點）、14 個 JSON 區塊，0 問題，exit 0**；附件與封存雜湊仍相同。第一輪缺的三檔連結已存在。

這次只通過結構檢查；核心接點與獨立語意重核仍在收尾，最終修改後會補最後一次結果。新增 ACC 反例涵蓋 file.edit／counting provenance、輸出比較、D17 時序與 D18 批次結算；它們仍是未執行的遊戲案例。

## 敘事實際往返與有限重核

1. 反方初審列 N01–N13，其自擬 A/B 保留為選項比較。
2. 劇情主筆在 [AUTHOR_RESPONSE](../narrative/AUTHOR_RESPONSE.md) 真正逐項回覆，記錄對 B1 早期方案的撤回；D19/D20 是整合規劃，非作者批准。
3. 反方 R2 讀完成稿，裁定 3 已解／7 部分解／3 仍待作者，並提出 R-L01–07。
4. 整合者局部修訂六份敘事文件；反方 R3 再讀指定位置，**R-L01–07 全部關閉，N13 轉為規劃已解**。現行 **4 已解／6 部分解／3 仍待作者**，紀錄見 [NARRATIVE_DEBATE §9](NARRATIVE_DEBATE.md#9-r3僅重核-r-l0107-的修訂與關閉)。

已解的四項是知識→主線行動因果、免費提示政策、1.0 有界交班承諾、B0/B1 延期。其他事項仍需要正文、資料或後續實作證據；O-N01–08 均未解除。代理審查不代表玩家理解已驗或 Zien 已批准正史。

## 驗證界線

核心完成後曾再執行結構檢查：35 Markdown／440本地連結／15錨點／14 JSON／0問題、exit0；該次仍早於D21–D25及最後跨域重核。0.3修訂後`node --check planning/fullgame/reviews/check-docs.mjs`再次exit0，預期數量已改為25項決策／8項作者事項／25項ACC／13個工作包；這只是檢查器語法驗證。

0.3首次全包結構檢查為35 Markdown／441本地連結／15錨點／14 JSON，exit1：本段曾把「數量8／13」寫成看似作者事項／工作包ID，檢查器正確報2個未定義引用。已改為中文數量，不放寬檢查規則；附件比對仍相同，最後重跑另記。

本輪交付為文件，未執行完整版遊戲測試、新 schema／runtime、真人試玩、完整手機或讀屏器驗收；沒有新增任何通過宣稱。既有程式與原始內容的修改不列為本輪成果。後半正史及作者待決事項仍由 [DECISIONS](../DECISIONS.md) 管理。

## 最終交付判定

- 跨域語意：INTEGRATION_REVIEW 0.6 §10，20項規劃反例已解；每項關閉範圍與未測案例可追溯。
- 敘事：NARRATIVE_DEBATE R3，4已解／6部分解／3待作者；七處修稿關閉，八項作者事項仍在。
- 交接：WP1-A/B/C及各領域包責任明確；TRACE／EVIDENCE／SHARE／DOMAIN／PACK DSL／ReplayAssessment子schema先於相應producer啟用，runtime／性能／平台／真人關卡保留。
- 變更範圍：僅本文件包；原稿封存保留，未Git提交。入口為planning/fullgame/README.md。

### 最後結構檢查：通過

於獨立審查0.6及管理文件同步後，執行本檔§文件檢查方法的完整命令：**35份Markdown、441個本地連結（含15個錨點）、14個JSON區塊，issues=[]，exit 0**。編號定義及引用為25項決策、8項作者事項、25項ACC、13個工作包，均通過。

附件與封存SHA-256仍相同：`2a1aaa762616446f748d14582f3e5010a563113d6211951c5c92d264df497cff`，attachmentMatches=true。前次兩個錯誤引用已解除；未放寬檢查器。這次結果只證明所列文件結構與原稿一致性，不替代子schema實作、遊戲、平台或真人驗收。
