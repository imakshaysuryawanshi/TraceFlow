export const TF = {
  // Top bar
  logo: "tf-logo",
  sampleSelector: "sample-selector",
  sampleOption: (id) => `sample-option-${id}`,
  runTraceButton: "run-trace-button",

  // Panels
  codeEditor: "code-editor-panel",
  monacoEditor: "monaco-editor",
  executionPanel: "execution-panel",
  aiPanel: "ai-explanation-panel",
  outputConsole: "output-console",

  // Timeline
  timelineControls: "timeline-controls",
  btnPrev: "btn-prev-step",
  btnNext: "btn-next-step",
  btnPlay: "btn-play",
  btnPause: "btn-pause",
  btnReplay: "btn-replay",
  timelineProgress: "timeline-progress",
  timelineStepLabel: "timeline-step-label",

  // Execution
  currentLineIndicator: "current-line-indicator",
  currentStepBadge: "current-step-badge",
  variableCard: (name) => `variable-card-${name}`,
  variableChangedBadge: (name) => `variable-changed-${name}`,
  whatChanged: "what-changed-block",

  // AI
  aiExplanationText: "ai-explanation-text",

  // Output
  outputLine: (i) => `output-line-${i}`,
};

// Kept for compatibility with legacy template
export const HOME = { emergentLink: "emergent-link" };
