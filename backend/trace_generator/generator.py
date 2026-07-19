"""
TraceFlow Execution Trace Generator — Phase 6
==============================================

Walks the simplified AST produced by `backend.parser` and emits a Trace
object matching the frozen v1.0 schema (see `backend.schemas.trace_schema`
and `frontend/src/schemas/traceSchema.js`).

Design notes:
  - The generator interprets a supported subset of Java DIRECTLY. It does
    not compile or shell out to `javac`/`java`.
  - Each meaningful execution event emits exactly one Step. `variables` and
    `output` are full snapshots AFTER the event.
  - `explanation` is templated (mocked). Phase 9 will replace the templater
    with an LLM call without touching Step shape.
  - Safety: MAX_STEPS caps execution to prevent runaway loops in user code.
    A cap event emits a terminal step with a clear message and stops.

Public API:
    generate(ast: dict, *, id: str, name: str = "", description: str = "",
             concept: str = None, code: str = "") -> dict   # a Trace
    TraceGenerationError                                      # runtime errors
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Tuple
import copy

MAX_STEPS = 500


class TraceGenerationError(Exception):
    """Raised for runtime errors (division by zero, undefined variable, …)."""

    def __init__(self, message: str, line: Optional[int] = None):
        self.message = message
        self.line = line
        super().__init__(f"line {line}: {message}" if line else message)


# ---------------------------------------------------------------------------
# Emitter — owns state (vars, output, step counter) and produces Steps.
# ---------------------------------------------------------------------------


class _Emitter:
    def __init__(self) -> None:
        self.vars: Dict[str, Any] = {}
        self.output: List[str] = []
        self.steps: List[Dict[str, Any]] = []
        self._step_num: int = 1
        self.stopped: bool = False

    def emit(
        self,
        *,
        line: int,
        kind: str,
        label: str,
        changes: List[str],
        explanation: str,
        condition: Optional[str] = None,
        condition_result: Optional[bool] = None,
    ) -> None:
        step: Dict[str, Any] = {
            "step": self._step_num,
            "line": line,
            # Snapshots MUST be independent copies — later mutations to the
            # env should not leak into recorded steps.
            "variables": copy.deepcopy(self.vars),
            "output": list(self.output),
            "changes": list(changes),
            "explanation": explanation,
            "kind": kind,
            "label": label,
        }
        if condition is not None:
            step["condition"] = condition
            step["condition_result"] = condition_result
        self.steps.append(step)
        self._step_num += 1

        if self._step_num > MAX_STEPS:
            self.emit_cap(line)

    def emit_cap(self, line: int) -> None:
        # Emit a single terminal cap step and stop further execution.
        self.stopped = True
        self.steps.append(
            {
                "step": self._step_num,
                "line": line,
                "variables": copy.deepcopy(self.vars),
                "output": list(self.output),
                "changes": [f"execution stopped after {MAX_STEPS} steps"],
                "explanation": (
                    f"TraceFlow stopped after {MAX_STEPS} steps to prevent a "
                    f"runaway loop. Reduce the number of iterations or check "
                    f"your loop condition."
                ),
                "kind": "declare",  # neutral kind so UI colouring stays sane
                "label": "execution capped",
            }
        )


# ---------------------------------------------------------------------------
# Expression evaluation
# ---------------------------------------------------------------------------


def _evaluate(expr: Dict[str, Any], em: _Emitter) -> Any:
    kind = expr["kind"]
    if kind == "literal":
        return expr["value"]

    if kind == "var":
        name = expr["name"]
        if name not in em.vars:
            raise TraceGenerationError(f"variable '{name}' is not defined", expr.get("line"))
        return em.vars[name]

    if kind == "binary":
        left = _evaluate(expr["left"], em)
        right = _evaluate(expr["right"], em)
        return _apply_binary(expr["op"], left, right, expr.get("line"))

    if kind == "unary":
        return _evaluate_unary_pure(expr, em)

    if kind == "assign_expr":
        # Rare — assignment nested inside another expression, e.g. `while ((x = f()) > 0)`.
        name = expr["name"]
        rhs = _evaluate(expr["value"], em)
        new_val = _combine(expr["op"], em.vars.get(name), rhs, expr.get("line"))
        em.vars[name] = new_val
        return new_val

    raise TraceGenerationError(f"unsupported expression kind: {kind}", expr.get("line"))


def _evaluate_unary_pure(expr: Dict[str, Any], em: _Emitter) -> Any:
    """Evaluate a unary that appears in expression position (i.e., not a
    lone `i++;` statement — that path is handled by _exec_unary_stmt).
    Side-effects on variables still apply."""
    op = expr["op"]
    operand = expr["operand"]
    if op in ("++", "--"):
        if operand["kind"] != "var":
            raise TraceGenerationError(f"{op} requires a variable operand", expr.get("line"))
        name = operand["name"]
        if name not in em.vars:
            raise TraceGenerationError(f"variable '{name}' is not defined", operand.get("line"))
        old = em.vars[name]
        new = old + 1 if op == "++" else old - 1
        em.vars[name] = new
        return old if expr.get("postfix") else new
    val = _evaluate(operand, em)
    if op == "-":
        return -val
    if op == "+":
        return +val
    if op == "!":
        return not val
    raise TraceGenerationError(f"unsupported unary operator '{op}'", expr.get("line"))


def _apply_binary(op: str, a: Any, b: Any, line: Optional[int]) -> Any:
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        if isinstance(a, int) and isinstance(b, int):
            if b == 0:
                raise TraceGenerationError("division by zero", line)
            # Java-style integer division (truncate toward zero)
            q = abs(a) // abs(b)
            return q if (a < 0) == (b < 0) else -q
        if b == 0:
            raise TraceGenerationError("division by zero", line)
        return a / b
    if op == "%":
        if b == 0:
            raise TraceGenerationError("modulo by zero", line)
        # Java-style remainder (sign follows dividend)
        r = abs(a) % abs(b)
        return r if a >= 0 else -r
    if op == "==":
        return a == b
    if op == "!=":
        return a != b
    if op == "<":
        return a < b
    if op == "<=":
        return a <= b
    if op == ">":
        return a > b
    if op == ">=":
        return a >= b
    if op == "&&":
        return bool(a) and bool(b)
    if op == "||":
        return bool(a) or bool(b)
    raise TraceGenerationError(f"unsupported binary operator '{op}'", line)


def _combine(op: str, old: Any, rhs: Any, line: Optional[int]) -> Any:
    """Apply a compound-assignment operator: =, +=, -=, *=, /=, %=."""
    if op == "=":
        return rhs
    if op == "+=":
        return _apply_binary("+", old, rhs, line)
    if op == "-=":
        return _apply_binary("-", old, rhs, line)
    if op == "*=":
        return _apply_binary("*", old, rhs, line)
    if op == "/=":
        return _apply_binary("/", old, rhs, line)
    if op == "%=":
        return _apply_binary("%", old, rhs, line)
    raise TraceGenerationError(f"unsupported assignment operator '{op}'", line)


# ---------------------------------------------------------------------------
# Expression stringification (for labels + condition text)
# ---------------------------------------------------------------------------


def _stringify(expr: Optional[Dict[str, Any]]) -> str:
    if expr is None:
        return ""
    k = expr["kind"]
    if k == "literal":
        t = expr.get("type")
        if t == "string":
            return f'"{expr["value"]}"'
        if t == "char":
            return f"'{expr['value']}'"
        if t == "boolean":
            return "true" if expr["value"] else "false"
        return str(expr["value"])
    if k == "var":
        return expr["name"]
    if k == "binary":
        return f"{_stringify(expr['left'])} {expr['op']} {_stringify(expr['right'])}"
    if k == "unary":
        if expr.get("postfix"):
            return f"{_stringify(expr['operand'])}{expr['op']}"
        return f"{expr['op']}{_stringify(expr['operand'])}"
    if k == "assign_expr":
        return f"{expr['name']} {expr['op']} {_stringify(expr['value'])}"
    return "?"


def _fmt_value(v: Any) -> str:
    """Format a runtime value the way Java's default `println` would."""
    if isinstance(v, bool):
        return "true" if v else "false"
    return str(v)


