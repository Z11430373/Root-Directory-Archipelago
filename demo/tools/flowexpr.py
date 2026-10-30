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


class ExprError(Exception):
    pass


_TOK = re.compile(r"\s*(?:(\d+)|('[^']*'|\"[^\"]*\")|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_\-]+)*)|(==|!=|<=|>=|<|>|\(|\)|,))")


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


def evaluate(src, env):
    """env: {"flags": set, "vars": dict, "funcs": {name: callable}}"""
    toks = tokenize(src)
    i = [0]

    def peek():
        return toks[i[0]] if i[0] < len(toks) else (None, None)

    def eat():
        if i[0] >= len(toks):
            raise ExprError("運算式提早結束")
        t = toks[i[0]]
        i[0] += 1
        return t

    def p_or():
        v = p_and()
        while peek() == ("name", "or"):
            eat()
            r = p_and()
            v = bool(v) or bool(r)       # 解析時不短路（簡單）；求值無副作用，結果相同
        return v

    def p_and():
        v = p_not()
        while peek() == ("name", "and"):
            eat()
            r = p_not()
            v = bool(v) and bool(r)
        return v

    def p_not():
        if peek() == ("name", "not"):
            eat()
            return not p_not()
        return p_cmp()

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
