# TICKET-0042  [SEV-4]  日誌太長，找不到最後一行

報告人: harbor-master    狀態: CLOSED    結案: lin
重現:   /var/log/harbor/access.log
期望:   印出日誌的最後一行

提交紀錄:
  #1  cat access.log | head -1            WA   （那是第一行）
  #2  cat access.log                      TLE  request timeout after 2000ms
  #3  tail -n 1 access.log                AC   Service restored. uptime +3h

lin 的註記:
  tail 比 cat 溫柔。
  不是每件事都需要從頭讀完。
