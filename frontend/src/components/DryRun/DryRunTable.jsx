import { useMemo } from "react";
import { useTraceStore } from "@/store/traceStore";

export default function DryRunTable() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore((s) => s.currentStep);
  const goTo = useTraceStore((s) => s.goTo);

  const steps = useMemo(() => {
    return trace ? (trace.trace || trace.steps || []) : [];
  }, [trace]);

  // Extract all unique variables across all steps dynamically
  const uniqueVars = useMemo(() => {
    const varsSet = new Set();
    steps.forEach((s) => {
      const stepVars = s.state?.variables || s.variables || {};
      Object.keys(stepVars).forEach((k) => varsSet.add(k));
    });
    return Array.from(varsSet).sort();
  }, [steps]);

  // Format any variable value to string cleanly
  const formatVal = (val) => {
    if (val === undefined || val === null) return "-";
    if (typeof val === "boolean") return val ? "true" : "false";
    if (Array.isArray(val)) return `[${val.join(", ")}]`;
    return String(val);
  };

  if (steps.length === 0) {
    return (
      <div className="p-4 text-center text-[12px] italic text-[hsl(var(--tf-text-dim))]">
        No execution steps to show.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse font-mono text-[11px] leading-normal">
        <thead>
          <tr className="border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/60 text-[hsl(var(--tf-text-muted))]">
            <th className="px-2 py-1.5 font-bold text-center w-10">Step</th>
            <th className="px-2 py-1.5 font-bold text-center w-10">Line</th>
            <th className="px-2.5 py-1.5 font-bold min-w-[80px]">Condition</th>
            <th className="px-2.5 py-1.5 font-bold min-w-[120px]">Action</th>
            {uniqueVars.map((v) => (
              <th key={v} className="px-2.5 py-1.5 font-bold text-[hsl(var(--tf-accent))] min-w-[60px]">
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, idx) => {
            const isActive = idx === currentStep;
            const isCondition = s.kind === "condition" || s.type === "condition";
            const stepVars = s.state?.variables || s.variables || {};
            
            // Check if a variable changed in this specific step
            const changes = s.changes || [];
            const changedVars = new Set(
              changes
                .filter((c) => typeof c === "object" && c !== null && c.var)
                .map((c) => c.var)
            );

            return (
              <tr
                key={idx}
                onClick={() => goTo(idx)}
                className={`border-b border-[hsl(var(--tf-border))]/40 cursor-pointer transition-colors duration-150 ${
                  isActive
                    ? "bg-[hsl(var(--tf-accent))]/10 border-l-[3px] border-l-[hsl(var(--tf-accent))] text-[hsl(var(--tf-text))] font-semibold"
                    : "hover:bg-[hsl(var(--tf-panel-2))]/40 text-[hsl(var(--tf-text-muted))]"
                }`}
              >
                <td className="px-2 py-2 text-center text-[hsl(var(--tf-text-dim))] tabular-nums">
                  {idx + 1}
                </td>
                <td className="px-2 py-2 text-center text-[hsl(var(--tf-text-dim))] tabular-nums">
                  {s.line}
                </td>
                <td className="px-2.5 py-2 truncate max-w-[140px]" title={s.condition || ""}>
                  {isCondition && s.condition ? (
                    <span className="flex items-center gap-1">
                      <span className="truncate">{s.condition}</span>
                      <span className={s.condition_result ? "text-[hsl(var(--tf-success))]" : "text-[hsl(var(--tf-danger))]"}>
                        {s.condition_result ? "✓" : "✗"}
                      </span>
                    </span>
                  ) : (
                    <span className="text-[hsl(var(--tf-text-dim))]">-</span>
                  )}
                </td>
                <td className="px-2.5 py-2 truncate max-w-[200px]" title={s.code || ""}>
                  <span className={isActive ? "text-[hsl(var(--tf-text))]" : "text-[hsl(var(--tf-text-muted))]"}>
                    {s.code || "/* code */"}
                  </span>
                </td>
                {uniqueVars.map((v) => {
                  const hasValue = v in stepVars;
                  const isChanged = changedVars.has(v);
                  return (
                    <td
                      key={v}
                      className={`px-2.5 py-2 tabular-nums ${
                        isChanged
                          ? "text-[hsl(var(--tf-success))] font-bold bg-[hsl(var(--tf-success))]/5"
                          : hasValue
                            ? "text-[hsl(var(--tf-text))]"
                            : "text-[hsl(var(--tf-text-dim))]"
                      }`}
                    >
                      {formatVal(stepVars[v])}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
