from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
import os
import json
import logging
from pathlib import Path
from typing import Optional

from parser import parse as parse_source, ParserError
from trace_generator import generate as generate_trace, TraceGenerationError


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection (kept for future phases; not used in Phase 1-4)
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

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


@api_router.get("/traces/{trace_id}")
async def get_trace(trace_id: str):
    """Return a full trace (code + steps) by id."""
    data = _load_traces()
    for t in data["samples"]:
        if t["id"] == trace_id:
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


@api_router.post("/parse")
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


@api_router.post("/execute")
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
    return trace


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
