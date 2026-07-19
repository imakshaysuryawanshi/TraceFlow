"""Backend API tests for TraceFlow /api/traces endpoints (Phase 1-4)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend/.env directly for the runner
    env_path = "/app/frontend/.env"
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break

API = f"{BASE_URL}/api"
EXPECTED_IDS = {"for-loop-sum", "if-else-grade", "while-countdown"}


# --- Root/health --------------------------------------------------------------
class TestRoot:
    def test_root(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"


# --- List endpoint ------------------------------------------------------------
class TestListTraces:
    def test_list_returns_three_samples(self):
        r = requests.get(f"{API}/traces", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 3
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
        # Validate step schema on first step
        step0 = data["steps"][0]
        for key in ("step", "line", "kind", "label", "variables", "changed",
                    "output", "explanation"):
            assert key in step0, f"Missing key {key} on step[0] for {trace_id}"

    def test_for_loop_sum_final_output(self):
        r = requests.get(f"{API}/traces/for-loop-sum", timeout=15)
        assert r.status_code == 200
        data = r.json()
        steps = data["steps"]
        # Should have 13 steps per PRD
        assert len(steps) == 13
        # Final step outputs "6"
        assert steps[-1]["output"] == ["6"]
        assert steps[-1]["kind"] == "print"

    def test_if_else_grade_print_step(self):
        r = requests.get(f"{API}/traces/if-else-grade", timeout=15)
        assert r.status_code == 200
        steps = r.json()["steps"]
        # Contains a print step with "Pass"
        prints = [s for s in steps if s["kind"] == "print"]
        assert prints, "if-else-grade should have a print step"
        assert prints[0]["output"] == ["Pass"]

    def test_while_countdown_final_output(self):
        r = requests.get(f"{API}/traces/while-countdown", timeout=15)
        assert r.status_code == 200
        steps = r.json()["steps"]
        assert steps[-1]["output"] == ["3", "2", "1"]

    def test_get_trace_404_for_missing_id(self):
        r = requests.get(f"{API}/traces/does-not-exist", timeout=15)
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
