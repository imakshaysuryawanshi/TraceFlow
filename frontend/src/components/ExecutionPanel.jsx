import {
  useTraceStore,
  selectCurrentStep,
  selectPrevStep,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import VariableCard from "@/components/VariableCard";
import { Activity, GitCommit, Zap } from "lucide-react";

/**
 * CENTER panel — Execution Visualization.
 * Answers: What is executing? What changed? What are the variables?
 */
export default function ExecutionPanel() {
  const trace = useTraceStore((s) => s.trace);
  const step = useTraceStore(selectCurrentStep);
  const prev = useTraceStore(selectPrevStep);
  const currentStepIdx = useTraceStore((s) => s.currentStep);

  if (!trace || !step) {
    return (
      <div className="h-full flex items-center justify-center text-[hsl(var(--tf-text-dim))] text-sm">
        Loading trace…
      </div>
    );
  }

  const variables = step.variables || {};
  const varEntries = Object.entries(variables);
  const changed = new Set(step.changed || []);

  return (
    <div
      data-testid={TF.executionPanel}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0">
        <Activity className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold">
          Execution
        </span>
        <span
          className="ml-auto text-[11px] mono text-[hsl(var(--tf-text-muted))]"
          data-testid={TF.currentStepBadge}
        >
          step {currentStepIdx + 1}
          <span className="text-[hsl(var(--tf-text-dim))]">
            {" "}
            / {trace.steps.length}
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Current step banner */}
        <div
          key={`banner-${currentStepIdx}`}
          className="tf-fade-in rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel))] p-3.5"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <StepKindBadge kind={step.kind} />
            <span
              className="text-[11px] mono text-[hsl(var(--tf-text-muted))]"
              data-testid={TF.currentLineIndicator}
            >
              line {step.line}
            </span>
          </div>
          <div className="mono text-[13.5px] text-[hsl(var(--tf-text))] leading-relaxed">
            {step.label}
          </div>
          {step.condition && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))]">
                condition
              </span>
              <span className="mono text-[12px] text-[hsl(var(--tf-text-muted))]">
                {step.condition}
              </span>
              <span
                className={`text-[10.5px] mono px-1.5 py-0.5 rounded ${
                  step.condition_result
                    ? "text-[hsl(var(--tf-success))] bg-[hsl(var(--tf-success))]/10"
                    : "text-[hsl(var(--tf-danger))] bg-[hsl(var(--tf-danger))]/10"
                }`}
              >
                {String(step.condition_result)}
              </span>
            </div>
          )}
        </div>

        {/* Variables */}
        <div>
          <SectionLabel icon={<GitCommit className="w-3 h-3" />}>
            Variables
          </SectionLabel>
          {varEntries.length === 0 ? (
            <div className="text-[12px] text-[hsl(var(--tf-text-dim))] italic mono">
              (none yet)
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {varEntries.map(([name, value]) => (
                <VariableCard
                  key={name}
                  name={name}
                  value={value}
                  previousValue={prev?.variables?.[name]}
                  changed={changed.has(name)}
                  stepKey={currentStepIdx}
                />
              ))}
            </div>
          )}
        </div>

        {/* What changed */}
        <WhatChanged step={step} prev={prev} />
      </div>
    </div>
  );
}

function SectionLabel({ icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 text-[10.5px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--tf-text-muted))]">
      {icon}
      {children}
    </div>
  );
}

function StepKindBadge({ kind }) {
  const map = {
    declare: { label: "declare", color: "cyan" },
    assign: { label: "assign", color: "cyan" },
    condition: { label: "condition", color: "amber" },
    "loop-init": { label: "loop init", color: "blue" },
    "loop-step": { label: "loop step", color: "blue" },
    print: { label: "print", color: "green" },
  };
  const meta = map[kind] || { label: kind, color: "cyan" };
  const colors = {
    cyan: "text-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/10 border-[hsl(var(--tf-accent))]/25",
    blue: "text-[hsl(var(--tf-accent-2))] bg-[hsl(var(--tf-accent-2))]/10 border-[hsl(var(--tf-accent-2))]/25",
    amber: "text-[hsl(var(--tf-warning))] bg-[hsl(var(--tf-warning))]/10 border-[hsl(var(--tf-warning))]/25",
    green: "text-[hsl(var(--tf-success))] bg-[hsl(var(--tf-success))]/10 border-[hsl(var(--tf-success))]/25",
  }[meta.color];
  return (
    <span
      className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${colors}`}
    >
      {meta.label}
    </span>
  );
}

function WhatChanged({ step, prev }) {
  const changes = [];

  // Variable changes
  const prevVars = prev?.variables || {};
  for (const name of step.changed || []) {
    const before = prevVars[name];
    const after = step.variables?.[name];
    changes.push({
      kind: "var",
      name,
      before: before === undefined ? "—" : String(before),
      after: String(after),
    });
  }

  // Output changes
  const prevOut = prev?.output || [];
  const curOut = step.output || [];
  if (curOut.length > prevOut.length) {
    const added = curOut.slice(prevOut.length);
    added.forEach((line) => {
      changes.push({ kind: "output", value: line });
    });
  }

  return (
    <div data-testid={TF.whatChanged}>
      <SectionLabel icon={<Zap className="w-3 h-3" />}>
        What changed
      </SectionLabel>
      {changes.length === 0 ? (
        <div className="text-[12px] text-[hsl(var(--tf-text-dim))] italic mono">
          {prev ? "No state change on this step." : "Initial step."}
        </div>
      ) : (
        <ul className="space-y-1.5">
          {changes.map((c, i) => (
            <li
              key={i}
              className="mono text-[12.5px] flex items-center gap-2 text-[hsl(var(--tf-text))]"
            >
              {c.kind === "var" ? (
                <>
                  <span className="text-[hsl(var(--tf-accent))]">
                    {c.name}
                  </span>
                  <span className="text-[hsl(var(--tf-text-dim))]">
                    {c.before}
                  </span>
                  <span className="text-[hsl(var(--tf-text-dim))]">→</span>
                  <span className="text-[hsl(var(--tf-text))]">
                    {c.after}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[10px] uppercase tracking-wider text-[hsl(var(--tf-success))] bg-[hsl(var(--tf-success))]/10 px-1.5 py-0.5 rounded">
                    out
                  </span>
                  <span className="text-[hsl(var(--tf-text))]">
                    {c.value}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
