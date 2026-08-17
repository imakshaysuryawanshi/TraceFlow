import { useMemo } from "react";
import {
  useTraceStore,
  selectCurrentStep,
  selectPrevStep,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { diffChangedVars, computeLoopContexts } from "@/schemas/traceSchema";
import VariableCard from "@/components/VariableCard";
import StepIndicator from "@/components/StepIndicator";
import LoopIndicator from "@/components/LoopIndicator";
import { Activity, GitCommit, Zap, Copy } from "lucide-react";
import { toast } from "sonner";

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

  // Comparison State
  const savedRun = useTraceStore((s) => s.savedRun);
  const compareModeEnabled = useTraceStore((s) => s.compareModeEnabled);
  const saveCurrentRun = useTraceStore((s) => s.saveCurrentRun);
  const clearSavedRun = useTraceStore((s) => s.clearSavedRun);
  const toggleCompareMode = useTraceStore((s) => s.toggleCompareMode);

  const loopCtx = useMemo(() => computeLoopContexts(trace), [trace]);

  if (!trace || !step) {
    return (
      <div className="h-full flex items-center justify-center text-[hsl(var(--tf-text-dim))] text-sm">
        Loading trace…
      </div>
    );
  }

  const variables = step.state?.variables || step.variables || {};
  const varEntries = Object.entries(variables);
  const changedSet = diffChangedVars(step, prev);
  const stepsList = trace.trace || trace.steps || [];

  const handleCopySteps = () => {
    try {
      const headers = ["Step", "Line", "Kind", "Statement", "Variables", "Output", "Explanation"];
      const rows = stepsList.map((s, idx) => {
        const stepNum = idx + 1;
        const line = s.line;
        const kind = s.kind || s.type || "step";
        const statement = s.label || (s.changes && s.changes[0]) || "";
        const vars = s.state?.variables || s.variables || {};
        const variablesStr = Object.entries(vars)
          .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
          .join(", ");
        const outputStr = (s.output || []).join(" | ");
        const explanation = s.explanation || "";
        
        return [
          stepNum,
          line,
          kind,
          statement,
          variablesStr,
          outputStr,
          explanation
        ].map(val => {
          return String(val).replace(/\r?\n|\r/g, " ").replace(/\t/g, " ");
        });
      });

      const tsvContent = [
        headers.join("\t"),
        ...rows.map(row => row.join("\t"))
      ].join("\n");

      navigator.clipboard.writeText(tsvContent);
      toast.success("Steps copied to clipboard!", {
        description: "Paste directly into Excel or Google Sheets.",
        duration: 3000,
      });
    } catch (err) {
      toast.error("Failed to copy steps.");
    }
  };
  
  const currentLoop = (step.control && step.control.iteration !== null && step.control.iteration !== undefined) ? {
    iteration: step.control.iteration,
    total: (() => {
      if (step.control.total) return step.control.total;
      let maxIter = step.control.iteration;
      for (const s of stepsList) {
        if (s.control && s.control.condition === step.control.condition) {
          maxIter = Math.max(maxIter, s.control.iteration || 0);
        }
      }
      return maxIter || 1;
    })(),
    condition: step.control.condition
  } : (loopCtx.get(currentStepIdx) || null);

  return (
    <div data-testid={TF.executionPanel} className="h-full flex flex-col">
      {/* Header */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0 select-none">
        <Activity className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold">
          Execution
        </span>
        
        {/* Comparison Actions */}
        <div className="ml-4 flex items-center gap-2">
          <button
            onClick={saveCurrentRun}
            className={`px-2 py-0.5 rounded text-[9.5px] uppercase font-bold tracking-wider transition-all select-none duration-200 active:scale-95 border ${
              savedRun
                ? "border-[hsl(var(--tf-success))]/40 text-[hsl(var(--tf-success))] hover:bg-[hsl(var(--tf-success))]/5"
                : "border-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:bg-[hsl(var(--tf-panel-2))]"
            }`}
            title={savedRun ? "Overwrite baseline run with current state" : "Save current trace as comparison baseline"}
          >
            {savedRun ? "Baseline Set ✓" : "Set Baseline"}
          </button>
          
          {savedRun && (
            <button
              onClick={toggleCompareMode}
              className={`px-2 py-0.5 rounded text-[9.5px] uppercase font-bold tracking-wider transition-all select-none duration-200 active:scale-95 border ${
                compareModeEnabled
                  ? "bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] border border-[hsl(var(--tf-accent))]/30 shadow-[0_0_8px_rgba(34,211,238,0.1)]"
                  : "border-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))]"
              }`}
            >
              {compareModeEnabled ? "Comparing Active" : "Compare"}
            </button>
          )}

          <button
            onClick={handleCopySteps}
            className="px-2 py-0.5 rounded text-[9.5px] uppercase font-bold tracking-wider transition-all select-none duration-200 active:scale-95 border border-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:bg-[hsl(var(--tf-panel-2))] flex items-center gap-1"
            title="Copy all execution steps as Excel-friendly TSV"
          >
            <Copy className="w-2.5 h-2.5" />
            Copy Steps
          </button>
        </div>

        <span
          className="ml-auto text-[11px] mono text-[hsl(var(--tf-text-muted))]"
          data-testid={TF.currentStepBadge}
        >
          step {currentStepIdx + 1}
          <span className="text-[hsl(var(--tf-text-dim))]">
            {" "}/ {stepsList.length}
          </span>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {/* Prominent step indicator + current-step banner */}
        <div className="flex items-stretch gap-3">
          <StepIndicator current={currentStepIdx + 1} total={stepsList.length} />
          <div
            key={`banner-${currentStepIdx}`}
            className="tf-fade-in flex-1 min-w-0 rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel))] p-3"
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
            <div className="mono text-[13.5px] text-[hsl(var(--tf-text))] leading-relaxed break-words">
              {step.label || (step.changes && step.changes[0]) || `step ${step.step}`}
            </div>
            {step.condition && (
              <div className="mt-2 flex items-center gap-2 flex-wrap">
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
            {step.warnings && step.warnings.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded border border-[hsl(var(--tf-danger))]/30 bg-[hsl(var(--tf-danger))]/10 px-2.5 py-1.5">
                <span className="text-[10.5px] text-[hsl(var(--tf-danger))]">
                  ⚠
                </span>
                <span className="text-[11.5px] text-[hsl(var(--tf-text))] leading-snug">
                  {step.warnings[0]}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Loop iteration badge */}
        {currentLoop && (
          <LoopIndicator
            key={`loop-${currentLoop.iteration}-${currentLoop.condition}`}
            context={currentLoop}
          />
        )}

        {/* Variables */}
        <div>
          <SectionLabel icon={<GitCommit className="w-3 h-3" />}>
            Variables
          </SectionLabel>

          {compareModeEnabled && savedRun ? (
            (() => {
              const savedSteps = savedRun.trace || savedRun.steps || [];
              const savedIdx = Math.min(currentStepIdx, savedSteps.length - 1);
              const savedStep = savedSteps[savedIdx];
              const savedVariables = savedStep ? savedStep.variables || {} : {};
              const savedPrev = currentStepIdx > 0 ? savedSteps[currentStepIdx - 1] : null;
              const savedChangedSet = savedStep ? diffChangedVars(savedStep, savedPrev) : new Set();
              const savedVarEntries = Object.entries(savedVariables);

              return (
                <div className="grid grid-cols-2 gap-4">
                  {/* Current Run Column */}
                  <div className="space-y-2">
                    <div className="text-[10px] uppercase font-bold text-[hsl(var(--tf-text-dim))] mb-1 select-none">
                      Current Run
                    </div>
                    {varEntries.length === 0 ? (
                      <div className="text-[12px] text-[hsl(var(--tf-text-dim))] italic mono">(none)</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {varEntries.map(([name, value]) => (
                          <VariableCard
                            key={name}
                            name={name}
                            value={value}
                            previousValue={prev?.variables?.[name]}
                            changed={changedSet.has(name)}
                            stepKey={`curr-${currentStepIdx}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Saved Baseline Column */}
                  <div className="space-y-2 border-l border-[hsl(var(--tf-border))] pl-4">
                    <div className="text-[10px] uppercase font-bold text-[hsl(var(--tf-accent))] mb-1 select-none flex items-center justify-between">
                      <span>Baseline Run</span>
                    </div>
                    {savedVarEntries.length === 0 ? (
                      <div className="text-[12px] text-[hsl(var(--tf-text-dim))] italic mono">(none)</div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {savedVarEntries.map(([name, value]) => (
                          <VariableCard
                            key={name}
                            name={name}
                            value={value}
                            previousValue={savedPrev?.variables?.[name]}
                            changed={savedChangedSet.has(name)}
                            stepKey={`saved-${currentStepIdx}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          ) : (
            varEntries.length === 0 ? (
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
            )
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
          {changes.map((c, i) => {
            const isObj = typeof c === "object" && c !== null;
            let text;
            if (!isObj) {
              text = c;
            } else if (c.type === "init") {
              text = `Initialized variable '${c.var}' to ${c.new}`;
            } else if (c.type === "delete") {
              text = `Deleted variable '${c.var}' (was ${c.old})`;
            } else if (c.type === "print" || c.type === "note" || c.var === "unknown") {
              // Verbatim narrative events (e.g. `printed "6"`, `condition … evaluated
              // to true`, `loop exited`) carry the whole message in `new`.
              text = c.new;
            } else {
              text = `Updated variable '${c.var}' from ${c.old} to ${c.new}`;
            }

            return (
              <li
                key={i}
                data-testid={TF.changeItem(i)}
                className="tf-fade-in flex items-start gap-2 text-[12.5px] text-[hsl(var(--tf-text))]"
              >
                <span className="mt-1 w-1 h-1 rounded-full bg-[hsl(var(--tf-accent))] shrink-0" />
                <span className="mono leading-relaxed">{text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
