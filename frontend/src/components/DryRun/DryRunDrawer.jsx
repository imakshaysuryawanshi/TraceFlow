import { useMemo } from "react";
import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import DryRunTable from "./DryRunTable";
import VariableTimeline from "./VariableTimeline";
import PredictPanel from "./PredictPanel";
import { ArrowLeft, ArrowRight, RotateCcw, X, Eye, Play, Pause, Compass, Sparkles, Keyboard, Copy } from "lucide-react";
import { toast } from "sonner";

export default function DryRunDrawer() {
  const trace = useTraceStore((s) => s.trace);
  const currentStepIdx = useTraceStore((s) => s.currentStep);
  const isPlaying = useTraceStore((s) => s.isPlaying);
  const play = useTraceStore((s) => s.play);
  const pause = useTraceStore((s) => s.pause);
  const next = useTraceStore((s) => s.next);
  const prev = useTraceStore((s) => s.prev);
  const replay = useTraceStore((s) => s.replay);
  const toggleDryRun = useTraceStore((s) => s.toggleDryRun);

  const dryRunMode = useTraceStore((s) => s.dryRunMode);
  const setDryRunMode = useTraceStore((s) => s.setDryRunMode);

  const step = useTraceStore(selectCurrentStep);

  const stepsList = useMemo(() => {
    return trace ? (trace.trace || trace.steps || []) : [];
  }, [trace]);

  const currentLoop = useMemo(() => {
    if (!step || !step.control || step.control.iteration === null || step.control.iteration === undefined) {
      return null;
    }
    return {
      iteration: step.control.iteration,
      condition: step.control.condition,
    };
  }, [step]);

  const handleCopyTable = () => {
    try {
      const varsSet = new Set();
      stepsList.forEach((s) => {
        const stepVars = s.state?.variables || s.variables || {};
        Object.keys(stepVars).forEach((k) => varsSet.add(k));
      });
      const uniqueVars = Array.from(varsSet).sort();

      const headers = ["Step", "Line", "Condition", "Action", ...uniqueVars, "Explanation"];

      const rows = stepsList.map((s, idx) => {
        const stepNum = idx + 1;
        const line = s.line;
        
        const isCondition = s.kind === "condition" || s.type === "condition";
        let conditionStr = "-";
        if (isCondition && s.condition) {
          conditionStr = `${s.condition} (${s.condition_result ? "true" : "false"})`;
        }

        const action = s.code || "";
        const stepVars = s.state?.variables || s.variables || {};

        const varVals = uniqueVars.map((v) => {
          const val = stepVars[v];
          if (val === undefined || val === null) return "-";
          if (typeof val === "boolean") return val ? "true" : "false";
          if (Array.isArray(val)) return `[${val.join(", ")}]`;
          return String(val);
        });

        return [
          stepNum,
          line,
          conditionStr,
          action,
          ...varVals,
          s.explanation || ""
        ].map(val => {
          return String(val).replace(/\r?\n|\r/g, " ").replace(/\t/g, " ");
        });
      });

      const tsvContent = [
        headers.join("\t"),
        ...rows.map(row => row.join("\t"))
      ].join("\n");

      navigator.clipboard.writeText(tsvContent);
      toast.success("Table copied to clipboard!", {
        description: "Paste directly into Excel or Google Sheets.",
        duration: 3000,
      });
    } catch (err) {
      toast.error("Failed to copy table.");
    }
  };

  if (!trace || !step) {
    return (
      <div className="h-full flex items-center justify-center text-[hsl(var(--tf-text-dim))] text-sm">
        Loading Dry Run…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[hsl(var(--tf-bg))] border-l border-[hsl(var(--tf-border))] select-none">
      {/* Header */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-[hsl(var(--tf-accent))]" />
          <span className="text-[12px] uppercase tracking-[0.16em] font-bold text-[hsl(var(--tf-text))]">
            Dry Run Simulator
          </span>
        </div>
        <button
          onClick={toggleDryRun}
          className="p-1 rounded hover:bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors"
          title="Exit Dry Run"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Concept Summary Banner */}
      <div className="px-4 py-2 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/30 flex items-center justify-between text-[11px] mono text-[hsl(var(--tf-text-muted))]">
        <div className="flex items-center gap-1.5 capitalize">
          <span>{trace.concept || "Custom snippet"}</span>
          {trace.patterns && trace.patterns.length > 0 && (
            <>
              <span className="text-[hsl(var(--tf-text-dim))]">•</span>
              <span className="text-[hsl(var(--tf-accent))]">{trace.patterns[0].name}</span>
            </>
          )}
        </div>
        <div className="tabular-nums flex items-center gap-2">
          <span>step {currentStepIdx + 1} / {stepsList.length}</span>
          {currentLoop && (
            <>
              <span className="text-[hsl(var(--tf-text-dim))]">•</span>
              <span className="text-[hsl(var(--tf-accent-2))]">iteration {currentLoop.iteration}</span>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))]/50 shrink-0">
        <button
          onClick={() => setDryRunMode("guided")}
          className={`flex-1 py-2 text-[11px] uppercase tracking-wider font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            dryRunMode === "guided"
              ? "border-[hsl(var(--tf-accent))] text-[hsl(var(--tf-accent))]"
              : "border-transparent text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))]"
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          Guided
        </button>
        <button
          onClick={() => setDryRunMode("predict")}
          className={`flex-1 py-2 text-[11px] uppercase tracking-wider font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            dryRunMode === "predict"
              ? "border-[hsl(var(--tf-accent))] text-[hsl(var(--tf-accent))]"
              : "border-transparent text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))]"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Predict
        </button>
        <button
          onClick={() => setDryRunMode("practice")}
          className={`flex-1 py-2 text-[11px] uppercase tracking-wider font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
            dryRunMode === "practice"
              ? "border-[hsl(var(--tf-accent))] text-[hsl(var(--tf-accent))]"
              : "border-transparent text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))]"
          }`}
        >
          <Keyboard className="w-3.5 h-3.5" />
          Practice
        </button>
      </div>

      {/* Main Panel Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {dryRunMode === "guided" ? (
          <>
            {/* Steps Table Section */}
            <div className="border border-[hsl(var(--tf-border))] rounded-lg overflow-hidden bg-[hsl(var(--tf-panel))] shadow-sm">
              <div className="px-3 py-1.5 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))]/40 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-[hsl(var(--tf-text-muted))]">
                  Execution Steps Table
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[9.5px] text-[hsl(var(--tf-text-dim))] italic hidden sm:inline">
                    Click any row to seek
                  </span>
                  <button
                    onClick={handleCopyTable}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[9.5px] font-bold uppercase tracking-wider border border-[hsl(var(--tf-border))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:bg-[hsl(var(--tf-panel-2))] active:scale-95 transition-all select-none"
                    title="Copy this execution steps table for Excel"
                  >
                    <Copy className="w-2.5 h-2.5" />
                    Copy
                  </button>
                </div>
              </div>
              <DryRunTable />
            </div>

            {/* Dynamic Step Detail Card */}
            <StepDetailsCard step={step} />

            {/* Variable Timeline Section */}
            <div className="border border-[hsl(var(--tf-border))] rounded-lg p-3 bg-[hsl(var(--tf-panel))] shadow-sm">
              <span className="block text-[10px] uppercase font-bold tracking-wider text-[hsl(var(--tf-text-muted))] mb-2">
                Variable Evolution Timeline
              </span>
              <VariableTimeline />
            </div>
          </>
        ) : dryRunMode === "predict" ? (
          <PredictPanel />
        ) : (
          <PracticeInstructionsPanel />
        )}
      </div>

      {/* Footer Playback Controls */}
      <div className="h-14 border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] flex items-center justify-between px-4 shrink-0">
        <button
          onClick={replay}
          className="p-2 rounded-md hover:bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors active:scale-95"
          title="Restart Trace"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            disabled={currentStepIdx === 0}
            className="p-2 rounded-md hover:bg-[hsl(var(--tf-panel-2))] disabled:opacity-40 text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          {dryRunMode === "guided" && (
            <button
              onClick={isPlaying ? pause : play}
              className="p-2 rounded-md hover:bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-accent))] transition-colors active:scale-95"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={next}
            disabled={currentStepIdx === stepsList.length - 1}
            className="p-2 rounded-md hover:bg-[hsl(var(--tf-panel-2))] disabled:opacity-40 text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors active:scale-95"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="text-[11px] mono text-[hsl(var(--tf-text-dim))]">
          Line {step.line}
        </div>
      </div>
    </div>
  );
}

