# 交給代理之後，請你（Zien）回報這幾件事

你不用自己玩。把這份清單貼給你的代理，要他做完後只回報「通過／沒通過＋一句原因」。

## A. 資料包本身（我已經跑過，你的代理可以再跑一次確認）
```
cd root-archipelago-ch01
python3 tools/validate.py          # 預期：結果：0 項錯誤，0 項警告
python3 tools/build_script_md.py > SCRIPT.md   # 重新展開劇本，應與現有 SCRIPT.md 相同
```

## B. 引擎接上之後的最小驗收（不用人玩，寫成自動測試）
1. [ ] 載入 `chapters/ch0_lighthouse.yaml`，`ls`、`ls -a notes`、`cat handbook.md`、`grep -r KEY-FRAG ~` 的輸出與 `quests/ch0.yaml` 的 reference 一致。
2. [ ] `systemctl start lamp` 輸入錯誤口令三次，訊息依序變化；輸入 `lamp-before-sudo` 後 `shelf/cat.txt` 變成「復工」。
3. [ ] 在 main 打 `rm -rf ~` 被攔下；`git checkout -b alt/sandbox` 之後可以刪；清空 notes 後 `/lost+found/#0` 出現；沒讀就 `git merge --knowledge` 會被拒；讀了才拿到 K0。
4. [ ] 種子固定時，兩次產生 `access.log`（小測資模式）逐位元相同；manifest 的 `n404`、`busiest_day`、`n_gc` 與用 `grep`/`sort`/`uniq` 實算相同。
5. [ ] Q1-1 至 Q1-4：用 reference 指令通過；用 negative_references（`grep -c 404`、`grep 10.7.0.2`）不通過，且得到針對性提示。
6. [ ] `fsck .` 只檢查、`fsck -y .` 修復；修復前 `grep -r KEY-FRAG /srv/harbor` 找不到，修復後 `cat for-harbor-master.txt` 看得到 `KEY-FRAG[2]`。
7. [ ] T0100、T0427：`tickets/*/ref/sol.py` 全部 AC；`wrong_lexicographic.py` 在 T0427 test #4 WA；`wrong_no_tiebreak.py` 在 test #2 WA。
8. [ ] B1：`iptables -A INPUT -s 10.7.0.2 -j DROP` 的輸出逐字等於 `branches/B1.yaml` 的 `block_gc_exact`；封 `/24` 多一行車隊；封別的 IP 不會得到 K1。
9. [ ] 120 萬行模式：`cut -d'[' -f2 access.log | cut -d: -f1 | sort | uniq -c | sort -rn | head -1` 在瀏覽器內 2 秒內完成，記憶體不爆。

## C. 請你回報給我（照這個格式貼就好）
```
validate: 通過／失敗（貼 FAIL 那幾行）
B1~B9: 各項 通過／失敗＋一句原因
效能: 120 萬行的 Q1-2 管線耗時 ___ 秒
想改的字句: （有就列，沒有就寫無）
```

## D. 你自己決定的事（不用現在）
- OJ 題號：`tickets/T0100/ticket.yaml` 與 `tickets/T0427/ticket.yaml` 的 `judge.oj_problem_id` 目前是 `null`，接上你自己的 OJ 時再填。
- 數字（區塊獎勵、鑰匙幣、提示價格、反悔期限 3 天）全是起始值，要靠試玩調整。
