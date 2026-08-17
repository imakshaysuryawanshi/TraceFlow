from fastapi import FastAPI, APIRouter, Depends, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import os
import json
import logging
from pathlib import Path
from typing import Optional
import ast

from parser import parse as parse_source, ParserError
from trace_generator import generate as generate_trace, TraceGenerationError
from ai.explanation import explain_steps
from ratelimit import rate_limit_execute, rate_limit_parse


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')


# CORS origins allowed to call the backend. NEVER default to "*" — that is a
# security hole (any origin can read responses). The default below covers the
# local dev frontend; production must set CORS_ORIGINS to the exact origin(s),
# e.g. "https://traceflow.example.com".
_DEFAULT_CORS_ORIGINS = "http://localhost:3080,http://127.0.0.1:3080"
_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _DEFAULT_CORS_ORIGINS).split(",")
    if o.strip()
]



app = FastAPI(title="TraceFlow API")
api_router = APIRouter(prefix="/api")


# Load mock trace samples from JSON so it matches the future execution engine
# response format exactly. The parser/trace-generator (Phase 5+) will produce
# the same schema.
TRACES_PATH = ROOT_DIR / "mock_traces.json"


def _load_traces():
    with open(TRACES_PATH, "r") as f:
        return json.load(f)


@api_router.get("/")
async def root():
    return {"service": "TraceFlow", "status": "ok"}


@api_router.get("/traces")
async def list_traces():
    """Return the list of available sample traces (id, name, description)."""
    data = _load_traces()
    return [
        {
            "id": t["id"],
            "name": t["name"],
            "description": t["description"],
        }
        for t in data["samples"]
    ]


def _map_legacy_step(s: dict) -> dict:
    if "state" in s and "reasoning" in s:
        return s
    
    legacy_changes = s.get("changes", [])
    structured_changes = []
    for c in legacy_changes:
        if isinstance(c, str):
            if "initialized to" in c:
                parts = c.split("initialized to")
                var = parts[0].strip()
                try:
                    val = ast.literal_eval(parts[1].strip())
                except:
                    val = parts[1].strip()
                structured_changes.append({"var": var, "old": None, "new": val, "type": "init"})
            elif "changed from" in c:
                parts = c.split("changed from")
                var = parts[0].strip()
                # Split on the *spaced* separator so a value containing the word
                # "to" (e.g. "toString") doesn't truncate the value. limit=1
                # keeps the remainder (old → new) intact.
                subparts = parts[1].split(" to ", 1)
                try:
                    old_val = ast.literal_eval(subparts[0].strip())
                    new_val = ast.literal_eval(subparts[1].strip())
                except:
                    old_val = subparts[0].strip()
                    new_val = subparts[1].strip() if len(subparts) > 1 else ""
                structured_changes.append({"var": var, "old": old_val, "new": new_val, "type": "update"})
            elif " incremented from " in c or " decremented from " in c:
                import re as _re
                m = _re.match(r"^(\w+) (incremented|decremented) from (.*?) to (.*)$", c)
                if m:
                    var = m.group(1)
                    try:
                        old_val = ast.literal_eval(m.group(3))
                        new_val = ast.literal_eval(m.group(4))
                    except:
                        old_val = m.group(3).strip()
                        new_val = m.group(4).strip()
                    structured_changes.append({"var": var, "old": old_val, "new": new_val, "type": "update"})
                else:
                    structured_changes.append({"var": "unknown", "old": None, "new": c, "type": "note"})
            elif c.startswith("printed "):
                structured_changes.append({"var": "output", "old": None, "new": c, "type": "print"})
            else:
                structured_changes.append({"var": "unknown", "old": None, "new": c, "type": "note"})
        elif isinstance(c, dict):
            structured_changes.append(c)
    
    explanation = s.get("explanation", "")
    why_executed = "Sequential execution"
    condition = s.get("condition")
    condition_result = s.get("condition_result")
    if condition:
        why_executed = "Condition evaluated as " + ("true" if condition_result else "false")

    mapped = {
        "step": s.get("step", 1),
        "line": s.get("line", 1),
        "code": s.get("label", "").split("→")[0].strip() or "/* code */",
        "type": s.get("kind", "declare"),
        "state": {
            "variables": s.get("variables", {}),
            "memory": {},
            "call_stack": []
        },
        "changes": structured_changes,
        "control": {
            "block": "main",
            # Static mock traces carry no per-iteration info; the frontend
            # derives iteration counts from the condition steps instead.
            "iteration": None,
            "condition": condition,
            "result": condition_result
        },
        "reasoning": {
            "explanation": explanation,
            "why_executed": why_executed,
            "next_expected": "next statement"
        },
        "warnings": [],
        "variables": s.get("variables", {}),
        "output": s.get("output", []),
        "explanation": explanation,
        "kind": s.get("kind", "declare"),
        "label": s.get("label", ""),
    }
    if condition is not None:
        mapped["condition"] = condition
        mapped["condition_result"] = condition_result
    return mapped