function StepDetailsCard({ step }) {
  const reasoning = step.reasoning || {};
  return (
    <div className="border border-[hsl(var(--tf-border))] rounded-lg p-3.5 bg-[hsl(var(--tf-panel))] shadow-sm space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase font-bold tracking-wider text-[hsl(var(--tf-text-muted))]">
          Step Detail
        </span>
        <span className="mono text-[11px] text-[hsl(var(--tf-text-dim))]">
          line {step.line}
        </span>
      </div>

      <div className="rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))]/40 p-2.5 mono text-[12.5px] text-[hsl(var(--tf-text))]">
        {step.code || "/* code */"}
      </div>

      <div className="space-y-2 text-[12px] leading-relaxed">
        {step.condition && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-semibold text-[hsl(var(--tf-text-dim))] tracking-wider">
              Condition:
            </span>
            <span className="mono bg-[hsl(var(--tf-panel-2))] px-1.5 py-0.5 rounded text-[hsl(var(--tf-text-muted))]">
              {step.condition}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              step.condition_result
                ? "bg-[hsl(var(--tf-success))]/15 text-[hsl(var(--tf-success))]"
                : "bg-[hsl(var(--tf-danger))]/15 text-[hsl(var(--tf-danger))]"
            }`}>
              {step.condition_result ? "TRUE" : "FALSE"}
            </span>
          </div>
        )}

        <div className="text-[12.5px] text-[hsl(var(--tf-text-muted))]">
          <p className="font-medium text-[hsl(var(--tf-text))]">{reasoning.explanation || step.explanation}</p>
          {reasoning.why_executed && (
            <p className="mt-1.5 text-[11.5px] text-[hsl(var(--tf-text-dim))] italic">
              Reason: {reasoning.why_executed}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PracticeInstructionsPanel() {
  return (
    <div className="border border-[hsl(var(--tf-border))] rounded-lg p-4 bg-[hsl(var(--tf-panel))] shadow-sm space-y-3.5">
      <div className="flex items-center gap-2 text-[hsl(var(--tf-accent))]">
        <Keyboard className="w-5 h-5" />
        <span className="text-[12px] uppercase font-bold tracking-wider">
          Practice Mode
        </span>
      </div>
      <p className="text-[12.5px] text-[hsl(var(--tf-text-muted))] leading-relaxed">
        In this mode, you write and execute your own dry-run trace spreadsheet tables!
      </p>
      <div className="rounded-lg bg-[hsl(var(--tf-panel-2))]/50 p-3 space-y-2 text-[12px] text-[hsl(var(--tf-text-dim))]">
        <p className="font-semibold text-[hsl(var(--tf-text-muted))]">How to play:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>A blank dry-run grid matches the active source code.</li>
          <li>Fill in the correct variable values for each line step.</li>
          <li>Submit your custom trace to compare it with the engine's compilation output.</li>
        </ul>
      </div>
      <div className="pt-2 text-center text-[11.5px] text-[hsl(var(--tf-text-dim))] italic">
        (Practice mode editor is coming soon — use Guided or Predict mode for active learning)
      </div>
    </div>
  );
}
