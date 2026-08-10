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
from typing import Any, Dict, List, Optional
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
    def __init__(self, *, integer_division: bool = True) -> None:
        self.vars: Dict[str, Any] = {}
        self._prev_vars: Dict[str, Any] = {}
        self.output: List[str] = []
        self.steps: List[Dict[str, Any]] = []
        self._step_num: int = 1
        self.stopped: bool = False
        self.integer_division: bool = integer_division
        self.loop_depth: int = 0

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
        block: str = "main",
        iteration: Optional[int] = None,
    ) -> None:
        # Calculate structured variable changes
        changes_list = []
        for k, v in self.vars.items():
            if k not in self._prev_vars:
                changes_list.append({
                    "var": k,
                    "old": None,
                    "new": copy.deepcopy(v),
                    "type": "init"
                })
            elif self._prev_vars[k] != v:
                changes_list.append({
                    "var": k,
                    "old": copy.deepcopy(self._prev_vars[k]),
                    "new": copy.deepcopy(v),
                    "type": "update"
                })
        for k in self._prev_vars:
            if k not in self.vars:
                changes_list.append({
                    "var": k,
                    "old": copy.deepcopy(self._prev_vars[k]),
                    "new": None,
                    "type": "delete"
                })
        self._prev_vars = copy.deepcopy(self.vars)

        why_executed = "Sequential execution"
        if condition is not None:
            why_executed = "Condition evaluated as " + ("true" if condition_result else "false")

        step: Dict[str, Any] = {
            "step": self._step_num,
            "line": line,
            "code": label.split("→")[0].strip(),
            "type": kind,
            "state": {
                "variables": copy.deepcopy(self.vars),
                "memory": {},
                "call_stack": []
            },
            "changes": changes_list,
            "control": {
                "block": block,
                "iteration": iteration,
                "condition": condition,
                "result": condition_result,
                "loop_depth": self.loop_depth,
            },
            "reasoning": {
                "explanation": explanation,
                "why_executed": why_executed,
                "next_expected": "loop check" if kind in ("loop-init", "loop-step") else "next statement"
            },
            "warnings": [],
            # Legacy fields for backwards compatibility
            "variables": copy.deepcopy(self.vars),
            "output": list(self.output),
            "explanation": explanation,
            "kind": kind,
            "label": label,
            "_changes_legacy": changes,
        }
        if condition is not None:
            step["condition"] = condition
            step["condition_result"] = condition_result

        self.steps.append(step)
        self._step_num += 1

        if self._step_num > MAX_STEPS:
            self.emit_cap(line)

    def emit_cap(self, line: int) -> None:
        self.stopped = True
        self.steps.append(
            {
                "step": self._step_num,
                "line": line,
                "code": "/* execution capped */",
                "type": "declare",
                "state": {
                    "variables": copy.deepcopy(self.vars),
                    "memory": {},
                    "call_stack": []
                },
                "changes": [],
                "control": {
                    "block": "main",
                    "iteration": None,
                    "condition": None,
                    "result": None
                },
                "reasoning": {
                    "explanation": f"TraceFlow stopped after {MAX_STEPS} steps to prevent a runaway loop.",
                    "why_executed": "Execution cap exceeded",
                    "next_expected": "Exit program"
                },
                "warnings": ["execution stopped to prevent infinite loop"],
                # Legacy fields
                "variables": copy.deepcopy(self.vars),
                "output": list(self.output),
                "explanation": f"TraceFlow stopped after {MAX_STEPS} steps.",
                "kind": "declare",
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
        return _apply_binary(expr["op"], left, right, expr.get("line"), em)

    if kind == "unary":
        return _evaluate_unary_pure(expr, em)

    if kind == "assign_expr":
        name = expr["name"]
        rhs = _evaluate(expr["value"], em)
        new_val = _combine(expr["op"], em.vars.get(name), rhs, expr.get("line"), em)
        em.vars[name] = new_val
        return new_val

    if kind == "index":
        target = _evaluate(expr["target"], em)
        idx = _evaluate(expr["index"], em)
        if not isinstance(target, list):
            raise TraceGenerationError(
                f"cannot index a non-list value", expr.get("line")
            )
        if not isinstance(idx, int) or idx < 0 or idx >= len(target):
            raise TraceGenerationError(
                f"index {idx} out of bounds for a list of length {len(target)}",
                expr.get("line"),
            )
        return target[idx]

    if kind == "array_literal":
        return [_evaluate(e, em) for e in expr.get("elements", [])]

    if kind == "array_alloc":
        length = _evaluate(expr["length"], em)
        if not isinstance(length, int) or length < 0:
            raise TraceGenerationError(
                f"array length must be a non-negative integer, got {length!r}",
                expr.get("line"),
            )
        elem_default = _default_for(expr.get("elem_type", "int"))
        return [elem_default for _ in range(length)]

    if kind == "length":
        target = _evaluate(expr["target"], em)
        if not isinstance(target, list):
            raise TraceGenerationError("length access requires a list", expr.get("line"))
        return len(target)

    raise TraceGenerationError(f"unsupported expression kind: {kind}", expr.get("line"))


def _evaluate_unary_pure(expr: Dict[str, Any], em: _Emitter) -> Any:
    """Evaluate a unary that appears in expression position (i.e., not a
    lone `i++;` statement — that path is handled by _exec_unary_stmt).
    Side-effects on variables still apply."""
    op = expr["op"]
    operand = expr["operand"]
    if op in ("++", "--"):
        if operand["kind"] == "index":
            arr, idx = _resolve_index(operand, em)
            old = arr[idx]
            new = old + 1 if op == "++" else old - 1
            arr[idx] = new
            return old if expr.get("postfix") else new
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


def _apply_binary(op: str, a: Any, b: Any, line: Optional[int], em: _Emitter) -> Any:
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        if b == 0:
            raise TraceGenerationError("division by zero", line)
        # Java: int/int → int truncate toward zero. Python & JS: plain float.
        if em.integer_division and isinstance(a, int) and isinstance(b, int):
            q = abs(a) // abs(b)
            return q if (a < 0) == (b < 0) else -q
        return a / b
    if op == "//":
        # Floor division — always integer for int operands (Python semantics)
        if b == 0:
            raise TraceGenerationError("floor division by zero", line)
        # Python's // rounds toward negative infinity for negative operands
        return a // b if isinstance(a, int) and isinstance(b, int) else float(a) // float(b)
    if op == "%":
        if b == 0:
            raise TraceGenerationError("modulo by zero", line)
        if em.integer_division and isinstance(a, int) and isinstance(b, int):
            # Java-style remainder (sign follows dividend)
            r = abs(a) % abs(b)
            return r if a >= 0 else -r
        return a % b
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


def _combine(op: str, old: Any, rhs: Any, line: Optional[int], em: _Emitter) -> Any:
    """Apply a compound-assignment operator: =, +=, -=, *=, /=, //=, %=."""
    if op == "=":
        return rhs
    if op == "+=":
        return _apply_binary("+", old, rhs, line, em)
    if op == "-=":
        return _apply_binary("-", old, rhs, line, em)
    if op == "*=":
        return _apply_binary("*", old, rhs, line, em)
    if op == "/=":
        return _apply_binary("/", old, rhs, line, em)
    if op == "//=":
        return _apply_binary("//", old, rhs, line, em)
    if op == "%=":
        return _apply_binary("%", old, rhs, line, em)
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
    if k == "index":
        return f"{_stringify(expr['target'])}[{_stringify(expr['index'])}]"
    if k == "array_literal":
        return "[" + ", ".join(_stringify(e) for e in expr.get("elements", [])) + "]"
    if k == "array_alloc":
        return f"new {expr.get('elem_type', 'int')}[{_stringify(expr['length'])}]"
    if k == "length":
        return f"{_stringify(expr['target'])}.length"
    return "?"


def _fmt_value(v: Any) -> str:
    """Format a runtime value the way Java's default `println` would."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, list):
        return "[" + ", ".join(_fmt_value(x) for x in v) + "]"
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
    elif kind == "assign_index":
        _exec_assign_index(stmt, em, as_kind="assign")
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
    if type_.endswith("[]"):
        return []
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
    new = _combine(stmt["op"], old, rhs, stmt.get("line"), em)
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


def _resolve_index(expr: Dict[str, Any], em: _Emitter):
    """Evaluate an `index` expression and return (target_value, idx)."""
    target = _evaluate(expr["target"], em)
    idx = _evaluate(expr["index"], em)
    if not isinstance(target, list):
        raise TraceGenerationError(
            "cannot index a non-list value", expr.get("line")
        )
    if not isinstance(idx, int) or idx < 0 or idx >= len(target):
        raise TraceGenerationError(
            f"index {idx} out of bounds for a list of length {len(target)}",
            expr.get("line"),
        )
    return target, idx


def _exec_assign_index(stmt: Dict[str, Any], em: _Emitter, *, as_kind: str) -> None:
    target_expr = stmt["target"]
    if target_expr["kind"] != "index":
        raise TraceGenerationError(
            "assign_index target must be an index expression", stmt.get("line")
        )
    arr, idx = _resolve_index(target_expr, em)
    old = arr[idx]
    rhs = _evaluate(stmt["value"], em)
    new = _combine(stmt["op"], old, rhs, stmt.get("line"), em)
    arr[idx] = new

    op = stmt["op"]
    rhs_str = _stringify(stmt["value"])
    disp_old = _fmt_value(old)
    disp_new = _fmt_value(new)
    target_str = _stringify(target_expr)
    label = f"{target_str} {op} {rhs_str}  →  {target_str} = {disp_new}"
    em.emit(
        line=stmt["line"],
        kind=as_kind,
        label=label,
        changes=[f"{target_str} changed from {disp_old} to {disp_new}"],
        explanation=(
            f"{target_str} {op} {rhs_str} updates the element at that index. "
            f"It changes from {disp_old} to {disp_new}."
        ),
    )


def _exec_unary_index(stmt: Dict[str, Any], em: _Emitter, *, as_kind: str) -> None:
    """Handle `arr[i]++` / `arr[i]--` as a statement."""
    op = stmt["op"]
    if op not in ("++", "--"):
        raise TraceGenerationError(f"unsupported unary operator '{op}'", stmt.get("line"))
    arr, idx = _resolve_index(stmt["operand"], em)
    old = arr[idx]
    new = old + 1 if op == "++" else old - 1
    arr[idx] = new

    disp_old = _fmt_value(old)
    disp_new = _fmt_value(new)
    target_str = _stringify(stmt["operand"])
    verb = "incremented" if op == "++" else "decremented"
    label = f"{target_str}{op}  →  {target_str} = {disp_new}"
    if as_kind == "loop-step":
        change = f"{target_str} {verb} from {disp_old} to {disp_new}"
        expl = f"The element at that index is {verb} to {disp_new}. The condition will be re-checked."
    else:
        change = f"{target_str} changed from {disp_old} to {disp_new}"
        expl = f"The element at that index is {verb} to {disp_new}."
    em.emit(
        line=stmt["line"],
        kind=as_kind,
        label=label,
        changes=[change],
        explanation=expl,
    )


def _exec_unary_stmt(stmt: Dict[str, Any], em: _Emitter, *, as_kind: str) -> None:
    op = stmt["op"]
    operand = stmt["operand"]
    if operand["kind"] == "index":
        _exec_unary_index(stmt, em, as_kind=as_kind)
        return
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

    import re
    words = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', cond_str)
    var_parts = []
    for w in words:
        if w in em.vars:
            val_disp = str(em.vars[w]).lower() if isinstance(em.vars[w], bool) else str(em.vars[w])
            var_parts.append(f"{w} = {val_disp}")
    reason_str = f" ({', '.join(var_parts)})" if var_parts else ""

    em.emit(
        line=stmt["line"],
        kind="condition",
        label=f"Check {cond_str}  →  {str(result).lower()}",
        changes=[f"condition {cond_str} evaluated to {str(result).lower()}", branch_label],
        explanation=(
            f"The condition '{cond_str}' evaluates to {str(result).lower()}{reason_str}. "
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

        # 3. body — executes one nesting level deeper
        em.loop_depth += 1
        try:
            for s in stmt.get("body", []):
                if em.stopped:
                    return
                _exec(s, em)
        finally:
            em.loop_depth -= 1

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
        em.loop_depth += 1
        try:
            for s in stmt.get("body", []):
                if em.stopped:
                    return
                _exec(s, em)
        finally:
            em.loop_depth -= 1


def _emit_loop_condition(em: _Emitter, line: int, cond_str: str, result: bool) -> None:
    changes = [f"condition {cond_str} evaluated to {str(result).lower()}"]
    if not result:
        changes.append("loop exited")

    import re
    words = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', cond_str)
    var_parts = []
    for w in words:
        if w in em.vars:
            val_disp = str(em.vars[w]).lower() if isinstance(em.vars[w], bool) else str(em.vars[w])
            var_parts.append(f"{w} = {val_disp}")
    reason_str = f" ({', '.join(var_parts)})" if var_parts else ""

    em.emit(
        line=line,
        kind="condition",
        label=f"Check {cond_str}  →  {str(result).lower()}",
        changes=changes,
        explanation=(
            f"The loop condition '{cond_str}' evaluates to {str(result).lower()}{reason_str}, "
            + ("so we enter the loop body." if result else "so the loop exits.")
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
    language: str = "java",
) -> Dict[str, Any]:
    """Generate a full Trace from a parsed AST.

    The `language` argument only affects arithmetic semantics (Java uses
    integer division for `int / int`; Python and JavaScript use float
    division). The emitted Trace shape is identical across languages.
    """
    if not ast or ast.get("kind") != "program":
        raise TraceGenerationError("input is not a valid program AST")

    em = _Emitter(integer_division=(language.lower() == "java"))
    for stmt in ast.get("statements", []):
        if em.stopped:
            break
        _exec(stmt, em)

    # Run pattern detection
    from .pattern_detector import detect_patterns
    patterns_data = detect_patterns(em.steps)
    patterns = patterns_data.get("patterns", [])
    signals = patterns_data.get("signals", [])

    # Extract initial inputs from the first step variables
    initial_params = {}
    if em.steps:
        initial_params = em.steps[0].get("state", {}).get("variables", {})

    import datetime
    trace: Dict[str, Any] = {
        # Legacy/Compatibility Root Fields
        "id": id,
        "name": name or id,
        "description": description,
        "code": code,
        "language": language,
        "steps": em.steps,
        "patterns": patterns,
        "signals": signals,
        
        # Proposed Unified Schema Nodes
        "meta": {
            "language": language,
            "execution_id": id,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "total_steps": len(em.steps)
        },
        "input": {
            "params": initial_params,
            "stdin": None
        },
        "trace": em.steps,
        "summary": {
            "final_state": em.vars,
            "complexity": {
                "time": "O(n)" if "Nested Loops" not in [p.get("name") for p in patterns] else "O(n^2)",
                "space": "O(1)"
            }
        }
    }
    if concept is not None:
        trace["concept"] = concept

    return trace
