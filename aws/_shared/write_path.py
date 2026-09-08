# -*- coding: utf-8 -*-
"""저장소 쓰기 경로 분석 — INTEGRATION-8 §5 · §6 · §7.

**문자열을 찾지 않는다. 값을 따라간다.**

⚠️⚠️ 왜 다시 만드나
   INTEGRATION-4·5·7 에서 같은 실수가 층만 바꿔 세 번 반복됐다.

     4단계  탐지기가 `.sh` 만 훑었다        → `.mjs` 업로더를 놓쳤다
     5단계  목적지 **문자열**로 걸렀다      → 버킷·키가 변수인 업로더를 놓쳤다
     7단계  호출 자리 **리터럴**만 봤다     → 키를 상수로 빼 둔 람다를 놓쳤다(0건 탐지)

   셋 다 "적힌 모양"을 찾다가 뚫렸다. 이번에는 모양이 아니라 **값이 어디서 와서
   어디로 가는지**를 본다:

       상수/변수 대입  →  (전파)  →  쓰기 싱크 호출  →  버킷 / 키 / 접두사

   파이썬은 `ast` 로 진짜 구문 트리를 읽는다. 자바스크립트는 표준 라이브러리에
   파서가 없어 상수 전파 방식으로 따라간다 — 그 한계도 결과에 적는다(kind=UNKNOWN).

⚠️ 읽기 전용 코드는 세지 않는다. 쓰기 싱크에 **도달하는 경로만** 본다.
   (넓히기만 하면 app/ 를 읽는 람다까지 잡힌다 — 7단계에서 실제로 그랬다)
"""

import ast
import io
import os
import re

# ── 쓰기 싱크 ────────────────────────────────────────────────────────────────
# SDK 직접 호출. 이름은 저장소를 훑어 실제로 쓰이는 것만 넣었다.
SDK_SINKS = ("put_object", "upload_file", "upload_fileobj", "copy_object")
# @aws-sdk (자바스크립트)
JS_SINKS = ("PutObjectCommand", "CopyObjectCommand", "putObject")
# 이 저장소가 쓰는 얇은 감싸개. 앞의 밑줄은 있어도 없어도 된다.
#   put · put_json · _put_json · _write · save_snapshot · upload_dir …
# **몇 번째 인자가 키인지는 짐작하지 않는다.** 감싸개 몸통에서 Key= 로 넘어가는
# 매개변수를 찾아 그 자리를 쓴다. 못 찾으면 감싸개로 등록하지 않는다.
WRAPPER_HINT = re.compile(r"^_?(put|write|save|upload)")

KIND_LITERAL = "literal"
KIND_CONSTANT = "constant"
KIND_VARIABLE = "variable"
KIND_FUNCTION = "function"
KIND_UNKNOWN = "unknown"

# 감싸개 **정의** 안의 싱크. 실제 키는 호출 자리에서 정해진다.
# 같은 파일에서 호출이 하나라도 잡히면 정책이 이 자리를 중복으로 보지 않는다.
# 호출이 하나도 없으면 그대로 UNKNOWN 으로 남아 거부된다 (fail-closed).
WRAPPER_DEF = "감싸개 정의 — 실제 키는 호출 자리"


class _PassThrough(object):
    """인자를 그대로 돌려주는 함수. 접는 것은 **호출 자리의 인자**다."""

    __slots__ = ("index",)

    def __init__(self, index):
        self.index = index


class Write(object):
    """쓰기 한 건. 어디서(파일:줄) 어떤 키로 쓰는가."""

    __slots__ = ("path", "line", "sink", "key", "kind", "bucket", "detail")

    def __init__(self, path, line, sink, key, kind, bucket=None, detail=None):
        self.path, self.line, self.sink = path, line, sink
        self.key, self.kind, self.bucket, self.detail = key, kind, bucket, detail

    def as_dict(self):
        return {"path": self.path, "line": self.line, "sink": self.sink,
                "key": self.key, "kind": self.kind, "bucket": self.bucket,
                "detail": self.detail}

    def __repr__(self):                                   # pragma: no cover
        return "<Write %s:%d %s key=%r kind=%s>" % (
            self.path, self.line, self.sink, self.key, self.kind)


