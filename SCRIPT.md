# 《根目錄群島》Ch0–Ch1 完整劇本

這份文件由 `tools/build_script_md.py` 從資料檔自動展開，內容與資料檔一致；改資料檔後重新產生即可。

世界曆：賽季 5，2031-12-07 開始，2032-02-29（閏日）結束；鐘塔時間，時區 +0000。


---

## Ch0 〈值班第一天〉燈塔島 lighthouse

**目標：** 學會 ls、cd、cat、grep -r，拿到 F1，重新點亮燈塔，第一次開分支。

**基調：** 日誌式的、克制的、有點冷幽默。這一章要讓玩家覺得「世界很安靜，但有人剛離開」。

**玩家起點：** lighthouse，世界時間 2031-12-07 07:30:00


### s0.1　呼叫機

*（黑畫面。呼叫機的聲音。）*

**對話 `init.pager`**

```
[PAGE] INIT -> op-<你的暱稱>
       燈塔機房需要人手。優先度：低。倒數：無。
       你是目前唯一回應的人。
```



### s0.2　登入

**對話 `init.login`**

```
Welcome to ROOT ARCHIPELAGO v5.0 (POSIX-ish / island)
 * 本島：lighthouse    uptime 41d    燈：熄
 * 上次登入：lin，41 天前
You have 1 new mail.
〔if not flag.mail_read〕 [init] 你有一封信。指令是 mail。
```


*（玩家輸入 mail。信是 lin 寫的。）*

**對話 `lin.mail_first`**

```
From: lin
To: 下一個值班員
Subject: 先 ls，再 cat，別急著 sudo

如果你收到這封信，代表 INIT 還有力氣呼叫人。
燈塔不會自己亮，但也不會自己熄。
手冊在家目錄。看完再去看窗外。
                                  —— lin
P.S. 日誌裡有一件事我沒寫進手冊。你自己找。
```

*設定旗標：flag.mail_read*



### s0.3　手冊

**快題 Q0-1｜列出家目錄有什麼**（學到：ls）

- 任務文字：[init] 任務：看看家目錄裡有什麼。
- 標準做法：`ls`
- 提示 1：[init] 指令是兩個字母，l 開頭。
- 完成：init.q0_1_done

**快題 Q0-2｜讀值班手冊，找出第一個口令**（學到：cat）

- 任務文字：[init] 任務：讀手冊。口令在裡面。
- 標準做法：`cat handbook.md`
- 提示 1：[init] 手冊的檔名在 ls 的輸出裡。
- 提示 2：[init] 讀檔的指令是 cat。口令在第 5 節。
- 完成：init.q0_2_done

**檔案 `/home/op/handbook.md`**

```
# 燈塔機房．值班手冊（rev 5）

> 寫給下一個值班員。字很少，請全部讀完。 —— lin

## 1. 你是誰

你是值班員。你的工作是「在」。
管理員目前不在。請不要等他。

## 2. 燈

燈亮，代表這座島有人值班。燈熄，代表沒有。
燈不會自己亮，也不會自己熄。
（我說過兩次了。第二次是怕你沒看第一次。）

## 3. 四個指令，先學這些

    ls        看有什麼（加 -a 連躲起來的也看）
    cd        走過去
    cat       讀
    grep      找（加 -r 連資料夾裡面都找）

## 4. 島嶼憲章．值班員摘要（Rev 5）

全文在權限堡的 /etc/charter。你現在只需要知道這幾條：

    第一條  島不屬於任何人，包括寫憲章的人。
    第二條  日誌只歸檔，不刪除。
    第三條  動用 root 須三名值班員同時簽核。掛機不算人，
            三人中至少一人必須清醒。
    第六條  GC 單次停頓不得超過一次眨眼
            （150 毫秒，以值班室的標準眨眼貓為準）。
    第九條  修憲須附測試並通過 CI。不得在週五下午修憲。

## 5. 值班登記

啟動燈之前，INIT 會問你口令。
口令：lamp-before-sudo
```

*（手冊第 4 節的憲章摘要是全遊戲第一次出現憲章；第 5 節是口令。）*


### s0.4　窗外

**快題 Q0-3｜找出隱藏的草稿**（學到：ls -a、hidden files）

- 任務文字：[init] 任務：notes/ 裡似乎有東西沒列出來。
- 標準做法：`ls -a notes`
- 提示 1：[init] 檔名以點開頭的檔案，ls 預設不顯示。
- 提示 2：[init] ls 加一個選項，就能看到它們。選項是 a。
- 完成：init.q0_3_done

**快題 Q0-4｜燈是什麼時候、被誰熄的**（學到：grep）

- 任務文字：[init] 任務：燈為什麼是熄的。日誌在 logs/。
- 標準做法：`grep lamp logs/lamp.log`
- 提示 1：[init] 日誌很短，讀完也行。但試試只找包含 lamp 的行：grep <字> <檔案>。
- 備註：整章的小暗號：燈不是被 GC 熄的，是 lin 親手熄的，時間剛好是 02:00:00。
- 完成：init.q0_4_done

*（lamp.log 的最後一行是整章的小暗號。）*

**檔案 `/home/op/logs/lamp.log`**

```
2031-10-13 18:03:11 lamp.service started by uid=lin
2031-10-13 18:03:12 lamp.service active (running)
2031-10-14 09:12:44 cat.service blink calibrated (150 ms)
2031-10-15 18:00:02 lamp.service brightness 80%
2031-10-17 18:00:02 lamp.service brightness 80%
2031-10-19 11:30:19 cat.service backup cat: not registered
2031-10-20 18:00:02 lamp.service brightness 80%
2031-10-22 23:41:08 relay.service click (moth was here)
2031-10-23 18:00:02 lamp.service brightness 80%
2031-10-25 18:00:03 lamp.service brightness 80%
2031-10-26 23:58:30 lamp.service flicker x2 (operator tired)
2031-10-27 02:00:00 lamp.service stopped by uid=lin
2031-10-27 02:00:03 cat.service on strike (no operator on duty)
```


