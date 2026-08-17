import { create } from "zustand";
import axios from "axios";
import {
  saveSnippet,
  loadSnippet,
  clearSnippet,
  saveLanguage,
  loadLanguage,
  clearLanguage,
  saveAiSettings,
  loadAiSettings,
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
  "nested-loops-table": {
    java:
      "int total = 0;\nfor (int i = 1; i <= 3; i++) {\n    for (int j = 1; j <= 3; j++) {\n        total += i * j;\n    }\n}\nSystem.out.println(total);",
    python:
      "total = 0\nfor i in range(1, 4):\n    for j in range(1, 4):\n        total += i * j\nprint(total)",
    javascript:
      "let total = 0;\nfor (let i = 1; i <= 3; i++) {\n    for (let j = 1; j <= 3; j++) {\n        total += i * j;\n    }\n}\nconsole.log(total);",
  },
  "max-scan": {
    java:
      "int best = 0;\nfor (int i = 1; i <= 5; i++) {\n    if (i > best) {\n        best = i;\n    }\n}\nSystem.out.println(best);",
    python:
      "best = 0\nfor i in range(1, 6):\n    if i > best:\n        best = i\nprint(best)",
    javascript:
      "let best = 0;\nfor (let i = 1; i <= 5; i++) {\n    if (i > best) {\n        best = i;\n    }\n}\nconsole.log(best);",
  },
  "flag-toggle": {
    java:
      "boolean flag = false;\nint on = 0;\nfor (int i = 0; i < 4; i++) {\n    flag = !flag;\n    if (flag) {\n        on++;\n    }\n}\nSystem.out.println(on);",
    python:
      "flag = False\non = 0\nfor i in range(0, 4):\n    flag = not flag\n    if flag:\n        on += 1\nprint(on)",
    javascript:
      "let flag = false;\nlet on = 0;\nfor (let i = 0; i < 4; i++) {\n    flag = !flag;\n    if (flag) {\n        on++;\n    }\n}\nconsole.log(on);",
  },
  "string-accum": {
    java:
      'String s = "";\nfor (int i = 1; i <= 3; i++) {\n    s = s + "*";\n}\nSystem.out.println(s);',
    python:
      's = ""\nfor i in range(1, 4):\n    s = s + "*"\nprint(s)',
    javascript:
      'let s = "";\nfor (let i = 1; i <= 3; i++) {\n    s = s + "*";\n}\nconsole.log(s);',
  },
  "array-sum": {
    java:
      "int[] b = {1, 2, 3};\nint sum = 0;\nfor (int i = 0; i < b.length; i++) {\n    sum += b[i];\n}\nSystem.out.println(sum);",
    python:
      "b = [1, 2, 3]\nsum = 0\nfor i in range(0, len(b)):\n    sum += b[i]\nprint(sum)",
    javascript:
      "let b = [1, 2, 3];\nlet sum = 0;\nfor (let i = 0; i < b.length; i++) {\n    sum += b[i];\n}\nconsole.log(sum);",
  },
};