# ── 파이썬: 진짜 구문 트리 ───────────────────────────────────────────────────
class _PyConsts(ast.NodeVisitor):
    """이름 → 문자열 값. 모듈 전역과 함수 지역을 한 표에 모은다.

    보수적으로 본다: 확실히 아는 것만 값으로 적고, 나머지는 비워 둔다.
    비어 있으면 kind 가 variable/unknown 이 되고, 정책이 **거부**한다.
    """

    def __init__(self, funcs=None):
        self.env = {}
        self.funcs = funcs or {}

    def visit_Assign(self, node):
        val = _py_const(node.value, self.env, funcs=self.funcs)
        for t in node.targets:
            if isinstance(t, ast.Name) and val is not None:
                self.env[t.id] = val
        self.generic_visit(node)

    def visit_For(self, node):
        # for key in (f"{A}/x.json", f"{A}/latest.json"):  ← 이 자리가 곧 키다.
        # 값이 여럿이면 **공통 접두사**만 취한다. 판정은 접두사로 한다.
        if isinstance(node.target, ast.Name) and isinstance(
                node.iter, (ast.Tuple, ast.List)):
            vals = [_py_const(e, self.env, funcs=self.funcs) for e in node.iter.elts]
            if vals and all(v is not None for v in vals):
                if len(set(vals)) == 1:
                    self.env[node.target.id] = vals[0]
                else:
                    self.env[node.target.id] = os.path.commonprefix(vals) + "…"
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        if node.value is not None and isinstance(node.target, ast.Name):
            val = _py_const(node.value, self.env, funcs=self.funcs)
            if val is not None:
                self.env[node.target.id] = val
        self.generic_visit(node)


def _py_const(node, env, loose=False, funcs=None):
    """식 → 문자열, 모르면 None. 여기가 전파의 핵심이다.

    ``loose`` 는 모르는 이름을 ``…`` 로 둔다. **접두사만** 알아내려는 자리
    (지역 함수의 반환값 접기)에서만 쓴다 — 호출 자리에 그대로 쓰면 모르는 키를
    안다고 말하게 된다.
    """
    if node is None:
        return None
    rec = lambda n: _py_const(n, env, loose, funcs)
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.Name):
        v = env.get(node.id)
        return "…" if v is None and loose else v
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        a, b = rec(node.left), rec(node.right)
        if a is not None and b is not None:
            return a + b
        # 앞이 상수면 **접두사는 안다**. 뒤를 모른다고 통째로 버리지 않는다.
        #   prefix + m['files'][slot]  →  'app/v3/characters/…/versions/…/…'
        # 판정은 접두사로 한다. 모르는 뒷부분은 … 로 남겨 눈에 보이게 둔다.
        if a is not None:
            return a + "…"
        return None
    if isinstance(node, ast.JoinedStr):                    # f-string
        out = []
        for v in node.values:
            if isinstance(v, ast.Constant) and isinstance(v.value, str):
                out.append(v.value)
            elif isinstance(v, ast.FormattedValue):
                inner = rec(v.value)
                out.append(inner if inner is not None else "…")
            else:
                return None
        return "".join(out)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Mod):
        # '%s/%s/c%03d.png' % (PREFIX, run_tag, s) — 이 저장소 람다가 즐겨 쓴다.
        fmt = rec(node.left)
        if fmt is not None:
            args = (node.right.elts if isinstance(node.right, (ast.Tuple, ast.List))
                    else [node.right])
            vals = [rec(a) for a in args]
            out, i = [], 0
            for piece in re.split(r"(%[-#0 +]*[\d.*]*[a-zA-Z%])", fmt):
                if piece.startswith("%") and len(piece) > 1:
                    if piece == "%%":
                        out.append("%")
                        continue
                    v = vals[i] if i < len(vals) else None
                    out.append(v if v is not None else "…")
                    i += 1
                else:
                    out.append(piece)
            return "".join(out)
    if isinstance(node, (ast.Attribute, ast.Subscript)):
        return "…" if loose else None
    if isinstance(node, ast.Call):
        f = node.func
        # os.environ.get("X", "default") → 기본값을 쓴다 (운영에서 바뀔 수 있음은 detail 로)
        if isinstance(f, ast.Attribute) and f.attr == "get" and len(node.args) >= 2:
            return rec(node.args[1])
        # "a/{}".format(...) 는 앞부분만 알 수 있다 — 접두사 판정에는 그걸로 충분하다
        if isinstance(f, ast.Attribute) and f.attr == "format":
            base = rec(f.value)
            if base is not None:
                return base.split("{")[0] + "…"
        # "x".rstrip("/") 등 문자열 메서드는 원본을 그대로 본다
        if isinstance(f, ast.Attribute) and f.attr in (
                "strip", "rstrip", "lstrip", "replace", "lower", "upper"):
            return rec(f.value)
        # "/".join([...]) — 조각을 이어 붙인다
        if isinstance(f, ast.Attribute) and f.attr == "join":
            sep = rec(f.value)
            if sep is not None and node.args and isinstance(
                    node.args[0], (ast.List, ast.Tuple)):
                parts = [rec(e) for e in node.args[0].elts]
                if all(p is not None for p in parts):
                    return sep.join(parts)
        # 같은 파일의 지역 함수 → 접힌 반환값 (접두사만 알아도 판정에는 충분하다)
        if funcs and isinstance(f, ast.Name) and f.id in funcs:
            got = funcs[f.id]
            # 통과 함수(_assert_private(DST) 처럼 인자를 그대로 돌려주는 것)는
            # **호출 자리의 인자**를 접는다. 안 그러면 목적지를 잃는다.
            if isinstance(got, _PassThrough):
                if got.index < len(node.args):
                    return rec(node.args[got.index])
                return None
            return got
        if loose:
            return "…"
    return None


