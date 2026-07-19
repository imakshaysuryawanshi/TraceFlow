import { TF } from "@/constants/testIds";

/**
 * A single variable card showing name, current value, and (when changed on
 * this step) the previous value + a subtle flash animation.
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
      className={`relative rounded-md border p-2.5 bg-[hsl(var(--tf-panel))] transition-colors ${
        changed
          ? "border-[hsl(var(--tf-accent))]/60 tf-flash"
          : "border-[hsl(var(--tf-border))]"
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
      <div className="mono text-[16px] font-semibold text-[hsl(var(--tf-text))] leading-none">
        {String(value)}
      </div>
      {changed && previousValue !== undefined && (
        <div className="mt-1.5 mono text-[10.5px] text-[hsl(var(--tf-text-dim))]">
          was <span className="text-[hsl(var(--tf-text-muted))]">
            {String(previousValue)}
          </span>
        </div>
      )}
    </div>
  );
}
