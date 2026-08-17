"""
TraceFlow AI Explanation Engine — Multi-Provider Dispatcher
===========================================================

Supports Gemini, Groq, OpenRouter, and OpenAI.

All providers are called via raw HTTP (aiohttp) for async compatibility:
  - Gemini: POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
  - OpenAI-compatible (Groq, OpenRouter, OpenAI): POST https://{base}/v1/chat/completions

Caches responses keyed on (provider, model, code, step lines hash) to avoid
re-calling the LLM for the same trace.
"""

from __future__ import annotations
import asyncio
import hashlib
import json
import logging
import os
import threading
from collections import OrderedDict
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default model per provider
# ---------------------------------------------------------------------------
DEFAULT_MODELS: Dict[str, str] = {
    "gemini": "gemini-1.5-flash",
    "groq": "openai/gpt-oss-120b",
    "openrouter": "openai/gpt-4o-mini",
    "openai": "gpt-4o-mini",
}

# OpenAI-compatible base URLs
OPENAI_BASES: Dict[str, str] = {
    "groq": "https://api.groq.com/openai",
    "openrouter": "https://openrouter.ai/api",
    "openai": "https://api.openai.com",
}

ENV_KEY_MAP: Dict[str, str] = {
    "gemini": "GEMINI_API_KEY",
    "groq": "GROQ_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "openai": "OPENAI_API_KEY",
}

# ---------------------------------------------------------------------------
# Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are a precise, non-hallucinating programming tutor explaining a step-by-step execution trace.

GROUNDING RULES (strict — never violate):
- Use ONLY facts present in the step data and code you are given. Never invent variable names, values, lines, or control flow.
- You may only reference variable names that actually appear in the step's `variables` snapshot, and only their exact values as shown.
- Never claim a value, print, condition result, or line number that is not explicitly present in the data.
- Do not guess the purpose of a statement beyond what the data shows; if a step shows no change, say so.