class _PyDicts(ast.NodeVisitor):
    """이름 → {문자열 키: 값 노드}.

    이 저장소의 업로더는 인자를 사전에 모았다가 ``put_object(**args)`` 로 편다.
    호출 자리만 보면 Key 가 없다 — 사전 대입까지 따라가야 보인다.
    """

    def __init__(self):
        self.env = {}

    def _record(self, name, node):
        if isinstance(node, ast.Dict):
            d = {}
            for k, v in zip(node.keys, node.values):
                if isinstance(k, ast.Constant) and isinstance(k.value, str):
                    d[k.value] = v
            self.env[name] = d
        elif (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id == "dict"):
            self.env[name] = {kw.arg: kw.value for kw in node.keywords if kw.arg}

    def visit_Assign(self, node):
        for t in node.targets:
            if isinstance(t, ast.Name):
                self._record(t.id, node.value)
            # args["Key"] = ... 처럼 나중에 채우는 자리도 본다
            elif (isinstance(t, ast.Subscript) and isinstance(t.value, ast.Name)
                    and isinstance(t.slice, ast.Constant)
                    and isinstance(t.slice.value, str)):
                self.env.setdefault(t.value.id, {})[t.slice.value] = node.value
        self.generic_visit(node)


def _sink_arg_nodes(call, dicts):
    """쓰기 싱크 호출 → (Key 노드, Bucket 노드). ``**args`` 도 편다."""
    key = bucket = None
    for kw in call.keywords:
        if kw.arg == "Key":
            key = kw.value
        elif kw.arg == "Bucket":
            bucket = kw.value
        elif kw.arg is None and isinstance(kw.value, ast.Name):      # **args
            spread = dicts.get(kw.value.id, {})
            key = key or spread.get("Key")
            bucket = bucket or spread.get("Bucket")
    return key, bucket


def _wrapper_key_pos(fn, dicts):
    """감싸개의 **몇 번째 인자가 키인가**. 모르면 None (등록하지 않는다)."""
    params = [a.arg for a in fn.args.args]
    base = 1 if params and params[0] in ("self", "cls") else 0
    for inner in ast.walk(fn):
        if not (isinstance(inner, ast.Call)
                and _py_sink_name(inner.func) in SDK_SINKS):
            continue
        knode, _ = _sink_arg_nodes(inner, dicts)
        if isinstance(knode, ast.Name) and knode.id in params:
            return params.index(knode.id) - base, params[base:]
    return None


def _py_sink_name(func):
    if isinstance(func, ast.Attribute):
        return func.attr
    if isinstance(func, ast.Name):
        return func.id
    return None


_FUNC = (ast.FunctionDef, ast.AsyncFunctionDef)


