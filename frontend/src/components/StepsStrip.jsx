import { useEffect, useMemo, useRef } from "react";
import { useTraceStore } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { computeLoopContexts } from "@/schemas/traceSchema";

/**
 * Expandable execution timeline — a horizontal strip of clickable step chips.
 * Color-coded by step.kind so users can spot loops, prints, and conditions
 * at a glance. Clicking a chip seeks the timeline to that step.
 */
export default function StepsStrip() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const expanded = useTraceStore((s) => s.stripExpanded);
  const goTo = useTraceStore((s) => s.goTo);

  const loopCtx = useMemo(() => computeLoopContexts(trace), [trace]);

  const scrollRef = useRef(null);
  const activeRef = useRef(null);

  // Keep the active chip in view when the step advances.
  useEffect(() => {
    if (!expanded || !activeRef.current) return;
    activeRef.current.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [currentStep, expanded]);

  if (!trace || !expanded) return null;

  const steps = trace.trace || trace.steps || [];

  return (
    <div
      data-testid={TF.stepsStrip}
      className="border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/60"
    >
      <div
        ref={scrollRef}
        className="flex items-stretch gap-1.5 px-3 py-2.5 overflow-x-auto"
      >
        {steps.map((s, i) => (
          <StripChip
            key={i}
            step={s}
            idx={i}
            active={i === currentStep}
            past={i < currentStep}
            loopInfo={loopCtx.get(i)}
            onClick={() => goTo(i)}
            innerRef={i === currentStep ? activeRef : null}
          />
        ))}
      </div>
    </div>
  );
}

function StripChip({ step, idx, active, past, loopInfo, onClick, innerRef }) {
  const color = kindColor(step.kind);
  return (
    <button
      ref={innerRef}
      data-testid={TF.stripChip(idx)}
      onClick={onClick}
      title={`step ${idx + 1} · line ${step.line}${step.label ? " · " + step.label : ""}`}
      className={`group relative shrink-0 flex flex-col items-start gap-1 min-w-[64px] px-2 py-1.5 rounded-md border transition-colors text-left ${
        active
          ? "border-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/12 ring-1 ring-[hsl(var(--tf-accent))]/40"
          : past
            ? "border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] hover:border-[hsl(var(--tf-border-strong))]"
            : "border-[hsl(var(--tf-border))]/50 bg-transparent hover:border-[hsl(var(--tf-border))]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full ${color.dot} ${past ? "" : "opacity-50"}`}
        />
        <span
          className={`mono text-[11px] font-medium tabular-nums ${
            active ? "text-[hsl(var(--tf-text))]" : "text-[hsl(var(--tf-text-muted))]"
          }`}
        >
          {String(idx + 1).padStart(2, "0")}
        </span>
        <span className="mono text-[10px] text-[hsl(var(--tf-text-dim))]">
          L{step.line}
        </span>
      </div>
      <div
        className={`mono text-[10.5px] leading-tight ${
          active ? color.text : "text-[hsl(var(--tf-text-muted))] group-hover:text-[hsl(var(--tf-text))]"
        }`}
      >
        {step.kind || "step"}
      </div>
      {loopInfo && (
        <div className="mono text-[9.5px] text-[hsl(var(--tf-accent-2))]/80 tabular-nums">
          i{loopInfo.iteration}
        </div>
      )}
    </button>
  );
}

function kindColor(kind) {
  switch (kind) {
    case "declare":
    case "assign":
      return { dot: "bg-[hsl(var(--tf-accent))]", text: "text-[hsl(var(--tf-accent))]" };
    case "loop-init":
    case "loop-step":
      return { dot: "bg-[hsl(var(--tf-accent-2))]", text: "text-[hsl(var(--tf-accent-2))]" };
    case "condition":
      return { dot: "bg-[hsl(var(--tf-warning))]", text: "text-[hsl(var(--tf-warning))]" };
    case "print":
      return { dot: "bg-[hsl(var(--tf-success))]", text: "text-[hsl(var(--tf-success))]" };
    default:
      return { dot: "bg-[hsl(var(--tf-text-muted))]", text: "text-[hsl(var(--tf-text))]" };
  }
}
