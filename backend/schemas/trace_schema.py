"""
TraceFlow Trace Schema — v1.0 (FROZEN)
=======================================

This is the single canonical schema used across every phase:
- Phase 4 (current): mock traces served from mock_traces.json.
- Phase 5:           Java parser output MUST conform to this schema.
- Phase 6:           Execution trace generator MUST produce Step objects
                     matching this shape.
- Phase 7-8:         Frontend variable & output UI consume `variables`,
                     `output`, `changes` fields directly — no adapter needed.
- Phase 9:           LLM explanation writes to `explanation` field only;
                     rest of the object is unchanged.

Rule of thumb: DO NOT add required fields here without bumping schema_version
and updating the frontend consumer components (VariableCard, ExecutionPanel,
OutputConsole, AIExplanation).

Optional fields (`kind`, `label`, `condition`, `condition_result`) are UI
hints; the frontend degrades gracefully when they are absent.
"""

from __future__ import annotations
from typing import Any, Dict, List, Optional, Literal
from pydantic import BaseModel, Field


SCHEMA_VERSION: str = "1.0"


class Step(BaseModel):
    """One frame in the execution trace. Order in trace.steps == chronological."""

    step: int = Field(..., ge=1, description="1-indexed monotonically increasing step number")
    line: int = Field(..., ge=1, description="1-indexed source line currently executing")
    variables: Dict[str, Any] = Field(
        default_factory=dict,
        description="Full snapshot of variable name -> value AFTER this step",
    )
    output: List[str] = Field(
        default_factory=list,
        description="Full print buffer as a list of strings AFTER this step",
    )
    changes: List[str] = Field(
        default_factory=list,
        description="Human-readable list of what changed on this step (e.g. 'sum changed from 0 to 1')",
    )
    explanation: str = Field(
        default="",
        description="Short (<=3 sentence) explanation. Mocked in Phase 4, LLM-generated in Phase 9",
    )

    # ----- optional UI hints (safe to omit) -----
    kind: Optional[
        Literal[
            "declare", "assign", "condition", "loop-init", "loop-step", "print", "call", "return"
        ]
    ] = None
    label: Optional[str] = Field(default=None, description="Short mono label shown in UI")
    condition: Optional[str] = None
    condition_result: Optional[bool] = None


class Trace(BaseModel):
    """A full program trace."""

    id: str
    name: str
    description: str = ""
    concept: Optional[str] = None
    code: str
    steps: List[Step]


class TraceCatalogEntry(BaseModel):
    id: str
    name: str
    description: str = ""
