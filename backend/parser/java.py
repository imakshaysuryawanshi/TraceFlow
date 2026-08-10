"""
TraceFlow Java Parser — Phase 5
================================

Parses a supported subset of Java into a simplified AST tailored for the
Phase 6 trace generator.

Supported constructs (MVP scope):
  - variable declarations (int, long, double, float, boolean, String)
  - assignment (=, +=, -=, *=, /=, %=)
  - arithmetic & boolean expressions
  - unary ++ / -- (prefix + postfix)
  - System.out.println(...) / System.out.print(...)
  - if / else
  - for loops (classic C-style)
  - while loops

Explicitly UNSUPPORTED (rejected with ParserError):
  - user-declared methods, method calls (only System.out.println/print allowed)
  - arrays, generics, collections
  - object creation (`new Foo()`), inheritance, interfaces
  - threads, file IO, imports beyond default
  - try/catch/throw, switch, do-while, break/continue
  - lambdas, streams, recursion (methods are not supported)

Public API:
  parse(source: str) -> dict   # simplified AST
  ParserError                   # raised for syntax or unsupported constructs

The returned AST uses plain dicts (JSON-serialisable) so both the Phase 6
generator and the Trace Inspector can consume it directly.

Line numbers in the returned AST are 1-indexed against the USER's original
source, even when the parser wraps the snippet in a synthetic
`class Main { main() { ... } }` shell.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import javalang
from javalang import tree as jt

from .errors import ParserError


# ---------------------------------------------------------------------------
# Wrapping helpers
# ---------------------------------------------------------------------------

_WRAPPER_PREFIX = "class Main {\n  public static void main(String[] args) {\n"
_WRAPPER_SUFFIX = "\n  }\n}\n"
_WRAPPER_LINE_OFFSET = 2  # number of preamble lines in _WRAPPER_PREFIX


def _looks_wrapped(source: str) -> bool:
    """Heuristic: does the source already contain a class declaration?"""
    stripped = source.lstrip()
    return stripped.startswith("class ") or stripped.startswith("public class ")


def _prepare(source: str) -> Tuple[str, int]:
    """Return (wrapped_source, line_offset_to_subtract)."""
    if _looks_wrapped(source):
        return source, 0
    return _WRAPPER_PREFIX + source + _WRAPPER_SUFFIX, _WRAPPER_LINE_OFFSET


# ---------------------------------------------------------------------------
# Line resolution
# ---------------------------------------------------------------------------

def _line_of(node: Any, fallback: int = 1, offset: int = 0) -> int:
    """Best-effort line extraction for a javalang node."""
    pos = getattr(node, "position", None)
    if pos is not None:
        return max(1, pos.line - offset)
    return fallback


def _first_line(nodes: List[Any], fallback: int, offset: int) -> int:
    for n in nodes:
        line = _line_of(n, fallback=-1, offset=offset)
        if line != -1:
            return line
    return fallback


# ---------------------------------------------------------------------------
# Expression conversion
# ---------------------------------------------------------------------------

_BASIC_TYPES = {"int", "long", "short", "byte", "double", "float", "boolean", "char"}
_REFERENCE_ALLOWED = {"String"}
_PRINT_METHODS = {"println", "print"}


def _expr(node: Any, ctx: "_Ctx") -> Dict[str, Any]:
    line = _line_of(node, fallback=ctx.current_line, offset=ctx.offset)

    # Any node with prefix/postfix operators (e.g. `-7`, `!x`, `i++`) is a
    # unary expression. Check this BEFORE the plain-literal / member-reference
    # branches so that `-7` isn't silently treated as `7`.
    if getattr(node, "prefix_operators", None) or getattr(node, "postfix_operators", None):
        return _handle_unary(node, ctx, line)

    if isinstance(node, jt.Literal):
        return _literal(node, line)

    if isinstance(node, jt.MemberReference):
        # `a.length` — array length access.
        if node.member == "length" and node.qualifier and not node.selectors:
            qual = node.qualifier
            if "." in qual:
                raise ParserError(
                    f"qualified reference '{qual}.{node.member}' is not supported",
                    line,
                )
            return {"kind": "length", "target": {"kind": "var", "name": qual, "line": line}, "line": line}

        # A bare identifier reference. `qualifier` is only set for `Foo.bar` —
        # we treat the qualifier chain as unsupported here (System.out.println
        # is handled at the statement level via MethodInvocation).
        if node.qualifier:
            raise ParserError(
                f"qualified reference '{node.qualifier}.{node.member}' is not supported",
                line,
            )
        # Array indexing: `arr[i]` (and chained `arr[i][j]`).
        if node.selectors:
            result: Dict[str, Any] = {"kind": "var", "name": node.member, "line": line}
            for sel in node.selectors:
                if not isinstance(sel, jt.ArraySelector):
                    raise ParserError(
                        f"unsupported selector {type(sel).__name__}",
                        line,
                    )
                result = {
                    "kind": "index",
                    "target": result,
                    "index": _expr(sel.index, ctx),
                    "line": line,
                }
            return result
        return {"kind": "var", "name": node.member, "line": line}

    if isinstance(node, jt.ArrayCreator):
        # `new int[3]` / `new String[3]`
        dims = getattr(node, "dimensions", None) or []
        if len(dims) != 1:
            raise ParserError(
                "only single-dimension array creation (`new T[n]`) is supported", line
            )
        if getattr(node, "initializer", None) is not None:
            raise ParserError("`new T[] { ... }` is not supported", line)
        return {
            "kind": "array_alloc",
            "elem_type": _type_name(node.type, line).rstrip("[]") or "int",
            "length": _expr(dims[0], ctx),
            "line": line,
        }

    if isinstance(node, jt.ArrayInitializer):
        # `{ 1, 2, 3 }`
        return {
            "kind": "array_literal",
            "elements": [_expr(e, ctx) for e in (node.initializers or [])],
            "line": line,
        }

    if isinstance(node, jt.BinaryOperation):
        return {
            "kind": "binary",
            "op": node.operator,
            "left": _expr(node.operandl, ctx),
            "right": _expr(node.operandr, ctx),
            "line": line,
        }

    if isinstance(node, jt.Assignment):
        # `sum += i` appearing inside another expression (rare) — normalise as
        # a binary op producing the RHS value. Statement-level Assignments are
        # handled separately in _statement.
        target = _expr(node.expressionl, ctx)
        if target["kind"] != "var":
            raise ParserError("assignment target must be a variable", line)
        return {
            "kind": "assign_expr",
            "op": node.type,  # '=', '+=', ...
            "name": target["name"],
            "value": _expr(node.value, ctx),
            "line": line,
        }

    if isinstance(node, (jt.MethodInvocation,)):
        # Method calls are only permitted at the statement level for
        # System.out.println/print. Any expression-position call is rejected.
        raise ParserError("method calls are not supported yet", line)

    # ++x, --x, +x, -x, !x — handled by the top-of-function early dispatch;
    # left here as a safety net for direct calls with fresh nodes.
    if hasattr(node, "prefix_operators") or hasattr(node, "postfix_operators"):
        return _handle_unary(node, ctx, line)

    if isinstance(node, jt.Cast):
        raise ParserError("cast expressions are not supported", line)

    raise ParserError(f"unsupported expression: {type(node).__name__}", line)


def _literal(node: jt.Literal, line: int) -> Dict[str, Any]:
    v = node.value  # javalang gives the literal as a string
    if v == "true" or v == "false":
        return {"kind": "literal", "value": v == "true", "type": "boolean", "line": line}
    if v.startswith('"') and v.endswith('"'):
        return {"kind": "literal", "value": v[1:-1], "type": "string", "line": line}
    if v.startswith("'") and v.endswith("'"):
        return {"kind": "literal", "value": v[1:-1], "type": "char", "line": line}
    if v == "null":
        raise ParserError("null literals are not supported", line)
    # numeric
    try:
        if "." in v or "e" in v.lower():
            return {"kind": "literal", "value": float(v.rstrip("fFdD")), "type": "double", "line": line}
        return {"kind": "literal", "value": int(v.rstrip("lL")), "type": "int", "line": line}
    except ValueError:
        raise ParserError(f"invalid literal: {v}", line)


def _handle_unary(node: Any, ctx: "_Ctx", line: int) -> Dict[str, Any]:
    prefix_ops = list(getattr(node, "prefix_operators", []) or [])
    postfix_ops = list(getattr(node, "postfix_operators", []) or [])
    if not (prefix_ops or postfix_ops):
        raise ParserError(f"unsupported expression: {type(node).__name__}", line)

    if len(prefix_ops) + len(postfix_ops) > 1:
        raise ParserError("multiple unary operators are not supported", line)

    op = prefix_ops[0] if prefix_ops else postfix_ops[0]
    is_postfix = bool(postfix_ops)

    # The rest of the node is a normal reference/literal
    if isinstance(node, jt.MemberReference):
        if node.qualifier:
            raise ParserError(
                f"qualified reference '{node.qualifier}.{node.member}' is not supported",
                line,
            )
        operand: Dict[str, Any] = {"kind": "var", "name": node.member, "line": line}
        for sel in (node.selectors or []):
            if not isinstance(sel, jt.ArraySelector):
                raise ParserError(f"unsupported selector {type(sel).__name__}", line)
            operand = {
                "kind": "index",
                "target": operand,
                "index": _expr(sel.index, ctx),
                "line": line,
            }
    elif isinstance(node, jt.Literal):
        operand = _literal(node, line)
    else:
        raise ParserError(f"unsupported operand for {op}", line)

    return {
        "kind": "unary",
        "op": op,
        "operand": operand,
        "postfix": is_postfix,
        "line": line,
    }


def _method_call_expr(node: jt.MethodInvocation, ctx: "_Ctx", line: int) -> Dict[str, Any]:
    """Reserved — method calls are unsupported in current scope."""
    raise ParserError("method calls are not supported yet", line)


# ---------------------------------------------------------------------------
# Statement conversion
# ---------------------------------------------------------------------------

class _Ctx:
    """Line offset + a running 'current line' fallback."""

    def __init__(self, offset: int):
        self.offset = offset
        self.current_line = 1


def _statement(node: Any, ctx: _Ctx) -> Dict[str, Any]:
    line = _line_of(node, fallback=ctx.current_line, offset=ctx.offset)
    ctx.current_line = line

    if isinstance(node, jt.LocalVariableDeclaration):
        return _var_decl(node, ctx, line)

    if isinstance(node, jt.StatementExpression):
        return _statement_expression(node, ctx, line)

    if isinstance(node, jt.IfStatement):
        return _if_stmt(node, ctx, line)

    if isinstance(node, jt.ForStatement):
        return _for_stmt(node, ctx, line)

    if isinstance(node, jt.WhileStatement):
        return _while_stmt(node, ctx, line)

    if isinstance(node, jt.ReturnStatement):
        raise ParserError("return statements require methods, which are not supported yet", line)

    if isinstance(node, jt.BlockStatement):
        # A bare block — flatten. Callers usually pass Block directly, so this
        # branch is mostly a safety net.
        return {"kind": "block", "body": _statements(node.statements or [], ctx), "line": line}

    # Explicitly reject known unsupported constructs with helpful messages
    if isinstance(node, jt.DoStatement):
        raise ParserError("do-while loops are not supported yet", line)
    if isinstance(node, jt.SwitchStatement):
        raise ParserError("switch statements are not supported yet", line)
    if isinstance(node, (jt.TryStatement, jt.ThrowStatement)):
        raise ParserError("try/catch/throw is not supported yet", line)
    if isinstance(node, (jt.BreakStatement, jt.ContinueStatement)):
        raise ParserError(
            "break / continue are not supported yet — use a boolean flag instead", line
        )

    raise ParserError(f"unsupported statement: {type(node).__name__}", line)


def _statements(nodes: List[Any], ctx: _Ctx) -> List[Dict[str, Any]]:
    return [_statement(n, ctx) for n in nodes]


def _var_decl(node: jt.LocalVariableDeclaration, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if len(node.declarators) != 1:
        raise ParserError(
            "multiple declarations on one line are not supported (`int a, b;`)",
            line,
        )
    decl = node.declarators[0]
    type_name = _type_name(node.type, line)
    if getattr(decl, "dimensions", None):
        if type_name.endswith("[]"):
            raise ParserError("multi-dimensional arrays are not supported", line)
        type_name += "[]"
    return {
        "kind": "var_decl",
        "type": type_name,
        "name": decl.name,
        "value": _expr(decl.initializer, ctx) if decl.initializer is not None else None,
        "line": line,
    }


def _type_name(t: Any, line: int) -> str:
    if isinstance(t, jt.BasicType):
        if t.name not in _BASIC_TYPES:
            raise ParserError(f"type '{t.name}' is not supported", line)
        base = t.name
    elif isinstance(t, jt.ReferenceType):
        if getattr(t, "arguments", None):
            raise ParserError("generic types are not supported", line)
        if t.name not in _REFERENCE_ALLOWED:
            raise ParserError(f"type '{t.name}' is not supported", line)
        base = t.name
    else:
        raise ParserError(f"unsupported type: {type(t).__name__}", line)

    dims = getattr(t, "dimensions", None) or []
    if len(dims) > 1:
        raise ParserError("multi-dimensional arrays are not supported", line)
    if dims:
        return base + "[]"
    return base


def _statement_expression(node: jt.StatementExpression, ctx: _Ctx, line: int) -> Dict[str, Any]:
    inner = node.expression

    # ------- print statement -------
    if isinstance(inner, jt.MethodInvocation) and inner.member in _PRINT_METHODS:
        if _is_system_out(inner):
            args = inner.arguments or []
            if len(args) > 1:
                raise ParserError("System.out.println expects at most one argument", line)
            value = _expr(args[0], ctx) if args else None
            return {
                "kind": "print",
                "value": value,
                "newline": inner.member == "println",
                "line": line,
            }

    # ------- assignment (statement-level) -------
    if isinstance(inner, jt.Assignment):
        target = _expr(inner.expressionl, ctx)
        if target["kind"] == "var":
            return {
                "kind": "assign",
                "op": inner.type,  # '=', '+=', '-=', '*=', '/=', '%='
                "name": target["name"],
                "value": _expr(inner.value, ctx),
                "line": line,
            }
        if target["kind"] == "index":
            return {
                "kind": "assign_index",
                "op": inner.type,
                "target": target,
                "value": _expr(inner.value, ctx),
                "line": line,
            }
        raise ParserError("assignment target must be a variable or array element", line)

    # ------- lone ++ / -- statement -------
    if isinstance(inner, jt.MemberReference) and (
        getattr(inner, "prefix_operators", None) or getattr(inner, "postfix_operators", None)
    ):
        unary = _handle_unary(inner, ctx, line)
        return {"kind": "unary_stmt", **{k: v for k, v in unary.items() if k != "kind"}}

    # ------- standalone method call (only System.out.print[ln]) -------
    if isinstance(inner, jt.MethodInvocation):
        raise ParserError(
            "method calls are not supported (only System.out.println/print)", line
        )

    raise ParserError(f"unsupported statement expression: {type(inner).__name__}", line)


def _is_system_out(inv: jt.MethodInvocation) -> bool:
    """True when the invocation is `System.out.println(...)` or `.print(...)`."""
    # javalang models `System.out.println(x)` as MethodInvocation with
    # qualifier="System.out". Selectors can appear if the call chain is longer.
    return (inv.qualifier or "") in ("System.out", "System .out") and not inv.selectors


def _if_stmt(node: jt.IfStatement, ctx: _Ctx, line: int) -> Dict[str, Any]:
    return {
        "kind": "if",
        "condition": _expr(node.condition, ctx),
        "then": _body(node.then_statement, ctx),
        "else": _body(node.else_statement, ctx) if node.else_statement is not None else None,
        "line": line,
    }


def _for_stmt(node: jt.ForStatement, ctx: _Ctx, line: int) -> Dict[str, Any]:
    ctrl = node.control
    if not isinstance(ctrl, jt.ForControl):
        raise ParserError("for-each loops are not supported yet", line)

    init: Optional[Dict[str, Any]] = None
    if ctrl.init is not None:
        # Init can be a VariableDeclaration OR a list of StatementExpressions.
        if isinstance(ctrl.init, jt.VariableDeclaration):
            init = _for_var_decl(ctrl.init, ctx, line)
        elif isinstance(ctrl.init, list) and ctrl.init:
            if len(ctrl.init) > 1:
                raise ParserError("multiple init expressions in for(...) are not supported", line)
            init = _statement(jt.StatementExpression(expression=ctrl.init[0]), ctx)
        else:
            raise ParserError("unsupported for-loop init", line)

    condition = _expr(ctrl.condition, ctx) if ctrl.condition is not None else None

    update: Optional[Dict[str, Any]] = None
    if ctrl.update:
        if len(ctrl.update) > 1:
            raise ParserError("multiple update expressions in for(...) are not supported", line)
        upd = ctrl.update[0]
        update = _for_update_expr(upd, ctx, line)

    return {
        "kind": "for",
        "init": init,
        "condition": condition,
        "update": update,
        "body": _body(node.body, ctx),
        "line": line,
    }


def _for_var_decl(node: jt.VariableDeclaration, ctx: _Ctx, line: int) -> Dict[str, Any]:
    if len(node.declarators) != 1:
        raise ParserError("multiple declarators in for(...) are not supported", line)
    decl = node.declarators[0]
    return {
        "kind": "var_decl",
        "type": _type_name(node.type, line),
        "name": decl.name,
        "value": _expr(decl.initializer, ctx) if decl.initializer is not None else None,
        "line": line,
    }


def _for_update_expr(node: Any, ctx: _Ctx, line: int) -> Dict[str, Any]:
    """Update expression is stored as a bare expression (not a Statement)."""
    if isinstance(node, jt.Assignment):
        target = _expr(node.expressionl, ctx)
        if target["kind"] == "var":
            return {
                "kind": "assign",
                "op": node.type,
                "name": target["name"],
                "value": _expr(node.value, ctx),
                "line": line,
            }
        if target["kind"] == "index":
            return {
                "kind": "assign_index",
                "op": node.type,
                "target": target,
                "value": _expr(node.value, ctx),
                "line": line,
            }
        raise ParserError("update assignment target must be a variable or array element", line)
    # e.g. i++
    if isinstance(node, jt.MemberReference) and (
        getattr(node, "prefix_operators", None) or getattr(node, "postfix_operators", None)
    ):
        unary = _handle_unary(node, ctx, line)
        return {"kind": "unary_stmt", **{k: v for k, v in unary.items() if k != "kind"}}
    raise ParserError("unsupported for-loop update expression", line)


def _while_stmt(node: jt.WhileStatement, ctx: _Ctx, line: int) -> Dict[str, Any]:
    return {
        "kind": "while",
        "condition": _expr(node.condition, ctx),
        "body": _body(node.body, ctx),
        "line": line,
    }


def _body(stmt: Any, ctx: _Ctx) -> List[Dict[str, Any]]:
    """Normalise a body (Block or single statement) into a list of statements."""
    if stmt is None:
        return []
    if isinstance(stmt, jt.BlockStatement):
        return _statements(stmt.statements or [], ctx)
    return [_statement(stmt, ctx)]


# ---------------------------------------------------------------------------
# Method extraction — methods are NOT supported in current scope. Kept here
# only for documentation. Reserved for a future phase.
# ---------------------------------------------------------------------------

_UNSUPPORTED_MODIFIERS = {"synchronized", "native", "volatile", "abstract", "strictfp"}


def _extract_program(tree: jt.CompilationUnit, ctx: _Ctx) -> Dict[str, Any]:
    """Walk the compilation unit and pull out main-body statements + methods."""
    if tree.package is not None:
        raise ParserError("package declarations are not supported")
    if tree.imports:
        raise ParserError("import statements are not supported")

    classes = [t for t in tree.types if isinstance(t, jt.ClassDeclaration)]
    if not classes:
        raise ParserError("no class declaration found")
    if len(classes) > 1:
        raise ParserError("multiple top-level classes are not supported")

    cls = classes[0]
    if cls.extends is not None or cls.implements:
        raise ParserError("inheritance and interfaces are not supported")
    if cls.type_parameters:
        raise ParserError("generic classes are not supported")

    statements: List[Dict[str, Any]] = []
    main_found = False

    for member in cls.body:
        if isinstance(member, jt.MethodDeclaration):
            if _is_main(member):
                if main_found:
                    raise ParserError("multiple main() methods are not supported")
                main_found = True
                statements = _statements(member.body or [], ctx)
            else:
                raise ParserError(
                    "user-declared methods are not supported yet",
                    _line_of(member, offset=ctx.offset),
                )
        elif isinstance(member, jt.FieldDeclaration):
            raise ParserError(
                "class-level fields are not supported — declare variables inside main()",
                _line_of(member, offset=ctx.offset),
            )
        elif isinstance(member, jt.ConstructorDeclaration):
            raise ParserError("constructors are not supported", _line_of(member, offset=ctx.offset))
        else:
            raise ParserError(
                f"unsupported class member: {type(member).__name__}",
                _line_of(member, offset=ctx.offset),
            )

    if not main_found:
        raise ParserError("no statements to execute")

    return {
        "kind": "program",
        "statements": statements,
    }


def _is_main(method: jt.MethodDeclaration) -> bool:
    if method.name != "main":
        return False
    if not method.parameters or len(method.parameters) != 1:
        return False
    p = method.parameters[0]
    # We only accept `String[] args`. Users may write different names.
    t = p.type
    return isinstance(t, jt.ReferenceType) and t.name == "String" and bool(p.varargs) is False


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def parse(source: str) -> Dict[str, Any]:
    """Parse Java source into a simplified AST dict.

    Raises `ParserError` for syntax errors and unsupported constructs.
    """
    if not source or not source.strip():
        raise ParserError("source is empty")

    wrapped, offset = _prepare(source)

    try:
        tree = javalang.parse.parse(wrapped)
    except javalang.parser.JavaSyntaxError as e:
        # javalang stores the offending token; try to recover a line number.
        line = getattr(getattr(e, "at", None), "position", None)
        line_num = line.line - offset if line else None
        raise ParserError(f"syntax error: {e.description}", line_num) from e
    except javalang.tokenizer.LexerError as e:
        raise ParserError(f"tokenizer error: {e}") from e

    ctx = _Ctx(offset=offset)
    return _extract_program(tree, ctx)
