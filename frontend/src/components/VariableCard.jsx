import { TF } from "@/constants/testIds";

function isList(v) {
  return Array.isArray(v);
}

/**
 * Renders a value. Plain values show as text; arrays render each element in
 * an index-labeled box so a[0], a[1], … are individually visible. Nested
 * arrays recurse.
 */
function ValueView({ value, stepKey, changed }) {
  if (isList(value)) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {value.map((item, idx) => (
          <div
            key={`${stepKey}-${idx}`}
            className="flex flex-col items-center rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] px-1.5 py-1 min-w-[34px]"
          >
            <span className="mono text-[9.5px] text-[hsl(var(--tf-text-muted))] leading-none mb-0.5">
              [{idx}]
            </span>
            <ValueView value={item} stepKey={stepKey} changed={changed} />
          </div>
        ))}
      </div>
    );
  }
  if (value === null) return <span className="text-[hsl(var(--tf-text-dim))]">null</span>;
  return (
    <span className={`text-[hsl(var(--tf-text))] leading-none tabular-nums ${changed ? "tf-value-in" : ""}`}>
      {String(value)}
    </span>
  );
}

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
        className={`${isList(value) ? "text-[14px]" : "mono text-[18px] font-semibold text-[hsl(var(--tf-text))] leading-none tabular-nums"} ${
          changed ? "tf-value-in" : ""
        }`}
      >
        <ValueView value={value} stepKey={stepKey} changed={changed} />
      </div>
      {changed && previousValue !== undefined && (
        <div className="mt-2 flex items-start gap-1.5 mono text-[10.5px] text-[hsl(var(--tf-text-dim))]">
          <span className="mt-0.5">was</span>
          <span className="text-[hsl(var(--tf-text-muted))] line-through decoration-[hsl(var(--tf-text-dim))]/60">
            <ValueView value={previousValue} stepKey={`prev-${stepKey}`} changed={false} />
          </span>
          <span className="mt-0.5 text-[hsl(var(--tf-accent))]">→</span>
          <span className="text-[hsl(var(--tf-accent))]">
            <ValueView value={value} stepKey={`cur-${stepKey}`} changed={false} />
          </span>
        </div>
      )}
    </div>
  );
}
