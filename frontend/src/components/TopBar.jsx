import {
  useTraceStore,
  selectCodeDirty,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { Waypoints, ChevronDown, Play, Braces, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export default function TopBar() {
  const samples = useTraceStore((s) => s.samples);
  const trace = useTraceStore((s) => s.trace);
  const loadTrace = useTraceStore((s) => s.loadTrace);
  const runTrace = useTraceStore((s) => s.runTrace);
  const resetCode = useTraceStore((s) => s.resetCode);
  const running = useTraceStore((s) => s.running);
  const toggleInspector = useTraceStore((s) => s.toggleInspector);
  const codeDirty = useTraceStore(selectCodeDirty);

  const runDisabled = !trace || running;
  const runTitle = codeDirty
    ? "Parse your code and generate an execution trace"
    : "Replay the current trace from the beginning";

  const onRun = async () => {
    const res = await runTrace();
    if (res && !res.ok) {
      const line = res.error.line != null ? ` (line ${res.error.line})` : "";
      const stage = res.error.stage === "parse" ? "Parse error" : "Runtime error";
      toast.error(`${stage}${line}`, {
        description: res.error.message,
        duration: 8000,
        action: {
          label: "Reset code",
          onClick: () => resetCode(),
        },
      });
    } else if (res && res.ok && codeDirty) {
      toast.success("Trace generated", {
        description: `${res.trace.steps.length} steps`,
        duration: 2200,
      });
    }
  };

  return (
    <header
      className="h-12 flex items-center justify-between px-4 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0"
      data-testid="topbar"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5" data-testid={TF.logo}>
        <div className="w-6 h-6 rounded-[5px] bg-gradient-to-br from-[hsl(var(--tf-accent))] to-[hsl(var(--tf-accent-2))] flex items-center justify-center">
          <Waypoints className="w-3.5 h-3.5 text-black/80" strokeWidth={2.5} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold tracking-tight">
            TraceFlow
          </span>
          <span className="text-[11px] text-[hsl(var(--tf-text-dim))] mono">
            follow every step
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Sample selector */}
        <span className="text-[11px] uppercase tracking-[0.12em] text-[hsl(var(--tf-text-dim))] font-medium">
          Sample
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid={TF.sampleSelector}
            className="group flex items-center gap-2 px-3 h-8 rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] hover:border-[hsl(var(--tf-accent))]/50 transition-colors text-sm"
          >
            <span className="mono text-[13px] text-[hsl(var(--tf-text))]">
              {trace ? trace.name : "Loading…"}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))] group-hover:text-[hsl(var(--tf-accent))]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-80 bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))]"
          >
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))]">
              Sample programs
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[hsl(var(--tf-border))]" />
            {samples.map((s) => (
              <DropdownMenuItem
                key={s.id}
                data-testid={TF.sampleOption(s.id)}
                onSelect={() => loadTrace(s.id)}
                className="cursor-pointer focus:bg-[hsl(var(--tf-accent))]/10 focus:text-[hsl(var(--tf-text))] py-2"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{s.name}</span>
                  <span className="text-[11px] text-[hsl(var(--tf-text-muted))]">
                    {s.description}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Run Trace — POSTs to /api/execute when code is dirty; otherwise
            re-plays the current trace from the beginning. */}
        <button
          data-testid={TF.runTraceButton}
          disabled={runDisabled}
          onClick={onRun}
          title={runTitle}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium transition-colors border border-[hsl(var(--tf-accent))]/40 bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent))]/15 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[hsl(var(--tf-accent))]/10"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={2.4} />
          ) : (
            <Play className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
          )}
          {running ? "Running…" : "Run trace"}
          {codeDirty && !running && (
            <span
              data-testid="run-trace-live-badge"
              className="text-[9.5px] uppercase tracking-wider text-[hsl(var(--tf-accent))]/80 bg-[hsl(var(--tf-accent))]/10 px-1.5 py-0.5 rounded border border-[hsl(var(--tf-accent))]/25 ml-1"
            >
              live
            </span>
          )}
        </button>

        {/* Inspector toggle */}
        <button
          data-testid={TF.inspectorToggle}
          onClick={toggleInspector}
          title="Open Trace JSON Inspector (Ctrl+`)"
          className="w-8 h-8 rounded-md flex items-center justify-center border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-accent))] hover:border-[hsl(var(--tf-accent))]/50 transition-colors"
        >
          <Braces className="w-4 h-4" />
        </button>

        <div className="hidden md:flex items-center gap-1.5 pl-3 border-l border-[hsl(var(--tf-border))]">
          <span className="text-[11px] text-[hsl(var(--tf-text-dim))]">
            Navigate
          </span>
          <span className="tf-kbd">←</span>
          <span className="tf-kbd">→</span>
        </div>
      </div>
    </header>
  );
}
