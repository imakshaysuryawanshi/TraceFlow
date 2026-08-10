import { useEffect } from "react";
import "@/App.css";
import TopBar from "@/components/TopBar";
import CodeEditor from "@/components/CodeEditor";
import ExecutionPanel from "@/components/ExecutionPanel";
import AIExplanation from "@/components/AIExplanation";
import OutputConsole from "@/components/OutputConsole";
import TimelineControls from "@/components/TimelineControls";
import StepsStrip from "@/components/StepsStrip";
import TraceInspector from "@/components/TraceInspector";
import { useTraceStore } from "@/store/traceStore";
import { Toaster } from "@/components/ui/sonner";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function App() {
  const loadSamples = useTraceStore((s) => s.loadSamples);
  const loadTrace = useTraceStore((s) => s.loadTrace);
  const samples = useTraceStore((s) => s.samples);
  const trace = useTraceStore((s) => s.trace);
  const next = useTraceStore((s) => s.next);
  const prev = useTraceStore((s) => s.prev);
  const toggleInspector = useTraceStore((s) => s.toggleInspector);
  const closeInspector = useTraceStore((s) => s.closeInspector);

  useEffect(() => {
    loadSamples();
  }, [loadSamples]);

  useEffect(() => {
    if (samples.length > 0 && !trace) {
      loadTrace(samples[0].id);
    }
  }, [samples, trace, loadTrace]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // Inspector toggle: Cmd/Ctrl + `
      if ((e.metaKey || e.ctrlKey) && e.key === "`") {
        e.preventDefault();
        toggleInspector();
        return;
      }
      if (e.key === "Escape") {
        closeInspector();
        return;
      }
      // Timeline navigation only when NOT inside an editable element
      const tag = e.target?.tagName;
      const editable = e.target?.isContentEditable;
      if (["INPUT", "TEXTAREA"].includes(tag) || editable) return;
      // Monaco puts focus on a textarea inside its widget; the check above
      // covers it. Arrow keys should not steal focus from Monaco either.
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
  }, [next, prev, toggleInspector, closeInspector]);

  // Layout persistence
  const layoutKey = "traceflow.layout";
  let defaultLayout = [40, 35, 25];
  try {
    const saved = localStorage.getItem(layoutKey);
    if (saved) {
      defaultLayout = JSON.parse(saved);
    }
  } catch (e) {
    // ignore
  }

  const onLayout = (sizes) => {
    try {
      localStorage.setItem(layoutKey, JSON.stringify(sizes));
    } catch (e) {
      // ignore
    }
  };

  return (
    <div className="App flex flex-col bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))]">
      <TopBar />

      {/* Three-panel main area — resizable */}
      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 bg-[hsl(var(--tf-border))]"
        onLayout={onLayout}
      >
        <ResizablePanel defaultSize={defaultLayout[0]} minSize={20}>
          <div className="h-full bg-[hsl(var(--tf-bg))]">
            <CodeEditor />
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-[3px] bg-[hsl(var(--tf-border))] hover:bg-[hsl(var(--tf-accent))]/50 transition-colors data-[resize-handle-active]:bg-[hsl(var(--tf-accent))]/70" />

        <ResizablePanel defaultSize={defaultLayout[1]} minSize={20}>
          <div className="h-full bg-[hsl(var(--tf-bg))] tf-grid-bg">
            <ExecutionPanel />
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-[3px] bg-[hsl(var(--tf-border))] hover:bg-[hsl(var(--tf-accent))]/50 transition-colors data-[resize-handle-active]:bg-[hsl(var(--tf-accent))]/70" />

        <ResizablePanel defaultSize={defaultLayout[2]} minSize={15}>
          <div className="h-full bg-[hsl(var(--tf-bg))]">
            <AIExplanation />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Timeline + Output console */}
      <div className="border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))]">
        <TimelineControls />
        <StepsStrip />
        <OutputConsole />
      </div>

      {/* Hidden developer panel — toggled via Ctrl/Cmd + ` */}
      <TraceInspector />

      {/* Global toaster for /api/execute errors + success */}
      <Toaster position="bottom-right" richColors closeButton theme="dark" />
    </div>
  );
}

export default App;