### s0.5　沒有寄出的信

**快題 Q0-5｜全家目錄找出 KEY-FRAG**（學到：grep -r）

- 任務文字：[init] 任務：lin 的信說有東西沒寫進手冊。整個家目錄找 KEY-FRAG。
- 標準做法：`grep -r KEY-FRAG ~`
- 提示 1：[init] 單一檔案找不到的東西，可能在資料夾裡面。grep 有遞迴的選項。
- 提示 2：[init] grep -r <字> <目錄>。家目錄可以寫成 ~。
- 完成：init.q0_5_done（取得 F1）

**對話 `lin.draft`**

```
（草稿．未寄出）
給下一個值班員：

這一片先放在這裡。燈塔是最不會被收走的地方，因為每天都有人看它。
（或者說，曾經每天都有人。）

KEY-FRAG[1]: 7c1f-9a3e-0b44-e2d8

憲章第三條寫得很清楚：
    「任何持有 root 的操作，須有三名值班員同時在線。」
所以這一片，請不要一個人拿去用。找兩個人。至少一個要清醒。

                                  —— lin
P.S. 我這週五下午想改一條憲章。CI 說不行。
     CI 說得對。我也不想煮一個月的咖啡。
```

> 備註：引用的是憲章第三條的 v2.4 原文（舊設定），也就是 Ch2 對 sentry 念的口令句。 P.S. 的週五修憲是 Rev 5 第九條 + lin 修憲案（art10）的第一個伏筆。


*設定旗標：flag.draft_read*


*（（選擇性）玩家可以順手看 shelf/、incidents/、.bash_history。）*

**檔案 `/home/op/shelf/jar.txt`**

```
   ┌──────── RELAY #7 ────────┐
   │      \ /     \ /          │     標本 No.1
   │       (oo)====(oo)        │     第一隻 bug
   │    ───┤  ├────┤  ├───     │     採集者：moth（v1.x）
   └───────────────────────────┘
   備註：它不是在壞掉。它是在卡住。
```

**檔案 `/home/op/shelf/cat.txt`**（兩個版本：燈亮前／燈亮後；此為燈亮前，後者見 text/ch0/cat_working.txt）

```
 /\_/\    標準眨眼貓 #0
( -.- )   狀態：罷工中（已連續 41 天，與燈同期）
 > ^ <    備用貓：未登記
          眨眼 = 150 ms（憲章第六條）
```

**檔案 `/home/op/incidents/TICKET-0001.md`**

```
# TICKET-0001

狀態:     OPEN (reopened 4 times)
報告人:   ████████
嚴重度:   (未定)
建立:     v0.x
標題:     (空白)

描述:
  無法重現。

最後更新: 今日 02:00:00
          （每天都會更新一次，內容不變。）

> close: 權限不足（需要報告人或 root）
```

**檔案 `/home/op/.bash_history`**

```
ls
cat handbook.md
cd /var/log
cat boot.0
cd ~
grep -r lamp .
systemctl status lamp
man 7 init
ls -a notes
vi notes/.draft.txt
cat notes/.draft.txt
date
uptime
last | head -3
ssh permfort
cd /etc/charter.d
vi amend-10.draft
git push origin amend/art-10
cat /var/log/ci/last.txt
sleep 3600
```


### s0.6　點燈

**對話 `init.lamp_prompt`**

*（觸發：玩家執行 systemctl start lamp，且尚未點亮）*
```
[init] 值班登記需要口令。
```


**對話 `init.lamp_success`**

```
op@lighthouse:~$ systemctl start lamp
[init] lamp.service: active (running)
[init] 值班已登記：uid=1001 (op-<你的暱稱>)。
[init] 謝謝你回應。
```

*設定旗標：flag.lamp_lit, flag.cat_working*


**對話 `init.map_lit`**

```
[init] 燈亮了。其他島的燈，現在看得到了。
                    [ lighthouse  ✦ 亮 ]

   [ logport  ◌ 閃 ]      [ permfort  ▪ 暗 ]      [ mailisle  ◦ 微 ]

        [ cronmine  ◌ 整點才閃 ]      [ routereef  ◌ 閃 ]

        [ heapswamp  · 熄 ]           [ coldstorage  · 熄 ]

                         [ /  ? ]

  亮 = 有人值班　閃 = 不穩定　暗 = 只有程式在值班　熄 = 沒有人
〔if not flag.map_seen〕 [init] 亮：有人值班。熄：沒有。
```

*設定旗標：flag.map_seen*


*（shelf/cat.txt 的狀態變成『復工』。）*


### s0.7　第一夜的試誤（分支教學）

**對話 `init.branch_offer`**

```
[init] 你可以開一條分支。在分支裡，弄壞什麼都不要緊。
[init] 指令：git checkout -b alt/sandbox
[init] 也可以不開。
```


**分支 B0｜第一夜的試誤**（parallel，`alt/sandbox`，起點 `ckpt/ch0-lamp`）

進入：`git checkout -b alt/sandbox`

