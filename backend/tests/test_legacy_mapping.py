"""Unit tests for `server._map_legacy_step` (mock-trace → unified schema)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import _map_legacy_step


def _step(changes, kind="print", **overrides):
    s = {
        "step": 2,
        "line": 3,
        "kind": kind,
        "label": "the label",
        "variables": {"x": 1},
        "output": [],
        "explanation": "why",
        "changes": changes,
    }
    s.update(overrides)
    return s


def test_incremented_from_maps_to_structured_update():
    mapped = _map_legacy_step(_step(["i incremented from 1 to 2"], kind="loop-step"))
    assert mapped["changes"] == [
        {"var": "i", "old": 1, "new": 2, "type": "update"}
    ]


def test_decremented_from_maps_to_structured_update():
    mapped = _map_legacy_step(_step(["n decremented from 3 to 2"], kind="loop-step"))
    assert mapped["changes"] == [
        {"var": "n", "old": 3, "new": 2, "type": "update"}
    ]


def test_changed_from_split_handles_to_in_values():
    """'changed from A to B' must split on the *spaced* separator so values
    containing the word 'to' (e.g. 'toString') aren't truncated."""
    mapped = _map_legacy_step(
        _step(["s changed from 'toString' to 'toValue'"], kind="assign")
    )
    assert mapped["changes"] == [
        {"var": "s", "old": "toString", "new": "toValue", "type": "update"}
    ]


def test_printed_maps_to_print_note():
    mapped = _map_legacy_step(_step(['printed "6"']))
    assert mapped["changes"] == [
        {"var": "output", "old": None, "new": 'printed "6"', "type": "print"}
    ]


def test_condition_note_maps_to_verbatim_note():
    mapped = _map_legacy_step(
        _step(["condition i <= 3 evaluated to true"], kind="condition")
    )
    assert mapped["changes"][0] == {
        "var": "unknown",
        "old": None,
        "new": "condition i <= 3 evaluated to true",
        "type": "note",
    }


def test_mock_condition_steps_have_null_iteration():
    """Static mock traces carry no iteration info; the frontend derives it."""
    mapped = _map_legacy_step(
        _step(["condition i <= 3 evaluated to true"], kind="condition")
    )
    assert mapped["control"]["iteration"] is None