OUTPUT CONTRACT (strict):
- Respond with EXACTLY one JSON array of strings, one entry per step, in the same order as provided.
- Each entry is a SHORT explanation of 1-3 sentences.
- No markdown, no code fences, no bullets, no numbering, no commentary before or after the JSON.
- The JSON must parse as valid JSON. Nothing else is acceptable."""


def _build_prompt(code: str, language: str, steps: List[Dict[str, Any]]) -> str:
    """Build a single prompt that lists every step for the LLM."""
    lines = [
        f"Language: {language}",
        "",
        "```",
        code,
        "```",
        "",
        "Execution steps (step_number, line, kind, condition, condition_result, variables, output):",
    ]
    for s in steps:
        cond = f"  condition: {s.get('condition')} → {s.get('condition_result')}" if s.get("condition") else ""
        var_str = json.dumps(s.get("variables", {}))
        out_str = " | ".join(s.get("output", []))
        lines.append(
            f"  {s['step']}. line {s['line']} [{s.get('kind', 'exec')}]{cond}  vars={var_str}  output={out_str}"
        )
    return "\n".join(lines)


def _cache_key(provider: str, model: str, code: str, steps: List[Dict]) -> str:
    raw = f"{provider}:{model}:{code}:{json.dumps([s['line'] for s in steps], sort_keys=True)}"
    return hashlib.sha256(raw.encode()).hexdigest()

class _BoundedCache:
    """Thread-safe LRU dict that caps its entry count."""

    def __init__(self, maxsize: int = 256) -> None:
        self.maxsize = maxsize
        self._data: "OrderedDict[str, List[str]]" = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[List[str]]:
        with self._lock:
            val = self._data.get(key)
            if val is not None:
                self._data.move_to_end(key)
            return val

    def put(self, key: str, value: List[str]) -> None:
        with self._lock:
            if key in self._data:
                self._data.move_to_end(key)
            self._data[key] = value
            while len(self._data) > self.maxsize:
                self._data.popitem(last=False)


# In-memory LRU cache: key -> list[str] explanations. Bounded so an
# unbounded number of distinct (provider, model, code, steps) traces can't
# grow process memory without limit.
_explanation_cache = _BoundedCache(maxsize=256)

# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------


async def _call_gemini(
    session: aiohttp.ClientSession,
    model: str,
    api_key: str,
    contents: List[Dict[str, Any]],
) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": contents,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 2048},
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                text = await resp.text()
                logger.warning("Gemini HTTP %d: %s", resp.status, text)
                return None
            body = await resp.json()
            candidates = body.get("candidates", [])
            if not candidates:
                return None
            raw = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            return raw
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        logger.warning("Gemini call failed: %s", e)
        return None


async def _call_openai_compat(
    session: aiohttp.ClientSession,
    base_url: str,
    model: str,
    api_key: str,
    messages: List[Dict[str, Any]],
) -> Optional[str]:
    url = f"{base_url}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 2048,
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                text = await resp.text()
                logger.warning("OpenAI-compat HTTP %d: %s", resp.status, text)
                return None
            body = await resp.json()
            raw = body.get("choices", [{}])[0].get("message", {}).get("content", "")
            return raw
    except (aiohttp.ClientError, asyncio.TimeoutError) as e:
        logger.warning("OpenAI-compat call failed: %s", e)
        return None


def _parse_json_list(raw: str) -> Optional[List[str]]:
    """Try to extract a JSON array of strings from the LLM output."""
    raw = raw.strip()
    # Remove markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        raw = raw.rsplit("```", 1)[0]
        raw = raw.strip()
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and all(isinstance(x, str) for x in parsed):
            return parsed
    except json.JSONDecodeError:
        pass
    # Fall back to line-by-line heuristic
    lines = [l.strip().lstrip("- ").strip() for l in raw.split("\n") if l.strip()]
    if lines:
        return lines
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def explain_steps(
    code: str,
    language: str,
    steps: List[Dict[str, Any]],
    provider: str = "gemini",
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    semaphore: Optional[asyncio.Semaphore] = None,
) -> List[str]:
    """
    Generate explanations for every step in the trace.

    Returns a list of explanation strings, one per step, preserving order.
    Falls back to step.explanation (templated) if the LLM call fails or
    returns fewer explanations than steps.
    """
    model = model or DEFAULT_MODELS.get(provider, "gemini-1.5-flash")

    # Resolve API key: passed > env var
    env_var = ENV_KEY_MAP.get(provider)
    resolved_key = api_key or (os.environ.get(env_var) if env_var else None)
    if not resolved_key:
        logger.warning("No API key for provider '%s' — falling back to templated explanations", provider)
        return _fallback(steps)

    # Check cache
    ck = _cache_key(provider, model, code, steps)
    cached = _explanation_cache.get(ck)
    if cached is not None and len(cached) == len(steps):
        logger.info("Cache hit for %s/%s (%d steps)", provider, model, len(steps))
        return cached

    prompt = _build_prompt(code, language, steps)

    # Concurrency gate
    sem = semaphore or asyncio.Semaphore(5)

    # Prepare message history for Ralphloop retries
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    contents = [
        {"role": "user", "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{prompt}"}]}
    ]

    max_attempts = 3
    explanations: Optional[List[str]] = None

    async with sem:
        async with aiohttp.ClientSession() as session:
            for attempt in range(1, max_attempts + 1):
                logger.info("Explain steps (Ralphloop): Attempt %d of %d for provider=%s", attempt, max_attempts, provider)
                
                raw: Optional[str] = None
                if provider == "gemini":
                    raw = await _call_gemini(session, model, resolved_key, contents)
                elif provider in ("groq", "openrouter", "openai"):
                    base = OPENAI_BASES.get(provider)
                    if base:
                        raw = await _call_openai_compat(session, base, model, resolved_key, messages)
                else:
                    logger.warning("Unknown provider '%s'", provider)
                    break

                if raw is None:
                    logger.warning("API returned no response on attempt %d", attempt)
                    await asyncio.sleep(1)
                    continue

                parsed_list = _parse_json_list(raw)
                if parsed_list is not None and len(parsed_list) == len(steps):
                    explanations = parsed_list
                    break

                # Validation failed
                if parsed_list is None:
                    error_msg = "Failed to parse JSON. Output was not a valid JSON array of strings."
                else:
                    error_msg = f"Validation failed. Expected exactly {len(steps)} explanations, but got {len(parsed_list)}."

                logger.warning("Attempt %d validation failure: %s. Retrying...", attempt, error_msg)

                # Append bad output and retry instructions to history
                messages.append({"role": "assistant", "content": raw})
                messages.append({
                    "role": "user",
                    "content": f"Your previous response was invalid.\nError: {error_msg}\n\nPlease output EXACTLY one valid JSON array of {len(steps)} strings, preserving order. No formatting, no code fences, no extra text."
                })

                contents.append({"role": "model", "parts": [{"text": raw}]})
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"Your previous response was invalid.\nError: {error_msg}\n\nPlease output EXACTLY one valid JSON array of {len(steps)} strings, preserving order. No formatting, no code fences, no extra text."}]
                })

    if explanations is not None and len(explanations) == len(steps):
        sanitized = _sanitize_explanations(explanations, steps)
        _explanation_cache.put(ck, sanitized)
        return sanitized

    if explanations is not None:
        logger.warning(
            "Expected %d explanations, got %d after retries — padding/truncating",
            len(steps),
            len(explanations),
        )
        result = explanations[: len(steps)]
        while len(result) < len(steps):
            result.append(_fallback([steps[len(result)]])[0])
        _explanation_cache.put(ck, result)
        return result

    return _fallback(steps)


def _sanitize_explanations(
    explanations: List[str], steps: List[Dict[str, Any]]
) -> List[str]:
    """Anti-hallucination guard.

    For each step, if the LLM explanation references a variable that does not
    exist in that step's snapshot (e.g. a made-up snake_case/camelCase
    identifier), fall back to the templated explanation for that step. Keeps
    the count stable.
    """
    result: List[str] = []
    for exp, step in zip(explanations, steps):
        vars_map = step.get("state", {}).get("variables") or step.get("variables") or {}
        known = set(vars_map.keys())
        if not known:
            result.append(exp)
            continue
        import re
        mentioned = set(re.findall(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b", exp))
        # Only suspicious identifiers: code-style names (contain underscore or
        # camelCase) that are NOT actual variables in this step.
        suspicious = {
            m
            for m in mentioned
            if m not in known and ("_" in m or re.search(r"[a-z][A-Z]", m))
        }
        if suspicious:
            logger.info(
                "Explanation references unknown variable-like identifiers %s — falling back to template",
                sorted(suspicious),
            )
            result.append(step.get("explanation", ""))
        else:
            result.append(exp)
    return result


def _fallback(steps: List[Dict[str, Any]]) -> List[str]:
    """Return the templated explanations baked into each step."""
    return [s.get("explanation", "") for s in steps]
