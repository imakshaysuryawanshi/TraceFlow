"""
TraceFlow JavaScript Parser — Phase 11
========================================

Parses a beginner-safe subset of JavaScript (ES2015+) into TraceFlow's
simplified AST. Uses the pure-Python `esprima` port — no Node.js needed.

Supported constructs (MVP scope — mirrors Java parity):
  - `let` / `const` / `var` declarations (const reassignment rejected)
  - assignment / compound (= += -= *= /= %=)
  - arithmetic + boolean expressions (&& || !, ==, ===, !=, !==)
  - unary ++ / -- (prefix + postfix)
  - `console.log(...)` — one argument
  - `if` / `else if` / `else`
  - `for (init; cond; update)`  (classic C-style)
  - `while`

Explicitly UNSUPPORTED (rejected with ParserError):
  - functions, arrow functions, classes, `new`
  - arrays, objects, destructuring, spread
  - imports/exports, async/await, promises, callbacks
  - for-of, for-in, do-while, switch, try/catch, break/continue
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Set
import esprima

from .errors import ParserError


_ASSIGN_OPS = {"=", "+=", "-=", "*=", "/=", "%="}
_BINARY_OPS = {"+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=",
               "===", "!=="}
_LOGICAL_OPS = {"&&": "&&", "||": "||"}


class _Ctx:
    def __init__(self) -> None:
        # Track declared names and whether each was declared `const`.
        self.declared: Set[str] = set()
        self.consts: Set[str] = set()


def _line(node: Any, fallback: int = 1) -> int:
    loc = getattr(node, "loc", None)
    if loc and getattr(loc, "start", None):
        return loc.start.line
    return fallback


def _expr(node: Any, ctx: _Ctx) -> Dict[str, Any]:
    line = _line(node)
    t = node.type

    if t == "Literal":
        return _literal(node.value, line)

    if t == "Identifier":
        return {"kind": "var", "name": node.name, "line": line}

    if t == "BinaryExpression":
        op = node.operator
        # Normalize === / !== to == / !=
        if op == "===":
            op = "=="
        elif op == "!==":
            op = "!="
        if op not in _BINARY_OPS - {"===", "!=="}:
            raise ParserError(f"binary operator '{node.operator}' is not supported", line)
        return {
            "kind": "binary",
            "op": op,
            "left": _expr(node.left, ctx),
            "right": _expr(node.right, ctx),
            "line": line,
        }

    if t == "LogicalExpression":
        if node.operator not in _LOGICAL_OPS:
            raise ParserError(f"logical operator '{node.operator}' is not supported", line)
        return {
            "kind": "binary",
            "op": _LOGICAL_OPS[node.operator],
            "left": _expr(node.left, ctx),
            "right": _expr(node.right, ctx),
            "line": line,
        }

    if t == "UnaryExpression":
        if node.operator not in ("+", "-", "!"):
            raise ParserError(f"unary operator '{node.operator}' is not supported", line)
        return {
            "kind": "unary",
            "op": node.operator,
            "operand": _expr(node.argument, ctx),
            "postfix": False,
            "line": line,
        }

    if t == "UpdateExpression":  # ++ / --
        if node.operator not in ("++", "--"):
            raise ParserError(f"update operator '{node.operator}' is not supported", line)
        return {
            "kind": "unary",
            "op": node.operator,
            "operand": _expr(node.argument, ctx),
            "postfix": bool(getattr(node, "prefix", False) is False),
            "line": line,
        }

    if t == "AssignmentExpression":
        raise ParserError(
            "assignment inside an expression is not supported (use a statement)", line
        )

    if t == "CallExpression":
        # `console.log` handled at statement level; other calls rejected.
        raise ParserError(
            "function calls are not supported (only `console.log(...)` at statement level)",
            line,
        )

    if t == "ArrayExpression":
        return {
            "kind": "array_literal",
            "elements": [_expr(e, ctx) for e in node.elements],
            "line": line,
        }

    if t == "ObjectExpression":
        raise ParserError("objects are not supported", line)

    if t in ("ArrowFunctionExpression", "FunctionExpression"):
        raise ParserError("functions are not supported yet", line)

    if t == "MemberExpression":
        # `arr[i]` (computed) → index; `arr.length` → length
        if getattr(node, "computed", False):
            return {
                "kind": "index",
                "target": _expr(node.object, ctx),
                "index": _expr(node.property, ctx),
                "line": line,
            }
        if (
            node.property.type == "Identifier"
            and node.property.name == "length"
            and node.object.type == "Identifier"
        ):
            return {
                "kind": "length",
                "target": {"kind": "var", "name": node.object.name, "line": line},
                "line": line,
            }
        raise ParserError("member access is not supported (only `arr[i]` and `arr.length`)", line)

    if t == "TemplateLiteral":
        raise ParserError("template literals (backticks) are not supported", line)

    raise ParserError(f"unsupported expression: {t}", line)


def _literal(value: Any, line: int) -> Dict[str, Any]:
    if isinstance(value, bool):
        return {"kind": "literal", "value": value, "type": "boolean", "line": line}
    if isinstance(value, int):
        return {"kind": "literal", "value": value, "type": "int", "line": line}
    if isinstance(value, float):
        # JS has no int/float distinction — integers show up as ints in esprima
        return {"kind": "literal", "value": value, "type": "double", "line": line}
    if isinstance(value, str):
        return {"kind": "literal", "value": value, "type": "string", "line": line}
    if value is None:
        raise ParserError("null literals are not supported", line)
    raise ParserError(f"unsupported literal of type {type(value).__name__}", line)


def _stmt(node: Any, ctx: _Ctx) -> Dict[str, Any]:
    line = _line(node)
    t = node.type

    if t == "VariableDeclaration":
        return _var_decl(node, ctx, line)

    if t == "ExpressionStatement":
        return _statement_expression(node.expression, ctx, line)

    if t == "IfStatement":
        return _if(node, ctx, line)

    if t == "ForStatement":
        return _for(node, ctx, line)

    if t == "WhileStatement":
        return _while(node, ctx, line)

    if t == "BlockStatement":
        return {"kind": "block", "body": _statements(node.body, ctx), "line": line}

    # Rejections with clear messages
    if t in ("FunctionDeclaration",):
        raise ParserError("function declarations are not supported yet", line)
    if t == "ClassDeclaration":
        raise ParserError("class declarations are not supported yet", line)
    if t in ("ImportDeclaration", "ExportNamedDeclaration", "ExportDefaultDeclaration"):
        raise ParserError("imports / exports are not supported", line)
    if t == "ReturnStatement":
        raise ParserError("return requires a function, which is not supported yet", line)
    if t in ("ForOfStatement", "ForInStatement"):
        raise ParserError("for-of / for-in loops are not supported yet", line)
    if t == "DoWhileStatement":
        raise ParserError("do-while loops are not supported yet", line)
    if t == "SwitchStatement":
        raise ParserError("switch statements are not supported yet", line)
    if t in ("TryStatement", "ThrowStatement"):
        raise ParserError("try / catch / throw is not supported yet", line)
    if t in ("BreakStatement", "ContinueStatement"):
        raise ParserError("break / continue are not supported yet", line)
    if t == "EmptyStatement":
        return {"kind": "block", "body": [], "line": line}

    raise ParserError(f"unsupported statement: {t}", line)


def _statements(nodes: List[Any], ctx: _Ctx) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for n in nodes:
        s = _stmt(n, ctx)
        if s["kind"] == "block" and not s["body"]:
            continue
        out.append(s)
    return out


def _var_decl(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if len(node.declarations) != 1:
        raise ParserError("multiple declarations on one line are not supported", line)
    d = node.declarations[0]
    if d.id.type != "Identifier":
        raise ParserError("destructuring declarations are not supported", line)
    name = d.id.name
    if name in ctx.declared:
        raise ParserError(f"variable '{name}' is already declared", line)
    ctx.declared.add(name)
    if node.kind == "const":
        ctx.consts.add(name)

    return {
        "kind": "var_decl",
        "type": _infer_type(d.init),
        "name": name,
        "value": _expr(d.init, ctx) if d.init is not None else None,
        "line": line,
    }


def _infer_type(init_node: Any) -> str:
    if init_node is None:
        return "int"
    if init_node.type == "ArrayExpression":
        return "int[]"
    if init_node.type == "Literal":
        v = init_node.value
        if isinstance(v, bool):
            return "boolean"
        if isinstance(v, int):
            return "int"
        if isinstance(v, float):
            return "double"
        if isinstance(v, str):
            return "string"
    return "int"


def _statement_expression(expr: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if expr.type == "CallExpression":
        return _handle_call(expr, ctx, line)
    if expr.type == "AssignmentExpression":
        return _handle_assignment(expr, ctx, line)
    if expr.type == "UpdateExpression":
        return {
            "kind": "unary_stmt",
            "op": expr.operator,
            "operand": _expr(expr.argument, ctx),
            "postfix": bool(getattr(expr, "prefix", False) is False),
            "line": line,
        }
    raise ParserError(f"unsupported statement expression: {expr.type}", line)


def _handle_call(call: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    # console.log(...)  — the only permitted call
    if (
        call.callee.type == "MemberExpression"
        and call.callee.object.type == "Identifier"
        and call.callee.object.name == "console"
        and call.callee.property.type == "Identifier"
        and call.callee.property.name in ("log", "info")
    ):
        args = call.arguments or []
        if len(args) > 1:
            raise ParserError("console.log with multiple arguments is not supported yet", line)
        value = _expr(args[0], ctx) if args else None
        return {"kind": "print", "value": value, "newline": True, "line": line}
    raise ParserError(
        "only `console.log(...)` is allowed as a standalone call", line
    )


def _handle_assignment(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if node.left.type == "MemberExpression" and getattr(node.left, "computed", False):
        return {
            "kind": "assign_index",
            "op": node.operator,
            "target": {
                "kind": "index",
                "target": _expr(node.left.object, ctx),
                "index": _expr(node.left.property, ctx),
                "line": line,
            },
            "value": _expr(node.right, ctx),
            "line": line,
        }
    if node.left.type != "Identifier":
        raise ParserError("assignment target must be a variable name", line)
    name = node.left.name
    if name in ctx.consts:
        raise ParserError(f"cannot reassign const variable '{name}'", line)
    if name not in ctx.declared:
        raise ParserError(f"variable '{name}' is used before declaration", line)
    if node.operator not in _ASSIGN_OPS:
        raise ParserError(f"assignment operator '{node.operator}' is not supported", line)
    return {
        "kind": "assign",
        "op": node.operator,
        "name": name,
        "value": _expr(node.right, ctx),
        "line": line,
    }


def _if(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    then_body = _body(node.consequent, ctx)
    else_body = _body(node.alternate, ctx) if node.alternate is not None else None
    return {
        "kind": "if",
        "condition": _expr(node.test, ctx),
        "then": then_body,
        "else": else_body,
        "line": line,
    }


def _body(node: Any, ctx: _Ctx) -> List[Dict[str, Any]]:
    if node is None:
        return []
    if node.type == "BlockStatement":
        return _statements(node.body, ctx)
    return [_stmt(node, ctx)]


def _for(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    init: Optional[Dict[str, Any]] = None
    if node.init is not None:
        if node.init.type == "VariableDeclaration":
            init = _var_decl(node.init, ctx, _line(node.init))
        elif node.init.type == "AssignmentExpression":
            init = _handle_assignment(node.init, ctx, _line(node.init))
        elif node.init.type == "UpdateExpression":
            init = {
                "kind": "unary_stmt",
                "op": node.init.operator,
                "operand": _expr(node.init.argument, ctx),
                "postfix": bool(getattr(node.init, "prefix", False) is False),
                "line": _line(node.init),
            }
        else:
            raise ParserError("unsupported for-loop init", line)

    condition = _expr(node.test, ctx) if node.test is not None else None

    update: Optional[Dict[str, Any]] = None
    if node.update is not None:
        u = node.update
        u_line = _line(u)
        if u.type == "UpdateExpression":
            update = {
                "kind": "unary_stmt",
                "op": u.operator,
                "operand": _expr(u.argument, ctx),
                "postfix": bool(getattr(u, "prefix", False) is False),
                "line": u_line,
            }
        elif u.type == "AssignmentExpression":
            update = _handle_assignment(u, ctx, u_line)
        else:
            raise ParserError("unsupported for-loop update expression", u_line)

    return {
        "kind": "for",
        "init": init,
        "condition": condition,
        "update": update,
        "body": _body(node.body, ctx),
        "line": line,
    }


def _while(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    return {
        "kind": "while",
        "condition": _expr(node.test, ctx),
        "body": _body(node.body, ctx),
        "line": line,
    }


def parse(source: str) -> Dict[str, Any]:
    """Parse JavaScript source into TraceFlow's simplified AST."""
    if not source or not source.strip():
        raise ParserError("source is empty")
    try:
        tree = esprima.parseScript(source, {"loc": True, "tolerant": False})
    except esprima.Error as e:
        # esprima raises with attributes .lineNumber, .description
        line = getattr(e, "lineNumber", None)
        msg = getattr(e, "description", str(e))
        raise ParserError(f"syntax error: {msg}", line) from e

    ctx = _Ctx()
    return {"kind": "program", "statements": _statements(tree.body, ctx)}
