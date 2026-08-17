# TraceFlow — Security & Access

## 1. Overview / Threat Model

TraceFlow is a **single-user, self-hosted teaching tool**. It is designed to run
locally (frontend + backend on `localhost`) and is **not** intended to be
exposed to the public internet without additional protection.

Primary assets:
- The **code snippets** users write and trace (stored only in the browser via
  `localStorage`; the backend is stateless).
- **LLM provider API keys** (Gemini / Groq / OpenRouter / OpenAI) supplied by
  the user to power AI explanations.
- Backend compute time (an unthrottled `/api/execute` could burn paid LLM
  tokens / CPU).

There are **no user accounts, roles, or permissions**. Any client that can
reach the backend may call any endpoint. "Access control" therefore means:
network-level protection (don't expose it), plus the mitigations below.

## 2. Authentication & Access Levels

| Level | Mechanism |
|---|---|
| Users | None — no login, no accounts, no sessions. |
| Backend API | Open to any reachable client. Protected only by rate limits. |
| Browsers | Cross-origin calls restricted by the CORS allowlist. |

If the product ever gains accounts/progress/cloud-save (see README roadmap),
authentication must be added then (e.g., OAuth + signed session cookies, with
per-user data isolation). Nothing today requires it.

## 3. CORS (browser cross-origin policy)

Configured in `backend/server.py` from `CORS_ORIGINS` (comma-separated).

- Default: `http://localhost:3080,http://127.0.0.1:3080` (the dev frontend).
- **Never** set this to `*` — that would let any website read API responses
  (including the user's code and AI explanations).
- In production, set `CORS_ORIGINS` to your exact frontend origin(s).

## 4. Rate Limiting

Implemented in `backend/ratelimit.py` (in-process sliding-window counter, no
external dependencies).

- `/api/execute` → `RATE_LIMIT_EXECUTE_PER_MINUTE` (default **30/min**) —
  guards the expensive parse + LLM path.
- `/api/parse` → `RATE_LIMIT_PARSE_PER_MINUTE` (default **60/min**).
- `RATE_LIMIT_ENABLED=false` disables it (not recommended outside local dev).

Caveats to be aware of:
- State is **per-process**: each uvicorn worker carries its own budget, so the
  effective limit scales with worker count. A multi-worker deployment should
  tune the env vars accordingly (or move to a shared store like Redis).
- The window resets when the process restarts.

## 5. Client Identification & Proxy Trust

Keyed by client IP via `_client_key()` in `backend/ratelimit.py`.

- By default the **direct socket peer** address is used.
- The `X-Forwarded-For` header is **ignored unless** the direct peer is in the
  `TRUSTED_PROXIES` env var (comma-separated IPs), in which case the
  **rightmost** entry is used (the value appended by your trusted proxy).
- This prevents clients from rotating spoofed `X-Forwarded-For` headers to
  bypass the rate budget.

## 6. LLM API Keys

- Users can enter a provider key in the frontend **Settings** modal. It is
  persisted in the browser under `localStorage['traceflow.ai.settings']` and
  sent to the backend inside the `/api/execute` request body.
- The backend (`backend/ai/explanation.py`) resolves the key as
  `passed-in > environment variable` (`GEMINI_API_KEY`, `GROQ_API_KEY`,
  `OPENROUTER_API_KEY`, `OPENAI_API_KEY`). Keys are **never logged**.
- Risks & guidance:
  - `localStorage` is readable by any script on the origin (XSS risk). Never
    add untrusted third-party scripts to the same origin.
  - Prefer configuring keys via **environment variables** server-side over
    sending them from the browser.
  - Over plain HTTP (local dev) a key can be sniffed on the network — use TLS
    in any deployment that leaves `localhost`.

## 7. Code Execution Safety

- The backend **never** runs user code natively: there is no `exec`/`eval`,
  no subprocess, no `javac`/`node`/`python` shell-out. The parsers
  (javalang / Python `ast` / esprima) build a simplified AST that the trace
  generator interprets in-process.
- `MAX_STEPS = 500` (`backend/trace_generator/generator.py`) caps runaway
  loops and emits a terminal "execution cap reached" step.
- A generator/parser bug could theoretically raise or crash the worker
  (mitigated by uvicorn's process isolation + the rate limiter).
- The frontend evaluates **breakpoint conditions** via `new Function` in
  `frontend/src/store/traceStore.js`. This runs **client-side in the user's own
  browser only** and is not a server-side execution vector.

## 8. Data Storage

- **Server:** stateless. No database. Traces are generated in memory per
  request; static mock traces are read from `backend/mock_traces.json`.
- **Browser (`localStorage`):** per-sample code drafts
  (`traceflow.snippet.<id>`), language preference (`traceflow.lang.<id>`),
  layout (panel ratios), and AI settings (including API keys). Clearing site
  data removes all of it.

## 9. Deployment Checklist

Before exposing the app beyond `localhost`:

1. Put it behind a reverse proxy (nginx / Caddy) with **TLS**.
2. Set `TRUSTED_PROXIES` to your proxy's IP (so rate limiting sees real clients).
3. Set `CORS_ORIGINS` to your exact frontend origin — never `*`.
4. Keep `RATE_LIMIT_ENABLED=true` and tune limits for your worker count.
5. Prefer server-side `*_API_KEY` env vars over client-supplied keys.
6. If multiple users will ever share it, add real authentication before then —
   the current API is open to any caller that can reach it.
