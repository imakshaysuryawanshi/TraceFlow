import { useEffect } from "react";
import "@/App.css";
import TopBar from "@/components/TopBar";
import CodeEditor from "@/components/CodeEditor";
import ExecutionPanel from "@/components/ExecutionPanel";
import AIExplanation from "@/components/AIExplanation";
import OutputConsole from "@/components/OutputConsole";
import TimelineControls from "@/components/TimelineControls";
import { useTraceStore } from "@/store/traceStore";

function App() {
  const loadSamples = useTraceStore((s) => s.loadSamples);
  const loadTrace = useTraceStore((s) => s.loadTrace);
  const samples = useTraceStore((s) => s.samples);
  const trace = useTraceStore((s) => s.trace);
  const next = useTraceStore((s) => s.next);
  const prev = useTraceStore((s) => s.prev);

  // Bootstrap: load catalog once, then auto-load the first sample.
  useEffect(() => {
    loadSamples();
  }, [loadSamples]);

  useEffect(() => {
    if (samples.length > 0 && !trace) {
      loadTrace(samples[0].id);
    }
  }, [samples, trace, loadTrace]);

  // Global keyboard shortcuts for timeline navigation
  useEffect(() => {
    const onKey = (e) => {
      if (
        e.target &&
        ["INPUT", "TEXTAREA"].includes(e.target.tagName)
      )
        return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  return (
    <div className="App flex flex-col bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))]">
      <TopBar />

      {/* Three-panel main area */}
      <div className="flex-1 grid grid-cols-12 gap-px bg-[hsl(var(--tf-border))] overflow-hidden">
        <div className="col-span-5 min-w-0 bg-[hsl(var(--tf-bg))]">
          <CodeEditor />
        </div>
        <div className="col-span-4 min-w-0 bg-[hsl(var(--tf-bg))] tf-grid-bg">
          <ExecutionPanel />
        </div>
        <div className="col-span-3 min-w-0 bg-[hsl(var(--tf-bg))]">
          <AIExplanation />
        </div>
      </div>

      {/* Timeline + Output console */}
      <div className="border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))]">
        <TimelineControls />
        <OutputConsole />
      </div>
    </div>
  );
}

export default App;
