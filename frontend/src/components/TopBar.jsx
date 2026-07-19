import { useTraceStore } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { Waypoints, ChevronDown } from "lucide-react";
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

      {/* Sample selector */}
      <div className="flex items-center gap-3">
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
