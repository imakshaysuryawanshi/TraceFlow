import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { Sparkles } from "lucide-react";

/**
 * RIGHT panel — AI Explanation & Thinking Simulator Panel.
 * Supports Study Mode (generic descriptions) and Practice Mode (active prediction).
 */
export default function AIExplanation() {
  const step = useTraceStore(selectCurrentStep);
  const currentStepIdx = useTraceStore((s) => s.currentStep);
  const trace = useTraceStore((s) => s.trace);

  const practiceModeEnabled = useTraceStore((s) => s.practiceModeEnabled);
  const activeQuiz = useTraceStore((s) => s.activeQuiz);
  const selectedAnswer = useTraceStore((s) => s.selectedAnswer);
  const quizSubmitted = useTraceStore((s) => s.quizSubmitted);
  const quizAnsweredCorrectly = useTraceStore((s) => s.quizAnsweredCorrectly);
  const togglePracticeMode = useTraceStore((s) => s.togglePracticeMode);
  const selectQuizAnswer = useTraceStore((s) => s.selectQuizAnswer);
  const submitQuizAnswer = useTraceStore((s) => s.submitQuizAnswer);

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
        <button
          onClick={togglePracticeMode}
          className={`ml-auto px-2 py-0.5 rounded text-[9.5px] uppercase font-bold tracking-wider transition-all select-none duration-200 active:scale-95 ${
            practiceModeEnabled
              ? "bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] border border-[hsl(var(--tf-accent))]/30 shadow-[0_0_8px_rgba(34,211,238,0.1)]"
              : "text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] border border-[hsl(var(--tf-border))]"
          }`}
          title="Toggle Practice mode to challenge yourself on predicting updates"
        >
          {practiceModeEnabled ? "Practice Active" : "Practice Mode"}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {step ? (
          <div key={currentStepIdx} className="tf-fade-in">
            <div className="flex items-center gap-2 mb-2 text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] select-none">
              <span>step {currentStepIdx + 1}</span>
              <span>·</span>
              <span className="mono">line {step.line}</span>
            </div>

            {practiceModeEnabled && activeQuiz ? (
              (() => {
                const quiz = activeQuiz;
                const correctAnswer = quiz.correctAnswer;
                const hint = quiz.hint;

                return (
                  <div className="p-3.5 rounded bg-[hsl(var(--tf-panel-2))] border border-[hsl(var(--tf-border))] space-y-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[hsl(var(--tf-accent))] font-bold select-none">
                      <span>Practice Quiz</span>
                      <span>·</span>
                      <span>Next Step Prediction</span>
                    </div>
                    <div className="text-[13px] font-semibold text-[hsl(var(--tf-text))] leading-relaxed">
                      {quiz.question}
                    </div>
                    
                    <div className="space-y-2">
                      {quiz.options.map((opt) => {
                        const isSelected = selectedAnswer === opt;
                        const isCorrectOption = opt === correctAnswer;
                        let btnStyle = "border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:border-[hsl(var(--tf-text-muted))]";
                        
                        if (quizSubmitted) {
                          if (isCorrectOption) {
                            btnStyle = "border-[hsl(var(--tf-success))] bg-[hsl(var(--tf-success))]/10 text-[hsl(var(--tf-success))] font-semibold";
                          } else if (isSelected) {
                            btnStyle = "border-[hsl(var(--tf-danger))] bg-[hsl(var(--tf-danger))]/10 text-[hsl(var(--tf-danger))]";
                          }
                        } else if (isSelected) {
                          btnStyle = "border-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] font-semibold";
                        }

                        return (
                          <button
                            key={opt}
                            disabled={quizSubmitted && quizAnsweredCorrectly}
                            onClick={() => selectQuizAnswer(opt)}
                            className={`w-full text-left p-2.5 rounded border text-[12.5px] mono transition-all ${btnStyle}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      {!quizAnsweredCorrectly && (
                        <button
                          onClick={submitQuizAnswer}
                          disabled={!selectedAnswer}
                          className="px-4 py-1.5 rounded bg-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent-2))] text-black font-bold text-[11.5px] transition-all disabled:opacity-50 active:scale-95 select-none"
                        >
                          Submit
                        </button>
                      )}
                      {quizSubmitted && !quizAnsweredCorrectly && (
                        <div className="text-[11.5px] text-[hsl(var(--tf-warning))] leading-relaxed">
                          ❌ Try again! Hint: {hint}
                        </div>
                      )}
                    </div>

                    {quizAnsweredCorrectly && (
                      <div className="p-3 rounded bg-[hsl(var(--tf-success))]/10 border border-[hsl(var(--tf-success))]/20 space-y-2 mt-2">
                        <div className="text-[12px] font-semibold text-[hsl(var(--tf-success))] flex items-center gap-1 select-none">
                          <span>✓ Correct! Timeline unlocked.</span>
                        </div>
                        <div className="text-[12.5px] text-[hsl(var(--tf-text))] leading-relaxed">
                          {step.reasoning?.explanation || step.explanation}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            ) : (
              <>
                <p
                  data-testid={TF.aiExplanationText}
                  className="text-[13.5px] leading-[1.7] text-[hsl(var(--tf-text))]"
                >
                  {step.reasoning?.explanation || step.explanation}
                </p>

                <div className="mt-6 pt-4 border-t border-[hsl(var(--tf-border))]">
                  <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-2 select-none">
                    Focus
                  </div>
                  <div className="mono text-[12px] text-[hsl(var(--tf-text-muted))] leading-relaxed">
                    {step.reasoning?.why_executed || step.label}
                  </div>
                </div>

                {trace && (
                  <div className="mt-6 pt-4 border-t border-[hsl(var(--tf-border))]">
                    <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-2 select-none">
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

                {trace && trace.patterns && trace.patterns.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-[hsl(var(--tf-border))]">
                    <div className="text-[10.5px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))] mb-2 select-none">
                      Patterns Detected
                    </div>
                    <div className="space-y-3">
                      {trace.patterns.map((p, idx) => (
                        <div key={idx} className="p-2.5 rounded bg-[hsl(var(--tf-panel))] border border-[hsl(var(--tf-border))]">
                          <div className="text-[12px] font-semibold text-[hsl(var(--tf-accent))] flex items-center gap-1.5 select-none">
                            💡 {p.name} {p.variable && <span className="text-[10.5px] mono text-[hsl(var(--tf-text-muted))]">({p.variable})</span>}
                          </div>
                          <div className="text-[11.5px] text-[hsl(var(--tf-text-muted))] mt-1 leading-relaxed">
                            {p.description}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="text-[hsl(var(--tf-text-dim))] text-sm">
            Load a sample to see an explanation.
          </div>
        )}
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
      "nested-loops": "Nested Loops",
      "min-max": "Min / Max Search",
      "flag": "Boolean Flag",
      "string-accum": "String Accumulation",
      "arrays": "Arrays",
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
      "nested-loops":
        "A loop inside a loop body. The inner loop completes fully for each iteration of the outer loop, which is where O(n^2) work comes from.",
      "min-max":
        "A variable is updated only when a comparison against the current candidate succeeds, so it tracks the best value seen so far.",
      "flag":
        "A boolean variable that flips its value to switch behavior or signal a state change, e.g. toggling on/off each iteration.",
      "string-accum":
        "A string variable that grows by concatenation on each iteration, commonly used to build output or a result string.",
      "arrays":
        "An array stores several values under one name. Elements are read and written by index — like b[i] — and b.length gives its size. Indices start at 0.",
    }[c] || ""
  );
}