const BACKEND_URL =
  process.env.REACT_APP_BACKEND_URL || "http://localhost:8080";
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

  // AI explanation settings — empty provider = AI OFF (no tokens consumed).
  // Only set once the user explicitly picks a provider in the Settings modal.
  aiProvider: "",
  aiModel: "",
  aiApiKey: "",

  // Dev tools
  inspectorOpen: false,
  stripExpanded: false,

  // ---------- active breakpoints ----------
  breakpoints: [],
  breakpointHitMessage: "",
  
  addBreakpoint: (line, condition) => {
    const { breakpoints } = get();
    const newBp = {
      id: Math.random().toString(36).substring(2, 11),
      line: Number(line),
      condition: condition.trim(),
      enabled: true
    };
    set({ breakpoints: [...breakpoints, newBp], breakpointHitMessage: "" });
  },
  removeBreakpoint: (id) => {
    const { breakpoints } = get();
    set({ breakpoints: breakpoints.filter(b => b.id !== id) });
  },
  toggleBreakpoint: (id) => {
    const { breakpoints } = get();
    set({
      breakpoints: breakpoints.map(b => b.id === id ? { ...b, enabled: !b.enabled } : b)
    });
  },
  clearBreakpointMessage: () => set({ breakpointHitMessage: "" }),

  // ---------- save + compare runs ----------
  savedRun: null,
  compareModeEnabled: false,
  
  saveCurrentRun: () => {
    const { trace } = get();
    if (!trace) return;
    set({ savedRun: JSON.parse(JSON.stringify(trace)) });
  },
  clearSavedRun: () => set({ savedRun: null, compareModeEnabled: false }),
  toggleCompareMode: () => set(s => ({ compareModeEnabled: !s.compareModeEnabled })),

  // ---------- active practice mode ----------
  practiceModeEnabled: false,
  activeQuiz: null,
  selectedAnswer: "",
  quizSubmitted: false,
  quizAnsweredCorrectly: false,

  togglePracticeMode: () => {
    const { practiceModeEnabled, trace, currentStep, dryRunOpen, dryRunMode } = get();
    const nextVal = !practiceModeEnabled;
    const isQuizActive = nextVal || (dryRunOpen && dryRunMode === "predict");
    set({
      practiceModeEnabled: nextVal,
      activeQuiz: isQuizActive ? _generateQuiz(trace, currentStep) : null,
      selectedAnswer: "",
      quizSubmitted: false,
      quizAnsweredCorrectly: false,
    });
  },

  selectQuizAnswer: (ans) => set({ selectedAnswer: ans }),

  submitQuizAnswer: () => {
    const { activeQuiz, selectedAnswer } = get();
    if (!activeQuiz) return;
    const isCorrect = selectedAnswer === activeQuiz.correctAnswer;
    set({
      quizSubmitted: true,
      quizAnsweredCorrectly: isCorrect,
    });
  },

  // ---------- active dry run mode ----------
  dryRunOpen: false,
  dryRunMode: "guided", // "guided" | "predict" | "practice"

  toggleDryRun: () => {
    const { dryRunOpen, trace, currentStep, dryRunMode, practiceModeEnabled } = get();
    get().pause();
    const nextOpen = !dryRunOpen;
    const isQuizActive = practiceModeEnabled || (nextOpen && dryRunMode === "predict");
    set({
      dryRunOpen: nextOpen,
      activeQuiz: isQuizActive ? _generateQuiz(trace, currentStep) : null,
      selectedAnswer: "",
      quizSubmitted: false,
      quizAnsweredCorrectly: false,
      breakpointHitMessage: "",
    });
  },

  setDryRunMode: (mode) => {
    const { trace, currentStep, practiceModeEnabled, dryRunOpen } = get();
    const isQuizActive = practiceModeEnabled || (dryRunOpen && mode === "predict");
    set({
      dryRunMode: mode,
      activeQuiz: isQuizActive ? _generateQuiz(trace, currentStep) : null,
      selectedAnswer: "",
      quizSubmitted: false,
      quizAnsweredCorrectly: false,
    });
  },

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
        // Debug/comparison state from the previous sample is stale —
        // breakpoint line numbers and the saved baseline no longer apply.
        breakpoints: [],
        breakpointHitMessage: "",
        savedRun: null,
        compareModeEnabled: false,
        activeQuiz: get().practiceModeEnabled ? _generateQuiz({ ...data, code: canonicalForLang }, 0) : null,
        quizAnsweredCorrectly: false,
        selectedAnswer: "",
        quizSubmitted: false,
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
    const { trace, language } = get();
    if (!trace || lang === language) return;

    const canonical = SAMPLE_CODES[trace.id];
    const targetCanonical = canonical?.[lang];

    if (targetCanonical) {
      // Always swap to target language's canonical code if available for this sample
      set({
        language: lang,
        draftCode: targetCanonical,
        trace: { ...trace, code: targetCanonical },
        currentStep: 0,
        execError: null,
      });
    } else {
      // If no canonical code exists for this language/sample (e.g. custom user code),
      // just switch the highlighting language and keep the code.
      set({ language: lang });
    }

    // Clear any persisted snippet — language changed so the old delta is stale.
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
      set({
        currentStep: 0,
        execError: null,
        activeQuiz: state.practiceModeEnabled ? _generateQuiz(state.trace, 0) : null,
        quizAnsweredCorrectly: false,
        selectedAnswer: "",
        quizSubmitted: false,
      });
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
        ai_provider: state.aiProvider || null,
        ai_model: state.aiModel || null,
        ai_api_key: state.aiApiKey || null,
      });
      set({
        trace: data,
        currentStep: 0,
        running: false,
        execError: null,
        activeQuiz: state.practiceModeEnabled ? _generateQuiz(data, 0) : null,
        quizAnsweredCorrectly: false,
        selectedAnswer: "",
        quizSubmitted: false,
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
          : typeof detail === "string"
            ? {
                message: detail,
                line: null,
                stage: "rate_limit",
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
    const { trace, currentStep, isPlaying, practiceModeEnabled, activeQuiz, quizAnsweredCorrectly, dryRunOpen, dryRunMode } = get();
    if (!trace) return;
    const isQuizActive = practiceModeEnabled || (dryRunOpen && dryRunMode === "predict");
    if (isQuizActive && activeQuiz && !quizAnsweredCorrectly) return;
    if (isPlaying) get().pause();
    const steps = trace.trace || trace.steps;
    if (currentStep < steps.length - 1) {
      const nextIdx = currentStep + 1;
      set({
        currentStep: nextIdx,
        activeQuiz: isQuizActive ? _generateQuiz(trace, nextIdx) : null,
        quizAnsweredCorrectly: false,
        selectedAnswer: "",
        quizSubmitted: false,
      });
    }
  },
  prev: () => {
    const { currentStep, isPlaying, trace, practiceModeEnabled, dryRunOpen, dryRunMode } = get();
    if (isPlaying) get().pause();
    const isQuizActive = practiceModeEnabled || (dryRunOpen && dryRunMode === "predict");
    if (currentStep > 0) {
      const prevIdx = currentStep - 1;
      set({
        currentStep: prevIdx,
        activeQuiz: isQuizActive ? _generateQuiz(trace, prevIdx) : null,
        quizAnsweredCorrectly: false,
        selectedAnswer: "",
        quizSubmitted: false,
      });
    }
  },
  goTo: (idx) => {
    const { trace, practiceModeEnabled, dryRunOpen, dryRunMode } = get();
    if (!trace) return;
    const isQuizActive = practiceModeEnabled || (dryRunOpen && dryRunMode === "predict");
    const steps = trace.trace || trace.steps;
    const clamped = Math.max(0, Math.min(idx, steps.length - 1));
    set({
      currentStep: clamped,
      activeQuiz: isQuizActive ? _generateQuiz(trace, clamped) : null,
      quizAnsweredCorrectly: false,
      selectedAnswer: "",
      quizSubmitted: false,
    });
  },
  replay: () => {
    const { trace, practiceModeEnabled, dryRunOpen, dryRunMode } = get();
    get().pause();
    const isQuizActive = practiceModeEnabled || (dryRunOpen && dryRunMode === "predict");
    set({
      currentStep: 0,
      activeQuiz: isQuizActive ? _generateQuiz(trace, 0) : null,
      quizAnsweredCorrectly: false,
      selectedAnswer: "",
      quizSubmitted: false,
    });
  },
  play: () => {
    const { _timer, isPlaying, trace, playbackSpeedMs, currentStep, practiceModeEnabled, dryRunOpen, dryRunMode } = get();
    const isQuizActive = practiceModeEnabled || (dryRunOpen && dryRunMode === "predict");
    if (isPlaying || !trace || isQuizActive) return;
    const steps = trace.trace || trace.steps;
    if (currentStep >= steps.length - 1) set({ currentStep: 0 });
    if (_timer) clearInterval(_timer);
    const timer = setInterval(() => {
      const s = get();
      if (!s.trace) {
        s.pause();
        return;
      }
      const sSteps = s.trace.trace || s.trace.steps;
      if (!sSteps || s.currentStep >= sSteps.length - 1) {
        s.pause();
        return;
      }
      const nextIdx = s.currentStep + 1;
      const nextStep = sSteps[nextIdx];
      
      // Check breakpoints
      let hitBp = null;
      const nextStepVars = nextStep.state?.variables || nextStep.variables || {};
      for (const bp of s.breakpoints) {
        if (bp.enabled && nextStep.line === bp.line) {
          if (bp.condition) {
            if (_evalBreakpointCondition(bp.condition, nextStepVars)) {
              hitBp = bp;
              break;
            }
          } else {
            hitBp = bp;
            break;
          }
        }
      }

      if (hitBp) {
        s.pause();
        set({
          currentStep: nextIdx,
          breakpointHitMessage: `Breakpoint hit at line ${hitBp.line}${hitBp.condition ? ` when (${hitBp.condition})` : ""}`
        });
        return;
      }

      set({ currentStep: nextIdx });
    }, playbackSpeedMs);
    set({ _timer: timer, isPlaying: true, breakpointHitMessage: "" });
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

  // ---------- AI settings ----------
  setAiSettings: (settings) => {
    set({
      aiProvider: settings.aiProvider ?? "",
      aiModel: settings.aiModel ?? "",
      aiApiKey: settings.aiApiKey ?? "",
    });
    saveAiSettings(settings);
  },

  // ---------- dev tools ----------
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  closeInspector: () => set({ inspectorOpen: false }),
  toggleStrip: () => set((s) => ({ stripExpanded: !s.stripExpanded })),

  // ---------- Theme Switcher ----------
  theme: localStorage.getItem("traceflow.theme") || "dark",
  toggleTheme: () => {
    const nextTheme = get().theme === "dark" ? "light" : "dark";
    localStorage.setItem("traceflow.theme", nextTheme);
    set({ theme: nextTheme });
  },

  // ---------- TraceFlow Insight ----------
  insightOpen: false,
  insightHistory: [],
  insightPending: false,
  userRole: localStorage.getItem("traceflow.userRole") || "student_fresher",
  setUserRole: (role) => {
    localStorage.setItem("traceflow.userRole", role);
    set({ userRole: role });
  },

  toggleInsight: () => {
    const { insightOpen } = get();
    set({ insightOpen: !insightOpen });
  },

  clearInsightHistory: () => set({ insightHistory: [] }),

  askInsight: async (intent, userInput = "") => {
    const state = get();
    if (!state.trace) return;
    
    set({ insightPending: true });

    // Gather dynamic context autoritatively
    const steps = state.trace.trace || state.trace.steps || [];
    const currentStepObj = steps[state.currentStep] || null;
    const prevStepObj = state.currentStep > 0 ? steps[state.currentStep - 1] : null;

    const payloadContext = {
      code: state.draftCode || state.trace.code,
      language: state.language,
      current_step: currentStepObj ? {
        step: currentStepObj.step,
        line: currentStepObj.line,
        code: currentStepObj.code,
        kind: currentStepObj.kind || currentStepObj.type,
        condition: currentStepObj.condition || null,
        condition_result: currentStepObj.condition_result !== undefined ? currentStepObj.condition_result : null,
        variables: currentStepObj.state?.variables || currentStepObj.variables || {}
      } : null,
      prev_step: prevStepObj ? {
        step: prevStepObj.step,
        line: prevStepObj.line,
        code: prevStepObj.code,
        kind: prevStepObj.kind || prevStepObj.type,
        variables: prevStepObj.state?.variables || prevStepObj.variables || {}
      } : null,
      output: currentStepObj ? (currentStepObj.output || []) : [],
      question: userInput,
      user_role: state.userRole
    };

    try {
      const { data } = await axios.post(`${API}/insight`, {
        intent,
        context: payloadContext,
        ai_provider: state.aiProvider || null,
        ai_model: state.aiModel || null,
        ai_api_key: state.aiApiKey || null
      });

      const newMsg = {
        id: Math.random().toString(36).substring(2, 11),
        sender: "insight",
        intent,
        question: userInput || intent.replace(/_/g, " "),
        response: data
      };

      set(s => ({
        insightHistory: [...s.insightHistory, newMsg],
        insightPending: false
      }));
    } catch (e) {
      // Fallback offline handler when request fails
      const fallbackResponse = {
        status: "error",
        intent,
        title: "Service Temporarily Offline",
        summary: "Could not establish a connection to the TraceFlow Insight engine.",
        explanation: [
          "Please check if your backend server is running on port 8080.",
          "Verify that you have internet connectivity or that your AI keys are configured correctly."
        ],
        evidence: {
          variables: {},
          line: currentStepObj ? currentStepObj.line : 1
        },
        followUp: {
          type: "none",
          text: ""
        }
      };

      const newMsg = {
        id: Math.random().toString(36).substring(2, 11),
        sender: "insight",
        intent,
        question: userInput || intent.replace(/_/g, " "),
        response: fallbackResponse
      };

      set(s => ({
        insightHistory: [...s.insightHistory, newMsg],
        insightPending: false
      }));
    }
  },
}));

