"""Shared exception classes for the parser dispatcher and backends."""


class ParserError(Exception):
    """Raised for syntax errors or unsupported constructs. Shared across
    all language backends so callers can catch a single type regardless
    of source language."""

    def __init__(self, message: str, line=None):
        self.message = message
        self.line = line
        super().__init__(f"line {line}: {message}" if line is not None else message)
