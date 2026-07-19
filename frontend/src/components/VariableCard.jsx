import { TF } from "@/constants/testIds";

/**
 * A single variable card.
 * When `changed` is true:
 *   - the card runs a flash + scale-bump (tf-flash)
 *   - the new value slides in from above (tf-value-in)
 *   - the previous value fades below as "was N"
 */
export default function VariableCard({
  name,
  value,
  previousValue,
  changed,
  stepKey,
}) {
  return (
    <div
      data-testid={TF.variableCard(name)}
      // stepKey remounts the node so the flash animation replays on change
      key={changed ? `${name}-${stepKey}` : name}
      className={`relative rounded-md border p-2.5 bg-[hsl(var(--tf-panel))] overflow-hidden ${
        changed
          ? "border-[hsl(var(--tf-accent))]/60 tf-flash"
          : "border-[hsl(var(--tf-border))] transition-colors"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="mono text-[12px] text-[hsl(var(--tf-accent))] font-medium">
          {name}
        </span>
        {changed && (
          <span
            data-testid={TF.variableChangedBadge(name)}
            className="text-[9.5px] uppercase tracking-wider text-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/10 px-1.5 py-0.5 rounded border border-[hsl(var(--tf-accent))]/25"
          >
            changed
          </span>
        )}
      </div>
      <div
        key={`v-${stepKey}`}
        className={`mono text-[18px] font-semibold text-[hsl(var(--tf-text))] leading-none tabular-nums ${
          changed ? "tf-value-in" : ""
        }`}
      >
        {String(value)}
      </div>
      {changed && previousValue !== undefined && (
        <div className="mt-2 flex items-center gap-1.5 mono text-[10.5px] text-[hsl(var(--tf-text-dim))]">
          <span>was</span>
          <span className="text-[hsl(var(--tf-text-muted))] line-through decoration-[hsl(var(--tf-text-dim))]/60">
            {String(previousValue)}
          </span>
          <span className="text-[hsl(var(--tf-accent))]">→</span>
          <span className="text-[hsl(var(--tf-accent))]">{String(value)}</span>
        </div>
      )}
    </div>
  );
}
