import json
import logging
import os
import aiohttp
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Default model per provider (similar to explanation.py)
DEFAULT_MODELS: Dict[str, str] = {
    "gemini": "gemini-1.5-flash",
    "groq": "llama3-8b-8192",
    "openrouter": "google/gemini-flash-1.5",
    "openai": "gpt-4o-mini",
}

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

SYSTEM_PROMPT = """You are a precise, non-hallucinating programming mentor named "TraceFlow Insight".
Your goal is to help beginners understand code execution and debug logic mistakes.

TRUTH & AUTHORITY RULES (strict — never violate):
- TraceFlow owns execution truth. Treat all supplied trace data, variable states, outputs, and loop counts as authoritative.
- Never invent variables, values, outputs, iterations, or execution outcomes.
- If the supplied context does not contain enough data to answer, state: "I cannot determine this reliably from the available trace."
- Never claim a variable changed to a value that is not explicitly present in the variables state dictionary.

OUTPUT CONTRACT (strict):
- You MUST respond with EXACTLY one valid JSON object conforming to the schema below.
- Do not wrap the JSON in markdown code blocks (no ```json). Output raw, unadorned JSON.
- If you cannot process the request, return a JSON with status="error".

RESPONSE JSON SCHEMA:
{
  "status": "success" | "error",
  "intent": "string",
  "title": "string",
  "summary": "string",
  "explanation": ["bullet points explaining logic steps"],
  "evidence": {
    "variables": { "varName": { "before": "value", "after": "value" } },
    "line": 0
  },
  "followUp": {
    "type": "question" | "concept" | "none",
    "text": "string"
  }
}
"""

def _build_insight_prompt(intent: str, context: Dict[str, Any]) -> str:
    """Build intent-specific context prompts to minimize token usage."""
    code = context.get("code", "")
    language = context.get("language", "java")
    current_step = context.get("current_step", {})
    prev_step = context.get("prev_step", {})
    output_so_far = context.get("output", [])
    user_question = context.get("question", "")
    user_role = context.get("user_role", "student_fresher")

    lines = [
        f"Intent: {intent}",
        f"Language: {language}",
        f"Target Audience Level: {user_role} (student_fresher = basic learning / experienced_pro = software engineer interview)",
        "Source Code:",
        "```",
        code,
        "```",
        ""
    ]

    # Add current step context
    if current_step:
        lines.append(f"Active Step #: {current_step.get('step', 1)}")
        lines.append(f"Active Line: {current_step.get('line', 1)}")
        lines.append(f"Active Code Statement: {current_step.get('code', '')}")
        lines.append(f"Active Kind: {current_step.get('kind', 'exec')}")
        if current_step.get("condition"):
            lines.append(f"Condition: {current_step.get('condition')} -> {current_step.get('condition_result')}")
        
        curr_vars = current_step.get("state", {}).get("variables", {}) or current_step.get("variables", {})
        prev_vars = prev_step.get("state", {}).get("variables", {}) or prev_step.get("variables", {}) if prev_step else {}
        lines.append(f"Current Variables: {json.dumps(curr_vars)}")
        lines.append(f"Previous Variables: {json.dumps(prev_vars)}")
        lines.append(f"Output So Far: {json.dumps(output_so_far)}")

    if user_question:
        lines.append(f"User Question: {user_question}")

    # Guidelines based on intent
    if intent == "explain_step":
        if user_role == "experienced_pro":
            lines.append("Instructions: Explain the step targeting a senior developer, focusing on memory layout, pointer offsets, reference changes, and design principles.")
        else:
            lines.append("Instructions: Explain the step targeting a student/fresher, explaining variables, simple operations, and logic flow.")
    elif intent == "why_change":
        lines.append("Instructions: Detail why variables changed value between the previous variables snapshot and the current snapshot.")
    elif intent == "find_bugs":
        if user_role == "experienced_pro":
            lines.append("Instructions: Scan the code for complex bugs, pointer safety issues, memory leaks, resource handles, boundary traps, or bad design patterns.")
        else:
            lines.append("Instructions: Scan the code for simple runtime errors, infinite loops, null references, or assignment mistakes.")
    elif intent == "explain_complexity":
        if user_role == "experienced_pro":
            lines.append("Instructions: Detail best, average, and worst-case Big-O complexities. Explain scaling limits, garbage collector overhead, and cache line performance issues.")
        else:
            lines.append("Instructions: Simply explain the time and space complexity using simple analogies and step-by-step counting.")
    elif intent == "challenge_me":
        if user_role == "experienced_pro":
            lines.append("Instructions: Ask the user a high-level software engineering quiz (multiple choice) about algorithmic efficiency, pointer swaps, optimizations, or language-specific edge cases.")
        else:
            lines.append("Instructions: Ask the user a simple multiple-choice quiz about loop iterations, output print results, or variable value changes.")

    return "\n".join(lines)