```
[init] 你可以開一條分支。在分支裡，弄壞什麼都不要緊。
```
- 觸發 `rm_anything` → [init@alt/sandbox] 還好這是分支。
- 觸發 `rm_anything_generic` → [init@alt/sandbox] 這是模擬。
- 觸發 `sudo_in_branch` → [init@alt/sandbox] 這是分支，也不行。lin 說過了。
- 離開 `git merge --knowledge` → [init] 已合併 1 張知識卡。歷史未被更動。
- 離開 `git abandon` → [init] 分支已捨棄。懸空 commit {n} 個，等待回收。
- 離開 `git tag <name>` → [init] 已標記 {name}。它不會再被改動。


**知識卡 K0｜世界可以被安全地弄壞**

```
在分支裡，弄壞什麼都不要緊。
每一個被刪掉的東西，都有人曾經引用過。
（所以刪除之前，先問一句：現在還有誰引用它？）
```


### s0.8　登記簿（選擇性工單）

**工單 TICKET-0100｜值班簽到**（SEV-4，獎勵 2 區塊 + 1 鑰匙幣）

```md
# TICKET-0100  [SEV-4]  值班簽到

報告人: registry (auto)    狀態: OPEN    獎勵: 2 sectors + 1 key

背景:   燈塔的登記簿只剩一個功能：把名字寫進去。
        上一支登記程式，在 41 天前跟著燈一起熄了。
        沒有登記，就沒有值班；沒有值班，燈就不算亮。

輸入:   一行文字：值班員的名字（1 到 30 個字元，可含空白與連字號）。
期望:   輸出一行：值班已登記：<名字>
約束:   時間 1000 ms / 記憶體 64 MB
範例:   輸入  lin
        輸出  值班已登記：lin
提交:   submit sol.py

（這是你的第一張工單。它很簡單。簡單是故意的。）
```
- 提示：man ticket-0100（1 鑰匙）：輸入一行，輸出一行。你在做的是 echo，只是多了前綴。；man -k input（2 鑰匙）：讀一行字串，去掉行尾換行。；man 7 solution（3 鑰匙）：name = input(); print('值班已登記：' + name)


### s0.9　渡海

**對話 `init.ch0_done`**

*（觸發：flag.lamp_lit and flag.f1 and flag.b0.done）*
```
[init] 燈塔今晚有人值班。
[init] 日誌港的燈在閃。那裡有一位港務員。
[init] 渡海：ssh logport
```

*設定旗標：flag.ch0_done*



### 單人離線、多人離線、連線

**單人離線**：燈塔是你的私人副本，INIT 全程陪伴，不限時、可無限重來。

- INIT 提示在『30 秒無輸入』時改為『5 回合無有效指令』。
- 分支同時最多 5 條，無成本。
- ada、bo 不在 Ch0 出場；他們只在 Ch1 的 access.log 留下足跡。

**多人離線**：把存檔交給朋友，他會在 .bash_history 的盡頭看到你的指令，以及你留在 notes/ 的便條；換你接他的存檔，也會看到他的。燈塔因此變成一座輪流值班的島。

- 匯入對方存檔時：~/.bash_history 末尾追加一行『# --- <對方暱稱> (imported)』，之後是對方最後 20 行指令。
- ~/notes/ 增加 peer-<暱稱>.txt，內容是對方存檔裡 notes 目錄的便條（玩家可在 Ch0 結尾用 echo 寫便條：echo '...' > ~/notes/for-next.txt，下一個接手的人會看到）。
- lamp.log 追加一行：<時間> lamp.service started by uid=<對方>。燈變成『輪流值班』。
- K0 合併沒有衝突。

**連線**：每位新手各有一座副本燈塔，避免搶先與干擾。燈亮之後解鎖『值班室廣場』（共享區，可用 who 與 wall），而且全服有一個共同計數器：本季已亮燈的島嶼數。

- MOTD 的條件行會顯示 {season.lit_islands}。
- 廣場：who 列出在線值班員（暱稱化）；wall <訊息> 對全廣場廣播（限長 80 字、每分鐘 3 則）。
- B0 是教學，不消耗時間燃料。
- T0100 送正式 OJ 判題（接自己的 OJ 時），不排名。


### 作者備忘

- 全章最重要的一個細節：燈不是被 GC 熄的，是 lin 親手熄的，時間剛好是 02:00:00。
- 第二重要：Ch0 不可以出現『八片』、『Admin 是頭銜』、『INIT 開了 TICKET-0001』。
- 手冊第 4 節只摘五條憲章；第六條刻意不寫『GC 不得被封鎖』，留給 Ch1 的 B1 揭露。
- 週五下午修憲的伏筆出現三次：draft.txt 的 P.S.、.bash_history 的最後三行、MOTD 的條件行。

---

## Ch1 〈日誌港〉日誌港 logport

**目標：** 學會管線（grep | sort | uniq -c | sort -rn）、重導向、fsck，解第一張 OJ 工單，拿到 F2，認識 GC 的探測。

**基調：** 港口的老人話多、愛吹牛；日誌本身是冷的。這一章的笑點來自港務員，不安來自 02:00:00。

**玩家起點：** logport，世界時間 （渡海抵達）


### s1.1　渡海與到港

**對話 `init.ferry`**

*（觸發：ssh logport）*
```
[init] 渡海：lighthouse -> logport。延遲 38 ms。風險：低。
```


**對話 `init.ch1_arrive`**

```
[PAGE] 日誌港：日誌太大，沒人看得完。
```

> 備註：之後直接進入 harbor-master.intro


**對話 `harbor-master.intro`**

```
harbor-master: 新來的？別碰 access.log。一百二十萬行，
               上一個看完的人現在在黑潮裡。
harbor-master: ……開玩笑的。大概。
harbor-master: 我當年一行 cat | grep | sort 就把整座港口看穿了。
               你去，我喝茶。
```

*設定旗標：flag.met_harbor*



