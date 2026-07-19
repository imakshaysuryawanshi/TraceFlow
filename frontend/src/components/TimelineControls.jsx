import {
  useTraceStore,
  selectCurrentStep,
  selectProgress,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Gauge,
} from "lucide-react";

const SPEEDS = [
  { label: "0.5×", ms: 1600 },
  { label: "1×", ms: 900 },
  { label: "2×", ms: 450 },
];

export default function TimelineControls() {
  const trace = useTraceStore((s) => s.trace);
  const step = useTraceStore(selectCurrentStep);
  const currentStep = useTraceStore((s) => s.currentStep);
  const isPlaying = useTraceStore((s) => s.isPlaying);
  const playbackSpeedMs = useTraceStore((s) => s.playbackSpeedMs);
  const progress = useTraceStore(selectProgress);

  const next = useTraceStore((s) => s.next);
  const prev = useTraceStore((s) => s.prev);
  const play = useTraceStore((s) => s.play);
  const pause = useTraceStore((s) => s.pause);
  const replay = useTraceStore((s) => s.replay);
  const goTo = useTraceStore((s) => s.goTo);
  const setSpeed = useTraceStore((s) => s.setSpeed);

  const total = trace?.steps.length ?? 0;
  const atStart = currentStep === 0;
  const atEnd = trace ? currentStep === total - 1 : true;

  return (
    <div
      data-testid={TF.timelineControls}
      className="border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))]"
    >
      <div className="flex items-center gap-3 px-3 h-11">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          <IconButton
            testid={TF.btnReplay}
            title="Replay from start"
            onClick={replay}
            disabled={!trace}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton
            testid={TF.btnPrev}
            title="Previous step (←)"
            onClick={prev}
            disabled={!trace || atStart}
          >
            <ChevronLeft className="w-4 h-4" />
          </IconButton>
          {isPlaying ? (
            <IconButton
              testid={TF.btnPause}
              title="Pause"
              onClick={pause}
              variant="primary"
            >
              <Pause className="w-4 h-4" />
            </IconButton>
          ) : (
            <IconButton
              testid={TF.btnPlay}
              title="Play"
              onClick={play}
              disabled={!trace || atEnd}
              variant="primary"
            >
              <Play className="w-4 h-4" />
            </IconButton>
          )}
          <IconButton
            testid={TF.btnNext}
            title="Next step (→)"
            onClick={next}
            disabled={!trace || atEnd}
          >
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>

        {/* Progress bar / scrubber */}
        <div className="flex-1 flex items-center gap-3 min-w-0">
          <div
            className="flex-1 relative h-1.5 rounded-full bg-[hsl(var(--tf-panel-2))] overflow-hidden cursor-pointer"
            data-testid={TF.timelineProgress}
            onClick={(e) => {
              if (!trace) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              goTo(Math.round(pct * (total - 1)));
            }}
          >
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-[hsl(var(--tf-accent))] to-[hsl(var(--tf-accent-2))]"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div
            className="text-[11px] mono text-[hsl(var(--tf-text-muted))] shrink-0 tabular-nums"
            data-testid={TF.timelineStepLabel}
          >
            <span className="text-[hsl(var(--tf-text))]">
              {String(currentStep + 1).padStart(2, "0")}
            </span>
            <span className="text-[hsl(var(--tf-text-dim))]">
              {" "}
              / {String(total).padStart(2, "0")}
            </span>
            {step && (
              <span className="ml-3 text-[hsl(var(--tf-text-dim))]">
                line {step.line}
              </span>
            )}
          </div>
        </div>

        {/* Speed */}
        <div className="flex items-center gap-1.5 pl-3 border-l border-[hsl(var(--tf-border))]">
          <Gauge className="w-3.5 h-3.5 text-[hsl(var(--tf-text-dim))]" />
          {SPEEDS.map((s) => (
            <button
              key={s.ms}
              data-testid={`speed-${s.label}`}
              onClick={() => setSpeed(s.ms)}
              className={`text-[11px] mono px-1.5 h-6 rounded transition-colors ${
                playbackSpeedMs === s.ms
                  ? "text-[hsl(var(--tf-accent))] bg-[hsl(var(--tf-accent))]/10"
                  : "text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, onClick, disabled, title, variant, testid }) {
  const base =
    "h-8 w-8 flex items-center justify-center rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-[hsl(var(--tf-accent))] text-black hover:bg-[hsl(var(--tf-accent))]/90"
      : "bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:bg-[hsl(var(--tf-panel-2))]/70 border border-[hsl(var(--tf-border))]";
  return (
    <button
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
  );
}
