export const TF = {
  // Top bar
  logo: "tf-logo",
  sampleSelector: "sample-selector",
  sampleOption: (id) => `sample-option-${id}`,
  runTraceButton: "run-trace-button",
  inspectorToggle: "inspector-toggle",

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
  stripToggle: "strip-toggle",
  stepsStrip: "steps-strip",
  stripChip: (i) => `strip-chip-${i}`,

  // Execution
  currentLineIndicator: "current-line-indicator",
  currentStepBadge: "current-step-badge",
  stepIndicator: "step-indicator",
  stepIndicatorNumber: "step-indicator-number",
  loopIndicator: "loop-indicator",
  loopIterationNumber: "loop-iteration-number",
  variableCard: (name) => `variable-card-${name}`,
  variableChangedBadge: (name) => `variable-changed-${name}`,
  whatChanged: "what-changed-block",
  changeItem: (i) => `change-item-${i}`,

  // AI
  aiExplanationText: "ai-explanation-text",

  // Output
  outputLine: (i) => `output-line-${i}`,

  // Inspector
  inspector: "trace-inspector",
  inspectorClose: "inspector-close",
  inspectorTab: (tab) => `inspector-tab-${tab}`,
  inspectorJson: "inspector-json",
  inspectorValidation: "inspector-validation",
};

// Kept for compatibility with legacy template
export const HOME = { emergentLink: "emergent-link" };
