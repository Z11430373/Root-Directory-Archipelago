#!/usr/bin/env python3
# 世界/Shell QA 工具；依賴 savelib.py、tools/validate.py/gen_logs.py、YAML/text 與真 Bash/coreutils。
# build 在自己的暫存樹執行可信案例，finally 清理；CLI make 才寫 conformance.json，check 僅比對。
# 每個案例複製獨立世界避免前案污染，但工作目錄不是系統級沙箱，不可接外部任意命令。
"""
引擎一致性測資：用「真的 bash」在試玩版的虛擬檔案系統上跑一批指令，記下標準輸出與退出碼。
前端的模擬 shell 必須對同一批指令給出同樣的結果（語意以 GNU coreutils/grep、C 語系排序為準）。

  python3 demo/tools/make_conformance.py make    # 產生 demo/testvectors/conformance.json
  python3 demo/tools/make_conformance.py check   # 重新跑真 bash，確認測資沒過期

內容
  vfs      各章虛擬檔案系統的「靜態檔」sha256 與目錄（前端建出的 VFS 必須完全一致）
  log      試玩規模日誌（seed 5、每天 100 行、30 天、--npc）的 sha256 與 manifest
           目標是前端移植 gen_logs.py 後「逐位元相同」；做不到時退回只守不變量 I1–I7（但標記 needs_identical_log 的案例就不能比對）
  cases    指令案例：cwd、cmd、stdout、rc（pwd 的路徑已把暫存根目錄換成 /）
  quests   七個快題的 check 判定：reference 必須通過、negative_references 必須被擋
"""
import hashlib
import json
import os
import posixpath
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PACK = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(PACK, "tools"))
sys.path.insert(0, HERE)
import savelib as S      # noqa: E402
import validate as V     # noqa: E402

OUT = os.path.join(PACK, "demo", "testvectors", "conformance.json")

CH0 = [
    ("ls", "~"), ("ls -a", "~"), ("ls shelf", "~"), ("ls -a notes", "~"), ("ls incidents notes", "~"),
    ("cat handbook.md", "~"), ("cat shelf/jar.txt shelf/cat.txt", "~"), ("cat notes/.draft.txt", "~"),
    ("cat .bash_history", "~"), ("cat notes/01-first-night.txt", "~"), ("cat incidents/TICKET-0001.md", "~"),
    ("cat logs/lamp.log", "~"), ("cat var/mail/op", "/"), ("cat var/log/boot.0", "/"),
    ("head -n 3 handbook.md", "~"), ("head -2 handbook.md", "~"), ("tail -n 2 logs/lamp.log", "~"),
    ("tail -1 logs/lamp.log", "~"), ("wc -l logs/lamp.log", "~"), ("wc -l handbook.md logs/lamp.log", "~"),
    ("grep -r KEY . ", "~"), ("grep -rn amend .", "~"), ("grep -ri charter handbook.md", "~"),
    ("grep -c '' handbook.md", "~"), ("grep -v '^#' logs/lamp.log", "~"), ("grep -n lamp logs/lamp.log", "~"),
    ("grep -r lin notes shelf", "~"), ("grep nothing-here handbook.md; echo rc=$?", "~"),
    ("grep -r KEY-FRAG ~", "~"), ("grep -rl lin .", "~"),
    ("cd shelf && pwd && ls", "~"), ("cd .. && pwd", "~/shelf"), ("cd / && pwd", "~"), ("cd ~/notes && ls -a", "/"),
    ("pwd", "~"), ("cat handbook.md | grep -i charter | wc -l", "~"),
    ("echo hello > note.txt && cat note.txt", "~"), ("echo a > n.txt && echo b >> n.txt && cat n.txt", "~"),
    ("cat shelf/jar.txt | head -n 1", "~"), ("sort handbook.md | head -n 3", "~"),
    ("cut -d: -f1 logs/lamp.log | head -n 2", "~"), ("cat nope.txt; echo rc=$?", "~"), ("ls nope; echo rc=$?", "~"),
]
CH1_STATIC = [
    ("ls", "/var/log/harbor"), ("ls -a", "/var/log/harbor"), ("cat error.log", "/var/log/harbor"),
    ("head -n 5 error.log", "/var/log/harbor"), ("tail -n 3 error.log", "/var/log/harbor"),
    ("wc -l error.log", "/var/log/harbor"), ("grep -c '' error.log", "/var/log/harbor"),
    ("grep -i slipper error.log", "/var/log/harbor"), ("grep -n WARN error.log | head -n 3", "/var/log/harbor"),
    ("sort error.log | uniq -c | sort -rn | head -n 3", "/var/log/harbor"),
    ("cut -d' ' -f1 error.log | sort | uniq -c", "/var/log/harbor"),
    ("pwd", "/var/log/harbor"), ("cd .. && pwd && ls", "/var/log/harbor"),
]
CH1_LOG = [
    ("wc -l access.log", "/var/log/harbor"), ("head -n 2 access.log", "/var/log/harbor"),
    ("tail -n 1 access.log", "/var/log/harbor"), ("grep -c 404 access.log", "/var/log/harbor"),
    ("grep -c ' 404 ' access.log", "/var/log/harbor"), ("grep -c '\" 404 ' access.log", "/var/log/harbor"),
    ("grep '02:00:00' access.log | head -n 3", "/var/log/harbor"),
    ("grep -c 'gc/1.0' access.log", "/var/log/harbor"), ("grep -c 10.7.0.2 access.log", "/var/log/harbor"),
    ("grep -c '^10\\.7\\.0\\.2 ' access.log", "/var/log/harbor"),
    ("cut -d' ' -f1 access.log | sort | uniq -c | sort -rn | head -n 3", "/var/log/harbor"),
    ("cut -d'[' -f2 access.log | cut -d: -f1 | sort | uniq -c | sort -rn | head -n 1", "/var/log/harbor"),
    ("grep -c 'POST /appeal' access.log", "/var/log/harbor"),
    ("grep 'gc/1.0' access.log | tail -n 1", "/var/log/harbor"),
    ("grep ' 404 ' access.log | cut -d' ' -f1 | sort | uniq -c | sort -rn | head -n 2", "/var/log/harbor"),
]


