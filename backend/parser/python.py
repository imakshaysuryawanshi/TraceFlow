"""
TraceFlow Python Parser — Phase 10
====================================

Parses a beginner-safe subset of Python 3 into TraceFlow's simplified AST
(same shape as the Java and JavaScript backends). The trace generator,
schema, and frontend do not learn about the source language.

Supported constructs (MVP scope — mirrors Java parity):
  - variable "declarations" (first assignment to a name)
  - assignment / compound assignment (= += -= *= /= //= %=)
  - arithmetic + boolean expressions (and / or / not, comparison chains)
  - print(...) — one argument, keyword args ignored
  - if / elif / else
  - for i in range(...)              (positive integer step only)
  - while

Explicitly UNSUPPORTED (rejected with ParserError):
  - functions / lambdas / decorators / classes / imports
  - lists / tuples / dicts / sets / comprehensions / slicing / indexing
  - f-strings, string formatting
  - try / except / raise / with / yield / async
  - global / nonlocal
  - `input()`, other builtins beyond `print` / `range`
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Set
import ast

from .errors import ParserError


# ---------------------------------------------------------------------------
# Operator maps — Python token → TraceFlow-canonical op
# ---------------------------------------------------------------------------

_BIN_OPS = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "*",
    ast.Div: "/",
    ast.FloorDiv: "//",
    ast.Mod: "%",
}

_CMP_OPS = {
    ast.Eq: "==",
    ast.NotEq: "!=",
    ast.Lt: "<",
    ast.LtE: "<=",
    ast.Gt: ">",
    ast.GtE: ">=",
}

_BOOL_OPS = {ast.And: "&&", ast.Or: "||"}

_AUG_OPS = {
    ast.Add: "+=",
    ast.Sub: "-=",
    ast.Mult: "*=",
    ast.Div: "/=",
    ast.FloorDiv: "//=",
    ast.Mod: "%=",
}


# ---------------------------------------------------------------------------
# Context — tracks which names are already declared so subsequent
# assignments emit `assign` (not `var_decl`).
# ---------------------------------------------------------------------------

class _Ctx:
    def __init__(self) -> None:
        self.declared: Set[str] = set()


# ---------------------------------------------------------------------------
# Expressions
# ---------------------------------------------------------------------------


def _expr(node: ast.AST, ctx: _Ctx) -> Dict[str, Any]:
    line = getattr(node, "lineno", 1)

    if isinstance(node, ast.Constant):
        return _literal(node.value, line)

    if isinstance(node, ast.Name):
        return {"kind": "var", "name": node.id, "line": line}

    if isinstance(node, ast.BinOp):
        op_cls = type(node.op)
        if op_cls not in _BIN_OPS:
            raise ParserError(f"binary operator '{ast.dump(node.op)}' is not supported", line)
        return {
            "kind": "binary",
            "op": _BIN_OPS[op_cls],
            "left": _expr(node.left, ctx),
            "right": _expr(node.right, ctx),
            "line": line,
        }

    if isinstance(node, ast.UnaryOp):
        return _unary(node, ctx, line)

    if isinstance(node, ast.Compare):
        return _compare(node, ctx, line)

    if isinstance(node, ast.BoolOp):
        return _bool_op(node, ctx, line)

    if isinstance(node, ast.Call):
        # `len(...)` is a builtin used with lists.
        if (
            isinstance(node.func, ast.Name)
            and node.func.id == "len"
            and len(node.args) == 1
            and not node.keywords
        ):
            return {
                "kind": "length",
                "target": _expr(node.args[0], ctx),
                "line": line,
            }
        raise ParserError(
            "function calls are not supported (only `print(...)` at statement level and `len(...)`)",
            line,
        )

    if isinstance(node, ast.Attribute):
        raise ParserError("attribute access is not supported", line)

    if isinstance(node, ast.List):
        return {
            "kind": "array_literal",
            "elements": [_expr(e, ctx) for e in node.elts],
            "line": line,
        }

    if isinstance(node, ast.Tuple):
        raise ParserError("tuples are not supported — use a list `[...]`", line)

    if isinstance(node, (ast.Dict, ast.Set)):
        raise ParserError("dicts / sets are not supported", line)

    if isinstance(node, ast.Subscript):
        if isinstance(node.slice, ast.Slice):
            raise ParserError("slicing is not supported", line)
        return {
            "kind": "index",
            "target": _expr(node.value, ctx),
            "index": _expr(node.slice, ctx),
            "line": line,
        }

    if isinstance(node, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
        raise ParserError("comprehensions are not supported", line)

    if isinstance(node, ast.JoinedStr):  # f-string
        raise ParserError("f-strings are not supported", line)

    if isinstance(node, ast.Lambda):
        raise ParserError("lambdas are not supported", line)

    raise ParserError(f"unsupported expression: {type(node).__name__}", line)


def _literal(value: Any, line: int) -> Dict[str, Any]:
    if isinstance(value, bool):
        return {"kind": "literal", "value": value, "type": "boolean", "line": line}
    if isinstance(value, int):
        return {"kind": "literal", "value": value, "type": "int", "line": line}
    if isinstance(value, float):
        return {"kind": "literal", "value": value, "type": "double", "line": line}
    if isinstance(value, str):
        return {"kind": "literal", "value": value, "type": "string", "line": line}
    if value is None:
        raise ParserError("None literals are not supported", line)
    raise ParserError(f"unsupported literal of type {type(value).__name__}", line)


def _unary(node: ast.UnaryOp, ctx: _Ctx, line: int) -> Dict[str, Any]:
    op_map = {ast.UAdd: "+", ast.USub: "-", ast.Not: "!"}
    op_cls = type(node.op)
    if op_cls not in op_map:
        raise ParserError(f"unary operator '{ast.dump(node.op)}' is not supported", line)
    return {
        "kind": "unary",
        "op": op_map[op_cls],
        "operand": _expr(node.operand, ctx),
        "postfix": False,
        "line": line,
    }


def _compare(node: ast.Compare, ctx: _Ctx, line: int) -> Dict[str, Any]:
    # Only single-comparison chains supported: `a < b`. `a < b < c` becomes
    # `(a < b) && (b < c)` in Java/JS — we keep the schema flat, so reject
    # true chains (>1 op) with a friendly error.
    if len(node.ops) > 1:
        raise ParserError(
            "chained comparisons (e.g. `a < b < c`) are not supported — use `and` instead",
            line,
        )
    op_cls = type(node.ops[0])
    if op_cls not in _CMP_OPS:
        raise ParserError(f"comparison operator '{ast.dump(node.ops[0])}' is not supported", line)
    return {
        "kind": "binary",
        "op": _CMP_OPS[op_cls],
        "left": _expr(node.left, ctx),
        "right": _expr(node.comparators[0], ctx),
        "line": line,
    }


def _bool_op(node: ast.BoolOp, ctx: _Ctx, line: int) -> Dict[str, Any]:
    """Normalize `a and b and c` into left-associative binary chain."""
    op_cls = type(node.op)
    if op_cls not in _BOOL_OPS:
        raise ParserError(f"boolean operator '{ast.dump(node.op)}' is not supported", line)
    op_str = _BOOL_OPS[op_cls]
    values = [_expr(v, ctx) for v in node.values]
    result = values[0]
    for v in values[1:]:
        result = {"kind": "binary", "op": op_str, "left": result, "right": v, "line": line}
    return result


# ---------------------------------------------------------------------------
# Statements
# ---------------------------------------------------------------------------


def _stmt(node: ast.AST, ctx: _Ctx) -> Dict[str, Any]:
    line = getattr(node, "lineno", 1)

    if isinstance(node, ast.Assign):
        return _assign(node, ctx, line)

    if isinstance(node, ast.AugAssign):
        return _aug_assign(node, ctx, line)

    if isinstance(node, ast.AnnAssign):
        raise ParserError("type annotations on assignments are not supported yet", line)

    if isinstance(node, ast.Expr):
        return _statement_expression(node.value, ctx, line)

    if isinstance(node, ast.If):
        return _if(node, ctx, line)

    if isinstance(node, ast.For):
        return _for(node, ctx, line)

    if isinstance(node, ast.While):
        return _while(node, ctx, line)

    # Explicit rejections
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        raise ParserError("function definitions are not supported yet", line)
    if isinstance(node, ast.ClassDef):
        raise ParserError("class definitions are not supported yet", line)
    if isinstance(node, (ast.Import, ast.ImportFrom)):
        raise ParserError("imports are not supported", line)
    if isinstance(node, ast.Return):
        raise ParserError("return statements require functions, which are not supported", line)
    if isinstance(node, (ast.Try, ast.Raise)):
        raise ParserError("try / except / raise is not supported yet", line)
    if isinstance(node, (ast.With, ast.AsyncWith)):
        raise ParserError("with statements are not supported", line)
    if isinstance(node, (ast.Break, ast.Continue)):
        raise ParserError("break / continue are not supported yet", line)
    if isinstance(node, (ast.Global, ast.Nonlocal)):
        raise ParserError("global / nonlocal are not supported", line)
    if isinstance(node, ast.Delete):
        raise ParserError("del statements are not supported", line)
    if isinstance(node, ast.Assert):
        raise ParserError("assert statements are not supported", line)
    if isinstance(node, ast.Pass):
        # Silently ignore — a `pass` statement is a valid no-op that would
        # otherwise leave an empty body. We convert to an empty block.
        return {"kind": "block", "body": [], "line": line}

    raise ParserError(f"unsupported statement: {type(node).__name__}", line)


def _statements(nodes: List[ast.AST], ctx: _Ctx) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for n in nodes:
        s = _stmt(n, ctx)
        # Flatten synthetic empty blocks (`pass`)
        if s["kind"] == "block" and not s["body"]:
            continue
        out.append(s)
    return out


def _assign(node: ast.Assign, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if len(node.targets) != 1:
        raise ParserError("multiple assignment targets (`a = b = 1`) are not supported", line)
    target = node.targets[0]
    if isinstance(target, ast.Subscript):
        if isinstance(target.slice, ast.Slice):
            raise ParserError("slicing is not supported", line)
        return {
            "kind": "assign_index",
            "op": "=",
            "target": {
                "kind": "index",
                "target": _expr(target.value, ctx),
                "index": _expr(target.slice, ctx),
                "line": line,
            },
            "value": _expr(node.value, ctx),
            "line": line,
        }
    if not isinstance(target, ast.Name):
        raise ParserError("assignment target must be a simple variable name", line)
    name = target.id
    value_expr = _expr(node.value, ctx)

    if name not in ctx.declared:
        ctx.declared.add(name)
        return {
            "kind": "var_decl",
            "type": _infer_type(node.value),
            "name": name,
            "value": value_expr,
            "line": line,
        }

    return {
        "kind": "assign",
        "op": "=",
        "name": name,
        "value": value_expr,
        "line": line,
    }


def _aug_assign(node: ast.AugAssign, ctx: _Ctx, line: int) -> Dict[str, Any]:
    op_cls = type(node.op)
    if op_cls not in _AUG_OPS:
        raise ParserError(f"compound assignment '{ast.dump(node.op)}=' is not supported", line)

    if isinstance(node.target, ast.Subscript):
        if isinstance(node.target.slice, ast.Slice):
            raise ParserError("slicing is not supported", line)
        return {
            "kind": "assign_index",
            "op": _AUG_OPS[op_cls],
            "target": {
                "kind": "index",
                "target": _expr(node.target.value, ctx),
                "index": _expr(node.target.slice, ctx),
                "line": line,
            },
            "value": _expr(node.value, ctx),
            "line": line,
        }

    if not isinstance(node.target, ast.Name):
        raise ParserError("compound assignment target must be a variable", line)
    name = node.target.id
    if name not in ctx.declared:
        raise ParserError(f"variable '{name}' is used before assignment", line)
    return {
        "kind": "assign",
        "op": _AUG_OPS[op_cls],
        "name": name,
        "value": _expr(node.value, ctx),
        "line": line,
    }


def _infer_type(value_node: ast.AST) -> str:
    if isinstance(value_node, ast.Constant):
        v = value_node.value
        if isinstance(v, bool):
            return "boolean"
        if isinstance(v, int):
            return "int"
        if isinstance(v, float):
            return "double"
        if isinstance(v, str):
            return "string"
    if isinstance(value_node, ast.List):
        return "int[]"
    # Non-literal initializer: best-effort tag. Doesn't affect generator behaviour.
    return "int"


def _statement_expression(value: ast.AST, ctx: _Ctx, line: int) -> Dict[str, Any]:
    # print(...) — the only permitted statement-level call
    if isinstance(value, ast.Call) and isinstance(value.func, ast.Name) and value.func.id == "print":
        return _print_call(value, ctx, line)

    # A bare expression like `x + 1` on its own line is meaningless in a
    # beginner subset — but Python accepts it. Reject with a clear message.
    if isinstance(value, ast.Call):
        raise ParserError(
            f"only `print(...)` is allowed as a standalone call (got '{_call_name(value)}')",
            line,
        )
    raise ParserError("a bare expression on its own line is not supported", line)


def _call_name(call: ast.Call) -> str:
    if isinstance(call.func, ast.Name):
        return call.func.id
    if isinstance(call.func, ast.Attribute):
        return f"...{call.func.attr}"
    return "call"


def _print_call(call: ast.Call, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if call.keywords:
        raise ParserError("print() keyword arguments (sep=, end=, ...) are not supported", line)
    if len(call.args) > 1:
        raise ParserError("print() with multiple arguments is not supported yet", line)
    value = _expr(call.args[0], ctx) if call.args else None
    return {"kind": "print", "value": value, "newline": True, "line": line}


def _if(node: ast.If, ctx: _Ctx, line: int) -> Dict[str, Any]:
    return {
        "kind": "if",
        "condition": _expr(node.test, ctx),
        "then": _statements(node.body, ctx),
        # Python `elif` is represented as a nested If inside `orelse`. We
        # keep that nested shape — the trace generator + UI already handle
        # nested conditions naturally.
        "else": _statements(node.orelse, ctx) if node.orelse else None,
        "line": line,
    }


def _for(node: ast.For, ctx: _Ctx, line: int) -> Dict[str, Any]:
    """Only `for i in range(...)` is supported. Normalize to C-style for."""
    if node.orelse:
        raise ParserError("for/else is not supported", line)
    if not isinstance(node.target, ast.Name):
        raise ParserError("for-loop variable must be a simple name", line)
    if not (
        isinstance(node.iter, ast.Call)
        and isinstance(node.iter.func, ast.Name)
        and node.iter.func.id == "range"
    ):
        raise ParserError(
            "only `for <var> in range(...)` is supported (no lists, iterators, or enumerate)",
            line,
        )
    if node.iter.keywords:
        raise ParserError("range() keyword arguments are not supported", line)

    args = node.iter.args
    if not 1 <= len(args) <= 3:
        raise ParserError("range() must take 1, 2, or 3 arguments", line)

    counter = node.target.id
    ctx.declared.add(counter)

    if len(args) == 1:
        start_val = {"kind": "literal", "value": 0, "type": "int", "line": line}
        stop_expr = _expr(args[0], ctx)
        step_val = 1
    elif len(args) == 2:
        start_val = _expr(args[0], ctx)
        stop_expr = _expr(args[1], ctx)
        step_val = 1
    else:  # 3 args
        start_val = _expr(args[0], ctx)
        stop_expr = _expr(args[1], ctx)
        # Only integer literal step for MVP (positive or negative)
        step_arg = args[2]
        if not (isinstance(step_arg, ast.Constant) and isinstance(step_arg.value, int)):
            raise ParserError("range() step must be an integer literal", line)
        step_val = step_arg.value
        if step_val == 0:
            raise ParserError("range() step cannot be 0", line)

    # init: counter = start
    init = {
        "kind": "var_decl",
        "type": "int",
        "name": counter,
        "value": start_val,
        "line": line,
    }
    # condition: counter < stop  (or > stop when step < 0)
    cond_op = "<" if step_val > 0 else ">"
    condition = {
        "kind": "binary",
        "op": cond_op,
        "left": {"kind": "var", "name": counter, "line": line},
        "right": stop_expr,
        "line": line,
    }
    # update: counter += step
    update = {
        "kind": "assign",
        "op": "+=" if step_val > 0 else "-=",
        "name": counter,
        "value": {"kind": "literal", "value": abs(step_val), "type": "int", "line": line},
        "line": line,
    }

    return {
        "kind": "for",
        "init": init,
        "condition": condition,
        "update": update,
        "body": _statements(node.body, ctx),
        "line": line,
    }


def _while(node: ast.While, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if node.orelse:
        raise ParserError("while/else is not supported", line)
    return {
        "kind": "while",
        "condition": _expr(node.test, ctx),
        "body": _statements(node.body, ctx),
        "line": line,
    }


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def parse(source: str) -> Dict[str, Any]:
    """Parse Python source into TraceFlow's simplified AST."""
    if not source or not source.strip():
        raise ParserError("source is empty")

    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as e:
        raise ParserError(f"syntax error: {e.msg}", e.lineno) from e

    ctx = _Ctx()
    statements = _statements(tree.body, ctx)
    return {"kind": "program", "statements": statements}
