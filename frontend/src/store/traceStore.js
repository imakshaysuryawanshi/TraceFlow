import { create } from "zustand";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * Central store for the currently loaded trace and the playback cursor.
 * Shape of a `trace` matches the future execution-engine response:
 *   {
 *     id, name, description, concept, code,
 *     steps: [{ step, line, kind, label, variables, changed, output, explanation, condition?, condition_result? }]
 *   }
 */
export const useTraceStore = create((set, get) => ({
  // Catalog
  samples: [],
  samplesLoading: false,

  // Active trace
  trace: null,
  traceLoading: false,
  error: null,

  // Playback
  currentStep: 0, // 0-indexed pointer into trace.steps
  isPlaying: false,
  playbackSpeedMs: 900,
  _timer: null,

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
      set({ trace: data, currentStep: 0, traceLoading: false });
    } catch (e) {
      set({ error: "Failed to load trace", traceLoading: false });
    }
  },

  // ---------- playback ----------
  next: () => {
    const { trace, currentStep } = get();
    if (!trace) return;
    if (currentStep < trace.steps.length - 1) {
      set({ currentStep: currentStep + 1 });
    } else {
      get().pause();
    }
  },
  prev: () => {
    const { currentStep } = get();
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
    const { _timer, isPlaying, trace, playbackSpeedMs } = get();
    if (isPlaying || !trace) return;
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