// Initialize AI settings from localStorage
const savedAi = loadAiSettings();
if (savedAi) {
  useTraceStore.getState().setAiSettings(savedAi);
}

// ---------- derived selectors (pure helpers) ----------
export const selectCurrentStep = (state) => {
  const steps = state.trace ? (state.trace.trace || state.trace.steps) : null;
  return steps ? steps[state.currentStep] : null;
};

export const selectPrevStep = (state) => {
  const steps = state.trace ? (state.trace.trace || state.trace.steps) : null;
  return steps && state.currentStep > 0
    ? steps[state.currentStep - 1]
    : null;
};

export const selectProgress = (state) => {
  if (!state.trace) return 0;
  const steps = state.trace.trace || state.trace.steps;
  if (!steps || steps.length === 0) return 0;
  return ((state.currentStep + 1) / steps.length) * 100;
};

/** Whether draftCode diverges from the loaded sample's original source. */
export const selectCodeDirty = (state) =>
  !!state.trace && state.draftCode !== state.trace.code;

/**
 * Top up a quiz options set with random distractors. Bounded attempts so the
 * loop can never spin forever even if the RNG keeps producing existing values.
 */
function _fillWithRandomDistractors(optionsSet) {
  let guard = 0;
  while (optionsSet.size < 4 && guard < 20) {
    optionsSet.add(String(Math.floor(Math.random() * 100)));
    guard += 1;
  }
}