# ---------------------------------------------------------------------------
# Statement execution
# ---------------------------------------------------------------------------


def _exec(stmt: Dict[str, Any], em: _Emitter) -> None:
    if em.stopped:
        return

    kind = stmt["kind"]

    if kind == "var_decl":
        _exec_var_decl(stmt, em)
    elif kind == "assign":
        _exec_assign(stmt, em, as_kind="assign")
    elif kind == "unary_stmt":
        _exec_unary_stmt(stmt, em, as_kind="assign")
    elif kind == "print":
        _exec_print(stmt, em)
    elif kind == "if":
        _exec_if(stmt, em)
    elif kind == "for":
        _exec_for(stmt, em)
    elif kind == "while":
        _exec_while(stmt, em)
    elif kind == "block":
        for s in stmt["body"]:
            _exec(s, em)
            if em.stopped:
                return
    else:
        raise TraceGenerationError(f"unsupported statement kind: {kind}", stmt.get("line"))


def _default_for(type_: str) -> Any:
    if type_ in ("int", "long", "short", "byte"):
        return 0
    if type_ in ("double", "float"):
        return 0.0
    if type_ == "boolean":
        return False
    if type_ == "char":
        return ""
    return ""  # String


def _exec_var_decl(stmt: Dict[str, Any], em: _Emitter) -> None:
    name = stmt["name"]
    if stmt.get("value") is not None:
        value = _evaluate(stmt["value"], em)
    else:
        value = _default_for(stmt["type"])
    em.vars[name] = value

    disp = _fmt_value(value)
    label = f"Declare {name} = {disp}" if stmt.get("value") is not None else f"Declare {name}"
    em.emit(
        line=stmt["line"],
        kind="declare",
        label=label,
        changes=[f"{name} initialized to {disp}"],
        explanation=(
            f"The variable {name} is declared and initialized to {disp}."
        ),
    )


