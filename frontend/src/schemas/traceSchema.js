/**
 * TraceFlow Trace Schema — v1.0 (FROZEN)
 * =======================================
 *
 * Mirrors backend/schemas/trace_schema.py. Every step served by the API
 * (mock in Phase 4, parser output in Phase 5+, LLM-explained in Phase 9)
 * MUST conform to this shape. Optional fields are UI hints only.
 *
 * @typedef {Object} Step
 * @property {number} step        1-indexed chronological step id
 * @property {number} line        1-indexed source line executing
 * @property {Object.<string, *>} variables  Full variable snapshot AFTER this step
 * @property {string[]} output    Full print buffer AFTER this step
 * @property {string[]} changes   Human-readable list of what changed here
 * @property {string} explanation Short (<=3 sentence) explanation
 *
 * -- optional UI hints (may be absent) --
 * @property {("declare"|"assign"|"condition"|"loop-init"|"loop-step"|"print"|"call"|"return")=} kind
 * @property {string=} label
 * @property {string=} condition
 * @property {boolean=} condition_result
 *
 * @typedef {Object} Trace
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string=} concept
 * @property {string} code
 * @property {Step[]} steps
 */

export const SCHEMA_VERSION = "1.0";

/** Required fields on a Step — used only by the Trace Inspector for validation display. */
export const STEP_REQUIRED_FIELDS = [
  "step",
  "line",
  "variables",
  "output",
  "changes",
  "explanation",
];

/**
 * Return the set of variable names whose value differs between prev and current
 * step. Derived from the canonical `variables` snapshot — DO NOT rely on
 * optional trace fields for this.
 * @param {Step|null} current
 * @param {Step|null} prev
 * @returns {Set<string>}
 */
export function diffChangedVars(current, prev) {
  const changed = new Set();
  if (!current) return changed;
  const cur = current.variables || {};
  const p = prev?.variables || {};
  for (const key of Object.keys(cur)) {
    // Compare by JSON to handle numbers/booleans/strings uniformly
    if (JSON.stringify(p[key]) !== JSON.stringify(cur[key])) {
      changed.add(key);
    }
  }
  return changed;
}

/** Lightweight schema validator used by the Trace Inspector to surface issues early. */
export function validateStep(step) {
  const problems = [];
  if (!step || typeof step !== "object") {
    return ["step is not an object"];
  }
  for (const key of STEP_REQUIRED_FIELDS) {
    if (!(key in step)) problems.push(`missing required field: ${key}`);
  }
  if ("variables" in step && (step.variables === null || typeof step.variables !== "object")) {
    problems.push("variables must be an object");
  }
  if ("output" in step && !Array.isArray(step.output)) {
    problems.push("output must be an array of strings");
  }
  if ("changes" in step && !Array.isArray(step.changes)) {
    problems.push("changes must be an array of strings");
  }
  return problems;
}
