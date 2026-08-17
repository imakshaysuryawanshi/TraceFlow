import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  useTraceStore,
  selectCurrentStep,
  selectCodeDirty,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { FileCode2, Pencil, RotateCcw } from "lucide-react";
import { extractVariablesFromCode, updateVariableInCode, injectBugInCode, prependVariableToCode } from "@/store/snippetStorage";

/**
 * Left panel — Monaco editor.
 * Phase 4: editable, but "Run Trace" only replays the mock trace when the
 * code has not diverged from the loaded sample. Phase 5+ will POST the
 * draft code to /api/execute.
 */
const LANG_LABELS = { java: "Java", python: "Python", javascript: "JavaScript" };

export default function CodeEditor() {
  const trace = useTraceStore((s) => s.trace);
  const draftCode = useTraceStore((s) => s.draftCode);
  const language = useTraceStore((s) => s.language);
  const setDraftCode = useTraceStore((s) => s.setDraftCode);
  const resetCode = useTraceStore((s) => s.resetCode);
  const runTrace = useTraceStore((s) => s.runTrace);
  const currentStep = useTraceStore(selectCurrentStep);
  const codeDirty = useTraceStore(selectCodeDirty);
  const theme = useTraceStore((s) => s.theme);

  // Breakpoints
  const breakpoints = useTraceStore((s) => s.breakpoints);
  const breakpointHitMessage = useTraceStore((s) => s.breakpointHitMessage);
  const addBreakpoint = useTraceStore((s) => s.addBreakpoint);
  const removeBreakpoint = useTraceStore((s) => s.removeBreakpoint);
  const toggleBreakpoint = useTraceStore((s) => s.toggleBreakpoint);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const detectedInputs = extractVariablesFromCode(draftCode);

  const handleInputChange = async (varName, newValue) => {
    const updatedCode = updateVariableInCode(draftCode, varName, newValue);
    setDraftCode(updatedCode);
    
    // If the input value is empty, do not trigger a backend run (prevents parsing invalid syntax e.g. "int sum = ;")
    if (newValue.trim() === "") {
      return;
    }
    
    // Auto re-run trace to trigger execution engine refresh immediately
    setTimeout(() => {
      runTrace();
    }, 100);
  };

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme("traceflow-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "7dd3fc" },
        { token: "type", foreground: "a5f3fc" },
        { token: "number", foreground: "fbbf24" },
        { token: "string", foreground: "86efac" },
        { token: "comment", foreground: "6b7280", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#0b0d10",
        "editor.foreground": "#e5e7eb",
        "editorLineNumber.foreground": "#3f4753",
        "editorLineNumber.activeForeground": "#94a3b8",
        "editor.lineHighlightBackground": "#11151b",
        "editor.selectionBackground": "#164e63aa",
        "editorCursor.foreground": "#22d3ee",
        "editorGutter.background": "#0b0d10",
        "editorIndentGuide.background": "#1a1f27",
        "editorIndentGuide.activeBackground": "#2a323d",
      },
    });

    monaco.editor.defineTheme("traceflow-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "keyword", foreground: "0284c7" },
        { token: "type", foreground: "0891b2" },
        { token: "number", foreground: "d97706" },
        { token: "string", foreground: "16a34a" },
        { token: "comment", foreground: "9ca3af", fontStyle: "italic" },
      ],
      colors: {
        "editor.background": "#ffffff",
        "editor.foreground": "#0f172a",
        "editorLineNumber.foreground": "#cbd5e1",
        "editorLineNumber.activeForeground": "#64748b",
        "editor.lineHighlightBackground": "#f8fafc",
        "editor.selectionBackground": "#e0f2fe",
        "editorCursor.foreground": "#0284c7",
        "editorGutter.background": "#ffffff",
        "editorIndentGuide.background": "#f1f5f9",
        "editorIndentGuide.activeBackground": "#e2e8f0",
      },
    });

    monaco.editor.setTheme(theme === "dark" ? "traceflow-dark" : "traceflow-light");
  };

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(theme === "dark" ? "traceflow-dark" : "traceflow-light");
    }
  }, [theme]);

  // Update the current-line decoration whenever the step changes. Skipped
  // when the user has edited the code (line numbers may no longer match
  // the mocked trace).
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !currentStep) return;

    if (codeDirty) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }

    const line = currentStep.line;
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: "tf-current-line",
            glyphMarginClassName: "tf-current-line-glyph",
          },
        },
      ]
    );
    editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentStep, codeDirty]);

  const resetLocal = () => {
    resetCode();
  };

  return (
    <div
      data-testid={TF.codeEditor}
      className="h-full flex flex-col bg-[hsl(var(--tf-bg))]"
    >
      <div className="h-9 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0">
        <FileCode2 className="w-3.5 h-3.5 text-[hsl(var(--tf-text-muted))]" />
        <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--tf-text))]">
          Code
        </span>
        {trace && (
          <span className="text-[11px] text-[hsl(var(--tf-text-dim))] mono ml-1 truncate">
            · {trace.name} · {LANG_LABELS[language] ?? "Java"}
          </span>
        )}
        {trace && (
          <select
            onChange={(e) => {
              const bug = e.target.value;
              if (bug) {
                const buggedCode = injectBugInCode(draftCode, bug);
                setDraftCode(buggedCode);
                setTimeout(() => runTrace(), 100);
              }
              e.target.value = "";
            }}
            className="ml-3 h-5 px-1 rounded text-[9.5px] uppercase font-bold tracking-wider border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel-2))] text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] hover:border-[hsl(var(--tf-text-dim))] focus:outline-none cursor-pointer transition-colors duration-200"
            defaultValue=""
          >
            <option value="" disabled>Introduce Bug...</option>
            <option value="off_by_one">Off-by-One</option>
            <option value="missing_increment">Missing Increment</option>
            <option value="wrong_comparison">Wrong Comparison</option>
          </select>
        )}
        <span className="ml-auto flex items-center gap-2">
          {codeDirty ? (
            <>
              <span className="flex items-center gap-1 text-[10.5px] mono text-[hsl(var(--tf-warning))]">
                <Pencil className="w-3 h-3" />
                edited
              </span>
              <button
                onClick={resetLocal}
                className="flex items-center gap-1 text-[10.5px] mono text-[hsl(var(--tf-text-muted))] hover:text-[hsl(var(--tf-text))] transition-colors"
                title="Revert to sample code (also clears the saved local override)"
                data-testid="reset-code-btn"
              >
                <RotateCcw className="w-3 h-3" />
                reset
              </button>
            </>
          ) : (
            <span className="text-[10.5px] mono text-[hsl(var(--tf-text-dim))]">
              editable
            </span>
          )}
        </span>
      </div>
      <div className="flex-1 min-h-0" data-testid={TF.monacoEditor}>
        <Editor
          height="100%"
          key={language}
          language={language}
          value={draftCode}
          onChange={(v) => setDraftCode(v ?? "")}
          onMount={handleMount}
          theme="traceflow-dark"
          options={{
            readOnly: false,
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 13.5,
            fontLigatures: false,
            minimap: { enabled: false },
            glyphMargin: true,
            lineNumbers: "on",
            renderLineHighlight: "none",
            scrollBeyondLastLine: false,
            padding: { top: 14, bottom: 14 },
            smoothScrolling: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            guides: { indentation: true },
            contextmenu: false,
            tabSize: 4,
          }}
        />
      </div>
      {/* Bottom Controls Panel (Inputs + Breakpoints) */}
      <div className="h-28 border-t border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] grid grid-cols-2 gap-4 p-3 shrink-0">
        
        {/* Left Column: Input Variables */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 select-none">
            <span className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-[hsl(var(--tf-text-muted))]">
              Input Variables
            </span>
            <span className="text-[9.5px] text-[hsl(var(--tf-text-dim))] mono">
              (edit values to auto-run)
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {detectedInputs.length > 0 ? (
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {detectedInputs.map((input) => (
                  <div key={input.name} className="flex items-center gap-1.5">
                    <span className="text-[11px] mono text-[hsl(var(--tf-text-dim))] select-none">
                      {input.name} =
                    </span>
                    <input
                      type="text"
                      value={input.value}
                      onChange={(e) => handleInputChange(input.name, e.target.value)}
                      className="w-14 h-5 px-1 text-[11px] mono rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] focus:outline-none focus:border-[hsl(var(--tf-accent))]"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-[hsl(var(--tf-text-dim))] italic select-none">
                No variables detected in top 10 lines.
              </div>
            )}
          </div>

          {/* Add Input Variable Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = e.target.varName.value.trim();
              const val = e.target.varVal.value.trim();
              if (name && val) {
                const updatedCode = prependVariableToCode(draftCode, language, name, val);
                setDraftCode(updatedCode);
                setTimeout(() => runTrace(), 100);
                e.target.reset();
              }
            }}
            className="flex items-center gap-1.5 mt-1.5 border-t border-[hsl(var(--tf-border))]/30 pt-1.5 shrink-0"
          >
            <input
              name="varName"
              type="text"
              placeholder="Name"
              pattern="^[a-zA-Z_][a-zA-Z0-9_]*$"
              title="Variable name must be valid identifier (e.g. nums, target, x)"
              className="w-12 h-5 px-1 text-[10px] mono rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] focus:outline-none focus:border-[hsl(var(--tf-accent))]"
              required
            />
            <span className="text-[10px] text-[hsl(var(--tf-text-dim))] mono select-none">=</span>
            <input
              name="varVal"
              type="text"
              placeholder="Value"
              className="flex-1 h-5 px-1 text-[10px] mono rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] focus:outline-none focus:border-[hsl(var(--tf-accent))]"
              required
            />
            <button
              type="submit"
              className="h-5 px-2 rounded bg-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent-2))] text-black font-bold text-[10px] transition-colors select-none"
              title="Declare this variable at the top of the file"
            >
              Add
            </button>
          </form>
        </div>

        {/* Right Column: Breakpoints */}
        <div className="flex flex-col min-w-0 border-l border-[hsl(var(--tf-border))] pl-4">
          <div className="flex items-center gap-2 mb-2 select-none">
            <span className="text-[10.5px] uppercase tracking-[0.12em] font-semibold text-[hsl(var(--tf-text-muted))]">
              Breakpoints
            </span>
            {breakpointHitMessage && (
              <span className="text-[9.5px] text-[hsl(var(--tf-danger))] font-semibold animate-pulse">
                ({breakpointHitMessage})
              </span>
            )}
          </div>
          
          {/* Add Breakpoint Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const line = e.target.line.value;
              const cond = e.target.condition.value;
              if (line) {
                addBreakpoint(line, cond);
                e.target.reset();
              }
            }}
            className="flex items-center gap-2 mb-2 shrink-0 animate-fade-in"
          >
            <input
              name="line"
              type="number"
              placeholder="Line"
              className="w-12 h-6 px-1.5 text-[11px] mono rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] focus:outline-none focus:border-[hsl(var(--tf-accent))]"
              min="1"
              required
            />
            <input
              name="condition"
              type="text"
              placeholder="Condition (e.g. sum > 5)"
              className="flex-1 h-6 px-1.5 text-[11px] mono rounded border border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-bg))] text-[hsl(var(--tf-text))] focus:outline-none focus:border-[hsl(var(--tf-accent))]"
            />
            <button
              type="submit"
              className="h-6 px-2 rounded bg-[hsl(var(--tf-accent))] hover:bg-[hsl(var(--tf-accent-2))] text-black font-bold text-[11px] transition-colors"
            >
              +
            </button>
          </form>

          {/* Breakpoints List */}
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {breakpoints.length > 0 ? (
              breakpoints.map((bp) => (
                <div key={bp.id} className="flex items-center justify-between text-[11px] mono px-2 py-0.5 rounded bg-[hsl(var(--tf-bg))] border border-[hsl(var(--tf-border))]/50">
                  <div className="flex items-center gap-1.5 truncate">
                    <input
                      type="checkbox"
                      checked={bp.enabled}
                      onChange={() => toggleBreakpoint(bp.id)}
                      className="cursor-pointer accent-[hsl(var(--tf-accent))]"
                    />
                    <span className={bp.enabled ? "text-[hsl(var(--tf-text))]" : "text-[hsl(var(--tf-text-dim))] line-through"}>
                      Line {bp.line} {bp.condition && `if (${bp.condition})`}
                    </span>
                  </div>
                  <button
                    onClick={() => removeBreakpoint(bp.id)}
                    className="text-[hsl(var(--tf-text-dim))] hover:text-[hsl(var(--tf-danger))] font-bold px-1 ml-1"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-[hsl(var(--tf-text-dim))] italic select-none">
                No breakpoints set.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
