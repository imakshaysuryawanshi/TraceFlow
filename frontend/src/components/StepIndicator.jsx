import { TF } from "@/constants/testIds";

/**
 * Prominent circular step counter with a progress ring.
 * Sized to be visually dominant in the execution panel — the user should
 * see the step number as a first-class UI element, not tucked away in a
 * corner.
 */
export default function StepIndicator({ current, total }) {
  const safeTotal = Math.max(total, 1);
  const pct = Math.max(0, Math.min(1, current / safeTotal));
  const size = 84;
  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;

  return (
    <div
      data-testid={TF.stepIndicator}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="rotate-[-90deg]">
        {/* track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--tf-border-strong))"
          strokeWidth={stroke}
          fill="none"
        />
        {/* progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="hsl(var(--tf-accent))"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 260ms cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div
        key={`step-${current}`}
        className="absolute inset-0 flex flex-col items-center justify-center tf-step-pulse"
      >
        <span
          data-testid={TF.stepIndicatorNumber}
          className="mono text-[26px] font-semibold leading-none tabular-nums text-[hsl(var(--tf-text))]"
        >
          {String(current).padStart(2, "0")}
        </span>
        <span className="mono text-[10px] text-[hsl(var(--tf-text-dim))] mt-1 tracking-wider uppercase">
          of {String(safeTotal).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
