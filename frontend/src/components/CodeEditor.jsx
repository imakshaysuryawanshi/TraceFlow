import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import {
  useTraceStore,
  selectCurrentStep,
  selectCodeDirty,
} from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { FileCode2, Pencil, RotateCcw } from "lucide-react";

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
  const currentStep = useTraceStore(selectCurrentStep);
  const codeDirty = useTraceStore(selectCodeDirty);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

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
    monaco.editor.setTheme("traceflow-dark");
  };

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
    </div>
  );
}