/**
 * Dynamically generates a multiple-choice practice question predicting the next step.
 */
function _generateQuiz(trace, currentStepIdx) {
  if (!trace) return null;
  const steps = trace.trace || trace.steps;
  if (!steps || currentStepIdx >= steps.length - 1) return null;
  const curr = steps[currentStepIdx];
  const next = steps[currentStepIdx + 1];

  // 1. Check if variables changed
  const changedVars = [];
  const currVars = curr.state?.variables || curr.variables || {};
  const nextVars = next.state?.variables || next.variables || {};
  
  for (const k of Object.keys(nextVars)) {
    if (currVars[k] !== nextVars[k]) {
      changedVars.push({ name: k, oldVal: currVars[k], newVal: nextVars[k] });
    }
  }

  if (changedVars.length > 0) {
    const target = changedVars[0];
    const question = `At the next step (line ${next.line}), what will be the value of variable '${target.name}'?`;
    const correctVal = String(target.newVal);
    const oldVal = String(target.oldVal);
    const optionsSet = new Set([correctVal, oldVal]);
    
    try {
      const num = Number(target.newVal);
      if (!isNaN(num)) {
        optionsSet.add(String(num + 1));
        optionsSet.add(String(num * 2));
        optionsSet.add("0");
      } else if (typeof target.newVal === "boolean") {
        optionsSet.add(String(!target.newVal));
      } else {
        optionsSet.add(correctVal + "_updated");
        optionsSet.add("null");
      }
    } catch (e) {
      optionsSet.add("undefined");
    }
    
    _fillWithRandomDistractors(optionsSet);
    
    const options = Array.from(optionsSet);
    options.sort(() => Math.random() - 0.5);

    return {
      type: "variable",
      question,
      options,
      correctAnswer: correctVal,
      hint: `Currently, '${target.name}' is ${oldVal}. Look closely at the statement at line ${next.line} to see how it updates.`
    };
  }

  // 2. Print prediction — what value will be output next
  if (next.kind === "print") {
    const outputSoFar = curr.output || [];
    const knownOutput = outputSoFar[outputSoFar.length - 1];
    // `output` is a cumulative buffer, so the value just printed is the
    // LAST element of the next step's output.
    const correctVal = String((next.output || []).slice(-1)[0]);
    const optionsSet = new Set([correctVal]);
    if (knownOutput !== undefined) optionsSet.add(String(knownOutput));
    if (currVars && Object.keys(currVars).length > 0) {
      for (const v of Object.values(currVars)) {
        optionsSet.add(String(v));
      }
    }
    optionsSet.add("undefined");
    optionsSet.add("null");
    _fillWithRandomDistractors(optionsSet);
    return {
      type: "print",
      question: `The next statement (line ${next.line}) prints something to the console. What value will it output?`,
      options: Array.from(optionsSet)
        .sort(() => Math.random() - 0.5)
        .slice(0, 4),
      correctAnswer: correctVal,
      hint: `Current variables are: ${JSON.stringify(currVars)}. Determine what the print statement evaluates to.`
    };
  }

  // 3. If it's a loop or conditional check
  if (next.kind === "condition" && next.condition) {
    return {
      type: "condition",
      question: `The next statement checks the condition '${next.condition}'. What will it evaluate to?`,
      options: ["true", "false"],
      correctAnswer: String(next.condition_result),
      hint: `Evaluate the boolean expression '${next.condition}' using current variables: ${JSON.stringify(currVars)}.`
    };
  }

  // 4. Line execution prediction
  return {
    type: "line",
    question: `What line will execute next after line ${curr.line}?`,
    options: Array.from(new Set([String(next.line), String(curr.line + 1), String(curr.line + 2)])).sort(() => Math.random() - 0.5),
    correctAnswer: String(next.line),
    hint: `Look at the program structure (conditions or loop updates) to see which statement executes next.`
  };
}

