"""
TraceFlow Trace Engine Test Suite
=================================

Every supported construct has a canonical program + an EXPLICIT expected
trace snapshot. Parser + trace generator must round-trip through these
before any UI integration.

Supported constructs (per approved MVP scope):
    - Variable assignment (declaration, re-assign, compound, unary)
    - If / Else
    - For loop
    - While loop
    - Print

Assertion strategy:
    We compare every required schema field EXACTLY (`step`, `line`, `kind`,
    `variables`, `output`, `changes`, and `condition`/`condition_result`
    where applicable). `explanation` is templated in Phase 4-6 and will be
    replaced by an LLM in Phase 9, so we only assert it is non-empty.

Run:
    pytest /app/backend/tests/test_trace_engine.py -v
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional

import pytest

from parser import parse
from trace_generator import generate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run(code: str) -> List[Dict[str, Any]]:
    """Parse + generate. Returns the list of Step dicts."""
    ast = parse(code)
    return generate(ast, id="test", name="test", code=code)["steps"]


def _assert_trace_equals(code: str, expected: List[Dict[str, Any]]) -> None:
    """Assert the generated trace matches `expected` step-for-step.

    Every field in each expected step is compared exactly, EXCEPT
    `explanation` which is only checked for non-empty presence (it is
    templated in Phase 4-6 and will be regenerated in Phase 9).
    """
    actual = _run(code)
    assert len(actual) == len(expected), (
        f"step count mismatch: expected {len(expected)}, got {len(actual)}"
    )
    for i, (got, want) in enumerate(zip(actual, expected)):
        ctx = f"step {i + 1}"
        # 1-indexed step number
        assert got["step"] == i + 1, f"{ctx}: step should be {i + 1}, got {got['step']}"
        # every field the expected snapshot declares must match exactly
        for key, want_val in want.items():
            assert got[key] == want_val, (
                f"{ctx}: field '{key}' mismatch\n"
                f"  expected: {want_val!r}\n"
                f"  actual  : {got[key]!r}"
            )
        # explanation is required to be present and non-empty
        assert got.get("explanation"), f"{ctx}: explanation missing/empty"


# ===========================================================================
# 1. Variable assignment
# ===========================================================================


class TestVariableAssignment:
    def test_simple_declaration(self):
        code = "int x = 5;"
        _assert_trace_equals(code, [
            {
                "line": 1,
                "kind": "declare",
                "variables": {"x": 5},
                "output": [],
                "changes": ["x initialized to 5"],
            },
        ])

    def test_declaration_without_initializer(self):
        code = "int x;"
        _assert_trace_equals(code, [
            {
                "line": 1,
                "kind": "declare",
                "variables": {"x": 0},
                "output": [],
                "changes": ["x initialized to 0"],
            },
        ])

    def test_reassignment(self):
        code = "int x = 1;\nx = 9;"
        _assert_trace_equals(code, [
            {
                "line": 1, "kind": "declare",
                "variables": {"x": 1}, "output": [], "changes": ["x initialized to 1"],
            },
            {
                "line": 2, "kind": "assign",
                "variables": {"x": 9}, "output": [], "changes": ["x changed from 1 to 9"],
            },
        ])

    def test_compound_add_assign(self):
        code = "int x = 10;\nx += 5;"
        _assert_trace_equals(code, [
            {
                "line": 1, "kind": "declare",
                "variables": {"x": 10}, "output": [], "changes": ["x initialized to 10"],
            },
            {
                "line": 2, "kind": "assign",
                "variables": {"x": 15}, "output": [], "changes": ["x changed from 10 to 15"],
            },
        ])

    def test_compound_chain(self):
        code = "int x = 10;\nx += 5;\nx *= 2;\nx /= 3;\nx -= 1;"
        # x: 10 -> 15 -> 30 -> 10 (int div) -> 9
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 10}, "output": [],
             "changes": ["x initialized to 10"]},
            {"line": 2, "kind": "assign", "variables": {"x": 15}, "output": [],
             "changes": ["x changed from 10 to 15"]},
            {"line": 3, "kind": "assign", "variables": {"x": 30}, "output": [],
             "changes": ["x changed from 15 to 30"]},
            {"line": 4, "kind": "assign", "variables": {"x": 10}, "output": [],
             "changes": ["x changed from 30 to 10"]},
            {"line": 5, "kind": "assign", "variables": {"x": 9}, "output": [],
             "changes": ["x changed from 10 to 9"]},  # 10 - 1 = 9
        ])

    def test_postfix_increment_as_statement(self):
        code = "int i = 0;\ni++;"
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"i": 0}, "output": [],
             "changes": ["i initialized to 0"]},
            # standalone i++ is body-level, so phrased as a normal change (not a loop-step)
            {"line": 2, "kind": "assign", "variables": {"i": 1}, "output": [],
             "changes": ["i changed from 0 to 1"]},
        ])

    def test_postfix_decrement_as_statement(self):
        code = "int n = 3;\nn--;"
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"n": 3}, "output": [],
             "changes": ["n initialized to 3"]},
            {"line": 2, "kind": "assign", "variables": {"n": 2}, "output": [],
             "changes": ["n changed from 3 to 2"]},
        ])

    def test_boolean_variable(self):
        code = "boolean b = true;\nb = false;"
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"b": True}, "output": [],
             "changes": ["b initialized to true"]},
            {"line": 2, "kind": "assign", "variables": {"b": False}, "output": [],
             "changes": ["b changed from true to false"]},
        ])

    def test_string_variable(self):
        code = 'String s = "hi";'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"s": "hi"}, "output": [],
             "changes": ["s initialized to hi"]},
        ])


# ===========================================================================
# 2. If / Else
# ===========================================================================


class TestIfElse:
    def test_if_true_branch_taken(self):
        code = (
            'int x = 10;\n'
            'if (x > 5) {\n'
            '  System.out.println("big");\n'
            '} else {\n'
            '  System.out.println("small");\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 10}, "output": [],
             "changes": ["x initialized to 10"]},
            {"line": 2, "kind": "condition", "variables": {"x": 10}, "output": [],
             "condition": "x > 5", "condition_result": True,
             "changes": ["condition x > 5 evaluated to true", "took if branch"]},
            {"line": 3, "kind": "print", "variables": {"x": 10}, "output": ["big"],
             "changes": ['printed "big"']},
        ])

    def test_if_false_else_branch_taken(self):
        code = (
            'int x = 1;\n'
            'if (x > 5) {\n'
            '  System.out.println("big");\n'
            '} else {\n'
            '  System.out.println("small");\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 1}, "output": [],
             "changes": ["x initialized to 1"]},
            {"line": 2, "kind": "condition", "variables": {"x": 1}, "output": [],
             "condition": "x > 5", "condition_result": False,
             "changes": ["condition x > 5 evaluated to false", "took else branch"]},
            {"line": 5, "kind": "print", "variables": {"x": 1}, "output": ["small"],
             "changes": ['printed "small"']},
        ])

    def test_if_without_else_when_false_does_nothing(self):
        code = (
            'int x = 1;\n'
            'if (x > 5) {\n'
            '  System.out.println("big");\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 1}, "output": [],
             "changes": ["x initialized to 1"]},
            {"line": 2, "kind": "condition", "variables": {"x": 1}, "output": [],
             "condition": "x > 5", "condition_result": False,
             "changes": ["condition x > 5 evaluated to false", "took else branch"]},
        ])

    def test_equality_condition(self):
        code = (
            'int x = 3;\n'
            'if (x == 3) {\n'
            '  System.out.println("match");\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 3}, "output": [],
             "changes": ["x initialized to 3"]},
            {"line": 2, "kind": "condition", "variables": {"x": 3}, "output": [],
             "condition": "x == 3", "condition_result": True,
             "changes": ["condition x == 3 evaluated to true", "took if branch"]},
            {"line": 3, "kind": "print", "variables": {"x": 3}, "output": ["match"],
             "changes": ['printed "match"']},
        ])


# ===========================================================================
# 3. For loop
# ===========================================================================


class TestForLoop:
    def test_sum_1_to_3(self):
        """The canonical demo — every step and value verified explicitly."""
        code = (
            'int sum = 0;\n'
            'for (int i = 1; i <= 3; i++) {\n'
            '  sum += i;\n'
            '}\n'
            'System.out.println(sum);'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"sum": 0}, "output": [],
             "changes": ["sum initialized to 0"]},
            {"line": 2, "kind": "loop-init", "variables": {"sum": 0, "i": 1}, "output": [],
             "changes": ["i initialized to 1"]},
            {"line": 2, "kind": "condition", "variables": {"sum": 0, "i": 1}, "output": [],
             "condition": "i <= 3", "condition_result": True,
             "changes": ["condition i <= 3 evaluated to true"]},
            {"line": 3, "kind": "assign", "variables": {"sum": 1, "i": 1}, "output": [],
             "changes": ["sum changed from 0 to 1"]},
            {"line": 2, "kind": "loop-step", "variables": {"sum": 1, "i": 2}, "output": [],
             "changes": ["i incremented from 1 to 2"]},
            {"line": 2, "kind": "condition", "variables": {"sum": 1, "i": 2}, "output": [],
             "condition": "i <= 3", "condition_result": True,
             "changes": ["condition i <= 3 evaluated to true"]},
            {"line": 3, "kind": "assign", "variables": {"sum": 3, "i": 2}, "output": [],
             "changes": ["sum changed from 1 to 3"]},
            {"line": 2, "kind": "loop-step", "variables": {"sum": 3, "i": 3}, "output": [],
             "changes": ["i incremented from 2 to 3"]},
            {"line": 2, "kind": "condition", "variables": {"sum": 3, "i": 3}, "output": [],
             "condition": "i <= 3", "condition_result": True,
             "changes": ["condition i <= 3 evaluated to true"]},
            {"line": 3, "kind": "assign", "variables": {"sum": 6, "i": 3}, "output": [],
             "changes": ["sum changed from 3 to 6"]},
            {"line": 2, "kind": "loop-step", "variables": {"sum": 6, "i": 4}, "output": [],
             "changes": ["i incremented from 3 to 4"]},
            {"line": 2, "kind": "condition", "variables": {"sum": 6, "i": 4}, "output": [],
             "condition": "i <= 3", "condition_result": False,
             "changes": ["condition i <= 3 evaluated to false", "loop exited"]},
            {"line": 5, "kind": "print", "variables": {"sum": 6, "i": 4}, "output": ["6"],
             "changes": ['printed "6"']},
        ])

    def test_zero_iterations_when_condition_starts_false(self):
        code = 'for (int i = 5; i < 3; i++) { System.out.println(i); }'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "loop-init", "variables": {"i": 5}, "output": [],
             "changes": ["i initialized to 5"]},
            {"line": 1, "kind": "condition", "variables": {"i": 5}, "output": [],
             "condition": "i < 3", "condition_result": False,
             "changes": ["condition i < 3 evaluated to false", "loop exited"]},
        ])

    def test_single_iteration(self):
        code = 'for (int i = 0; i < 1; i++) { System.out.println(i); }'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "loop-init", "variables": {"i": 0}, "output": [],
             "changes": ["i initialized to 0"]},
            {"line": 1, "kind": "condition", "variables": {"i": 0}, "output": [],
             "condition": "i < 1", "condition_result": True,
             "changes": ["condition i < 1 evaluated to true"]},
            {"line": 1, "kind": "print", "variables": {"i": 0}, "output": ["0"],
             "changes": ['printed "0"']},
            {"line": 1, "kind": "loop-step", "variables": {"i": 1}, "output": ["0"],
             "changes": ["i incremented from 0 to 1"]},
            {"line": 1, "kind": "condition", "variables": {"i": 1}, "output": ["0"],
             "condition": "i < 1", "condition_result": False,
             "changes": ["condition i < 1 evaluated to false", "loop exited"]},
        ])


# ===========================================================================
# 4. While loop
# ===========================================================================


class TestWhileLoop:
    def test_countdown(self):
        code = (
            'int n = 3;\n'
            'while (n > 0) {\n'
            '  System.out.println(n);\n'
            '  n--;\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"n": 3}, "output": [],
             "changes": ["n initialized to 3"]},
            {"line": 2, "kind": "condition", "variables": {"n": 3}, "output": [],
             "condition": "n > 0", "condition_result": True,
             "changes": ["condition n > 0 evaluated to true"]},
            {"line": 3, "kind": "print", "variables": {"n": 3}, "output": ["3"],
             "changes": ['printed "3"']},
            {"line": 4, "kind": "assign", "variables": {"n": 2}, "output": ["3"],
             "changes": ["n changed from 3 to 2"]},
            {"line": 2, "kind": "condition", "variables": {"n": 2}, "output": ["3"],
             "condition": "n > 0", "condition_result": True,
             "changes": ["condition n > 0 evaluated to true"]},
            {"line": 3, "kind": "print", "variables": {"n": 2}, "output": ["3", "2"],
             "changes": ['printed "2"']},
            {"line": 4, "kind": "assign", "variables": {"n": 1}, "output": ["3", "2"],
             "changes": ["n changed from 2 to 1"]},
            {"line": 2, "kind": "condition", "variables": {"n": 1}, "output": ["3", "2"],
             "condition": "n > 0", "condition_result": True,
             "changes": ["condition n > 0 evaluated to true"]},
            {"line": 3, "kind": "print", "variables": {"n": 1}, "output": ["3", "2", "1"],
             "changes": ['printed "1"']},
            {"line": 4, "kind": "assign", "variables": {"n": 0}, "output": ["3", "2", "1"],
             "changes": ["n changed from 1 to 0"]},
            {"line": 2, "kind": "condition", "variables": {"n": 0}, "output": ["3", "2", "1"],
             "condition": "n > 0", "condition_result": False,
             "changes": ["condition n > 0 evaluated to false", "loop exited"]},
        ])

    def test_zero_iterations_when_condition_starts_false(self):
        code = (
            'int n = 0;\n'
            'while (n > 0) {\n'
            '  System.out.println(n);\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"n": 0}, "output": [],
             "changes": ["n initialized to 0"]},
            {"line": 2, "kind": "condition", "variables": {"n": 0}, "output": [],
             "condition": "n > 0", "condition_result": False,
             "changes": ["condition n > 0 evaluated to false", "loop exited"]},
        ])

    def test_single_iteration(self):
        code = (
            'int n = 1;\n'
            'while (n > 0) {\n'
            '  n--;\n'
            '}'
        )
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"n": 1}, "output": [],
             "changes": ["n initialized to 1"]},
            {"line": 2, "kind": "condition", "variables": {"n": 1}, "output": [],
             "condition": "n > 0", "condition_result": True,
             "changes": ["condition n > 0 evaluated to true"]},
            {"line": 3, "kind": "assign", "variables": {"n": 0}, "output": [],
             "changes": ["n changed from 1 to 0"]},
            {"line": 2, "kind": "condition", "variables": {"n": 0}, "output": [],
             "condition": "n > 0", "condition_result": False,
             "changes": ["condition n > 0 evaluated to false", "loop exited"]},
        ])


# ===========================================================================
# 5. Print
# ===========================================================================


class TestPrint:
    def test_string_literal(self):
        code = 'System.out.println("hello");'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "print", "variables": {}, "output": ["hello"],
             "changes": ['printed "hello"']},
        ])

    def test_integer_literal(self):
        code = 'System.out.println(42);'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "print", "variables": {}, "output": ["42"],
             "changes": ['printed "42"']},
        ])

    def test_boolean_literal(self):
        code = 'System.out.println(true);'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "print", "variables": {}, "output": ["true"],
             "changes": ['printed "true"']},
        ])

    def test_variable(self):
        code = 'int x = 7;\nSystem.out.println(x);'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"x": 7}, "output": [],
             "changes": ["x initialized to 7"]},
            {"line": 2, "kind": "print", "variables": {"x": 7}, "output": ["7"],
             "changes": ['printed "7"']},
        ])

    def test_expression(self):
        code = 'int a = 2;\nint b = 3;\nSystem.out.println(a * b);'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "declare", "variables": {"a": 2}, "output": [],
             "changes": ["a initialized to 2"]},
            {"line": 2, "kind": "declare", "variables": {"a": 2, "b": 3}, "output": [],
             "changes": ["b initialized to 3"]},
            {"line": 3, "kind": "print", "variables": {"a": 2, "b": 3}, "output": ["6"],
             "changes": ['printed "6"']},
        ])

    def test_multiple_prints_append_to_output(self):
        code = 'System.out.println("a");\nSystem.out.println("b");\nSystem.out.println("c");'
        _assert_trace_equals(code, [
            {"line": 1, "kind": "print", "variables": {}, "output": ["a"],
             "changes": ['printed "a"']},
            {"line": 2, "kind": "print", "variables": {}, "output": ["a", "b"],
             "changes": ['printed "b"']},
            {"line": 3, "kind": "print", "variables": {}, "output": ["a", "b", "c"],
             "changes": ['printed "c"']},
        ])
