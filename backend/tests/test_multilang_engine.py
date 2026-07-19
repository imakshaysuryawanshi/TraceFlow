"""Python & JavaScript trace engine tests.

Same assertion strategy as test_trace_engine.py — hardcoded expected traces
per construct. Focused subset (5-6 cases per language) since Java's suite
already covers the schema exhaustively and all three backends emit the
exact same AST/Trace shape.
"""

import pytest
from parser import parse
from trace_generator import generate


def _run(code: str, language: str):
    ast = parse(code, language=language)
    return generate(ast, id="t", name="t", code=code, language=language)["steps"]


def _match(actual, expected):
    assert len(actual) == len(expected), f"step count: {len(actual)} vs {len(expected)}"
    for i, (got, want) in enumerate(zip(actual, expected)):
        for k, v in want.items():
            assert got[k] == v, f"step {i + 1} '{k}': {got[k]!r} != {v!r}"


# ===========================================================================
# Python
# ===========================================================================


class TestPython:
    def test_variable_assignment(self):
        _match(_run("x = 5\nx = x + 1", "python"), [
            {"line": 1, "kind": "declare", "variables": {"x": 5}, "output": [],
             "changes": ["x initialized to 5"]},
            {"line": 2, "kind": "assign", "variables": {"x": 6}, "output": [],
             "changes": ["x changed from 5 to 6"]},
        ])

    def test_compound_assignment(self):
        _match(_run("x = 10\nx += 5\nx *= 2", "python"), [
            {"line": 1, "kind": "declare", "variables": {"x": 10}, "output": [],
             "changes": ["x initialized to 10"]},
            {"line": 2, "kind": "assign", "variables": {"x": 15}, "output": [],
             "changes": ["x changed from 10 to 15"]},
            {"line": 3, "kind": "assign", "variables": {"x": 30}, "output": [],
             "changes": ["x changed from 15 to 30"]},
        ])

    def test_if_elif_else(self):
        code = "x = 5\nif x > 10:\n    print('big')\nelif x > 3:\n    print('mid')\nelse:\n    print('small')"
        steps = _run(code, "python")
        # declare, if(false), elif(true) via nested-if, print("mid")
        assert steps[-1]["output"] == ["mid"]
        assert any(s["kind"] == "print" for s in steps)

    def test_for_range(self):
        steps = _run("total = 0\nfor i in range(3):\n    total += i", "python")
        # After the loop: total = 0+1+2 = 3, i final = 3 (loop exit)
        assert steps[-1]["variables"] == {"total": 3, "i": 3}
        # First body-execution assign
        body_assigns = [s for s in steps if s["kind"] == "assign" and s.get("line") == 3]
        assert len(body_assigns) == 3

    def test_while_countdown(self):
        steps = _run("n = 3\nwhile n > 0:\n    print(n)\n    n -= 1", "python")
        assert steps[-1]["output"] == ["3", "2", "1"]
        assert steps[-1]["variables"] == {"n": 0}
        assert steps[-1]["condition_result"] is False

    def test_print_string_and_int(self):
        steps = _run("print('hi')\nprint(42)", "python")
        assert steps[0]["output"] == ["hi"]
        assert steps[1]["output"] == ["hi", "42"]

    def test_python_float_division(self):
        """Python `/` is float, not int-truncate like Java."""
        steps = _run("a = 7 / 2\nprint(a)", "python")
        assert steps[-1]["output"] == ["3.5"]

    def test_python_floor_division(self):
        steps = _run("a = 7 // 2\nprint(a)", "python")
        assert steps[-1]["output"] == ["3"]

    @pytest.mark.parametrize("code,fragment", [
        ("xs = [1, 2, 3]", "list"),
        ("def foo():\n    return 1", "function"),
        ("import os", "import"),
        ("class Foo:\n    pass", "class"),
        ("with open('x'): pass", "with"),
        ("try:\n    x = 1\nexcept:\n    x = 2", "try"),
    ])
    def test_python_rejections(self, code, fragment):
        from parser import ParserError
        with pytest.raises(ParserError):
            parse(code, "python")


# ===========================================================================
# JavaScript
# ===========================================================================


class TestJavaScript:
    def test_variable_and_reassign(self):
        _match(_run("let x = 5;\nx = 9;", "javascript"), [
            {"line": 1, "kind": "declare", "variables": {"x": 5}, "output": [],
             "changes": ["x initialized to 5"]},
            {"line": 2, "kind": "assign", "variables": {"x": 9}, "output": [],
             "changes": ["x changed from 5 to 9"]},
        ])

    def test_for_loop_sum(self):
        steps = _run(
            "let sum = 0;\nfor (let i = 1; i <= 3; i++) { sum += i; }\nconsole.log(sum);",
            "javascript",
        )
        assert steps[-1]["output"] == ["6"]
        assert steps[-1]["variables"] == {"sum": 6, "i": 4}
        assert steps[-1]["kind"] == "print"

    def test_while_countdown(self):
        steps = _run(
            "let n = 3;\nwhile (n > 0) { console.log(n); n--; }",
            "javascript",
        )
        assert steps[-1]["output"] == ["3", "2", "1"]
        assert steps[-1]["variables"] == {"n": 0}

    def test_if_else(self):
        code = 'let x = 5;\nif (x > 10) { console.log("big"); } else { console.log("small"); }'
        steps = _run(code, "javascript")
        assert steps[-1]["output"] == ["small"]

    def test_triple_equals_normalizes_to_double(self):
        steps = _run(
            'let x = 3;\nif (x === 3) { console.log("yes"); }',
            "javascript",
        )
        cond = next(s for s in steps if s["kind"] == "condition")
        assert cond["condition"] == "x == 3"
        assert cond["condition_result"] is True

    def test_const_reassignment_rejected(self):
        from parser import ParserError
        with pytest.raises(ParserError, match="const"):
            parse("const x = 1;\nx = 2;", "javascript")

    def test_js_float_division(self):
        """JavaScript has no integer type — `/` is always float."""
        steps = _run("let a = 7 / 2;\nconsole.log(a);", "javascript")
        assert steps[-1]["output"] == ["3.5"]

    @pytest.mark.parametrize("code,fragment", [
        ("let xs = [1,2,3];", "array"),
        ("function foo() { return 1; }", "function"),
        ("class Foo {}", "class"),
        ("import x from 'y';", "import"),
        ("for (let x of [1]) {}", "for-of"),
        ("switch (1) { case 1: break; }", "switch"),
        ("try { let x = 1; } catch (e) {}", "try"),
    ])
    def test_js_rejections(self, code, fragment):
        from parser import ParserError
        with pytest.raises(ParserError):
            parse(code, "javascript")
