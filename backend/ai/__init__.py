"""
AI Explanation Service — Phase 9
================================

Public API: `explain_steps(code, language, steps, provider, model, api_key)`
in `ai.explanation`. Dispatches to Gemini, Groq, OpenRouter, or OpenAI over
raw HTTP, returns one <=3-sentence explanation per step, and falls back to
the templated explanations baked into each step when the LLM call fails or
no API key is configured.

Frontend contract: writes result into `Step.explanation` — no other fields
change, so no frontend changes are required.
"""
