import {
  useTraceStore,
  selectCurrentStep,
  selectPrevStep,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { diffChangedVars } from "@/schemas/traceSchema";
import VariableCard from "@/components/VariableCard";
import { Activity, GitCommit, Zap } from "lucide-react";

/**
 * CENTER panel — Execution Visualization.
 * Answers: What is executing? What changed? What are the variables?
 *
 * Consumes ONLY the frozen trace schema:
 *   step.line, step.variables, step.output, step.changes, step.explanation
 * plus optional UI hints (kind, label, condition, condition_result).
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
  // Derived from canonical `variables` snapshot — NOT reliant on any
  // optional trace field.
  const changedSet = diffChangedVars(step, prev);

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
            {step.kind && <StepKindBadge kind={step.kind} />}
            <span
              className="text-[11px] mono text-[hsl(var(--tf-text-muted))]"
              data-testid={TF.currentLineIndicator}
            >
              line {step.line}
            </span>
          </div>
          <div className="mono text-[13.5px] text-[hsl(var(--tf-text))] leading-relaxed">
            {step.label || (step.changes && step.changes[0]) || `step ${step.step}`}
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
                  changed={changedSet.has(name)}
                  stepKey={currentStepIdx}
                />
              ))}
            </div>
          )}
        </div>

        {/* What changed — driven by canonical step.changes[] */}
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
    call: { label: "call", color: "cyan" },
    return: { label: "return", color: "cyan" },
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
  const changes = step.changes || [];

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
              data-testid={TF.changeItem(i)}
              className="flex items-start gap-2 text-[12.5px] text-[hsl(var(--tf-text))]"
            >
              <span className="mt-1 w-1 h-1 rounded-full bg-[hsl(var(--tf-accent))] shrink-0" />
              <span className="mono leading-relaxed">{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
