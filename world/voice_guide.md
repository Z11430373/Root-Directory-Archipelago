# 寫作與口吻守則（Ch0–Ch1）

## 世界的分工
**憲章負責好笑，世界負責冷。** 笑點只從三個地方出來：憲章條文本身、harbor-master 的傳聞、日誌裡的 WARN／ERROR 行。
INIT、GC、lin 不說笑話；他們的冷幽默來自「克制」。

## 訊息前綴
| 前綴 | 誰 | 規則 |
|---|---|---|
| `[init]` | INIT | 短句，不用驚嘆號，不嘲笑玩家，Ch0–1 不說「我」超過兩次（T0100 彩蛋與 Ch1 結尾各一次） |
| `[init@分支名]` | INIT（在分支裡） | 加上分支名，並聲明「這是模擬」 |
| `[sim]` | 模擬器 | 只在假設分支輸出，逐字固定，不加評論（唯一例外：B1 的第六條提示） |
| `[gc]` | GC | 全小寫、不帶情緒。Ch0–1 沒有 [gc] 台詞；它只以 access.log 的一行出現 |
| `[PAGE]` | 呼叫機 | 只用在 INIT 呼叫玩家 |
| `harbor-master:` | 港務員 | 愛抱怨愛吹牛；吹牛的內容必須能被日誌否定或查無紀錄 |
| `—— lin` | lin 的信 | 短、溫柔、叮嚀，P.S. 收尾 |

## lin 的雙重讀法
Ch0–1 所有 lin 的文字必須同時成立於兩種讀法：
1. 玩家以為的：lin 是失蹤的 Admin 的徒弟／前任值班員。
2. 真相：lin 是最後一任 Admin。
所以他從不自稱「值班員」或「管理員」，只說「我」與「你」；手冊寫「管理員目前不在」，是他留下的一句刻意措辭。

## 不能提前揭露的事
- 碎片總數（只寫 KEY-FRAG[1]、[2]，不寫 /8）
- Admin 是頭銜；lin 是最後一任 Admin
- GC 是免疫系統；Admin 被回收
- TICKET-0001 是 INIT 開的（TICKET-0001 的報告人欄一律是 ████████）
- lin 的修憲案內容（Ch0 只留「週五下午想改一條憲章，CI 說不行」）
這些由 `tools/validate.py` 的「劇透護欄」自動掃描。

## 憲章幽默怎麼放
| 憲章梗 | 出現位置 |
|---|---|
| 標準眨眼貓（150 ms）、罷工、備用貓未登記 | Ch0 shelf/cat.txt（燈亮後復工）、lamp.log、Ch1 error.log、harbor-master `cat` |
| 道歉布丁、過期視同第二次漏洞 | Ch1 error.log（P-0007）、harbor-master `pudding` / `cake` |
| 拖鞋（WARN 等級，實體禁止進機房） | Ch1 error.log、harbor-master `slipper` |
| 鐘塔為準、「我這邊顯示是」 | Ch1 access.log 的申訴日（POST /appeal，UA wristwatch/0.9）、error.log、harbor-master `tower` |
| 老王（ferrous）與颱風季 | harbor-master `wang` |
| 3000 杯飲料、手搖店老闆首富 | harbor-master `drinks` |
| 週五下午不修憲、煮一個月咖啡 | MOTD 條件行、draft.txt 的 P.S.、bash_history、harbor-master `friday`、error.log |
| 掛機充人頭、至少一人清醒 | handbook 第三條摘要；Ch2 的 sentry 口令謎題沿用 |
| GC 不得被封鎖 | 手冊刻意不寫；B1 模擬在玩家真的封鎖時才亮出第六條 |

## 日期與數字（全章一致）
- 世界曆賽季 5：2031-12-07（日）開始，2032-02-29（閏日，日）結束，共 12 週。
- lin 離開：2031-10-27 02:00:00（lamp.log 最後一行）；登入時距今 41 天。
- 玩家登入：2031-12-07 07:30:00。
- F1 硬連結時間 2031-10-26 21:10；F2 21:40。
- GC：每晚 02:00:00，10.7.0.2，`gc/1.0 (sweep)`；渡輪車隊 10.7.0.23 在 02:00:12。