def _scope_envs(tree, funcs=None):
    """모듈 전역 + 함수별 지역 환경.

    ⚠️ 한 표에 다 모으면 **다른 함수의 ``args`` 사전**을 끌어다 쓴다.
       실제로 그래서 감싸개 정의 자리가 남의 키로 해석됐다. 범위를 나눈다.
    """
    module = ast.Module(body=[n for n in tree.body if not isinstance(n, _FUNC + (ast.ClassDef,))],
                        type_ignores=[])
    mc, md = _PyConsts(funcs), _PyDicts()
    mc.visit(module)
    md.visit(module)

    scopes = {None: (dict(mc.env), dict(md.env))}
    for n in ast.walk(tree):
        if not isinstance(n, _FUNC):
            continue
        c, d = _PyConsts(funcs), _PyDicts()
        # 지역 대입은 **모듈 상수를 알고 있어야** 접힌다.
        #   PRIVATE = 'character-studio/'          ← 모듈
        #   key = f'{PRIVATE}assets/{cid}/…'       ← 지역
        # 빈 표로 시작하면 접두사를 통째로 잃는다.
        c.env.update(mc.env)
        d.env.update(md.env)
        for stmt in n.body:
            c.visit(stmt)
            d.visit(stmt)
        scopes[n] = (c.env, d.env)
    return scopes


def _parents(tree):
    p = {}
    for n in ast.walk(tree):
        for c in ast.iter_child_nodes(n):
            p[c] = n
    return p


def _enclosing(node, parents):
    cur = parents.get(node)
    while cur is not None:
        if isinstance(cur, _FUNC):
            return cur
        cur = parents.get(cur)
    return None


def _local_returns(tree, scopes):
    """지역 함수 이름 → 접힌 반환 문자열, 또는 통과 표식."""
    out = {}
    for n in ast.walk(tree):
        if not isinstance(n, _FUNC):
            continue
        params = [a.arg for a in n.args.args]
        base = 1 if params and params[0] in ("self", "cls") else 0
        rets = [r.value for r in ast.walk(n)
                if isinstance(r, ast.Return) and r.value is not None]
        # 인자를 그대로 돌려주는가
        names = {r.id for r in rets if isinstance(r, ast.Name)}
        if len(rets) == 1 and len(names) == 1:
            only = names.pop()
            if only in params:
                out[n.name] = _PassThrough(params.index(only) - base)
                continue
        env = scopes.get(n, scopes[None])[0]
        vals = [_py_const(r, env, loose=True) for r in rets]
        vals = [v for v in vals if v and v.strip("…")]
        if len(set(vals)) == 1:
            out[n.name] = vals[0]
    return out


def scan_python(path, text=None):
    """파이썬 한 파일의 쓰기 목록."""
    src = text if text is not None else _read(path)
    try:
        tree = ast.parse(src)
    except SyntaxError:
        return []
    # 2회전. 1회전으로 지역 함수의 반환값을 알아낸 뒤, 그것을 아는 채로
    # 상수 표를 다시 만든다 — `key = archive_key(...)` 같은 대입이 그제야 접힌다.
    scopes = _scope_envs(tree)
    funcs = _local_returns(tree, scopes)
    scopes = _scope_envs(tree, funcs)
    funcs = _local_returns(tree, scopes)
    parents = _parents(tree)
    env, dicts = scopes[None]

    # 이 파일에서 정의된 감싸개: 이름이 put/write/save/upload 계열이고
    # 몸통이 SDK 싱크에 **매개변수를 Key 로 넘긴다**.
    wrappers, wrapper_lines = {}, set()
    for n in ast.walk(tree):
        if not isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        if not WRAPPER_HINT.match(n.name):
            continue
        pos = _wrapper_key_pos(n, scopes.get(n, scopes[None])[1])
        if pos is None:
            continue
        wrappers[n.name] = pos
        for inner in ast.walk(n):
            if (isinstance(inner, ast.Call)
                    and _py_sink_name(inner.func) in SDK_SINKS):
                wrapper_lines.add(inner.lineno)

    out = []
    for n in ast.walk(tree):
        if not isinstance(n, ast.Call):
            continue
        name = _py_sink_name(n.func)
        if name is None:
            continue

        scope = _enclosing(n, parents)
        env, dicts = scopes.get(scope, scopes[None])

        key_node = bucket_node = None
        wrapper_def = False
        if name in SDK_SINKS:
            key_node, bucket_node = _sink_arg_nodes(n, dicts)
            wrapper_def = n.lineno in wrapper_lines
        elif name in wrappers:
            idx, params = wrappers[name]
            if 0 <= idx < len(n.args):
                key_node = n.args[idx]
            elif idx < len(params):                    # put_json(key=…) 형태
                want = params[idx]
                for kw in n.keywords:
                    if kw.arg == want:
                        key_node = kw.value
        else:
            continue

        if key_node is None:
            # 싱크는 맞는데 키를 못 찾았다 — **모른다고 적는다**. 조용히 넘기지 않는다.
            out.append(Write(path, n.lineno, name, None, KIND_UNKNOWN,
                             detail=WRAPPER_DEF if wrapper_def else "키 인자를 찾지 못했다"))
            continue

        val = _py_const(key_node, env, funcs=funcs)
        if isinstance(key_node, ast.Constant):
            kind = KIND_LITERAL
        elif isinstance(key_node, ast.Name):
            kind = KIND_CONSTANT if val is not None else KIND_VARIABLE
        elif isinstance(key_node, ast.Call):
            kind = KIND_FUNCTION if val is None else KIND_CONSTANT
        elif isinstance(key_node, (ast.JoinedStr, ast.BinOp)):
            kind = KIND_CONSTANT if val is not None else KIND_VARIABLE
        else:
            kind = KIND_VARIABLE if val is None else KIND_CONSTANT
        if val is None:
            kind = KIND_FUNCTION if isinstance(key_node, ast.Call) else (
                KIND_VARIABLE if kind == KIND_LITERAL else kind)

        out.append(Write(path, n.lineno, name, val, kind,
                         bucket=_py_const(bucket_node, env) if bucket_node else None,
                         detail=WRAPPER_DEF if wrapper_def else None))
    return out