# 呼叫：build 的檔案/log 對照；bytes → SHA-256 hex，純計算、不寫來源。
def sha(b):
    return hashlib.sha256(b).hexdigest()


# 共用於 flow_sim：實體路徑與虛擬 POSIX 路徑的邊界；不依宿主分隔符建虛擬鍵。
def virtual_path(real, root):
    rel = os.path.relpath(os.path.realpath(real), os.path.realpath(root))
    return "/" if rel == "." else "/" + rel.replace(os.sep, "/")


def host_path(root, virtual):
    path = posixpath.normpath("/" + virtual.lstrip("/"))
    return os.path.normpath(os.path.join(root, *path.lstrip("/").split("/")))


# 固定測資中帶絕對路徑的命令：在 Bash 展開/分詞後只映射路徑參數，保留引號、管線與 regex。
# 這不是完整 VFS/chroot；其他命令與語法仍交真 Bash，僅供本工具的可信案例。
WORLD_PREAMBLE = r'''
__ra_files() {
    local cmd=$1 arg
    shift
    local -a args=()
    for arg in "$@"; do
        case "$arg" in
            "$RA_WORLD_ROOT"|"$RA_WORLD_ROOT"/*) ;;
            /*) arg="$RA_WORLD_ROOT$arg" ;;
        esac
        args+=("$arg")
    done
    command "$cmd" "${args[@]}"
}
cat() { __ra_files cat "$@"; }
ls() { __ra_files ls "$@"; }
cd() {
    local target=${1:-$HOME}
    case "$target" in
        "$RA_WORLD_ROOT"|"$RA_WORLD_ROOT"/*) ;;
        /*) target="$RA_WORLD_ROOT$target" ;;
    esac
    builtin cd -- "$target"
}
'''


