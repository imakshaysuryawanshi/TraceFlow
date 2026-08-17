import { useState, useEffect, useRef } from "react";
import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { Sparkles, X, Loader2, Send, RotateCcw, AlertTriangle, CheckCircle, HelpCircle } from "lucide-react";

export default function InsightPanel() {
  const toggleInsight = useTraceStore((s) => s.toggleInsight);
  const clearInsightHistory = useTraceStore((s) => s.clearInsightHistory);
  const askInsight = useTraceStore((s) => s.askInsight);
  
  const trace = useTraceStore((s) => s.trace);
  const currentStepIdx = useTraceStore((s) => s.currentStep);
  const currentStep = useTraceStore(selectCurrentStep);
  const history = useTraceStore((s) => s.insightHistory);
  const pending = useTraceStore((s) => s.insightPending);

  const [inputVal, setInputVal] = useState("");
  const scrollRef = useRef(null);

  // Auto-scroll history on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, pending]);

  const totalSteps = trace ? (trace.trace || trace.steps || []).length : 0;

  const handleSend = () => {
    if (!inputVal.trim()) return;
    askInsight("custom", inputVal);
    setInputVal("");
  };

  const handleAction = (intent) => {
    askInsight(intent);
  };

  // Context classification
  const hasTrace = !!trace;
  const currentStepNum = currentStep ? currentStep.step : null;

  return (
    <div className="h-full flex flex-col border-l border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] text-[hsl(var(--tf-text))] text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[hsl(var(--tf-accent))]" />
          <span className="font-semibold text-sm">TraceFlow Insight</span>
        </div>
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={clearInsightHistory}
              title="Clear Insight history"
              className="p-1 rounded hover:bg-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={toggleInsight}
            className="p-1 rounded hover:bg-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Context Status Badge */}
      <div className="px-4 py-2 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/50 flex items-center justify-between text-xs text-[hsl(var(--tf-text-muted))]">
        <span>Active Context:</span>
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[hsl(var(--tf-border))] text-[hsl(var(--tf-text))] font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--tf-accent))] animate-pulse" />
          {hasTrace ? `Step ${currentStepNum} / ${totalSteps}` : "Full Code"}
        </div>
      </div>

      {/* Message History & Action Center */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 ? (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-1.5">
              <h3 className="font-medium text-[hsl(var(--tf-text))]">Welcome to TraceFlow Insight</h3>
              <p className="text-xs text-[hsl(var(--tf-text-muted))] max-w-[280px] mx-auto">
                Your context-aware programming mentor. Select a task below or ask custom questions.
              </p>
            </div>

            {/* Quick Actions Groups */}
            <div className="space-y-4">
              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[hsl(var(--tf-text-dim))] block mb-2">
                  What do you want to understand?
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAction("explain_logic")}
                    className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                  >
                    <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                      Explain Logic
                    </div>
                    <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                      Overview of active code mechanics.
                    </div>
                  </button>

                  <button
                    onClick={() => handleAction("explain_complexity")}
                    className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                  >
                    <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                      Explain Complexity
                    </div>
                    <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                      Time & Space complexity.
                    </div>
                  </button>

                  <button
                    onClick={() => handleAction("find_bugs")}
                    className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                  >
                    <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                      Find Possible Bugs
                    </div>
                    <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                      Scan code for errors/loops bounds.
                    </div>
                  </button>

                  {hasTrace && (
                    <button
                      onClick={() => handleAction("explain_step")}
                      className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                    >
                      <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                        Explain Step {currentStepNum}
                      </div>
                      <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                        Statement evaluation analysis.
                      </div>
                    </button>
                  )}

                  {hasTrace && currentStepIdx > 0 && (
                    <button
                      onClick={() => handleAction("why_change")}
                      className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                    >
                      <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                        Why Did This Change?
                      </div>
                      <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                        Explain variable mutations.
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[hsl(var(--tf-text-dim))] block mb-2">
                  Practice & Challenge
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleAction("challenge_me")}
                    className="p-2.5 rounded-lg border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-left hover:border-[hsl(var(--tf-accent))]/50 transition-colors group"
                  >
                    <div className="font-medium text-xs text-[hsl(var(--tf-text))] group-hover:text-[hsl(var(--tf-accent))] transition-colors">
                      Challenge Me
                    </div>
                    <div className="text-[10px] text-[hsl(var(--tf-text-muted))] mt-0.5">
                      Quiz my understanding.
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((msg) => (
              <div key={msg.id} className="space-y-2">
                {/* User Prompt */}
                <div className="flex justify-end">
                  <div className="bg-[hsl(var(--tf-border-strong))] text-[hsl(var(--tf-text))] rounded-lg px-3 py-2 max-w-[85%] text-xs font-medium">
                    {msg.question}
                  </div>
                </div>

                {/* Insight Response Card */}
                <div className="flex justify-start">
                  <div className="border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))] rounded-lg p-3 w-full space-y-3">
                    <div className="flex items-center justify-between border-b border-[hsl(var(--tf-border))] pb-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--tf-accent))]" />
                        <span className="font-semibold text-xs text-[hsl(var(--tf-text))]">
                          {msg.response.title}
                        </span>
                      </div>
                      {msg.response.status === "error" && (
                        <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--tf-danger))]" />
                      )}
                    </div>

                    <p className="text-xs text-[hsl(var(--tf-text))] leading-relaxed">
                      {msg.response.summary}
                    </p>

                    {msg.response.explanation && msg.response.explanation.length > 0 && (
                      <ul className="space-y-1.5 list-disc pl-4 text-xs text-[hsl(var(--tf-text-muted))]">
                        {msg.response.explanation.map((item, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {item}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Evidence section */}
                    {msg.response.evidence && Object.keys(msg.response.evidence.variables || {}).length > 0 && (
                      <div className="bg-[hsl(var(--tf-bg))]/50 rounded p-2 border border-[hsl(var(--tf-border))] text-[11px]">
                        <span className="font-semibold text-[hsl(var(--tf-text))] block mb-1">State Mutation Evidence:</span>
                        <div className="space-y-1">
                          {Object.entries(msg.response.evidence.variables).map(([name, val]) => (
                            <div key={name} className="flex items-center justify-between font-mono">
                              <span className="text-[hsl(var(--tf-text-dim))]">{name}:</span>
                              <span className="text-[hsl(var(--tf-text-muted))]">
                                {JSON.stringify(val.before)} ➔ <span className="text-[hsl(var(--tf-success))] font-bold">{JSON.stringify(val.after)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow up suggestions */}
                    {msg.response.followUp && msg.response.followUp.text && (
                      <div className="border-t border-[hsl(var(--tf-border))] pt-2 flex items-start gap-1.5 text-xs text-[hsl(var(--tf-text-dim))]">
                        <HelpCircle className="w-3.5 h-3.5 text-[hsl(var(--tf-accent))] mt-0.5 shrink-0" />
                        <span className="italic leading-relaxed">{msg.response.followUp.text}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {pending && (
              <div className="flex justify-start">
                <div className="border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))] rounded-lg p-3 w-full flex items-center gap-2 text-xs text-[hsl(var(--tf-text-muted))]">
                  <Loader2 className="w-4 h-4 text-[hsl(var(--tf-accent))] animate-spin" />
                  <span>Synthesizing dynamic trace context...</span>
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        )}
      </div>

      {/* Input Tray */}
      <div className="p-3 border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Insight anything..."
            className="flex-1 h-9 px-3 rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-bg))] text-xs placeholder-[hsl(var(--tf-text-dim))] text-[hsl(var(--tf-text))] outline-none focus:border-[hsl(var(--tf-accent))]/50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!inputVal.trim() || pending}
            className="w-9 h-9 flex items-center justify-center rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent))]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