@api_router.get("/traces/{trace_id}")
async def get_trace(trace_id: str):
    """Return a full trace (code + steps) by id."""
    data = _load_traces()
    for t in data["samples"]:
        if t["id"] == trace_id:
            # Map steps to final unified schema dynamically
            t["steps"] = [_map_legacy_step(s) for s in t.get("steps", [])]
            
            # Enrich static mock trace with dynamic patterns
            from trace_generator.pattern_detector import detect_patterns
            patterns_data = detect_patterns(t["steps"])
            t["patterns"] = patterns_data.get("patterns", [])
            t["signals"] = patterns_data.get("signals", [])
            
            # Form unified schema wrappers on mock traces too
            import datetime
            initial_params = {}
            if t["steps"]:
                initial_params = t["steps"][0].get("state", {}).get("variables", {})
            t["meta"] = {
                "language": t.get("language", "java"),
                "execution_id": trace_id,
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "total_steps": len(t["steps"])
            }
            t["input"] = {
                "params": initial_params,
                "stdin": None
            }
            t["trace"] = t["steps"]
            t["summary"] = {
                "final_state": t["steps"][-1].get("state", {}).get("variables", {}) if t["steps"] else {},
                "complexity": {
                    "time": "O(n)" if "Nested Loops" not in [p.get("name") for p in t["patterns"]] else "O(n^2)",
                    "space": "O(1)"
                }
            }
            return t
    raise HTTPException(status_code=404, detail=f"Trace '{trace_id}' not found")


# ---------------------------------------------------------------------------
# Phase 5 — Java parser diagnostic endpoint.
# Phase 6 (trace generator) will consume the same AST directly in-process,
# but exposing it via HTTP lets the frontend Trace Inspector show the parsed
# AST and lets us iterate on the parser via curl.
# ---------------------------------------------------------------------------

class ParseRequest(BaseModel):
    code: str = Field(..., description="Source code to parse")
    language: str = Field(default="java", description="java | python | javascript")


@api_router.post("/parse", dependencies=[Depends(rate_limit_parse)])
async def parse_endpoint(req: ParseRequest):
    """Parse the given source into TraceFlow's simplified AST."""
    try:
        ast = parse_source(req.code, language=req.language)
    except ParserError as e:
        raise HTTPException(
            status_code=400,
            detail={"message": e.message, "line": e.line},
        )
    return {"ok": True, "ast": ast, "language": req.language}


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="Source code to execute")
    language: str = Field(default="java", description="java | python | javascript")
    id: str = Field(default="user-code", description="Trace id (returned as-is)")
    name: str = Field(default="Custom code")
    description: str = Field(default="")
    concept: Optional[str] = Field(default=None)
    ai_provider: Optional[str] = Field(default=None, description="gemini | groq | openrouter | openai")
    ai_model: Optional[str] = Field(default=None, description="Model override for the AI provider")
    ai_api_key: Optional[str] = Field(default=None, description="User-supplied API key for the AI provider")


@api_router.post("/execute", dependencies=[Depends(rate_limit_execute)])
async def execute_endpoint(req: ExecuteRequest):
    """Parse + generate a trace for the given source. Returns a Trace."""
    try:
        ast = parse_source(req.code, language=req.language)
    except ParserError as e:
        raise HTTPException(
            status_code=400,
            detail={"stage": "parse", "message": e.message, "line": e.line},
        )
    try:
        trace = generate_trace(
            ast,
            id=req.id,
            name=req.name,
            description=req.description,
            concept=req.concept,
            code=req.code,
            language=req.language,
        )
    except TraceGenerationError as e:
        raise HTTPException(
            status_code=400,
            detail={"stage": "execute", "message": e.message, "line": e.line},
        )

    # Phase 9 — AI explanation enrichment. Non-blocking: if it fails or
    # no provider is configured, the templated explanations are kept.
    if req.ai_provider:
        try:
            explanations = await explain_steps(
                code=req.code,
                language=req.language,
                steps=trace.get("steps", []),
                provider=req.ai_provider,
                model=req.ai_model,
                api_key=req.ai_api_key,
            )
            if explanations and len(explanations) == len(trace.get("steps", [])):
                for i, exp in enumerate(explanations):
                    trace["steps"][i]["explanation"] = exp
        except Exception as e:
            logger.warning("AI explanation failed (non-blocking): %s", e)

    return trace


class InsightRequest(BaseModel):
    intent: str = Field(..., description="explain_logic | explain_step | why_change | find_bugs | explain_complexity | challenge_me")
    context: dict = Field(..., description="Context parameters: code, language, current_step, prev_step, output, question")
    ai_provider: Optional[str] = Field(default=None, description="gemini | groq | openrouter | openai")
    ai_model: Optional[str] = Field(default=None, description="Model override for the AI provider")
    ai_api_key: Optional[str] = Field(default=None, description="User-supplied API key for the AI provider")


@api_router.post("/insight", dependencies=[Depends(rate_limit_execute)])
async def insight_endpoint(req: InsightRequest):
    """Call the TraceFlow Insight engine and return a normalized JSON response."""
    from ai.insight import ask_insight
    response = await ask_insight(
        intent=req.intent,
        context=req.context,
        provider=req.ai_provider,
        model=req.ai_model,
        api_key=req.ai_api_key,
    )
    return response


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    # No cookies/sessions are used anywhere — the frontend talks to the API via
    # JSON + bearer-free requests, so credentials are never needed. Keeping this
    # False also means a misconfigured `CORS_ORIGINS=*` can never silently
    # accept credentialed cross-origin requests (which browsers reject anyway).
    allow_credentials=False,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)