# 呼叫：real/judge/flow_sim；在已物化世界跑可信 Bash，回傳 (stdout,rc,host_cwd)。
# 由 Bash 自己回報根目錄的實體 POSIX 表示，因此支援 Git Bash 的 /tmp mount、空白與非 ASCII 路徑。
def run_world_bash(cmd, cwd, root, home):
    root = os.path.realpath(root)
    probe = subprocess.run(["bash", "-c", "pwd -P"], cwd=root, check=True,
                           capture_output=True, text=True, encoding="utf-8", timeout=30)
    bash_root = probe.stdout.rstrip("\n")
    bash_home = bash_root + virtual_path(home, root)
    env = dict(os.environ, HOME=bash_home, RA_WORLD_ROOT=bash_root, LC_ALL="C")
    # eval 以單獨 argv 解析原命令，避免尾端 |/&& 或註解吞掉狀態回報腳本。
    script = WORLD_PREAMBLE + r'''
builtin eval -- "$1"
__ra_rc=$?
__ra_cwd=$(builtin pwd -P 2>/dev/null) || __ra_cwd=$PWD
printf '\n__RA_CWD__%s\n__RA_RC__%s' "$__ra_cwd" "$__ra_rc"
'''
    p = subprocess.run(["bash", "-c", script, "world-case", cmd], cwd=cwd, env=env,
                       capture_output=True, text=True, encoding="utf-8", timeout=30)
    out, rc, new_cwd = p.stdout, p.returncode, None
    match = re.search(r"\n__RA_CWD__(.*)\n__RA_RC__(\d+)$", out, re.S)
    if match:
        out, rc = out[:match.start()], int(match.group(2))
        bash_cwd = match.group(1)
        if posixpath.commonpath([bash_root, bash_cwd]) == bash_root:
            new_cwd = host_path(root, posixpath.relpath(bash_cwd, bash_root))
    # 只移除完整世界根前綴，不誤改同前綴的兄弟目錄；根目錄本身顯示 /。
    out = out.replace(bash_root + "/", "/")
    out = re.sub(re.escape(bash_root) + r"$", "/", out, flags=re.M)
    return out, rc, new_cwd


# c0-26 的兩個目錄 operand 順序有意義，但每個目錄內的檔案遍歷順序由宿主 FS 決定。
# 每檔匹配行須連續且順序不變；完整行（含檔名、內容、行尾）與重複次數全部保留。
def grep_file_blocks(output):
    groups = [{}, {}]    # 明確對應固定命令的 notes、shelf；不是通用 stdout 排序。
    last_operand, last_file = 0, None
    for line in output.splitlines(keepends=True):
        filename, separator, _ = line.partition(":")
        operand = 0 if filename.startswith("notes/") else 1 if filename.startswith("shelf/") else None
        if not separator or operand is None or operand < last_operand:
            raise ValueError("c0-26 的 grep 檔名前綴或 operand 順序不符")
        files = groups[operand]
        if filename != last_file and filename in files:
            raise ValueError("c0-26 同一檔案的 grep 匹配行不連續")
        files.setdefault(filename, []).append(line)
        last_operand, last_file = operand, filename
    return groups


# 呼叫：CLI check；只排除 Bash provenance。僅 c0-29 採無序行多重集合，c0-26 採每檔有序區塊。
# 保留重複行與行尾；其他 stdout、退出碼、指令、VFS/hash/check 都仍精確比對。
def conformance_contract(result):
    comparable = json.loads(json.dumps(result))
    version = comparable["env"].pop("bash")
    if not isinstance(version, str) or not version.startswith("GNU bash, version "):
        raise ValueError("缺少有效 Bash provenance")
    for case in comparable["cases"]:
        identity = (case["id"], case["chapter"], case["cwd"], case["cmd"])
        if identity == ("c0-29", "ch0", "~", "grep -rl lin ."):
            case["stdout"] = Counter(case["stdout"].splitlines(keepends=True))
        elif identity == ("c0-26", "ch0", "~", "grep -r lin notes shelf"):
            case["stdout"] = grep_file_blocks(case["stdout"])
    return comparable