### s1.2　一百二十萬行

**快題 Q1-1｜數出狀態碼 404 出現幾次**（學到：grep -c、精確比對）

- 任務文字：[init] 任務：access.log 裡，狀態碼 404 出現幾次。
- 標準做法：`grep -c ' 404 ' access.log`
- 提示 1：[init] grep 有一個選項，直接數行數。
- 提示 2：[init] grep -c <樣式> <檔案>。狀態碼在固定的位置，前後各有一個空格。
- 輸出不對時：[init] 數字比期望大。404 也可能出現在別的欄位。試試把前後空格一起比對。
- 完成：harbor.q1_1_done

**快題 Q1-2｜找出請求量最大的一天**（學到：管線、cut、sort、uniq -c）

- 任務文字：[init] 任務：哪一天的請求最多。
- 標準做法：`cut -d'[' -f2 access.log | cut -d: -f1 | sort | uniq -c | sort -rn | head -1`
- 提示 1：[init] 每行裡的日期格式一致：[DD/Mon/YYYY:HH:MM:SS。先想辦法只留下日期。
- 提示 2：[init] 日期留下之後：sort，再 uniq -c 數連續相同的行，最後 sort -rn 由大到小。
- 提示 3：[init] cut -d'[' -f2 取出方括號後面的部分；再 cut -d: -f1 取到第一個冒號之前。
- 備註：最忙的一天就是申訴日（憲章第八條彩蛋）：harbor-master 的 tower 話題會接這一天。
- 完成：harbor.q1_2_done

*（最忙的那一天是申訴日。harbor-master 的 tower 話題在這裡打開。）*

**對話 `harbor-master.topic_tower`**

**變體（if not flag.q1_2_done）**
```
harbor-master: 鐘塔就在港口，你出門就看得到。第八條：全島時間以它為準。
harbor-master: 手錶快慢、時區、『我這邊顯示是』，一律不得抗辯。
harbor-master: 想知道這條怎麼來的？別問我——問日誌。找最忙的那一天。
```

**變體（if flag.q1_2_done）**
```
harbor-master: 你找到那天了。那天有人送來好幾百封申訴，每一封都寫著：『我這邊顯示是』。
harbor-master: grep appeal。看看那些 user-agent。wristwatch。
harbor-master: 然後第八條就誕生了。
```

*設定旗標：flag.heard_tower*



### s1.3　02:00:00

**快題 Q1-3｜02:00:00 整點的請求有哪些**（學到：精確比對）

- 任務文字：[init] 任務：看看 02:00:00 整點到底是誰在敲門。
- 標準做法：`grep '02:00:00' access.log`
- 提示 1：[init] 時間戳的格式是固定的，整個 02:00:00 可以直接當搜尋字串。
- 備註：玩家第一次聽到 GC 這個名字。完成後自動打檢查點 ckpt/ch1-night（B1 的起點）。
- 完成：harbor.q1_3_done

**對話 `init.gc_name_heard`**

*（觸發：Q1-3 完成）*
```
[init] 10.7.0.2。gc/1.0 (sweep)。每晚 02:00:00。
[init] 已建立檢查點：ckpt/ch1-night。
[init] 你可以回到那一晚。
```


**對話 `harbor-master.q1_3_done`**

```
harbor-master: 02:00:00？那個？別理它。每晚都來，禮貌得很。
harbor-master: 它從來不要什麼。敲一下門，就走。
```

> 備註：玩家第一次聽到 GC 這個名字（由 INIT 的 gc_name_heard 節點說出）。


*（自動檢查點 ckpt/ch1-night。玩家可以先去開 B1，也可以繼續往下。）*


### s1.4　單獨存檔

**快題 Q1-4｜只看某個 IP 的請求並存成檔案**（學到：grep 錨定、> 重導向）

- 任務文字：[init] 任務：把 10.7.0.2 的請求單獨存成一個檔案。
- 標準做法：`grep '^10\.7\.0\.2 ' access.log > gc.txt && cat gc.txt`
- 提示 1：[init] 重導向：指令 > 檔名，把輸出寫進檔案。
- 提示 2：[init] grep 的樣式可以用 ^ 釘住行首。IP 後面接一個空格。
- 輸出不對時：[init] 多了一些行。10.7.0.2 的鄰居也長得很像。把 IP 的結尾也釘住。
- 完成：harbor.q1_4_done


### s1.5　最常見的訪客（OJ 工單）

**工單 TICKET-0427｜最常見的訪客**（SEV-2，獎勵 12 區塊 + 1 鑰匙幣）

```md
# TICKET-0427  [SEV-2]  港口日誌暴增，無法統計最常被請求的 IP

報告人: harbor-master    狀態: OPEN    獎勵: 12 sectors + 1 key
重現:   /var/log/harbor/access.log （約 120 萬行）

背景:   我想知道誰最常來。我試過 cat | sort | uniq，
        跑到第四十萬行，oom-killer 把我請去喝茶，茶都涼了。
        （你的程式不要像我一樣。）

輸入:   第一行是整數 N，代表日誌行數。
        接下來 N 行，每行是一筆日誌；以空白分隔，第一個欄位是請求者的 IP。
輸出:   請求次數最多的前三個 IP，每行一個，格式「IP 次數」。
        次數多的在前；次數相同時，IP 小的在前（逐段比較四個數字，
        所以 10.0.0.9 比 10.0.0.10 小）。
        不同的 IP 不足三個時，有幾個印幾個。
約束:   1 <= N <= 1200000，不同的 IP 至多 200000 個
        時間 2000 ms / 記憶體 256 MB
範例:   見下方（完整測資在 tests/，格式相同）
提交:   submit sol.py

範例輸入:
12
10.0.0.5 - - [06/Dec/2031:10:00:01 +0000] "GET /ship/ferry HTTP/1.1" 200 512
10.7.0.2 - - [06/Dec/2031:02:00:00 +0000] "GET /gc/probe HTTP/1.1" 200 12
10.0.0.5 - - [06/Dec/2031:10:00:09 +0000] "GET /dock/manifest HTTP/1.1" 200 788
10.3.3.3 - - [06/Dec/2031:10:01:30 +0000] "GET /crane/status HTTP/1.1" 304 0
10.0.0.5 - - [06/Dec/2031:10:02:00 +0000] "GET /ship/ferry HTTP/1.1" 200 512
10.7.0.2 - - [05/Dec/2031:02:00:00 +0000] "GET /gc/probe HTTP/1.1" 200 12
10.9.1.8 - - [06/Dec/2031:11:00:00 +0000] "GET /tower/time HTTP/1.1" 200 40
10.0.0.5 - - [06/Dec/2031:12:10:10 +0000] "GET /ship/ferry HTTP/1.1" 200 512
10.7.0.2 - - [04/Dec/2031:02:00:00 +0000] "GET /gc/probe HTTP/1.1" 200 12
10.3.3.3 - - [06/Dec/2031:13:00:00 +0000] "GET /crane/status HTTP/1.1" 200 90
10.0.0.5 - - [06/Dec/2031:14:00:00 +0000] "GET /ship/ferry HTTP/1.1" 200 512
10.7.0.2 - - [03/Dec/2031:02:00:00 +0000] "GET /gc/probe HTTP/1.1" 200 12

範例輸出:
10.0.0.5 5
10.7.0.2 4
10.3.3.3 2

彩蛋:   前三名裡有一個 IP 每次都在 02:00:00 整點出現。
        （範例是縮小的；真實日誌裡，它不會排這麼前面。）
```
- 提示：man ticket-0427（1 鑰匙）：港口日誌是文字，先想想怎麼數東西。；man -k count（2 鑰匙）：雜湊表與排序。；man 7 solution（3 鑰匙）：逐行取出 IP，用字典計數，最後排序取前三。注意同次數時 IP 要逐段比大小，不是字串比大小。
- 彩蛋：範例的前三名裡有 GC 的探測（10.7.0.2）。


### s1.6　被截斷的信

**快題 Q1-5｜復原 lost+found/#3141**（學到：fsck、檔名復原）

- 任務文字：[init] 任務：lost+found 裡有一個被截斷的檔案。把它救回來。
- 提示 1：[init] 先看看有什麼問題：fsck <目錄>。它只檢查，不會改動。
- 提示 2：[init] man fsck。修復要加一個選項，意思是『全部回答 yes』。
- 備註：F2 在復原後的檔案 for-harbor-master.txt 裡；第一次顯示 KEY-FRAG[2] 時才算取得。
- 完成：harbor.q1_5_done（取得 F2）

**對話 `lin.letter_harbor`**

```
From: lin
To: harbor-master
Subject: 日誌我替你輪替過了

港務員：

日誌我替你輪替過了，舊的壓成 .gz 放在 rotated/。
別再 cat 整份，你的茶都涼了。

02:00 那位訪客，每晚都會來。請不要為難它。
它只是在做它的工作。

如果有新的值班員來，而他想把門關上，
就讓他在分支裡試。INIT 會教他。弄壞什麼都不要緊。
（這句話我也對自己說過。）

KEY-FRAG[2]: 51d0-ae27-93bc-4f06

這一片先放你這。你的港口，沒人會想到翻。

                                  —— lin
P.S. 茶要趁熱喝。你每次都等它涼了才說冷。
```

*設定旗標：flag.letter3141_read*


**對話 `harbor-master.q1_5_done`**

```
harbor-master: lin 寫給我的？……那傢伙。放了一封信在我的港口，我居然沒發現。
harbor-master: 念。念給我聽。——不用了。我自己等一下會看。
```

*設定旗標：flag.harbor_knows_letter*


**檔案 `/var/log/harbor/error.log`**

```
[28/Nov/2031:03:11:52 +0000] WARN  slipper thrown at gc by anonymous (art.6; 實體拖鞋禁止進入機房)
[28/Nov/2031:03:11:53 +0000] INFO  slipper does not exist in log namespace; WARN downgraded to INFO
[29/Nov/2031:09:44:10 +0000] ERROR dock/berth-17: crane stuck (cause: tea)
[30/Nov/2031:14:02:31 +0000] ERROR pudding P-0007 expired (art.4: 視同第二次漏洞)
[30/Nov/2031:14:02:32 +0000] ERROR second vulnerability opened: pudding P-0007
[01/Dec/2031:02:00:12 +0000] INFO  convoy 10.7.0.23 passed (3 ferries, 0 incidents)
[01/Dec/2031:11:20:05 +0000] WARN  wristwatch/0.9 claims "我這邊顯示是 02:00:00"; rejected (art.8: 以鐘塔為準)
[02/Dec/2031:06:15:44 +0000] ERROR cat.service: backup cat not registered
[02/Dec/2031:06:15:44 +0000] ERROR cat.service: blink reference unavailable; gc pause cannot be audited (art.6)
[03/Dec/2031:23:59:59 +0000] INFO  tower: 敲鐘 x0 (season not ended)
[04/Dec/2031:16:47:02 +0000] WARN  amendment attempt rejected: it is Friday afternoon (art.9) -- submitter: anonymous
[04/Dec/2031:16:47:03 +0000] INFO  anonymous 將負責煮下週一早上的咖啡，煮一個月
[05/Dec/2031:08:30:00 +0000] ERROR dock/berth-03: no ship; berth empty; 港務員 reports "我在等"
[06/Dec/2031:19:12:40 +0000] INFO  archive: /var/log/harbor/access.log rotated (read-only, auditable)
```


### s1.7　封鎖 02:00 的訪客（假設分支）

**分支 B1｜封鎖 02:00 的訪客**（whatif，`whatif/block-gc`，起點 `ckpt/ch1-night`）

進入：`git checkout -b whatif/block-gc ckpt/ch1-night`

```
[init] 你回到昨夜 02:00 之前。這是模擬。
[init] 你可以改變任何事。歷史不會被改變。
```
**結果 `block_gc_exact`**（covers_gc=True、covers_convoy=False）
```
[sim] whatif/block-gc
[sim] 02:00:00 probe rejected
[sim] 02:00:07 gc: escalating to forced sweep
[sim] 02:00:41 reclaimed 3x sectors
[sim] 第六條：GC 不得被封鎖。這個模擬正在違反它。
[sim] 這是模擬。真實歷史沒有被更動。
```
**結果 `block_gc_and_convoy`**（covers_gc=True、covers_convoy=True）
```
[sim] whatif/block-gc
[sim] 02:00:00 probe rejected
[sim] 02:00:07 gc: escalating to forced sweep
[sim] 02:00:12 ferry convoy 10.7.0.23 dropped (collateral)
[sim] 02:00:41 reclaimed 3x sectors
[sim] 第六條：GC 不得被封鎖。這個模擬正在違反它。
[sim] 這是模擬。真實歷史沒有被更動。
```
**結果 `block_other`**（covers_gc=False）
```
[sim] whatif/block-gc
[sim] 02:00:00 probe accepted (rule did not match)
[sim] 02:00:03 sweep complete. reclaimed 0 sectors
[sim] 這是模擬。你封鎖的不是那個訪客。
```
- 離開 `git merge --knowledge` → [init] 已合併 1 張知識卡。歷史未被更動。
- 離開 `git abandon` → [init] 分支已捨棄。懸空 commit {n} 個，等待回收。
- 離開 `git tag <name>` → [init] 已標記 {name}。它不會再被改動。


**知識卡 K1｜GC 會對抗拒升級**

```
封鎖 GC 的探測，不會讓 GC 消失。
它會把「探測」升級成「強制回收」。
（模擬 whatif/block-gc：02:00:07 gc: escalating to forced sweep；02:00:41 reclaimed 3x sectors）
這不是敵意。這是它被設計成的樣子。
```

*（回到主線，再問 harbor-master：他會停下茶杯。）*

**對話 `harbor-master.softens`**

*（觸發：flag.k1 and ask harbor-master gc / ask harbor-master 02:00 / talk）*
```
harbor-master: （停下茶杯）
harbor-master: 你怎麼知道？……
harbor-master: 我年輕時也想擋過。
harbor-master: 那一晚，港口少了三個區塊。我再也沒擋過。
```

> 備註：對應 K1 的 harbor.softens 效果。『少了三個區塊』與 B1 模擬輸出的 3x sectors 呼應。

*設定旗標：flag.harbor_softened*



### s1.8　傳聞：憲章是靠出事長大的（選擇性）

**對話 `harbor-master.topic_charter`**

```
harbor-master: 憲章？我看它改了五版。每一版都是上一版出事以後補的洞。
harbor-master: 憲章這東西，是靠出事長大的。
harbor-master: 想聽哪一次？cake、cat、slipper、wang、drinks、tower、pudding、friday。
```

*設定旗標：flag.asked_charter*


**對話 `harbor-master.topic_cake`**

```
harbor-master: 蛋糕事件。第七十二小時整點，小林說『視同授權』，拿 root 把漏洞補了。
harbor-master: 補得很好。然後他把全島的桌布換成他的貓。
harbor-master: 道歉蛋糕放了三天，長毛。從那以後改成布丁，借用期間不准改桌布。
```

*設定旗標：flag.heard_cake*


**對話 `harbor-master.topic_cat`**

```
harbor-master: 阿宏那次 GC 停了 3.9 秒。他說他是慢眨眼體質，一眨就是 4 秒。
harbor-master: 經查，合憲。當時條文只說『一次眨眼』，沒說誰的眼。
harbor-master: 所以後來有了值班室那隻貓。標準眨眼貓。150 毫秒。貓罷工的時候，備用貓頂班。
harbor-master: 備用貓？沒登記。去燈塔看看那隻貓還罷不罷工。
```

*設定旗標：flag.heard_cat*


**對話 `harbor-master.topic_slipper`**

```
harbor-master: 拖鞋？第六條。GC 停太久，島民可以在日誌裡扔拖鞋。WARN 等級。
harbor-master: 實體拖鞋禁止進機房。因為有一個下午，兩台風扇。
harbor-master: 那是一個令人懷念的下午。
```

*設定旗標：flag.heard_slipper*


**對話 `harbor-master.topic_wang`**

```
harbor-master: 老王？ferrous 啦，島民都這樣叫他。
harbor-master: 季末到了，他不交 root。他說：『菲律賓外海還有一個熱帶性低氣壓，颱風季沒有結束。』
harbor-master: 我說老王，你那個颱風在菲律賓外海，我們這裡連毛毛雨都沒有。
harbor-master: 他就這樣抱著 root，抱到隔年。所以現在『季』以鐘塔為準，不接受氣象季、新番季、財報季。
```

*設定旗標：flag.heard_wang*


**對話 `harbor-master.topic_drinks`**

```
harbor-master: 有一次兩個新任為了搶 root，通宵蹲在交接點。各寫了腳本，同一毫秒簽收。
harbor-master: 兩個 root，各自合法。後到的那個要請全島喝飲料。三千杯。
harbor-master: 訂單把網路塞爆，那天剛好戰時斷網。手搖店老闆當天成為島上首富。
harbor-master: 他到現在還欠我兩杯。
harbor-master: 現在規定：出現兩根棒子，兩根都作廢，由第三人重新發棒。飲料各付各的。
```

*設定旗標：flag.heard_drinks*


**對話 `harbor-master.topic_pudding`**

```
harbor-master: 布丁？『過期布丁視同第二次漏洞』，這條是我提議的。
harbor-master: （日誌沒有紀錄。）
harbor-master: 你去看 error.log。P-0007。那個布丁，現在還是個漏洞。
```

*設定旗標：flag.heard_pudding*


**對話 `harbor-master.topic_friday`**

```
harbor-master: 週五下午不修憲。第九條。
harbor-master: 以前有人週五下午五點前修了一條，週一全島才發現它跟另一條打架。
harbor-master: 現在修憲要附測試、過 CI。違者煮一個月的咖啡，是週一早上的那種。
harbor-master: 上週四，有人在週五下午試過。日誌裡有。匿名。咖啡呢，我猜是我喝到的。
```

*設定旗標：flag.heard_friday*



### s1.9　離港

**對話 `init.ch1_done`**

*（觸發：flag.f2 and flag.t0427_done and flag.b1.done）*
```
[init] 日誌港：值班中。
[init] 02:00 的訪客，今晚也會來。
[init] 我沒有更動它。
[init] 下一站：權限堡。門只認三個人。
```

> 備註：『我沒有更動它。』是 Ch1 的一句像人的話：INIT 清楚知道自己可以更動，卻選擇不動。

*設定旗標：flag.ch1_done*



### 單人離線、多人離線、連線

**單人離線**：access.log 由你的存檔種子程序生成，並混進幾行你自己在 Ch0 留下的足跡，例如你登入燈塔的紀錄。判題用本機內建的小測資。

- 足跡：今日（登入後）有 POST /lighthouse/login、GET /lighthouse/handbook、GET /lighthouse/map、POST /lighthouse/lamp/start。
- ada、bo 各留下一組足跡（op-ada、op-bo 的燈塔登入），讓日誌有『別人也來過』的感覺。
- T0427 用 tickets/T0427/tests/ 的 5 組本機測資判題；可選擇連到自己的 OJ。不排名。

**多人離線**：存檔交換時，對方的足跡會被寫進你的 access.log，你們的日誌互相滲透；任何人都能從日誌看出對方走過哪裡。

- 匯入對方存檔時，用 gen_logs.py 的 --peer 規則把對方暱稱的足跡加進日誌（時間為對方存檔的世界時間）。
- judge 結果附簽名收據（receipt），寫進 commit；換人看到存檔時可驗證那個 AC 是真的。
- B1 的 K1 合併：兩人若分別得到 block_gc_exact 與 block_gc_and_convoy 兩種結果，不構成衝突，卡片取聯集並附註『collateral』。

**連線**：日誌是整個世界活動的縮影，裡面有其他玩家的登入、錯誤指令、渡海紀錄（暱稱化）。你 grep 得到隔壁隊伍的動向，這是偵察；別人也看得到你的。工單送到 OJ 正式判題。

- access.log 的熱門 IP 與流量由真實玩家活動決定，GC 的 02:00:00 探測仍然固定（I1）。
- T0427 送正式 OJ，帶相似度檢查；時限 2000 ms、記憶體 256 MB。
- B1 回溯消耗 1 單位時間燃料（全隊共享，每日補充 3）。
- 每晚真實 02:00 GC 會探測，玩家在線時可 tail -f access.log 看到它。


### 作者備忘

- 第一次聽到 GC 這個名字是在 Q1-3 完成時（INIT 說出 10.7.0.2 與 gc/1.0 (sweep)）。GC 在 Ch1 沒有對話、沒有敵意。
- B1 的 [sim] 輸出必須與設計稿逐字一致（見 branches/B1.yaml 的 block_gc_exact）；新增的第六條提示是額外一行，放在 reclaimed 之後。
- harbor-master 的傳聞只能是傳聞：他會吹牛，日誌沒有的事不要寫成事實。
- TICKET-0427 的彩蛋（前三名有 GC）只存在於『縮小的範例』；真實日誌的前三名是 10.2.1.1、10.4.0.9、10.1.5.5。

---

## 附錄 A：島嶼憲章修訂史（Rev 1–5）

本檔是《島嶼憲章》的完整修訂史（Rev 1–Rev 5）。為避免與世界版本號（v1.x–v5.0，指 Admin 的時代）混淆， 憲章的版次一律寫成 Rev。遊戲內玩家看到的是 Rev 5；舊版靠 git log -p 與各島傳聞拼出來。 憲章的作者是 kestrel（v2.x，立法的鷹）；之後每一版都是「上一版出事後的修憲」。 本檔融入了另一位 Claude 的幽默憲章稿，保持「憲章負責好笑、世界負責冷」的分工。

| Rev | 時代 | 出事 | 修了什麼 |
|---|---|---|---|
| 1 | v2.0 | （創世）kestrel 為終結第一次島嶼戰的混亂而立憲。原版有缺陷，七條都很短、很硬。 | 第1條；第2條；第3條；第4條；第5條；第6條；第7條 |
| 2 | v2.x | 戰時凌晨三點，島嶼被入侵。值班員想斷網，翻開第五條「戰爭不得斷電」，吵了 40 分鐘： 斷網算不算斷電？同時第三條要三人在線：一人掛機、一人睡著、一人在吵第五條。 漏洞整晚開著，GC 還挑最忙的時候停頓。 | 第1條；第2條；第3條；第4條；第5條；第6條；第7條；第addendum條 |
| 3 | v3.x | 小林在第 72 小時整點「視同授權」，拿走 root 修完漏洞，順手把全島桌布換成自己的貓。 道歉蛋糕放了三天長毛，史稱「蛋糕事件」。同一週 GC 停頓 3.9 秒，值班員阿宏抗辯自己是 「慢眨眼體質」，一次眨眼就是 4… | 第4條；第6條 |
| 4 | v3.x（末） | 季末到了，root 持有者老王（ferrous）拒絕登出，理由是「菲律賓外海還有一個熱帶性低氣壓， 颱風季尚未結束」，一路持有到隔年。另一邊，新任為了搶「先到者贏」，兩人通宵蹲在交接點， 各寫了搶 root 的腳本，結果… | 第7條；第8條 |
| 5 | v4.x | 敲鐘那一刻，小周正在借用 root 修漏洞。第四條說 15 分鐘後歸還，第七條說敲鐘後棒子要交新任， 棒子該給誰？全島吵了一下午。依附則查 git blame，鍋落到憲章作者頭上，他已累計請了 12 輪飲料。 於是有人偷… | 第2條；第4_append條；第9條；第addendum條 |

### 現行版（Rev 5）全文

第1條　島嶼不屬於任何人，包括寫這份憲章的人。有人想占為己有，罰抽籤連值一週班。

第2條　日誌只能歸檔，不能刪除。歸檔後唯讀、可稽核。rebase、force push 視同篡改，該人鍵盤交由全島保管一週（鍵盤也歸檔）。

第3條　動用 root 須三名值班員「簽核」，掛機充人頭不算。三人中至少一人必須清醒，咖啡因攝取量可供稽核。

第4條　發現漏洞者，先通報、後修補、再公開。72 小時沒人理你，可以自己動手，但 root 只是「借用」，15 分鐘後自動歸還，逾時 root 會自己回家。借用期間不得改桌布。道歉蛋糕改為道歉布丁，保存期限不得少於一週；過期布丁視同第二次漏洞。借用 root 遇到敲鐘時，棒子直接交新任，借用者轉任「口頭指揮」，由新任代為操作。指揮時不得說「你懂我意思吧」。

第5條　戰時不得斷「電」，但可以斷「網」。斷網不算斷電，電不知道自己被誤會了。

第6條　GC 不得被封鎖，單次停頓不得超過一次眨眼。一次眨眼 = 150 毫秒，以值班室的「標準眨眼貓」為準，個人體質不得抗辯，貓罷工時由備用貓頂班。違者島民可在日誌裡扔拖鞋（WARN 等級），實體拖鞋禁止進入機房。歸檔日誌仍視為 GC root。

第7條　root 是一根接力棒，全島同時只有一根（借用的也算）。「季」以鐘塔敲鐘為準，不接受氣象季、新番季或財報季的任何解釋。敲鐘後 24 小時內必須交棒，沒交的，棒子自己長腳跑掉。新任簽收後，舊任才能下班。出現兩根棒子時，兩根同時作廢，由第三人重新發棒。

第8條　全島時間以鐘塔為準。手錶快慢、時區、「我這邊顯示是」均不得作為抗辯。

第9條　修憲須附測試並通過 CI（矛盾檢查、單位檢查、標準眨眼貓同意）。不得在週五下午修憲，違者負責煮下週一早上的咖啡，煮一個月。

附則　條文互相矛盾時，兩條同時暫停，由當週值班員抽籤決定誰復活，落選條文須寫悔過書並附單元測試。憲章作者追溯免責，12 輪視同已還清，島民給他一個擁抱，擁抱歸檔。

### lin 的未完成修憲案

第十條　root 不再是接力棒。root 由八位守鑰者各持一片，任何動用須 k-of-8 簽核。 第七條相應廢止。

- 提交：Fri 16:42｜CI：BLOCKED
- 失敗原因：contradiction；friday_afternoon；blink_cat_consent
- 修憲被擋之後，lin 改走工程路線：把 root 拆成八片，用硬連結（ln）綁在各島，GC 無法回收。 這不是修憲，是繞過修憲。merge 結局（k-of-8 多簽）等於讓第十條真正通過。


## 附錄 B：舊設定保留清單

- Ch2 堡內憲章 v2.4 七條原文 → 現為 Rev 1，仍放在 /etc/charter.d/v2.4.orig；現行 /etc/charter 為 Rev 5。
- Ch2 口令：玩家念 lin 草稿引用的第三條原句『任何持有 root 的操作，須有三名值班員同時在線。』給 sentry。Ch0 的 .draft.txt 引用的就是這句原文（v2.4 措辭），所以舊謎題不動。
- Ch2 細節：第六條『GC 不得被封鎖』呼應 K1；第七條修改時間比前六條晚三個版本（ls -l / stat）。
- Ch2 遺物 amend-7.draft（第七條草稿）保留；新增 amend-10.draft（第十條草稿，被 CI 擋下）。兩個都在 /etc/charter.d/。
- Ch6 git blame：第七條 = lin（v4.7）保留；另外多一筆『第十條草案被 CI 擋下』的紀錄（作者 lin）。lin 想用規則逼大家還 root，規則不夠，才改走硬連結。
- K2〈憲章為防囤積而生〉、B2 改寫第三條的模擬（v2.5 → v3.4 OOM）完全不變；Rev 3–4 的故事反而替它補了背景。
