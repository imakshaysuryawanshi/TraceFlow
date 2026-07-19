"""Phase 6 trace generator tests — /app/backend/tests/test_trace_generator.py

Verifies that generated traces:
  1. Conform to the frozen v1.0 schema on every step.
  2. Match the canonical mock traces step-for-step for the 3 samples.
  3. Handle edge cases (division by zero, undefined var, runaway loop, if/else).
"""

import json
from pathlib import Path

import pytest

from parser import parse
from trace_generator import generate, TraceGenerationError, MAX_STEPS


REQUIRED_FIELDS = ["step", "line", "variables", "output", "changes", "explanation"]
MOCK_TRACES = json.loads((Path(__file__).parent.parent / "mock_traces.json").read_text())


def _gen(code: str, sid: str = "test", concept: str = None) -> dict:
    ast = parse(code)
    return generate(ast, id=sid, name=sid, concept=concept, code=code)


def _assert_schema(trace: dict) -> None:
    assert isinstance(trace["id"], str)
    assert isinstance(trace["code"], str)
    assert isinstance(trace["steps"], list)
    for i, s in enumerate(trace["steps"]):
        for k in REQUIRED_FIELDS:
            assert k in s, f"step {i + 1} missing '{k}'"
        assert isinstance(s["variables"], dict)
        assert isinstance(s["output"], list)
        assert isinstance(s["changes"], list)
        assert all(isinstance(x, str) for x in s["changes"])
        assert isinstance(s["explanation"], str)


# ---------------------------------------------------------------------------
# 1. Every generated trace conforms to the frozen schema
# ---------------------------------------------------------------------------

def test_schema_conformance_across_samples():
    for sample in MOCK_TRACES["samples"]:
        tr = _gen(sample["code"], sid=sample["id"], concept=sample["concept"])
        _assert_schema(tr)


# ---------------------------------------------------------------------------
# 2. Trace parity with the canonical mock traces — step count, lines,
#    variable snapshots, output progression, kinds, condition/result.
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("sample_id", [s["id"] for s in MOCK_TRACES["samples"]])
def test_matches_mock_trace(sample_id):
    mock = next(s for s in MOCK_TRACES["samples"] if s["id"] == sample_id)
    tr = _gen(mock["code"], sid=mock["id"], concept=mock["concept"])

    assert len(tr["steps"]) == len(mock["steps"]), (
        f"{sample_id}: expected {len(mock['steps'])} steps, got {len(tr['steps'])}"
    )
    for i, (got, want) in enumerate(zip(tr["steps"], mock["steps"])):
        ctx = f"{sample_id} step {i + 1}"
        assert got["step"] == want["step"], ctx
        assert got["line"] == want["line"], ctx
        assert got["kind"] == want["kind"], ctx
        assert got["variables"] == want["variables"], f"{ctx}: vars mismatch"
        assert got["output"] == want["output"], f"{ctx}: output mismatch"
        # `changes` phrasing must be identical to keep frontend UX consistent
        assert got["changes"] == want["changes"], (
            f"{ctx}: changes mismatch\n  got : {got['changes']}\n  want: {want['changes']}"
        )
        if "condition" in want:
            assert got.get("condition") == want["condition"], ctx
            assert got.get("condition_result") == want["condition_result"], ctx
        # Explanations differ (templated vs curated), so we only assert non-empty
        assert got["explanation"], f"{ctx}: explanation empty"


# ---------------------------------------------------------------------------
# 3. Edge cases
# ---------------------------------------------------------------------------


def test_if_false_takes_else_branch():
    src = 'int x = 5;\nif (x > 10) {\n  System.out.println("big");\n} else {\n  System.out.println("small");\n}'
    tr = _gen(src)
    assert tr["steps"][-1]["output"] == ["small"]
    cond = tr["steps"][1]
    assert cond["condition_result"] is False
    assert "took else branch" in cond["changes"]


def test_if_without_else_when_false():
    src = 'int x = 1;\nif (x > 10) {\n  System.out.println("hi");\n}'
    tr = _gen(src)
    # 2 steps: declare + condition-false. Body should NOT execute.
    assert [s["kind"] for s in tr["steps"]] == ["declare", "condition"]
    assert tr["steps"][-1]["output"] == []


def test_compound_assignment_operators():
    src = "int x = 10;\nx += 5;\nx *= 2;\nx /= 3;\nx -= 1;\nSystem.out.println(x);"
    tr = _gen(src)
    assert tr["steps"][-1]["output"] == ["9"]  # ((10+5)*2)/3 -1 = 30/3 -1 = 9


def test_boolean_condition_and_print():
    src = "boolean flag = true;\nif (flag) { System.out.println(flag); }"
    tr = _gen(src)
    assert tr["steps"][-1]["output"] == ["true"]


def test_string_println():
    src = 'System.out.println("hello world");'
    tr = _gen(src)
    assert tr["steps"][0]["output"] == ["hello world"]
    assert tr["steps"][0]["kind"] == "print"


def test_undefined_variable_error():
    with pytest.raises(TraceGenerationError, match="not defined"):
        _gen("System.out.println(missing);")


def test_division_by_zero_error():
    with pytest.raises(TraceGenerationError, match="division by zero"):
        _gen("int a = 1; int b = 0; int c = a / b;")


def test_max_steps_cap_prevents_runaway_loops():
    """A guaranteed-infinite loop must terminate with a cap step, not hang."""
    src = "int i = 0;\nwhile (i >= 0) { i++; }"
    tr = _gen(src)
    # Cap step is appended AFTER MAX_STEPS regular emissions
    assert len(tr["steps"]) == MAX_STEPS + 1
    last = tr["steps"][-1]
    assert "capped" in last["label"] or "capped" in last["explanation"] or (
        any("stopped" in c for c in last["changes"])
    )


def test_nested_for_inside_while():
    src = """\
int total = 0;
int i = 0;
while (i < 2) {
  for (int j = 0; j < 2; j++) {
    total += 1;
  }
  i++;
}
System.out.println(total);
"""
    tr = _gen(src)
    assert tr["steps"][-1]["output"] == ["4"]
    # Java scopes `j` to the for-loop, but the mock schema and our generator
    # keep loop-declared vars visible after exit (matching the canonical for-loop-sum
    # trace which keeps `i` at 4 after the loop). Assert the full snapshot.
    assert tr["steps"][-1]["variables"] == {"total": 4, "i": 2, "j": 2}


def test_java_integer_division_truncates_toward_zero():
    tr = _gen("int a = 7 / 2;\nSystem.out.println(a);")
    assert tr["steps"][-1]["output"] == ["3"]
    tr2 = _gen("int a = -7 / 2;\nSystem.out.println(a);")
    assert tr2["steps"][-1]["output"] == ["-3"]


def test_variables_snapshot_is_independent_per_step():
    """Mutating vars later must not retroactively change earlier snapshots."""
    tr = _gen("int x = 1; x = 2; x = 3;")
    assert tr["steps"][0]["variables"] == {"x": 1}
    assert tr["steps"][1]["variables"] == {"x": 2}
    assert tr["steps"][2]["variables"] == {"x": 3}


def test_output_snapshot_grows_monotonically():
    src = 'System.out.println("a");\nSystem.out.println("b");\nSystem.out.println("c");'
    tr = _gen(src)
    assert tr["steps"][0]["output"] == ["a"]
    assert tr["steps"][1]["output"] == ["a", "b"]
    assert tr["steps"][2]["output"] == ["a", "b", "c"]