# 呼叫：build；暫存根/試玩設定/資料索引 → (生成目錄,manifest,章節 roots)，寫暫存世界並修剪空目錄。
# 不改來源檔；整棵 tmp 的清理由 build finally 負責。
def build_tree(tmp, cfg, D):
    gen = os.path.join(tmp, "gen")
    ov = cfg["content"]["chapters"]["ch1_teaser"]["generate_override"]
    subprocess.run([sys.executable, os.path.join(PACK, "tools", "gen_logs.py"), "--out", gen, "--lines-per-day", str(ov["lines_per_day"]),
                    "--days", str(ov["days"]), "--seed", "5", "--npc"], check=True, capture_output=True)
    man = json.load(open(os.path.join(gen, "manifest.json"), encoding="utf-8"))
    roots = {}
    for chid, short in (("ch0", "ch0"), ("ch1", "ch1")):
        ch = dict(D["chapters"][chid if chid in D["chapters"] else [k for k in D["chapters"] if k.startswith(chid)][0]])
        if chid == "ch1":
            inc = set(cfg["content"]["chapters"]["ch1_teaser"]["include_files"])
            ch["files"] = [f for f in ch["files"] if f["path"] in inc]
        root = os.path.abspath(os.path.join(tmp, short))
        os.makedirs(root)
        V.materialize(ch, root, gen, {})
        home = host_path(root, ch["player_start"]["home"])
        os.makedirs(home, exist_ok=True)
        # 試玩版規則：丟掉的檔案不留下空資料夾（家目錄與其祖先除外）
        keep = set()
        p_ = home
        while True:
            keep.add(p_)
            if p_ == root:
                break
            p_ = os.path.dirname(p_)
        for dp, dn, fn in os.walk(root, topdown=False):
            if dp not in keep and not os.listdir(dp):
                os.rmdir(dp)
        roots[short] = (root, home, ch)
    return gen, man, roots


# 呼叫：build 指令案例；可信 cmd/起點/世界/暫存根 → (stdout,rc)，複製隔離案例後執行真 Bash，限 30 秒。
def real(cmd, cwd_kind, root, home, tmp):
    work = tempfile.mkdtemp(prefix="case_", dir=tmp)
    r2 = os.path.join(work, "r")
    shutil.copytree(root, r2, symlinks=True)
    h2 = os.path.join(r2, os.path.relpath(home, root))
    cwd = h2 if cwd_kind == "~" else r2 if cwd_kind == "/" else (h2 + cwd_kind[1:] if cwd_kind.startswith("~/") else os.path.join(r2, cwd_kind.lstrip("/")))
    out, rc, _ = run_world_bash(cmd, cwd, r2, h2)
    return out, rc


