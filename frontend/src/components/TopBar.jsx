import { useState } from "react";
import {
  useTraceStore,
  selectCodeDirty,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import {
  Waypoints,
  ChevronDown,
  Play,
  Braces,
  Loader2,
  Globe,
  Settings,
  Compass,
  Sun,
  Moon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import SettingsModal from "@/components/SettingsModal";

const LANGUAGES = [
  { id: "java", label: "Java" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
];

export default function TopBar() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const samples = useTraceStore((s) => s.samples);
  const trace = useTraceStore((s) => s.trace);
  const language = useTraceStore((s) => s.language);
  const loadTrace = useTraceStore((s) => s.loadTrace);
  const setLanguage = useTraceStore((s) => s.setLanguage);
  const runTrace = useTraceStore((s) => s.runTrace);
  const resetCode = useTraceStore((s) => s.resetCode);
  const running = useTraceStore((s) => s.running);
  const toggleInspector = useTraceStore((s) => s.toggleInspector);
  const codeDirty = useTraceStore(selectCodeDirty);
  const dryRunOpen = useTraceStore((s) => s.dryRunOpen);
  const toggleDryRun = useTraceStore((s) => s.toggleDryRun);
  const theme = useTraceStore((s) => s.theme);
  const toggleTheme = useTraceStore((s) => s.toggleTheme);
  const insightOpen = useTraceStore((s) => s.insightOpen);
  const toggleInsight = useTraceStore((s) => s.toggleInsight);

  const runDisabled = !trace || running;
  const runTitle = codeDirty
    ? "Parse your code and generate an execution trace"
    : "Replay the current trace from the beginning";

  const onRun = async () => {
    const res = await runTrace();
    if (res && !res.ok) {
      const line = res.error.line != null ? ` (line ${res.error.line})` : "";
      const stage =
        res.error.stage === "parse"
          ? "Parse error"
          : res.error.stage === "rate_limit"
            ? "Rate limited"
            : "Runtime error";
      toast.error(`${stage}${line}`, {
        description: res.error.message,
        duration: 8000,
        action: {
          label: "Reset code",
          onClick: () => resetCode(),
        },
      });
    } else if (res && res.ok && codeDirty) {
      const traceSteps = res.trace ? (res.trace.trace || res.trace.steps || []) : [];
      toast.success("Trace generated", {
        description: `${traceSteps.length} steps`,
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
        <div className="w-6 h-6 rounded-[5px] overflow-hidden bg-gradient-to-br from-[hsl(var(--tf-accent))] to-[hsl(var(--tf-accent-2))] flex items-center justify-center">
          <img src="/logo.png" alt="TraceFlow Logo" className="w-full h-full object-cover" />
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
             {(() => {
              const foundationIds = ["for-loop-sum", "if-else-grade", "while-countdown", "string-accum", "fibonacci-series", "string-palindrome"];
              const foundationSamples = samples.filter((s) => foundationIds.includes(s.id));
              const advancedSamples = samples.filter((s) => !foundationIds.includes(s.id));
              return (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[hsl(var(--tf-accent))] font-bold px-2 py-1">
                    Foundation Basics (Freshers / Students)
                  </DropdownMenuLabel>
                  {foundationSamples.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      data-testid={TF.sampleOption(s.id)}
                      onSelect={() => loadTrace(s.id)}
                      className="cursor-pointer focus:bg-[hsl(var(--tf-accent))]/10 focus:text-[hsl(var(--tf-text))] py-1.5 px-2.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-semibold">{s.name}</span>
                        <span className="text-[10.5px] text-[hsl(var(--tf-text-muted))] leading-normal">
                          {s.description}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                  
                  <DropdownMenuSeparator className="bg-[hsl(var(--tf-border))] my-1.5" />
                  
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-[hsl(var(--tf-accent-2))] font-bold px-2 py-1">
                    Advanced Interview (Experienced Pros / Working)
                  </DropdownMenuLabel>
                  {advancedSamples.map((s) => (
                    <DropdownMenuItem
                      key={s.id}
                      data-testid={TF.sampleOption(s.id)}
                      onSelect={() => loadTrace(s.id)}
                      className="cursor-pointer focus:bg-[hsl(var(--tf-accent-2))]/10 focus:text-[hsl(var(--tf-text))] py-1.5 px-2.5"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] font-semibold">{s.name}</span>
                        <span className="text-[10.5px] text-[hsl(var(--tf-text-muted))] leading-normal">
                          {s.description}
                        </span>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </>
              );
             })()}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger
            data-testid="language-selector"
            className="group flex items-center gap-2 h-8 px-2.5 rounded-md border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] hover:border-[hsl(var(--tf-accent))]/50 transition-colors"
          >
            <Globe className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))] group-hover:text-[hsl(var(--tf-accent))]" />
            <span className="mono text-[12.5px] text-[hsl(var(--tf-text))]">
              {LANGUAGES.find((l) => l.id === language)?.label ?? "Java"}
            </span>
            <ChevronDown className="w-3 h-3 text-[hsl(var(--tf-text-muted))] group-hover:text-[hsl(var(--tf-accent))]" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-40 bg-[hsl(var(--tf-panel-2))] border-[hsl(var(--tf-border-strong))]"
          >
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-[hsl(var(--tf-text-dim))]">
              Language
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-[hsl(var(--tf-border))]" />
            {LANGUAGES.map((l) => (
              <DropdownMenuItem
                key={l.id}
                data-testid={`lang-${l.id}`}
                onSelect={() => setLanguage(l.id)}
                className={`cursor-pointer focus:bg-[hsl(var(--tf-accent))]/10 focus:text-[hsl(var(--tf-text))] py-1.5 ${
                  l.id === language ? "text-[hsl(var(--tf-accent))]" : ""
                }`}
              >
                {l.label}
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

        {/* Dry Run Toggle Button */}
        <button
          onClick={toggleDryRun}
          title={dryRunOpen ? "Close Dry Run Mode" : "Open Dry Run Mode"}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium transition-colors border ${
            dryRunOpen
              ? "border-[hsl(var(--tf-accent))]/40 bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))]"
              : "border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-accent))] hover:border-[hsl(var(--tf-accent))]/50"
          }`}
        >
          <Compass className="w-3.5 h-3.5" />
          <span>Dry Run</span>
        </button>

        {/* Insight Toggle Button */}
        <button
          onClick={toggleInsight}
          title={insightOpen ? "Close TraceFlow Insight" : "Open TraceFlow Insight"}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium transition-colors border ${
            insightOpen
              ? "border-[hsl(var(--tf-accent))]/40 bg-[hsl(var(--tf-accent))]/10 text-[hsl(var(--tf-accent))]"
              : "border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-accent))] hover:border-[hsl(var(--tf-accent))]/50"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Insight</span>
        </button>

        {/* Theme Toggler */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          className="w-8 h-8 rounded-md flex items-center justify-center border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-accent))] hover:border-[hsl(var(--tf-accent))]/50 transition-colors"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="AI Settings"
          className="w-8 h-8 rounded-md flex items-center justify-center border border-[hsl(var(--tf-border-strong))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-accent))] hover:border-[hsl(var(--tf-accent))]/50 transition-colors"
        >
          <Settings className="w-4 h-4" />
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

      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