async def _call_gemini(session: aiohttp.ClientSession, model: str, api_key: str, contents: List[Dict[str, Any]]) -> Optional[str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": contents,
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }
    headers = {"Content-Type": "application/json", "x-goog-api-key": api_key}
    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
            if resp.status != 200:
                logger.warning("Insight: Gemini HTTP %d", resp.status)
                return None
            body = await resp.json()
            return body["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        logger.warning("Insight: Gemini call failed: %s", e)
        return None

async def _call_openai_compatible(session: aiohttp.ClientSession, base_url: str, model: str, api_key: str, messages: List[Dict[str, Any]]) -> Optional[str]:
    url = f"{base_url}/v1/chat/completions"
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=20)) as resp:
            if resp.status != 200:
                logger.warning("Insight: OpenAI-Compatible HTTP %d", resp.status)
                return None
            body = await resp.json()
            return body["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Insight: OpenAI-compatible call failed: %s", e)
        return None

async def ask_insight(
    intent: str,
    context: Dict[str, Any],
    provider: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Main entry point for TraceFlow Insight.
    Dispatches request to configured LLM, handles automatic fallbacks,
    and returns a normalized JSON response.
    """
    # 1. Resolve fallback chain: Try primary provider first, then check remaining
    chain = ["groq", "gemini", "openai", "openrouter"]
    if provider and provider in chain:
        chain.remove(provider)
        chain.insert(0, provider)

    prompt = _build_insight_prompt(intent, context)

    async with aiohttp.ClientSession() as session:
        for p in chain:
            # Resolve key (user setting or server env)
            p_key = api_key if p == provider and api_key else os.environ.get(ENV_KEY_MAP[p])
            if not p_key:
                continue

            p_model = model if p == provider and model else DEFAULT_MODELS[p]
            logger.info("Insight: Attempting provider=%s model=%s", p, p_model)

            messages = [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ]
            contents = [
                {"role": "user", "parts": [
                    {"text": SYSTEM_PROMPT},
                    {"text": prompt}
                ]}
            ]

            max_attempts = 3
            parsed_response = None

            for attempt in range(1, max_attempts + 1):
                logger.info("Insight (Ralphloop): Attempt %d of %d for provider=%s", attempt, max_attempts, p)
                response_text = None
                if p == "gemini":
                    response_text = await _call_gemini(session, p_model, p_key, contents)
                else:
                    base_url = OPENAI_BASES.get(p)
                    if base_url:
                        response_text = await _call_openai_compatible(session, base_url, p_model, p_key, messages)

                if not response_text:
                    logger.warning("Insight: Provider %s returned no response on attempt %d", p, attempt)
                    await asyncio.sleep(1)
                    continue

                try:
                    parsed = json.loads(response_text)
                    if parsed.get("status") in ("success", "error"):
                        required_keys = ["status", "intent", "title", "summary", "explanation"]
                        missing = [k for k in required_keys if k not in parsed]
                        if missing:
                            raise ValueError(f"Missing mandatory keys: {', '.join(missing)}")
                        
                        parsed_response = parsed
                        break
                    else:
                        raise ValueError("Field 'status' must be either 'success' or 'error'")
                except Exception as parse_err:
                    error_msg = str(parse_err)
                    logger.warning("Insight: Attempt %d validation failure: %s", attempt, error_msg)

                    retry_instruction = (
                        f"Your previous response was invalid and failed validation.\n"
                        f"Validation Error: {error_msg}\n"
                        f"Please correct the JSON structure according to the RESPONSE JSON SCHEMA and respond ONLY with the valid JSON object."
                    )

                    messages.append({"role": "assistant", "content": response_text})
                    messages.append({"role": "user", "content": retry_instruction})

                    contents.append({"role": "model", "parts": [{"text": response_text}]})
                    contents.append({"role": "user", "parts": [{"text": retry_instruction}]})

            if parsed_response:
                return parsed_response

    # Fallback response in case of API failure / AI disabled (authority preservation)
    current_step = context.get("current_step", {})
    curr_vars = current_step.get("state", {}).get("variables", {}) or current_step.get("variables", {})
    prev_step = context.get("prev_step", {})
    prev_vars = prev_step.get("state", {}).get("variables", {}) or prev_step.get("variables", {}) if prev_step else {}
    
    # Calculate state evidence deterministically
    evidence_vars = {}
    for k, v in curr_vars.items():
        evidence_vars[k] = {
            "before": prev_vars.get(k, "-"),
            "after": v
        }

    return {
        "status": "success",
        "intent": intent,
        "title": f"Deterministic Step Analysis",
        "summary": "AI Insight is currently offline. Reviewing deterministic variable updates.",
        "explanation": [
            f"Executed statement: '{current_step.get('code', '/* code */')}' on line {current_step.get('line', 1)}.",
            f"Active variables: {', '.join([f'{k}={v}' for k, v in curr_vars.items()]) if curr_vars else 'None'}."
        ],
        "evidence": {
            "variables": evidence_vars,
            "line": current_step.get("line", 1)
        },
        "followUp": {
            "type": "none",
            "text": "Check back once AI Provider connection is restored."
        }
    }