# ── 자바스크립트: 상수 전파 ──────────────────────────────────────────────────
_JS_ASSIGN = re.compile(
    r"""(?m)^\s*(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*=\s*(.+?);?\s*$""")
_JS_STR = re.compile(r"""^['"`]([^'"`]*)['"`]$""")
_JS_TMPL = re.compile(r"^`([^`]*)`$")


def _js_env(text):
    env, changed = {}, True
    raw = {m.group(1): m.group(2).strip() for m in _JS_ASSIGN.finditer(text)}
    while changed:
        changed = False
        for name, expr in raw.items():
            if name in env:
                continue
            val = _js_const(expr, env)
            if val is not None:
                env[name] = val
                changed = True
    return env


def _js_const(expr, env):
    expr = expr.strip().rstrip(";").strip()
    m = _JS_STR.match(expr)
    if m and "${" not in expr:
        return m.group(1)
    m = _JS_TMPL.match(expr)
    if m:
        body, out, i = m.group(1), [], 0
        for part in re.split(r"(\$\{[^}]*\})", body):
            if part.startswith("${"):
                inner = part[2:-1].strip()
                v = env.get(inner)
                if v is None:
                    v = _js_const(inner, env)
                out.append(v if v is not None else "…")
            else:
                out.append(part)
        return "".join(out)
    if expr in env:
        return env[expr]
    # ⚠️ 순서가 중요하다. 정규식 리터럴 안의 `+` 를 이어붙이기로 오해하면
    #    (PREFIX = (process.env.X || 'app/v2/…').replace(/^\/+|\/+$/g, '') 처럼)
    #    접두사를 통째로 놓친다. 실제로 그랬다.
    # 뒤에 붙은 문자열 메서드를 먼저 벗긴다 — 접두사 판정에는 원본으로 충분하다.
    m = re.match(r"^(.*\))\s*\.\s*(replace|trim|toLowerCase|toUpperCase|"
                 r"padStart|padEnd|slice|normalize)\s*\(.*\)$", expr, re.S)
    if m:
        return _js_const(m.group(1), env)
    # process.env.X || 'default'  ·  process.env.X ?? 'default'
    m = re.match(r"^\(?\s*process\.env\.[\w$]+\s*(?:\|\||\?\?)\s*(.+?)\s*\)?$", expr)
    if m:
        return _js_const(m.group(1), env)
    # 'a' + B  형태 — 따옴표·괄호 **밖**의 + 에서만 나눈다
    parts = _js_split_plus(expr)
    if len(parts) > 1:
        vals = []
        for p in parts:
            v = _js_const(p, env)
            if v is None:
                return None
            vals.append(v)
        return "".join(vals)
    return None


