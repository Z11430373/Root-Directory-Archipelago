# 故事聖經取得與對照研究

日期：2026-11-10｜版本：0.3-reconciliation｜角色：整合者（非故事作者）。

本文件記錄新取得的 [故事聖經](../source/《根目錄群島》故事聖經.md)（2026-10-27, @Zien, SHA-256 `5F5886C1E1E143E9ADA47A9DE24778317B2C1CCF14027D3E19D7F379172E8EA4`）對既有規劃文件的影響。它不取代 [NARRATIVE_DEBATE](NARRATIVE_DEBATE.md) 的作者裁決，也不把聖經全文當成規劃已全部採納。

## 1. 來源地位

- 聖經為**正文權威**；既有 `SCRIPT.md`、`world/*.yaml`、規劃書為**已實作／已知事實**與**規劃提案**。
- 衝突一律列於 [SOURCE_MAP](../SOURCE_MAP.md)，不以多數決或代理補寫消掉。
- 本研究只做「取得阻塞解除」與「必要／充分條件對照」，不把聖經的敘事提案直接寫進 ENGINE／SAVE 契約。

## 2. O-N 事項的現在狀態

| ID | 之前 | 現在（依聖經） |
| --- | --- | --- |
| O-N01 | 正文未取得 | **已取得**；取得阻塞解除 |
| O-N02 | 八空格未知 | 部分解除：排序規則為 `ls -ltr` 依 mtime 由舊到新；輸入格式／AT 設計仍待作者 |
| O-N03 | 隱藏結局未知 | 部分解除：隱藏結局為 `fork`，條件 8 片＋K0–K8 全部九張卡 |
| O-N04 | F3–F8/K2–K8 未知 | 基本解除：F1–F8 藏法、K0–K8 來源與用途、四結局條件均明列 |
| O-N05 | 修憲 CI 時序未知 | 基本解除：附錄 A 給出 Rev 1–5 修憲鏈與 amend-10 被擋；mtime 仍不當藏片時間 |
| O-N06 | 三人簽核/k-of-8 未知 | 基本解除：quorum 三人、k=7 開門（rebase/revert）、k=8 merge/fork |
| O-N07 | T0100 vs INIT 登記關係 | 部分更新：聖經顯示 TICKET-0001 由 INIT 開啟，T0100 是獨立 OJ 工單；兩者分開，關係仍待作者裁定 |
| O-N08 | Ch2 草案全文 vs Ch3 首揭露 | 基本解除：兩種揭露層次（檔案可讀 vs 全文理解）已分開 |

O-N02、O-N07 仍保留「待作者／UX」解除條件；其餘為「基本／部分解除」，不等於充分條件已確認。

## 3. 與既有規劃的對照重點

- **碎片與結局**：規劃書的「7 或 8 片」與聖經「7 片開門（rebase/revert）、8 片 merge/fork」一致；`merge` 需 K4+K6，`fork` 需 K0–K8 全部九張卡。與 BOSS_AND_BRANCHES、REVEALS_AND_ENDINGS 的現行描述相容。
- **憲章**：聖經附錄 A 的 Rev 1–5 與規劃的 `amend-7`/`amend-10`、Rev 5 廢除 blame 條款一致；`ls -ltr` 的 mtime 說法仍依 D11 保留撤回，不把 mtime 當藏片建立時間。
- **分支與知識卡**：聖經的 B0–B7 與規劃 D19/D20 的 defer/done、main 旅行、F5 取件規則一致；F5 只能在 main 合法取得，聖經的 B3b 也是支線，線索可帶回但不複製物品。
- **TICKET-0001**：聖經揭露由 INIT 開啟、狀態 `OPEN (reopened 4 times)`，與規劃的「TICKET-0001 狀態 OPEN（reopened 4 times）」一致；INIT 的自白與規劃 Ch7 結尾一致。
- **工單**：聖經的十張範例工單（T0100、T0427、T0777、T0613、T1100 等）與規劃的原題 ID 保留一致；T0100 為 SEV-4 值班簽到，T0427 為 SEV-2 港口日誌。
- **節奏**：聖經的 18 週課表與規劃的 M0–M7 里程碑不同粒度，前者是教學進度，後者是發布關卡，不互相取代。

## 4. 尚待處理

1. 將聖經的章節細節（Ch3.5、Ch4、Ch5、Ch6、Ch7）與 [CHAPTER_BEATS](../narrative/CHAPTER_BEATS.md)、[REVEALS_AND_ENDINGS](../narrative/REVEALS_AND_ENDINGS.md) 做逐項對照，補齊必要／排除條件。
2. 將附錄 A 的修憲史與 [SOURCE_MAP](../SOURCE_MAP.md) 的 NAR-C01（Ch2 草案全文 vs Ch3 揭露）做最終裁決建議，仍由作者裁定。
3. 將 F5 的具體取法（閏日排程註解）與 D20 的「main 合法取件」對齊；聖經只給 `0 0 29 2 *` 的推理，不給具體操作。
4. 將 O-N02 的八空格輸入規則與 UX 的無障礙設計對齊；聖經只給排序規則。
5. 更新 [NARRATIVE_DEBATE](NARRATIVE_DEBATE.md) 的作者缺口表，但不重開已關閉的 R-L01–07。

## 5. 本研究不做的事

- 不把聖經全文複製進規劃文件。
- 不把聖經的敘事提案直接寫進 ENGINE／SAVE 契約。
- 不把 O-N 事項標成「已完全解除」；僅按上表的「基本／部分解除」等級登錄。
- 不重跑遊戲測試或文件結構檢查（已是 0 問題）。
