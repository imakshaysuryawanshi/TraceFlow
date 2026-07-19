# TraceFlow — PRD

## Problem Statement (verbatim scope)
TraceFlow — "Follow every step your code takes."
A learning tool that visualizes step-by-step Java execution so beginners can see current line, variable changes, condition evaluation, and output as they happen. NOT an IDE, NOT a compiler, NOT a challenge platform.

**Scope for this build:** Phases 1–4 only (UI + Monaco + Execution Timeline with mock data). Validate UX early before building the parser/trace generator.

## User Personas
- Programming beginners
- Students
- Self-taught developers
- QA engineers learning automation
- Developers learning new languages

## Core Requirements (static)
- Java-only. Concepts: variables, arithmetic, assignment, print, if/else, for, while, basic methods.
- Three-panel UI (Code | Execution | AI Explanation) + Output console + Timeline.
- Step forward / back / replay / play-pause with variable + output tracking.
- Dark, IDE-inspired aesthetic (Linear / Raycast / VS Code / Warp).
- AI panel: short (≤3 sentences), context-tied, no chat UI.

## Architecture
- Frontend: React (CRA) + Tailwind + Zustand + Monaco Editor (@monaco-editor/react).
- Backend: FastAPI serving `/api/traces` (list) and `/api/traces/{id}` (full trace) from `/app/backend/mock_traces.json`.
- Trace schema (future-proof — matches planned parser output):
  `{ id, name, description, concept, code, steps:[{ step, line, kind, label, variables, changed, output, explanation, condition?, condition_result? }] }`

## Implemented (2026-02)
- **Phase 1 – Setup**: monaco + zustand added; theme tokens, JetBrains Mono + Inter.
- **Phase 2 – UI Layout**: top bar (brand + sample dropdown + Run trace + Inspector toggle + kbd hint), 3-column main, bottom timeline + output.
- **Phase 3 – Monaco**: editable Java editor with `traceflow-dark` theme, current-line decoration + gutter glyph, edited/reset UX.
- **Schema v1.0 FROZEN** (2026-02): every Step must have `{step, line, variables, output, changes, explanation}`. Optional UI hints: `kind, label, condition, condition_result`. Defined in `/app/backend/schemas/trace_schema.py` (pydantic) and mirrored in `/app/frontend/src/schemas/traceSchema.js` (JSDoc + validator + `diffChangedVars`).
- **Trace JSON Inspector** (hidden dev panel): toggle via `{}` button in top bar or `Ctrl/Cmd + `` `. Tabs: Current step / Full trace / Schema (validation view). Validates every step against the frozen schema and lists Phase 5/6/9 as future consumers.
- **Run Trace button**: visible in top bar; enabled when draft code matches the loaded sample (re-plays mock); disabled with "phase 5" pill + tooltip when code diverges.
- **Phase 5 — Java parser** (2026-02): `backend/parser/parser.py` using `javalang==0.13.0`. Parses the approved subset (`int/long/double/float/boolean/String` vars, arithmetic, `= += -= *= /= %=`, prefix/postfix `++`/`--`, `if/else`, `for`, `while`, `System.out.println/print`) into a simplified AST of plain dicts. Auto-wraps top-level snippets in a synthetic `class Main { main() { ... } }` and remaps line numbers back to the user's source. **Methods, recursion, arrays, generics, OOP, classes are rejected** with friendly `ParserError`. Exposed as `POST /api/parse`. Tests: 16 pytest.
- **Phase 6 — Trace generator** (2026-02): `backend/trace_generator/generator.py`. Interprets the AST directly (no `javac`) and emits Steps conforming exactly to the frozen v1.0 schema. Templated explanations (still mocked; LLM integration remains unapproved). `MAX_STEPS=500` cap prevents runaway loops. **Generated traces match the canonical mock traces step-for-step** for all 3 samples (verified by pytest — same step count, lines, kinds, variable snapshots, output progression, condition results, and `changes` phrasing). Exposed as `POST /api/execute { code, id?, name?, description?, concept? } → Trace`. Errors surface as HTTP 400 with `stage: "parse" | "execute"`, `message`, `line`. Tests: 24 pytest covering schema conformance, mock parity, if/else, compound assigns, booleans, string print, undefined var, div/mod by zero, integer division truncation, MAX_STEPS cap, nested loops, snapshot independence.
- **Frontend: zero changes in Phase 5–6.** Same components consume `/api/execute` responses identically to `/api/traces/{id}`.
- **Trace Engine Test Suite** (2026-02): `/app/backend/tests/test_trace_engine.py` — 25 tests with explicit expected-trace snapshots for every supported construct (variable assignment × 9, if/else × 4, for loop × 3, while loop × 3, print × 6). Every required schema field is asserted exactly (`step, line, kind, variables, output, changes, condition, condition_result`); `explanation` is checked for non-empty presence only (templated until Phase 9). **Parser + trace generator are proven correct by this suite before UI integration.** Full backend regression: **76 tests passing.**
- **Phase 4 – Execution Timeline**:
  - Zustand store: `samples`, `trace`, `currentStep`, `isPlaying`, `playbackSpeedMs`; actions `next / prev / goTo / play / pause / replay / setSpeed`.
  - Timeline controls: prev / play-pause / next / replay + clickable progress + 0.5×/1×/2× speed + arrow-key shortcuts.
  - Execution panel: step-kind badge, current line label, variable grid with `changed` flash + previous value, "What changed" diff, condition + boolean result badge.
  - Output console: prints incremental with "new" badge on the freshly printed line.
  - AI Explanation panel: mock explanation per step + Focus + Concept card; marked "mock" for Phase 9 swap.
- 3 sample programs: `for-loop-sum` (13 steps), `if-else-grade` (3 steps), `while-countdown` (11 steps).
- 100% E2E pass (11 backend pytest + 16 Playwright flows) — see `/app/test_reports/iteration_1.json`.

## Prioritized Backlog
### P0 (next up)
- **Phase 5** — Java parser (subset: vars, arithmetic, if/else, for/while, print, basic methods).
- **Phase 6** — Trace generator (produces the same JSON schema currently served from mock).

### P1
- **Phase 7** — Variable tracking hooked to real trace.
- **Phase 8** — Output tracking hooked to real trace.
- Editable Monaco + a "Run trace" button that POSTs code and receives the generated trace.

### P2
- **Phase 9** — AI explanation via LLM (Emergent LLM key, Claude Sonnet). Drop-in replacement for `step.explanation`.
- Resizable panels (react-resizable-panels already installed).
- Persistent user code snippets (only if requested).

## Nice-to-have polish (from code review)
- Cache `mock_traces.json` load (module-level or `lru_cache`).
- Lazy-init Mongo client (unused in Phase 1-4).
- Auto-reset on Play when at end of trace.
- Pause on manual next/prev while playing.

## Files (key)
- Backend: `/app/backend/server.py`, `/app/backend/mock_traces.json`
- Frontend: `/app/frontend/src/{App.js, index.css, App.css}`, `/app/frontend/src/store/traceStore.js`, `/app/frontend/src/constants/testIds.js`, `/app/frontend/src/components/{TopBar,CodeEditor,ExecutionPanel,VariableCard,AIExplanation,OutputConsole,TimelineControls}.jsx`