/**
 * Evaluates a conditional breakpoint expression using the variable values.
 *
 * Breakpoint conditions are tiny boolean expressions over the current step's
 * variables (e.g. `i == 5`, `sum >= 10 && flag`). We parse and interpret them
 * with a small tokenizer + recursive-descent parser instead of `new Function`,
 * so user input is never executed as code (no XSS / injection surface).
 *
 * Supported: numbers, "strings", true/false, identifiers, parens, and
 * `== != === !== < > <= >= && || ! + - * / %`.
 */
function _evalBreakpointCondition(cond, vars) {
  if (!cond) return true;
  try {
    return !!_parseBreakpointExpr(cond, vars || {});
  } catch (e) {
    return false;
  }
}

function _tokenizeBreakpoint(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const rest = src.slice(i);
    const multi = rest.match(/^(===|!==|==|!=|<=|>=|&&|\|\|)/);
    if (multi) {
      tokens.push({ type: "op", value: multi[0] });
      i += multi[0].length;
      continue;
    }
    if ("+-*/%<>!()".includes(c)) {
      tokens.push({ type: "op", value: c });
      i += 1;
      continue;
    }
    const num = rest.match(/^(\d+\.\d+|\d+)/);
    if (num) {
      tokens.push({ type: "num", value: parseFloat(num[1]) });
      i += num[1].length;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = "";
      let closed = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === "\\") {
          buf += ch + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        if (ch === '"') {
          closed = true;
          break;
        }
        buf += ch;
        j += 1;
      }
      if (!closed) throw new Error("unterminated string");
      tokens.push({ type: "str", value: JSON.parse(`"${buf}"`) });
      i = j + 1;
      continue;
    }
    const ident = rest.match(/^([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (ident) {
      const word = ident[1];
      if (word === "true") tokens.push({ type: "bool", value: true });
      else if (word === "false") tokens.push({ type: "bool", value: false });
      else tokens.push({ type: "ident", value: word });
      i += word.length;
      continue;
    }
    throw new Error(`unexpected character '${c}'`);
  }
  tokens.push({ type: "eof", value: undefined });
  return tokens;
}

function _bpCompare(op, a, b) {
  if (op === "<") return a < b;
  if (op === ">") return a > b;
  if (op === "<=") return a <= b;
  if (op === ">=") return a >= b;
  return false;
}

function _parseBreakpointExpr(src, vars) {
  const tokens = _tokenizeBreakpoint(src);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isOp = (v) => peek().type === "op" && peek().value === v;
  const expectOp = (v) => {
    if (!isOp(v)) throw new Error(`expected '${v}'`);
    return next().value;
  };

  function primary() {
    const t = next();
    if (t.type === "num" || t.type === "str" || t.type === "bool") return t.value;
    if (t.type === "ident") return vars[t.value]; // unknown var → undefined
    if (t.type === "op" && t.value === "(") {
      const v = orExpr();
      expectOp(")");
      return v;
    }
    throw new Error("unexpected token");
  }

  function unary() {
    if (isOp("!")) {
      next();
      return !unary();
    }
    if (isOp("-")) {
      next();
      return -unary();
    }
    if (isOp("+")) {
      next();
      return +unary();
    }
    return primary();
  }

  function multiplicative() {
    let v = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = next().value;
      const r = unary();
      v = op === "*" ? v * r : op === "/" ? v / r : v % r;
    }
    return v;
  }

  function additive() {
    let v = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = next().value;
      const r = multiplicative();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  function relational() {
    let v = additive();
    while (isOp("<") || isOp(">") || isOp("<=") || isOp(">=")) {
      const op = next().value;
      const r = additive();
      v = _bpCompare(op, v, r);
    }
    return v;
  }

  function equality() {
    let v = relational();
    while (isOp("==") || isOp("!=") || isOp("===") || isOp("!==")) {
      const op = next().value;
      const r = relational();
      if (op === "===") v = v === r;
      else if (op === "!==") v = v !== r;
      else if (op === "==") v = v == r;
      else v = v != r;
    }
    return v;
  }

  function andExpr() {
    let v = equality();
    while (isOp("&&")) {
      next();
      v = !!v && !!equality();
    }
    return v;
  }

  function orExpr() {
    let v = andExpr();
    while (isOp("||")) {
      next();
      v = !!v || !!andExpr();
    }
    return v;
  }

  const result = orExpr();
  if (peek().type !== "eof") throw new Error("trailing tokens");
  return result;
}