def _js_split_plus(expr):
    """따옴표·괄호·정규식 밖의 `+` 에서만 나눈다."""
    out, buf, depth, quote, i = [], [], 0, None, 0
    while i < len(expr):
        c = expr[i]
        if quote:
            buf.append(c)
            if c == "\\":
                if i + 1 < len(expr):
                    buf.append(expr[i + 1])
                    i += 1
            elif c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
            buf.append(c)
        elif c == "/" and i + 1 < len(expr) and expr[i + 1] not in "/*":
            # 정규식 리터럴은 통째로 넘긴다
            j = i + 1
            while j < len(expr) and expr[j] != "/":
                if expr[j] == "\\":
                    j += 1
                j += 1
            buf.append(expr[i:j + 1])
            i = j
        elif c in "([{":
            depth += 1
            buf.append(c)
        elif c in ")]}":
            depth -= 1
            buf.append(c)
        elif c == "+" and depth == 0:
            out.append("".join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1
    out.append("".join(buf).strip())
    return [p for p in out if p]


def _js_prop(window, prop):
    r"""객체 리터럴에서 한 속성의 **식 전체**를 떼어 낸다.

    ⚠️ `[^,}\n]+` 로 자르면 안 된다. 템플릿 리터럴 `${PREFIX}/x.json` 의
       닫는 중괄호에서 잘려 나가 목적지를 잃는다 — 실제로 그랬다.
       따옴표·역따옴표·괄호를 세면서 최상위 `,` 나 `}` 까지 읽는다.
    """
    m = re.search(r"\b%s\s*:\s*" % prop, window)
    if not m:
        return None
    i, depth, quote, out = m.end(), 0, None, []
    while i < len(window):
        c = window[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < len(window):
                out.append(window[i + 1])
                i += 1
            elif c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
            out.append(c)
        elif c in "([{":
            depth += 1
            out.append(c)
        elif c in ")]}":
            if depth == 0:
                break
            depth -= 1
            out.append(c)
        elif c == "," and depth == 0:
            break
        else:
            out.append(c)
        i += 1
    return "".join(out).strip() or None


def scan_js(path, text=None):
    src = text if text is not None else _read(path)
    env = _js_env(src)
    out = []
    for m in re.finditer(r"\b(%s)\s*\(" % "|".join(JS_SINKS), src):
        line = src.count("\n", 0, m.start()) + 1
        window = src[m.end():m.end() + 700]
        expr = _js_prop(window, "Key")
        if not expr:
            out.append(Write(path, line, m.group(1), None, KIND_UNKNOWN,
                             detail="Key 속성을 찾지 못했다"))
            continue
        val = _js_const(expr, env)
        if _JS_STR.match(expr) and "${" not in expr:
            kind = KIND_LITERAL
        elif val is not None:
            kind = KIND_CONSTANT
        elif expr.endswith(")") and "(" in expr:
            kind = KIND_FUNCTION
        else:
            kind = KIND_VARIABLE
        bexpr = _js_prop(window, "Bucket")
        out.append(Write(path, line, m.group(1), val, kind,
                         bucket=_js_const(bexpr, env) if bexpr else None))
    return out


# ── 셸: 변수 전개 ───────────────────────────────────────────────────────────
SH_SINKS = ("aws s3 cp", "aws s3 sync", "aws s3api put-object", "aws s3 mv")

_SH_ASSIGN = re.compile(r"""(?m)^\s*(?:export\s+)?([A-Za-z_][\w]*)=(.+?)\s*$""")
_SH_VAR = re.compile(r"\$\{([A-Za-z_]\w*)(?::-[^}]*)?\}|\$([A-Za-z_]\w*)")


def _sh_expand(text, env, depth=0):
    """`$VAR` · `${VAR}` · `${VAR:-기본값}` 를 편다. 모르면 … 로 남긴다."""
    if depth > 6:
        return text

    def sub(m):
        name = m.group(1) or m.group(2)
        val = env.get(name)
        if val is None and m.group(0).startswith("${") and ":-" in m.group(0):
            val = m.group(0).split(":-", 1)[1].rstrip("}")
        return _sh_expand(val, env, depth + 1) if val is not None else "…"

    return _SH_VAR.sub(sub, text)


def _sh_env(text):
    env, raw = {}, {}
    for m in _SH_ASSIGN.finditer(text):
        val = m.group(2).strip()
        if val.startswith("#") or "$(" in val or "`" in val:
            continue
        if len(val) > 1 and val[0] == val[-1] and val[0] in "'\"":
            val = val[1:-1]
        raw.setdefault(m.group(1), val)          # 첫 대입을 쓴다
    for name, val in raw.items():
        env[name] = val
    for name in list(env):
        env[name] = _sh_expand(env[name], env)
    return env


_SH_FOR = re.compile(r"^\s*for\s+([A-Za-z_]\w*)\s+in\s+(.+?)\s*;?\s*do\b")
_SH_WORD = re.compile(r"""\"([^\"]*)\"|'([^']*)'|(\S+)""")


def _sh_logical(src):
    r"""역슬래시로 이어진 줄을 한 줄로 본다.

    ⚠️ 이걸 안 하면 `aws s3api put-object --bucket … \` 다음 줄의 `--key` 를
       못 본다. 목적지가 있는데 "모른다"고 말하게 된다 — 검사기가 거짓말한다.
    """
    out, buf, start = [], "", 1
    for i, line in enumerate(src.splitlines(), 1):
        if not buf:
            start = i
        stripped = line.rstrip()
        if stripped.endswith("\\"):
            buf += stripped[:-1] + " "
            continue
        out.append((start, buf + stripped))
        buf = ""
    if buf:
        out.append((start, buf))
    return out


def scan_sh(path, text=None):
    src = text if text is not None else _read(path)
    env = _sh_env(src)
    out = []
    depth = 0
    for i, line in _sh_logical(src):
        code = line.split("#", 1)[0] if not line.strip().startswith("#") else ""
        # `for key in "$P/v2/index.html" "$P/v2/"; do` — **이 자리가 곧 키다.**
        # 파이썬 쪽 for 루프와 같은 함정이다. 셸에서도 따라간다.
        fm = _SH_FOR.match(code)
        if fm:
            depth += 1
            vals = [_sh_expand(a or b or c, env)
                    for a, b, c in _SH_WORD.findall(fm.group(2))]
            vals = [v for v in vals if v and not v.startswith("-")]
            if vals:
                env[fm.group(1)] = (vals[0] if len(set(vals)) == 1
                                    else os.path.commonprefix(vals) + "…")
        elif re.match(r"^\s*done", code) and depth:
            depth -= 1
        for sink in SH_SINKS:
            if sink not in code:
                continue
            m = re.search(r"s3://([^/\s\"']+)/?([^\s\"']*)", code)
            if m:
                bucket = _sh_expand(m.group(1), env)
                key = _sh_expand(m.group(2), env)
            else:
                bm = re.search(r"--bucket[= ]+(\S+)", code)
                km = re.search(r"--key[= ]+(\S+)", code)
                bucket = _sh_expand(bm.group(1), env) if bm else None
                key = _sh_expand(km.group(1), env) if km else None
            if key is None:
                out.append(Write(path, i, sink, None, KIND_UNKNOWN,
                                 bucket=bucket, detail="목적지를 찾지 못했다"))
                continue
            key = key.strip("\"'")
            kind = KIND_LITERAL if "…" not in key and "$" not in line else (
                KIND_VARIABLE if "…" in key else KIND_CONSTANT)
            out.append(Write(path, i, sink, key or None,
                             kind if key else KIND_UNKNOWN, bucket=bucket))
            break
    return out


def _read(path):
    with io.open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def scan_file(path):
    if path.endswith(".py"):
        return scan_python(path)
    if path.endswith((".js", ".mjs", ".cjs")):
        return scan_js(path)
    if path.endswith((".sh", ".bash")):
        return scan_sh(path)
    return []


SCAN_EXTS = (".py", ".js", ".mjs", ".cjs", ".sh", ".bash")


def scan_tree(root, skip_dirs=(".git", "node_modules", ".venv", ".deps",
                               "__pycache__", "build", ".worktrees")):
    out = []
    for r, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs
                   if d not in skip_dirs and not d.startswith(".claude")]
        for f in files:
            if f.endswith(SCAN_EXTS):
                out.extend(scan_file(os.path.join(r, f)))
    return out
