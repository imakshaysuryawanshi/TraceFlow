import { Repeat } from "lucide-react";
import { TF } from "@/constants/testIds";

/**
 * Loop iteration badge — shown only when the current step is inside a loop
 * body (as computed by computeLoopContexts).
 *
 * Renders "iteration N of M · <condition>" plus a compact iteration meter.
 */
export default function LoopIndicator({ context }) {
  if (!context) return null;
  const { iteration, total, condition } = context;
  const dots = Math.min(total, 12); // cap for very long loops

  return (
    <div
      data-testid={TF.loopIndicator}
      className="tf-fade-in rounded-md border border-[hsl(var(--tf-accent-2))]/30 bg-[hsl(var(--tf-accent-2))]/[0.05] px-3 py-2.5 flex items-center gap-3"
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[hsl(var(--tf-accent-2))]/15 text-[hsl(var(--tf-accent-2))] shrink-0">
        <Repeat className="w-3.5 h-3.5" strokeWidth={2.4} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[10.5px] uppercase tracking-[0.14em] text-[hsl(var(--tf-text-dim))] font-semibold">
            iteration
          </span>
          <span
            data-testid={TF.loopIterationNumber}
            className="mono text-[15px] font-semibold text-[hsl(var(--tf-text))] tabular-nums leading-none"
          >
            {iteration}
          </span>
          <span className="mono text-[11px] text-[hsl(var(--tf-text-dim))]">
            of {total}
          </span>
        </div>
        {condition && (
          <div className="mono text-[11px] text-[hsl(var(--tf-text-muted))] mt-1 truncate">
            while <span className="text-[hsl(var(--tf-accent-2))]">{condition}</span>
          </div>
        )}
      </div>
      {/* Iteration dots */}
      <div className="flex items-center gap-1 shrink-0">
        {Array.from({ length: dots }).map((_, i) => {
          const idx = i + 1;
          const state =
            idx < iteration
              ? "done"
              : idx === iteration
                ? "current"
                : "pending";
          return (
            <span
              key={i}
              className={
                state === "current"
                  ? "w-2 h-2 rounded-full bg-[hsl(var(--tf-accent-2))]"
                  : state === "done"
                    ? "w-1.5 h-1.5 rounded-full bg-[hsl(var(--tf-accent-2))]/45"
                    : "w-1.5 h-1.5 rounded-full bg-[hsl(var(--tf-border-strong))]"
              }
            />
          );
        })}
        {total > dots && (
          <span className="mono text-[9.5px] text-[hsl(var(--tf-text-dim))] ml-1">
            +{total - dots}
          </span>
        )}
      </div>
    </div>
  );
}
