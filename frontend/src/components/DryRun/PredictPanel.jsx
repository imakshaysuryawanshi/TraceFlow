import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

export default function PredictPanel() {
  const activeQuiz = useTraceStore((s) => s.activeQuiz);
  const selectedAnswer = useTraceStore((s) => s.selectedAnswer);
  const quizSubmitted = useTraceStore((s) => s.quizSubmitted);
  const quizAnsweredCorrectly = useTraceStore((s) => s.quizAnsweredCorrectly);
  const selectQuizAnswer = useTraceStore((s) => s.selectQuizAnswer);
  const submitQuizAnswer = useTraceStore((s) => s.submitQuizAnswer);
  const step = useTraceStore(selectCurrentStep);

  if (!activeQuiz) {
    return (
      <div className="border border-[hsl(var(--tf-border))] rounded-lg p-5 bg-[hsl(var(--tf-panel))] text-center space-y-3 shadow-sm">
        <CheckCircle2 className="w-8 h-8 text-[hsl(var(--tf-success))] mx-auto" />
        <span className="block text-[12px] uppercase font-bold tracking-wider text-[hsl(var(--tf-text-muted))]">
          Predict Mode Completed
        </span>
        <p className="text-[12.5px] text-[hsl(var(--tf-text-muted))] leading-relaxed">
          You've reached the final step of this trace! Try editing input variables to auto-generate a new dry run prediction challenge.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-[hsl(var(--tf-border))] rounded-lg p-4 bg-[hsl(var(--tf-panel))] shadow-sm space-y-4">
      {/* Quiz Title */}
      <div className="flex items-center gap-2 text-[hsl(var(--tf-accent))] border-b border-[hsl(var(--tf-border))]/50 pb-2.5">
        <Sparkles className="w-4.5 h-4.5" />
        <span className="text-[11px] uppercase font-bold tracking-wider">
          Practice Quiz: Predict the next step
        </span>
      </div>

      {/* Question */}
      <div className="text-[13px] font-semibold text-[hsl(var(--tf-text))] leading-relaxed">
        {activeQuiz.question}
      </div>

      {/* Answer Options Grid */}
      <div className="grid grid-cols-2 gap-2">
        {activeQuiz.options.map((opt) => {
          const isSelected = selectedAnswer === opt;
          const isCorrectOption = opt === activeQuiz.correctAnswer;
          
          let btnStyle = "border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/40 text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:border-[hsl(var(--tf-text-muted))]/80";
          
          if (quizSubmitted) {
            if (isCorrectOption) {
              btnStyle = "border-[hsl(var(--tf-success))] bg-[hsl(var(--tf-success))]/10 text-[hsl(var(--tf-success))] font-bold shadow-[0_0_8px_rgba(34,197,94,0.05)]";
            } else if (isSelected) {
              btnStyle = "border-[hsl(var(--tf-danger))] bg-[hsl(var(--tf-danger))]/10 text-[hsl(var(--tf-danger))]";
            }
          } else if (isSelected) {
            btnStyle = "border-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] font-bold";
          }

          return (
            <button
              key={opt}
              disabled={quizSubmitted && quizAnsweredCorrectly}
              onClick={() => selectQuizAnswer(opt)}
              className={`text-left p-3 rounded-lg border text-[12px] mono transition-all duration-150 active:scale-98 select-none break-all ${btnStyle}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {/* Controls & Feedback */}
      <div className="pt-1.5 flex flex-col gap-3">
        {!quizAnsweredCorrectly && (
          <div className="flex items-center gap-3">
            <button
              onClick={submitQuizAnswer}
              disabled={!selectedAnswer}
              className="px-4 py-2 rounded-md bg-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent-2))] text-black font-bold text-[11.5px] transition-all disabled:opacity-50 active:scale-95 select-none"
            >
              Submit Answer
            </button>
            {quizSubmitted && !quizAnsweredCorrectly && (
              <div className="flex items-start gap-1.5 text-[11.5px] text-[hsl(var(--tf-warning))] leading-normal bg-[hsl(var(--tf-warning))]/5 border border-[hsl(var(--tf-warning))]/20 p-2 rounded-md flex-1">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Incorrect. Hint: {activeQuiz.hint}</span>
              </div>
            )}
          </div>
        )}

        {/* Correct answer state */}
        {quizAnsweredCorrectly && (
          <div className="p-3 rounded-lg bg-[hsl(var(--tf-success))]/10 border border-[hsl(var(--tf-success))]/20 space-y-2 tf-fade-in">
            <div className="text-[12px] font-bold text-[hsl(var(--tf-success))] flex items-center gap-1.5 select-none">
              <CheckCircle2 className="w-4 h-4" />
              <span>Correct! Playback controls unlocked.</span>
            </div>
            <div className="text-[12.5px] text-[hsl(var(--tf-text-muted))] leading-relaxed font-medium">
              {step.reasoning?.explanation || step.explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
