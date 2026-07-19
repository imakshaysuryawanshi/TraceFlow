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
from typing import Any, Dict, List, Optional

import aiohttp

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Default model per provider
# ---------------------------------------------------------------------------
DEFAULT_MODELS: Dict[str, str] = {
    "gemini": "gemini-1.5-flash",
    "groq": "llama3-8b-8192",
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

SYSTEM_PROMPT = """You are a programming tutor helping a beginner understand a step-by-step execution trace.

The user wrote the code below. For each execution step, provide a SHORT explanation (1-3 sentences) that:
- States what just happened in plain language
- References the specific variable values involved
- Connects to the overall program flow

Respond with a JSON array of strings, one per step, in order. No markdown, no extra text."""


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

# In-memory cache: key -> list[str] explanations
_explanation_cache: Dict[str, List[str]] = {}

# ---------------------------------------------------------------------------
# Provider implementations
# ---------------------------------------------------------------------------


async def _call_gemini(
    session: aiohttp.ClientSession,
    model: str,
    api_key: str,
    prompt: str,
) -> Optional[List[str]]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
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
            return _parse_json_list(raw)
    except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError) as e:
        logger.warning("Gemini call failed: %s", e)
        return None


async def _call_openai_compat(
    session: aiohttp.ClientSession,
    base_url: str,
    model: str,
    api_key: str,
    prompt: str,
) -> Optional[List[str]]:
    url = f"{base_url}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
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
            return _parse_json_list(raw)
    except (aiohttp.ClientError, asyncio.TimeoutError, json.JSONDecodeError) as e:
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

    explanations: Optional[List[str]] = None
    async with sem:
        async with aiohttp.ClientSession() as session:
            if provider == "gemini":
                explanations = await _call_gemini(session, model, resolved_key, prompt)
            elif provider in ("groq", "openrouter", "openai"):
                base = OPENAI_BASES.get(provider)
                if base:
                    explanations = await _call_openai_compat(session, base, model, resolved_key, prompt)
            else:
                logger.warning("Unknown provider '%s'", provider)

    if explanations is not None and len(explanations) == len(steps):
        _explanation_cache[ck] = explanations
        return explanations

    if explanations is not None:
        logger.warning(
            "Expected %d explanations, got %d — padding/truncating",
            len(steps),
            len(explanations),
        )
        # Pad or truncate to match step count
        result = explanations[: len(steps)]
        while len(result) < len(steps):
            result.append(_fallback([steps[len(result)]])[0])
        _explanation_cache[ck] = result
        return result

    return _fallback(steps)


def _fallback(steps: List[Dict[str, Any]]) -> List[str]:
    """Return the templated explanations baked into each step."""
    return [s.get("explanation", "") for s in steps]
