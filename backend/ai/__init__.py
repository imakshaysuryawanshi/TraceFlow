"""
AI Explanation Service — Phase 9 (NOT IMPLEMENTED)
===================================================

Placeholder module. Will call an LLM (Emergent LLM key + Claude/GPT) to
generate a <=3 sentence explanation for each Step.

Contract (Phase 9 will implement):
    explain(step: Step, prev_step: Optional[Step]) -> str
Frontend contract: writes result into `Step.explanation` — no other fields
change, so no frontend changes are required.
"""

# TODO(phase-9): call LLM. Cache by (step_hash, prev_step_hash) to save cost.
