import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { Sparkles } from "lucide-react";

/**
 * RIGHT panel — AI Explanation (mocked in Phase 4).
 * Explanations are baked into every trace step. Phase 9 will replace the
 * text source with a real LLM call — the UI stays identical.
 */
export default function AIExplanation() {
  const step = useTraceStore(selectCurrentStep);
  const currentStepIdx = useTraceStore((s) => s.currentStep);
  const trace = useTraceStore((s) => s.trace);

  return (
    <div
      data-testid={TF.aiPanel}
      className="h-full flex flex-col bg-[hsl(var(--tf-bg))]"
    >
      {/* Header */}
      <div className="h-9 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0">
        <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--tf-accent))]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold">
          Explanation
        </span>
        <span className="ml-auto text-[10px] mono text-[hsl(var(--tf-text-dim))] px-1.5 py-0.5 rounded border border-[hsl(var(--tf-border))]">
          mock
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {step ? (
          <div key={currentStepIdx} className="tf-fade-in">
            <div className="flex items-center gap-2 mb-2 text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))]">
              <span>step {currentStepIdx + 1}</span>
              <span>·</span>
              <span className="mono">line {step.line}</span>
            </div>
            <p
              data-testid={TF.aiExplanationText}
              className="text-[13.5px] leading-[1.7] text-[hsl(var(--tf-text))]"
            >
              {step.explanation}
            </p>

            <div className="mt-6 pt-4 border-t border-[hsl(var(--tf-border))]">
              <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-2">
                Focus
              </div>
              <div className="mono text-[12px] text-[hsl(var(--tf-text-muted))] leading-relaxed">
                {step.label}
              </div>
            </div>

            {trace && (
              <div className="mt-6 pt-4 border-t border-[hsl(var(--tf-border))]">
                <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-2">
                  Concept
                </div>
                <div className="text-[12.5px] text-[hsl(var(--tf-text))]">
                  {conceptTitle(trace.concept)}
                </div>
                <div className="text-[11.5px] text-[hsl(var(--tf-text-muted))] mt-1 leading-relaxed">
                  {conceptHint(trace.concept)}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-[hsl(var(--tf-text-dim))] text-sm">
            Load a sample to see an explanation.
          </div>
        )}
      </div>

      <div className="border-t border-[hsl(var(--tf-border))] px-3 py-2 text-[10.5px] text-[hsl(var(--tf-text-dim))] mono">
        AI explanations are mocked in this phase.
      </div>
    </div>
  );
}

function conceptTitle(c) {
  return (
    {
      "for-loop": "For loop",
      "while-loop": "While loop",
      "if-else": "If / Else",
    }[c] || c
  );
}

function conceptHint(c) {
  return (
    {
      "for-loop":
        "A for loop runs an initializer once, then repeats a body while the condition holds, running the update after each iteration.",
      "while-loop":
        "A while loop re-checks its condition before every iteration and stops as soon as the condition becomes false.",
      "if-else":
        "An if/else statement evaluates a condition once and executes exactly one of its two branches.",
    }[c] || ""
  );
}