# 呼叫：CLI/驗證器；無參數 → VFS/日誌/指令/快題對照物件，會啟動子程序與建暫存，finally 全部清理。
def build():
    cfg = S.demo_cfg()
    D = V.load_all()
    tmp = tempfile.mkdtemp(prefix="conf_")
    try:
        gen, man, roots = build_tree(tmp, cfg, D)
        log_bytes = open(os.path.join(gen, "access.log"), "rb").read()
        lines = log_bytes.decode().split("\n")
        out = {"note": "由 demo/tools/make_conformance.py make 產生，請勿手改。排序以 LC_ALL=C（位元組順序）為準。", "schema": 1,
               "env": {"LC_ALL": "C", "bash": subprocess.run(["bash", "--version"], check=True, capture_output=True, text=True, encoding="utf-8").stdout.split("\n")[0]}}
        out["log"] = {"params": {"seed": 5, "lines_per_day": 100, "days": 30, "npc": True, "now": "2031-12-07", "nick": "op-zien"},
                      "access_log_sha256": sha(log_bytes), "first_line": lines[0], "last_nonempty_line": [l for l in lines if l][-1],
                      "manifest": man,
                      "rule": "目標：前端移植 gen_logs.py 後 access.log 逐位元相同；做不到就守 I1–I7，並跳過 needs_identical_log 的案例"}
        vfs = {}
        for short, (root, home, ch) in roots.items():
            files, dirs = {}, []
            for dp, dn, fn in os.walk(root):
                dirs.append(virtual_path(dp, root))
                for f in fn:
                    p = os.path.join(dp, f)
                    files[virtual_path(p, root)] = sha(open(p, "rb").read())
            vfs[short] = {"home": ch["player_start"]["home"], "cwd_start": ch["player_start"]["cwd"],
                          "files": dict(sorted(files.items())), "dirs": sorted(dirs),
                          "generated": ["/var/log/harbor/access.log"] if short == "ch1" else []}
        out["vfs"] = vfs
        cases = []
        for n, (cmd, cwd) in enumerate(CH0):
            o, rc = real(cmd, cwd, roots["ch0"][0], roots["ch0"][1], tmp)
            cases.append({"id": "c0-%02d" % n, "chapter": "ch0", "cwd": cwd, "cmd": cmd, "stdout": o, "rc": rc, "needs_identical_log": False})
        for n, (cmd, cwd) in enumerate(CH1_STATIC):
            o, rc = real(cmd, cwd, roots["ch1"][0], roots["ch1"][1], tmp)
            cases.append({"id": "c1-%02d" % n, "chapter": "ch1", "cwd": cwd, "cmd": cmd, "stdout": o, "rc": rc, "needs_identical_log": False})
        for n, (cmd, cwd) in enumerate(CH1_LOG):
            o, rc = real(cmd, cwd, roots["ch1"][0], roots["ch1"][1], tmp)
            cases.append({"id": "c1L-%02d" % n, "chapter": "ch1", "cwd": cwd, "cmd": cmd, "stdout": o, "rc": rc, "needs_identical_log": True})
        out["cases"] = cases
        # 快題判定
        qs = []
        for qid in cfg["content"]["quick_tasks"]:
            q = D["quests"][qid]
            chk = q["check"]
            chid = "ch1" if qid.startswith("Q1") else "ch0"
            root, home, _ = roots[chid]
            ref = q.get("reference")
            ent = {"id": qid, "chapter": chid, "check": chk, "prompt": q.get("prompt"), "pass": [], "fail": []}

            # 呼叫：本題正反例；案例/預期/分類 → None，複製世界跑 Bash/判 check，再附加 ent；tmp 由外層清理。
            def judge(entry, want, kind):
                cwd = entry["cwd"]
                cmd = V.fsub(entry["cmd"], man)
                work = tempfile.mkdtemp(prefix="q_", dir=tmp)
                r2 = os.path.join(work, "r")
                shutil.copytree(root, r2, symlinks=True)
                h2 = os.path.join(r2, os.path.relpath(home, root))
                cdir = h2 if cwd == "~" else os.path.join(r2, cwd.lstrip("/"))
                output, _, _ = run_world_bash(cmd, cdir, r2, h2)
                nf = None
                if chk["type"] == "file_matches":
                    fn = (entry.get("expect_file") or {}).get("name") or entry.get("file", "")
                    fp = os.path.join(cdir, fn)
                    nf = open(fp, encoding="utf-8").read().rstrip("\n").split("\n") if os.path.exists(fp) else None
                got = V.eval_check(chk, entry["cmd"], output, man, nf)
                assert got == want, (qid, cmd, got, want)
                ent[kind].append({"cmd": entry["cmd"], "cwd": cwd, "stdout": output, "expect_check": want})
            if ref:
                judge(ref, True, "pass")
            for neg in q.get("negative_references", []):
                judge(neg, False, "fail")
            for ex in q.get("examples", {}).get("pass", []):
                if chk["type"] == "ran_regex":
                    ent["pass"].append({"cmd": ex, "cwd": ref["cwd"] if ref else "~", "stdout": None, "expect_check": True})
            for ex in q.get("examples", {}).get("fail", []):
                if chk["type"] == "ran_regex":
                    ent["fail"].append({"cmd": ex, "cwd": ref["cwd"] if ref else "~", "stdout": None, "expect_check": False})
            qs.append(ent)
        out["quests"] = qs
        return out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    new = build()
    if cmd == "make":
        os.makedirs(os.path.dirname(OUT), exist_ok=True)
        json.dump(new, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1, sort_keys=True)
        print("寫入", OUT, "（案例 %d、快題 %d）" % (len(new["cases"]), len(new["quests"])))
    old = json.load(open(OUT, encoding="utf-8"))
    same = conformance_contract(new) == conformance_contract(old)
    print("Bash provenance: %s (golden: %s)" % (new["env"]["bash"], old["env"]["bash"]))
    print("一致性測資：%s" % ("與真 bash 重跑一致" if same else "已過期，請執行 make"))
    sys.exit(0 if same else 1)
