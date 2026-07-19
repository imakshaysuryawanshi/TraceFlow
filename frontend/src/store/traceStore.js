import { create } from "zustand";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Central store for TraceFlow.
 *
 * Trace schema is defined in /schemas/traceSchema.js and is FROZEN at v1.0.
 * Phase 5-9 will not change the shape consumed here.
 */
export const useTraceStore = create((set, get) => ({
  // Catalog
  samples: [],
  samplesLoading: false,

  // Active trace
  trace: null,
  traceLoading: false,
  error: null,

  // Editable code buffer (Phase 4: mirrors trace.code; Phase 5+: user's source)
  draftCode: "",
  // True when draftCode diverges from the loaded sample's original code.
  // The "Run Trace" button uses this to decide UX in Phase 4:
  //   - unchanged  -> re-play mock (button enabled)
  //   - changed    -> disabled with tooltip "Requires parser (Phase 5)"
  //     (state is derived in the component; store only holds the raw code)

  // Playback
  currentStep: 0, // 0-indexed pointer into trace.steps
  isPlaying: false,
  playbackSpeedMs: 900,
  _timer: null,

  // Dev tools
  inspectorOpen: false,
  stripExpanded: false,

  // ---------- catalog ----------
  loadSamples: async () => {
    set({ samplesLoading: true, error: null });
    try {
      const { data } = await axios.get(`${API}/traces`);
      set({ samples: data, samplesLoading: false });
    } catch (e) {
      set({ error: "Failed to load samples", samplesLoading: false });
    }
  },

  // ---------- active trace ----------
  loadTrace: async (id) => {
    get().pause();
    set({ traceLoading: true, error: null });
    try {
      const { data } = await axios.get(`${API}/traces/${id}`);
      set({
        trace: data,
        draftCode: data.code,
        currentStep: 0,
        traceLoading: false,
      });
    } catch (e) {
      set({ error: "Failed to load trace", traceLoading: false });
    }
  },

  setDraftCode: (code) => set({ draftCode: code }),

  /**
   * Phase 4: "Run Trace" only re-plays the currently loaded mock trace.
   * TODO(phase-5/6): POST draftCode to /api/execute, get back a Trace
   * conforming to the frozen schema, and swap it in via set({ trace, ... }).
   */
  runTrace: () => {
    const { trace } = get();
    if (!trace) return;
    get().pause();
    set({ currentStep: 0 });
  },

  // ---------- playback ----------
  next: () => {
    const { trace, currentStep, isPlaying } = get();
    if (!trace) return;
    if (isPlaying) get().pause();
    if (currentStep < trace.steps.length - 1) {
      set({ currentStep: currentStep + 1 });
    }
  },
  prev: () => {
    const { currentStep, isPlaying } = get();
    if (isPlaying) get().pause();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },
  goTo: (idx) => {
    const { trace } = get();
    if (!trace) return;
    const clamped = Math.max(0, Math.min(idx, trace.steps.length - 1));
    set({ currentStep: clamped });
  },
  replay: () => {
    get().pause();
    set({ currentStep: 0 });
  },
  play: () => {
    const { _timer, isPlaying, trace, playbackSpeedMs, currentStep } = get();
    if (isPlaying || !trace) return;
    // If at end, restart from beginning for a fresh play-through.
    if (currentStep >= trace.steps.length - 1) set({ currentStep: 0 });
    if (_timer) clearInterval(_timer);
    const timer = setInterval(() => {
      const s = get();
      if (!s.trace || s.currentStep >= s.trace.steps.length - 1) {
        s.pause();
        return;
      }
      set({ currentStep: s.currentStep + 1 });
    }, playbackSpeedMs);
    set({ _timer: timer, isPlaying: true });
  },
  pause: () => {
    const { _timer } = get();
    if (_timer) clearInterval(_timer);
    set({ _timer: null, isPlaying: false });
  },
  setSpeed: (ms) => {
    const { isPlaying } = get();
    set({ playbackSpeedMs: ms });
    if (isPlaying) {
      get().pause();
      get().play();
    }
  },

  // ---------- dev tools ----------
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  closeInspector: () => set({ inspectorOpen: false }),
  toggleStrip: () => set((s) => ({ stripExpanded: !s.stripExpanded })),
}));

// ---------- derived selectors (pure helpers) ----------
export const selectCurrentStep = (state) =>
  state.trace ? state.trace.steps[state.currentStep] : null;

export const selectPrevStep = (state) =>
  state.trace && state.currentStep > 0
    ? state.trace.steps[state.currentStep - 1]
    : null;

export const selectProgress = (state) => {
  if (!state.trace) return 0;
  return ((state.currentStep + 1) / state.trace.steps.length) * 100;
};

/** Whether draftCode diverges from the loaded sample's original source. */
export const selectCodeDirty = (state) =>
  !!state.trace && state.draftCode !== state.trace.code;