def _exec_assign(stmt: Dict[str, Any], em: _Emitter, *, as_kind: str) -> None:
    name = stmt["name"]
    if name not in em.vars:
        raise TraceGenerationError(f"variable '{name}' is not defined", stmt.get("line"))
    old = em.vars[name]
    rhs = _evaluate(stmt["value"], em)
    new = _combine(stmt["op"], old, rhs, stmt.get("line"))
    em.vars[name] = new

    op = stmt["op"]
    rhs_str = _stringify(stmt["value"])
    disp_old = _fmt_value(old)
    disp_new = _fmt_value(new)
    label = f"{name} {op} {rhs_str}  →  {name} = {disp_new}"
    em.emit(
        line=stmt["line"],
        kind=as_kind,
        label=label,
        changes=[f"{name} changed from {disp_old} to {disp_new}"],
        explanation=(
            f"{name} {op} {rhs_str} updates {name}. "
            f"It changes from {disp_old} to {disp_new}."
        ),
    )


def _exec_unary_stmt(stmt: Dict[str, Any], em: _Emitter, *, as_kind: str) -> None:
    op = stmt["op"]
    operand = stmt["operand"]
    if operand["kind"] != "var":
        raise TraceGenerationError(f"{op} requires a variable operand", stmt.get("line"))
    name = operand["name"]
    if name not in em.vars:
        raise TraceGenerationError(f"variable '{name}' is not defined", stmt.get("line"))
    old = em.vars[name]
    if op == "++":
        new = old + 1
        verb = "incremented"
    elif op == "--":
        new = old - 1
        verb = "decremented"
    else:
        raise TraceGenerationError(f"unsupported unary statement '{op}'", stmt.get("line"))
    em.vars[name] = new

    disp_old = _fmt_value(old)
    disp_new = _fmt_value(new)
    label = f"{name}{op}  →  {name} = {disp_new}"
    # In a for-loop update slot we call out incrementing/decrementing; in
    # any other position we treat it like a regular assignment so the
    # "changes" phrasing stays uniform ("X changed from A to B").
    if as_kind == "loop-step":
        change = f"{name} {verb} from {disp_old} to {disp_new}"
        expl = f"{name} is {verb} to {disp_new}. The condition will be re-checked."
    else:
        change = f"{name} changed from {disp_old} to {disp_new}"
        expl = f"{name} is {verb} to {disp_new}."

    em.emit(
        line=stmt["line"],
        kind=as_kind,
        label=label,
        changes=[change],
        explanation=expl,
    )


def _exec_print(stmt: Dict[str, Any], em: _Emitter) -> None:
    value = _evaluate(stmt["value"], em) if stmt.get("value") is not None else ""
    disp = _fmt_value(value)
    em.output.append(disp)

    expr_str = _stringify(stmt.get("value")) or ""
    method = "println" if stmt.get("newline", True) else "print"
    label = f"System.out.{method}({expr_str})"
    em.emit(
        line=stmt["line"],
        kind="print",
        label=label,
        changes=[f'printed "{disp}"'],
        explanation=(
            f'The value {disp} is printed to the console.'
        ),
    )


