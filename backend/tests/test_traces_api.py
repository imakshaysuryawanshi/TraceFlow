"""Backend API tests for TraceFlow /api/traces endpoints (Phase 1-4)."""
import os
from pathlib import Path
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend/.env directly for the runner. Resolve the
    # path relative to this file so it works on any OS (not just /app).
    env_path = Path(__file__).resolve().parent.parent.parent / "frontend" / ".env"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break

API = f"{BASE_URL}/api"
EXPECTED_IDS = {
    "for-loop-sum",
    "if-else-grade",
    "while-countdown",
    "nested-loops-table",
    "max-scan",
    "flag-toggle",
    "string-accum",
    "array-sum",
}


# --- Root/health --------------------------------------------------------------
class TestRoot:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# --- List endpoint ------------------------------------------------------------
class TestListTraces:
    def test_list_returns_all_samples(self):
        r = requests.get(f"{API}/traces", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == len(EXPECTED_IDS)
        ids = {t["id"] for t in data}
        assert ids == EXPECTED_IDS

    def test_list_shape_fields(self):
        r = requests.get(f"{API}/traces", timeout=15)
        assert r.status_code == 200
        for t in r.json():
            assert set(t.keys()) >= {"id", "name", "description"}
            assert isinstance(t["id"], str)
            assert isinstance(t["name"], str)
            assert isinstance(t["description"], str)
            # List endpoint should be summary only — no code/steps
            assert "steps" not in t
            assert "code" not in t


# --- Get by id ----------------------------------------------------------------
class TestGetTrace:
    @pytest.mark.parametrize("trace_id", sorted(EXPECTED_IDS))
    def test_get_trace_by_id(self, trace_id):
        r = requests.get(f"{API}/traces/{trace_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["id"] == trace_id
        assert isinstance(data.get("code"), str) and len(data["code"]) > 0
        assert isinstance(data.get("steps"), list) and len(data["steps"]) > 0
        # Validate step schema:
        REQUIRED = ("step", "line", "code", "type", "state", "changes", "control", "reasoning")
        for idx, s in enumerate(data["steps"]):
            for key in REQUIRED:
                assert key in s, f"Missing '{key}' on step[{idx}] of {trace_id}"
            assert isinstance(s["step"], int)
            assert isinstance(s["line"], int)
            assert isinstance(s["state"], dict)
            assert isinstance(s["state"]["variables"], dict)
            assert isinstance(s["changes"], list)
            for c in s["changes"]:
                assert isinstance(c, dict)
                assert "var" in c
                assert "type" in c

    def test_for_loop_sum_final_output_and_changes(self):
        r = requests.get(f"{API}/traces/for-loop-sum", timeout=15)
        assert r.status_code == 200
        data = r.json()
        steps = data["steps"]
        assert len(steps) == 13
        assert steps[-1]["output"] == ["6"]
        step4 = steps[3]
        assert step4["step"] == 4
        sum_changes = [c for c in step4["changes"] if c["var"] == "sum"]
        assert len(sum_changes) > 0
        assert sum_changes[0]["new"] == 1

    def test_if_else_grade_three_steps(self):
        r = requests.get(f"{API}/traces/if-else-grade", timeout=15)
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert len(steps) == 3
        assert steps[2]["output"] == ["Pass"]

    def test_while_countdown_last_step_and_output(self):
        r = requests.get(f"{API}/traces/while-countdown", timeout=15)
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert len(steps) == 11
        last = steps[-1]
        assert last["step"] == 11
        assert last.get("control", {}).get("result") is False
        assert steps[2]["output"] == ["3"]

    def test_get_trace_404_for_missing_id(self):
        r = requests.get(f"{API}/traces/missing-id", timeout=15)
        assert r.status_code == 404
        body = r.json()
        assert "detail" in body


# --- CORS ---------------------------------------------------------------------
class TestCORS:
    def test_cors_headers_present(self):
        r = requests.options(
            f"{API}/traces",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "GET",
            },
            timeout=15,
        )
        # Some ingress return 200/204 for preflight
        assert r.status_code in (200, 204)
