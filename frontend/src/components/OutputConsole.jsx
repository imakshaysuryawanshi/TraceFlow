import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { Terminal } from "lucide-react";

/**
 * BOTTOM panel — Output console.
 * Only shows lines that have been printed as of the current step.
 * A pending line (about to be printed on the current step) is highlighted.
 */
export default function OutputConsole() {
  const step = useTraceStore(selectCurrentStep);
  const trace = useTraceStore((s) => s.trace);
  const currentStepIdx = useTraceStore((s) => s.currentStep);

  const output = step?.output || [];
  const steps = trace ? (trace.trace || trace.steps) : [];
  const prevOutput =
    trace && currentStepIdx > 0
      ? steps[currentStepIdx - 1]?.output || []
      : [];
  const newlyPrintedIndex = output.length > prevOutput.length ? output.length - 1 : -1;

  return (
    <div
      data-testid={TF.outputConsole}
      className="border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))]"
    >
      <div className="h-8 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))]">
        <Terminal className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--tf-text-muted))]">
          Output
        </span>
        <span className="text-[11px] mono text-[hsl(var(--tf-text-dim))]">
          System.out
        </span>
        <span className="ml-auto text-[10.5px] mono text-[hsl(var(--tf-text-dim))]">
          {output.length} line{output.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="px-4 py-2.5 min-h-[76px] max-h-[140px] overflow-y-auto mono text-[13px] leading-relaxed">
        {output.length === 0 ? (
          <div className="text-[hsl(var(--tf-text-dim))] italic">
            (no output yet)
          </div>
        ) : (
          output.map((line, i) => (
            <div
              key={i}
              data-testid={TF.outputLine(i)}
              className={`flex items-center gap-3 ${
                i === newlyPrintedIndex
                  ? "text-[hsl(var(--tf-success))]"
                  : "text-[hsl(var(--tf-text))]"
              }`}
            >
              <span className="text-[hsl(var(--tf-text-dim))] select-none">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{line}</span>
              {i === newlyPrintedIndex && (
                <span className="text-[9.5px] uppercase tracking-wider bg-[hsl(var(--tf-success))]/10 text-[hsl(var(--tf-success))] px-1.5 py-0.5 rounded border border-[hsl(var(--tf-success))]/25">
                  new
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
