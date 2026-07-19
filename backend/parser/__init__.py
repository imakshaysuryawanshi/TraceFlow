"""TraceFlow Java parser — Phase 5.

Public exports:
    parse(source: str) -> dict
    ParserError
"""

from .parser import parse, ParserError

__all__ = ["parse", "ParserError"]