def _exec_if(stmt: Dict[str, Any], em: _Emitter) -> None:
    cond_str = _stringify(stmt["condition"])
    result = bool(_evaluate(stmt["condition"], em))
    branch_label = "took if branch" if result else "took else branch"

    em.emit(
        line=stmt["line"],
        kind="condition",
        label=f"Check {cond_str}  →  {str(result).lower()}",
        changes=[f"condition {cond_str} evaluated to {str(result).lower()}", branch_label],
        explanation=(
            f"{cond_str} evaluates to {str(result).lower()}. "
            + (
                "The if branch will execute; the else branch is skipped."
                if result
                else (
                    "The else branch will execute; the if branch is skipped."
                    if stmt.get("else")
                    else "The if branch is skipped."
                )
            )
        ),
        condition=cond_str,
        condition_result=result,
    )

    branch = stmt["then"] if result else (stmt.get("else") or [])
    for s in branch:
        if em.stopped:
            return
        _exec(s, em)


def _exec_for(stmt: Dict[str, Any], em: _Emitter) -> None:
    # 1. init — emit a "loop-init" step (or use init's own kind if not a decl)
    init = stmt.get("init")
    if init is not None:
        if init["kind"] == "var_decl":
            _exec_loop_init_decl(init, em)
        elif init["kind"] == "assign":
            _exec_assign(init, em, as_kind="loop-init")
        elif init["kind"] == "unary_stmt":
            _exec_unary_stmt(init, em, as_kind="loop-init")
        else:
            _exec(init, em)

    cond_expr = stmt.get("condition")
    cond_str = _stringify(cond_expr) if cond_expr is not None else "true"

    while True:
        if em.stopped:
            return
        # 2. evaluate condition → emit a "condition" step
        result = bool(_evaluate(cond_expr, em)) if cond_expr is not None else True
        _emit_loop_condition(em, stmt["line"], cond_str, result)
        if not result:
            return

        # 3. body
        for s in stmt.get("body", []):
            if em.stopped:
                return
            _exec(s, em)

        # 4. update — emit a "loop-step"
        upd = stmt.get("update")
        if upd is not None:
            if upd["kind"] == "assign":
                _exec_assign(upd, em, as_kind="loop-step")
            elif upd["kind"] == "unary_stmt":
                _exec_unary_stmt(upd, em, as_kind="loop-step")
            else:
                _exec(upd, em)


def _exec_loop_init_decl(stmt: Dict[str, Any], em: _Emitter) -> None:
    """A var_decl in a for's init slot — emit under kind=loop-init."""
    name = stmt["name"]
    if stmt.get("value") is not None:
        value = _evaluate(stmt["value"], em)
    else:
        value = _default_for(stmt["type"])
    em.vars[name] = value
    disp = _fmt_value(value)
    em.emit(
        line=stmt["line"],
        kind="loop-init",
        label=f"Initialize {name} = {disp}",
        changes=[f"{name} initialized to {disp}"],
        explanation=(
            f"The loop counter {name} is initialized to {disp}. "
            f"The condition will be evaluated next."
        ),
    )


def _exec_while(stmt: Dict[str, Any], em: _Emitter) -> None:
    cond_expr = stmt["condition"]
    cond_str = _stringify(cond_expr)
    while True:
        if em.stopped:
            return
        result = bool(_evaluate(cond_expr, em))
        _emit_loop_condition(em, stmt["line"], cond_str, result)
        if not result:
            return
        for s in stmt.get("body", []):
            if em.stopped:
                return
            _exec(s, em)


def _emit_loop_condition(em: _Emitter, line: int, cond_str: str, result: bool) -> None:
    changes = [f"condition {cond_str} evaluated to {str(result).lower()}"]
    if not result:
        changes.append("loop exited")
    em.emit(
        line=line,
        kind="condition",
        label=f"Check {cond_str}  →  {str(result).lower()}",
        changes=changes,
        explanation=(
            f"{cond_str} is {str(result).lower()}, so the loop body "
            + ("runs again." if result else "does not run. The loop exits.")
        ),
        condition=cond_str,
        condition_result=result,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def generate(
    ast: Dict[str, Any],
    *,
    id: str,
    name: str = "",
    description: str = "",
    concept: Optional[str] = None,
    code: str = "",
) -> Dict[str, Any]:
    """Generate a full Trace from a parsed AST.

    Raises TraceGenerationError for runtime issues (undefined variable,
    division by zero, unsupported node reaching the interpreter, …).
    """
    if not ast or ast.get("kind") != "program":
        raise TraceGenerationError("input is not a valid program AST")

    em = _Emitter()
    for stmt in ast.get("statements", []):
        if em.stopped:
            break
        _exec(stmt, em)

    trace: Dict[str, Any] = {
        "id": id,
        "name": name or id,
        "description": description,
        "code": code,
        "steps": em.steps,
    }
    if concept is not None:
        trace["concept"] = concept
    return trace
