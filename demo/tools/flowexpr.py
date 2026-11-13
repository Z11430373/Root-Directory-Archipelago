# 流程規格運算式參考層；只依賴 re，供 flow_sim.py、validate_flow.py 及跨語言測資使用。
# JS 對應 demo-app/src/expr.js；解析器只動局部游標，env.funcs 必須由呼叫者提供無副作用函式。
"""
flow.yaml 的運算式（expression）。參考實作；前端要寫一個行為相同的解析器（不得使用 eval／new Function）。

文法
  expr := or
  or   := and ('or' and)*
  and  := not ('and' not)*
  not  := 'not' not | cmp
  cmp  := atom (('=='|'!='|'<='|'>='|'<'|'>') atom)?
  atom := '(' expr ')' | call | name | int | string | 'true' | 'false'
  call := ident '(' [expr (',' expr)*] ')'
  name := ident ('.' ident)*      例如 flag.b0.done、tries、in_branch、quest_active
  string := '...' 或 "..."        不支援跳脫字元

語意
  - 'flag.x' 取環境 flags 集合是否含 'flag.x'（整個點號串當成一個名字）
  - 其他名字從環境 vars 取值；沒有就當 False（布林）
  - 比較：兩邊型別不同時，==  為 False、!= 為 True，其他比較為 False（不拋例外）
  - and/or 不保證短路（函式必須沒有副作用）；not 回傳布林；最後結果一律轉成布林
  - 不認得的函式 → ExprError
"""
import re


# 文法/未知函式的統一錯誤，驗證器捕捉後列診斷，無額外資源。
class ExprError(Exception):
    pass


_TOK = re.compile(r"\s*(?:(\d+)|('[^']*'|\"[^\"]*\")|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_\-]+)*)|(==|!=|<=|>=|<|>|\(|\)|,))")


# 呼叫：evaluate；來源字串 → (種類,值) tokens，非法位置拋 ExprError，不求值或改環境。
def tokenize(s):
    pos, out = 0, []
    s = s.rstrip()
    while pos < len(s):
        m = _TOK.match(s, pos)
        if not m or m.end() == pos:
            raise ExprError("無法解析（位置 %d）：%r" % (pos, s[pos:pos + 10]))
        pos = m.end()
        if m.group(1) is not None:
            out.append(("int", int(m.group(1))))
        elif m.group(2) is not None:
            out.append(("str", m.group(2)[1:-1]))
        elif m.group(3) is not None:
            out.append(("name", m.group(3)))
        else:
            out.append(("op", m.group(4)))
    return out


# 呼叫：Sim.ev/靜態驗證/測資；運算式/環境 → boolean，完整解析且不保證短路，不執行一般 Python 程式碼。
def evaluate(src, env):
    """env: {"flags": set, "vars": dict, "funcs": {name: callable}}"""
    toks = tokenize(src)
    i = [0]

    # 以下文法函式共用 toks/i；回傳當層值並依文法消費 token，不寫入外部世界。
    # 呼叫：各文法層；無參數 → 當前 token 或 (None,None)，不推進游標。
    def peek():
        return toks[i[0]] if i[0] < len(toks) else (None, None)

    # 呼叫：各文法層；無參數 → token 並推進 i，提早耗盡拋錯。
    def eat():
        if i[0] >= len(toks):
            raise ExprError("運算式提早結束")
        t = toks[i[0]]
        i[0] += 1
        return t

    # 呼叫：根層/括號/參數；無參數 → or 串值，右側也解析求值，環境函式不可帶副作用。
    def p_or():
        v = p_and()
        while peek() == ("name", "or"):
            eat()
            r = p_and()
            v = bool(v) or bool(r)       # 解析時不短路（簡單）；求值無副作用，結果相同
        return v

    # 呼叫：p_or；無參數 → and 串值，依優先序解析至 not，比較前不做短路。
    def p_and():
        v = p_not()
        while peek() == ("name", "and"):
            eat()
            r = p_not()
            v = bool(v) and bool(r)
        return v

    # 呼叫：p_and/自身；無參數 → 前綴否定布林或比較層值。
    def p_not():
        if peek() == ("name", "not"):
            eat()
            return not p_not()
        return p_cmp()

    # 呼叫：p_not；無參數 → 一次比較或原子值，跨型別排序固定 False，防隱含轉型差異。
    def p_cmp():
        a = p_atom()
        k, v = peek()
        if k == "op" and v in ("==", "!=", "<=", ">=", "<", ">"):
            eat()
            b = p_atom()
            same = type(a) == type(b) or (isinstance(a, (int, bool)) and isinstance(b, (int, bool)) and not isinstance(a, bool) and not isinstance(b, bool))
            if v == "==":
                return same and a == b
            if v == "!=":
                return (not same) or a != b
            if not same:
                return False
            return {"<=": a <= b, ">=": a >= b, "<": a < b, ">": a > b}[v]
        return a

    # 呼叫：p_cmp；無參數 → 常值/名稱/括號/白名單函式結果，未知函式/缺括號拋錯。
    def p_atom():
        if i[0] >= len(toks):
            raise ExprError("運算式提早結束")
        k, v = eat()
        if k == "int" or k == "str":
            return v
        if k == "op" and v == "(":
            r = p_or()
            if eat() != ("op", ")"):
                raise ExprError("缺少右括號")
            return r
        if k == "name":
            if v == "true":
                return True
            if v == "false":
                return False
            if peek() == ("op", "("):
                eat()
                args = []
                if peek() != ("op", ")"):
                    args.append(p_or())
                    while peek() == ("op", ","):
                        eat()
                        args.append(p_or())
                if eat() != ("op", ")"):
                    raise ExprError("缺少右括號")
                fn = env.get("funcs", {}).get(v)
                if fn is None:
                    raise ExprError("不認得的函式：%s" % v)
                return fn(*args)
            if v.startswith("flag."):
                return v in env.get("flags", ())
            return env.get("vars", {}).get(v, False)
        raise ExprError("意外的符號：%r" % (v,))

    r = p_or()
    if i[0] != len(toks):
        raise ExprError("多餘的符號：%r" % (toks[i[0]],))
    return bool(r) if not isinstance(r, (str, int)) or isinstance(r, bool) else bool(r)
