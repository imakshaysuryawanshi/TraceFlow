import { create } from "zustand";
import axios from "axios";
import {
  saveSnippet,
  loadSnippet,
  clearSnippet,
  saveLanguage,
  loadLanguage,
  clearLanguage,
} from "@/store/snippetStorage";

const SAMPLE_CODES = {
  "for-loop-sum": {
    java:
      "int sum = 0;\nfor (int i = 1; i <= 3; i++) {\n    sum += i;\n}\nSystem.out.println(sum);",
    python:
      "sum = 0\nfor i in range(1, 4):\n    sum += i\nprint(sum)",
    javascript:
      "let sum = 0;\nfor (let i = 1; i <= 3; i++) {\n    sum += i;\n}\nconsole.log(sum);",
  },
  "if-else-grade": {
    java:
      'int score = 72;\nif (score >= 60) {\n    System.out.println("Pass");\n} else {\n    System.out.println("Fail");\n}',
    python:
      'score = 72\nif score >= 60:\n    print("Pass")\nelse:\n    print("Fail")',
    javascript:
      'let score = 72;\nif (score >= 60) {\n    console.log("Pass");\n} else {\n    console.log("Fail");\n}',
  },
  "while-countdown": {
    java:
      "int n = 3;\nwhile (n > 0) {\n    System.out.println(n);\n    n--;\n}",
    python:
      "n = 3\nwhile n > 0:\n    print(n)\n    n -= 1",
    javascript:
      "let n = 3;\nwhile (n > 0) {\n    console.log(n);\n    n--;\n}",
  },
};



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
  // Current language selection — java | python | javascript. Persisted per
  // sample together with the draft code so switching samples doesn't lose
  // the user's language pick.
  language: "java",
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

  // Execution status
  running: false,
  execError: null, // { message, line, stage } from /api/execute failures

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
      // Restore persisted language preference for this sample
      const lang = loadLanguage(data.id) || "java";
      // Determine the appropriate code for the restored language.
      const canonicalForLang =
        SAMPLE_CODES[data.id]?.[lang] ?? data.code;
      // If the user had a saved snippet delta (from a previous session)
      // and it differs from this language's canonical, restore it;
      // otherwise start fresh with the canonical code.
      const saved = loadSnippet(data.id);
      let draftCode;
      if (saved != null && saved !== canonicalForLang) {
        draftCode = saved;
      } else {
        draftCode = canonicalForLang;
      }
      set({
        trace: { ...data, code: canonicalForLang },
        draftCode,
        language: lang,
        currentStep: 0,
        traceLoading: false,
        execError: null,
      });
    } catch (e) {
      set({ error: "Failed to load trace", traceLoading: false });
    }
  },

  setDraftCode: (code) => {
    const { trace } = get();
    set({ draftCode: code, execError: null });
    // Persist only the delta. When the user manually types back to the
    // sample's original source, drop the local override so the sample
    // opens clean next time.
    if (trace) {
      if (code === trace.code) {
        clearSnippet(trace.id);
      } else {
        saveSnippet(trace.id, code);
      }
    }
  },

  /**
   * Reset the editor to the loaded sample's canonical code and drop any
   * locally-saved override for that sample. Also clears the current
   * execution error and rewinds the timeline to step 0.
   */
  resetCode: () => {
    const { trace, language } = get();
    if (!trace) return;
    const canonical = SAMPLE_CODES[trace.id]?.[language] ?? trace.code;
    clearSnippet(trace.id);
    clearLanguage(trace.id);
    set({
      draftCode: canonical,
      trace: { ...trace, code: canonical },
      currentStep: 0,
      execError: null,
    });
  },

  setLanguage: (lang) => {
    const { trace, draftCode, language } = get();
    if (!trace || lang === language) return;

    const canonical = SAMPLE_CODES[trace.id];
    const currentCanonical = canonical?.[language];
    const targetCanonical = canonical?.[lang];

    if (currentCanonical && targetCanonical && draftCode === currentCanonical) {
      // User hadn't edited — swap to target language's canonical code.
      set({
        language: lang,
        draftCode: targetCanonical,
        trace: { ...trace, code: targetCanonical },
      });
    } else {
      // User had modified — keep their code, just switch language.
      set({ language: lang });
    }

    // Clear any persisted snippet — language changed so the old delta is
    // stale. The user's in-memory draftCode is preserved either way.
    clearSnippet(trace.id);
    saveLanguage(trace.id, lang);
  },

  /**
   * Run Trace:
   *   - If the code buffer matches the loaded sample, just re-play the
   *     current trace from step 0.
   *   - Otherwise POST the draft to /api/execute, receive a Trace that
   *     conforms to the frozen v1.0 schema, and swap it in. Frontend
   *     panels consume it identically to a mock trace — no UI changes.
   */
  runTrace: async () => {
    const state = get();
    state.pause();

    const isDirty = !!state.trace && state.draftCode !== state.trace.code;
    if (!isDirty) {
      set({ currentStep: 0, execError: null });
      return { ok: true };
    }

    set({ running: true, execError: null });
    try {
      const { data } = await axios.post(`${API}/execute`, {
        code: state.draftCode,
        language: state.language,
        id: "user-code",
        name: "Your code",
        description: "Generated from the editor",
      });
      set({
        trace: data,
        currentStep: 0,
        running: false,
        execError: null,
      });
      return { ok: true, trace: data };
    } catch (e) {
      const detail = e?.response?.data?.detail;
      const execError =
        detail && typeof detail === "object"
          ? {
              message: detail.message || "Execution failed",
              line: detail.line ?? null,
              stage: detail.stage || "execute",
            }
          : {
              message: e?.message || "Network error",
              line: null,
              stage: "network",
            };
      set({ running: false, execError });
      return { ok: false, error: execError };
    }
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
