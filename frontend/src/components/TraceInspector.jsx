import { useState } from "react";
import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import {
  SCHEMA_VERSION,
  STEP_REQUIRED_FIELDS,
  validateStep,
} from "@/schemas/traceSchema";
import { X, Braces, ShieldCheck, ShieldAlert } from "lucide-react";

/**
 * Trace JSON Inspector — hidden developer panel.
 * Toggle with Cmd/Ctrl + `  OR the header button.
 *
 * Purpose: verify the trace JSON contract BEFORE building parser/AI.
 * Shows: current step JSON, full trace JSON, and schema validation.
 */
export default function TraceInspector() {
  const open = useTraceStore((s) => s.inspectorOpen);
  const close = useTraceStore((s) => s.closeInspector);
  const trace = useTraceStore((s) => s.trace);
  const step = useTraceStore(selectCurrentStep);
  const currentStepIdx = useTraceStore((s) => s.currentStep);
  const [tab, setTab] = useState("step");

  if (!open) return null;

  const validationProblems = trace
    ? trace.steps.flatMap((s, i) =>
        validateStep(s).map((msg) => `step ${i + 1}: ${msg}`)
      )
    : [];
  const isValid = validationProblems.length === 0;

  let payload;
  if (tab === "step") payload = step;
  else if (tab === "trace") payload = trace;
  else payload = null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end"
      onClick={close}
      data-testid={TF.inspector}
    >
      <aside
        className="w-[540px] max-w-[90vw] h-full bg-[hsl(var(--tf-panel))] border-l border-[hsl(var(--tf-border-strong))] flex flex-col shadow-2xl tf-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="h-11 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] shrink-0">
          <Braces className="w-4 h-4 text-[hsl(var(--tf-accent))]" />
          <span className="text-[12.5px] font-semibold">Trace Inspector</span>
          <span className="text-[10.5px] mono text-[hsl(var(--tf-text-dim))] px-1.5 py-0.5 rounded border border-[hsl(var(--tf-border))]">
            schema v{SCHEMA_VERSION}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px]">
            {isValid ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--tf-success))]" />
                <span className="text-[hsl(var(--tf-success))]">valid</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-[hsl(var(--tf-danger))]" />
                <span className="text-[hsl(var(--tf-danger))]">
                  {validationProblems.length} issue
                  {validationProblems.length === 1 ? "" : "s"}
                </span>
              </>
            )}
          </span>
          <button
            onClick={close}
            data-testid={TF.inspectorClose}
            className="ml-2 w-7 h-7 rounded-md flex items-center justify-center text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:bg-[hsl(var(--tf-panel-2))]"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Tabs */}
        <div className="flex border-b border-[hsl(var(--tf-border))] shrink-0">
          <TabBtn active={tab === "step"} onClick={() => setTab("step")} testid={TF.inspectorTab("step")}>
            Current step
          </TabBtn>
          <TabBtn active={tab === "trace"} onClick={() => setTab("trace")} testid={TF.inspectorTab("trace")}>
            Full trace
          </TabBtn>
          <TabBtn active={tab === "schema"} onClick={() => setTab("schema")} testid={TF.inspectorTab("schema")}>
            Schema
          </TabBtn>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {tab === "schema" ? (
            <SchemaView
              problems={validationProblems}
              isValid={isValid}
              stepCount={trace?.steps.length || 0}
            />
          ) : (
            <>
              {tab === "step" && step && (
                <div className="mb-2 text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))]">
                  step {currentStepIdx + 1} · line {step.line}
                </div>
              )}
              <pre
                data-testid={TF.inspectorJson}
                className="mono text-[12px] leading-[1.55] text-[hsl(var(--tf-text))] bg-[hsl(var(--tf-bg))] border border-[hsl(var(--tf-border))] rounded-md p-3 overflow-x-auto"
              >
                {payload ? JSON.stringify(payload, null, 2) : "// no data"}
              </pre>
            </>
          )}
        </div>

        <footer className="h-8 border-t border-[hsl(var(--tf-border))] px-3 flex items-center text-[10.5px] mono text-[hsl(var(--tf-text-dim))] shrink-0">
          <span>toggle </span>
          <span className="tf-kbd ml-1.5">Ctrl</span>
          <span className="tf-kbd ml-1">`</span>
        </footer>
      </aside>
    </div>
  );
}

function TabBtn({ active, onClick, children, testid }) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className={`h-9 px-3.5 text-[12px] font-medium transition-colors ${
        active
          ? "text-[hsl(var(--tf-text))] border-b-2 border-[hsl(var(--tf-accent))]"
          : "text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] border-b-2 border-transparent"
      }`}
    >
      {children}
    </button>
  );
}

function SchemaView({ problems, isValid, stepCount }) {
  return (
    <div
      className="space-y-4 text-[12.5px]"
      data-testid={TF.inspectorValidation}
    >
      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-1.5">
          Required per step
        </div>
        <ul className="mono text-[12px] space-y-0.5">
          {STEP_REQUIRED_FIELDS.map((f) => (
            <li key={f} className="text-[hsl(var(--tf-text))]">
              <span className="text-[hsl(var(--tf-accent))]">{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-1.5">
          Validation
        </div>
        {isValid ? (
          <div className="mono text-[12px] text-[hsl(var(--tf-success))]">
            ✓ all {stepCount} step{stepCount === 1 ? "" : "s"} conform
          </div>
        ) : (
          <ul className="mono text-[12px] space-y-1 text-[hsl(var(--tf-danger))]">
            {problems.slice(0, 20).map((p, i) => (
              <li key={i}>• {p}</li>
            ))}
            {problems.length > 20 && (
              <li className="text-[hsl(var(--tf-text-dim))]">
                …and {problems.length - 20} more
              </li>
            )}
          </ul>
        )}
      </div>

      <div>
        <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-1.5">
          Future consumers
        </div>
        <ul className="text-[12px] text-[hsl(var(--tf-text-muted))] leading-relaxed space-y-1">
          <li>
            <span className="mono text-[hsl(var(--tf-accent))]">Phase 5</span> —
            Java parser output
          </li>
          <li>
            <span className="mono text-[hsl(var(--tf-accent))]">Phase 6</span> —
            Trace generator emits <span className="mono">Step</span> objects
          </li>
          <li>
            <span className="mono text-[hsl(var(--tf-accent))]">Phase 9</span> —
            LLM writes to <span className="mono">explanation</span> field only
          </li>
        </ul>
      </div>
    </div>
  );
}
