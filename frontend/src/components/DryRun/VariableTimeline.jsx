import { useMemo, useRef, useEffect } from "react";
import { useTraceStore } from "@/store/traceStore";

export default function VariableTimeline() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);

  const steps = useMemo(() => {
    return trace ? (trace.trace || trace.steps || []) : [];
  }, [trace]);

  // Extract variables
  const uniqueVars = useMemo(() => {
    const varsSet = new Set();
    steps.forEach((s) => {
      const stepVars = s.state?.variables || s.variables || {};
      Object.keys(stepVars).forEach((k) => varsSet.add(k));
    });
    return Array.from(varsSet).sort();
  }, [steps]);

  // Clean value formater
  const formatVal = (val) => {
    if (val === undefined || val === null) return "-";
    if (typeof val === "boolean") return val ? "T" : "F";
    return String(val);
  };

  if (uniqueVars.length === 0) {
    return (
      <div className="text-[12px] italic text-[hsl(var(--tf-text-dim))]">
        No variables initialized yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 py-1">
      {uniqueVars.map((v) => (
        <VariableTimelineRow
          key={v}
          varName={v}
          steps={steps}
          currentStep={currentStep}
          formatVal={formatVal}
        />
      ))}
    </div>
  );
}

function VariableTimelineRow({ varName, steps, currentStep, formatVal }) {
  const rowRef = useRef(null);

  // Auto-scroll the active step node into view
  useEffect(() => {
    const activeNode = rowRef.current?.querySelector("[data-active='true']");
    if (activeNode) {
      activeNode.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [currentStep]);

  // Generate sequence of values for this variable at each step
  const valueSequence = useMemo(() => {
    return steps.map((s, idx) => {
      const stepVars = s.state?.variables || s.variables || {};
      const val = stepVars[varName];
      
      // Determine if it changed on this step
      const changes = s.changes || [];
      const isChanged = changes.some(
        (c) => typeof c === "object" && c !== null && c.var === varName
      );

      return {
        value: val,
        isChanged,
        stepNum: idx + 1,
        line: s.line,
      };
    });
  }, [steps, varName]);

  return (
    <div className="space-y-1.5">
      {/* Variable Label */}
      <span className="mono text-[11px] font-bold text-[hsl(var(--tf-accent))]">
        {varName}
      </span>

      {/* Horizontal Scroll Track */}
      <div
        ref={rowRef}
        className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin select-none"
      >
        {valueSequence.map((item, idx) => {
          const isActive = idx === currentStep;
          const hasValue = item.value !== undefined;

          return (
            <div key={idx} className="flex items-center gap-1.5 shrink-0">
              {/* Step State Node */}
              <div
                data-active={isActive}
                className={`flex flex-col items-center justify-center min-w-[34px] h-[34px] rounded-md border text-center transition-all ${
                  isActive
                    ? "bg-[hsl(var(--tf-accent))] text-[hsl(var(--tf-bg))] border-[hsl(var(--tf-accent))] shadow-[0_0_8px_rgba(34,211,238,0.3)] scale-105"
                    : item.isChanged
                      ? "bg-[hsl(var(--tf-success))]/10 text-[hsl(var(--tf-success))] border-[hsl(var(--tf-success))]/35 font-bold"
                      : hasValue
                        ? "bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] border-[hsl(var(--tf-border))]"
                        : "bg-transparent text-[hsl(var(--tf-text-dim))] border-[hsl(var(--tf-border))]/30 border-dashed"
                }`}
                title={`Step ${item.stepNum} (Line ${item.line}): ${varName} = ${formatVal(item.value)}`}
              >
                <span className="mono text-[10.5px] font-semibold tabular-nums leading-none">
                  {formatVal(item.value)}
                </span>
                <span className={`text-[7.5px] mono mt-0.5 leading-none ${
                  isActive ? "text-[hsl(var(--tf-bg))]/75" : "text-[hsl(var(--tf-text-dim))]"
                }`}>
                  s{item.stepNum}
                </span>
              </div>

              {/* Arrow connector */}
              {idx < valueSequence.length - 1 && (
                <span className={`text-[10px] mono shrink-0 ${
                  idx < currentStep
                    ? "text-[hsl(var(--tf-text-muted))]"
                    : "text-[hsl(var(--tf-text-dim))]/30"
                }`}>
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
