"""TraceFlow execution trace generator — Phase 6.

Public exports:
    generate(ast: dict, *, id: str, ...) -> dict  # a Trace
    TraceGenerationError
"""

from .generator import generate, TraceGenerationError, MAX_STEPS

__all__ = ["generate", "TraceGenerationError", "MAX_STEPS"]
