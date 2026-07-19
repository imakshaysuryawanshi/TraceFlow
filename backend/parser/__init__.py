"""TraceFlow parser dispatcher.

Public exports:
    parse(source: str, language: str = "java") -> dict   # simplified AST
    ParserError

Language modules each provide a `parse(source: str) -> dict` function
that returns TraceFlow's simplified AST. All backends emit the SAME AST
shape so the trace generator, tests, and frontend never learn about the
source language.
"""

from typing import Callable, Dict

from .errors import ParserError
from .java import parse as parse_java

# Python and JavaScript backends are added in phases 10 and 11.
_BACKENDS: Dict[str, Callable[[str], Dict]] = {"java": parse_java}

try:
    from .python import parse as parse_python  # noqa: F401
    _BACKENDS["python"] = parse_python
except ImportError:  # pragma: no cover — python backend is added in P10
    pass

try:
    from .javascript import parse as parse_javascript  # noqa: F401
    _BACKENDS["javascript"] = parse_javascript
except ImportError:  # pragma: no cover — js backend is added in P11
    pass


def parse(source: str, language: str = "java") -> dict:
    """Parse `source` for the given `language`. Defaults to Java."""
    lang = (language or "java").lower()
    if lang not in _BACKENDS:
        raise ParserError(f"language '{language}' is not supported")
    return _BACKENDS[lang](source)


def supported_languages() -> list:
    return sorted(_BACKENDS.keys())


__all__ = ["parse", "ParserError", "supported_languages"]
