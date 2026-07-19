import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useTraceStore, selectCurrentStep } from "@/store/traceStore";
import { TF } from "@/constants/testIds";
import { FileCode2 } from "lucide-react";

/**
 * Left panel — Monaco editor.
 * Read-only in Phase 1-4 (mocked trace). The current executing line is
 * highlighted via a Monaco decoration and a glyph in the gutter.
 */
export default function CodeEditor() {
  const trace = useTraceStore((s) => s.trace);
  const currentStep = useTraceStore(selectCurrentStep);

  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);

  const handleMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define a dark theme that matches TraceFlow palette
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

  // Update the current-line decoration whenever the step changes
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !currentStep) return;

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
  }, [currentStep]);

  return (
    <div
      data-testid={TF.codeEditor}
      className="h-full flex flex-col bg-[hsl(var(--tf-bg))]"
    >
      <PanelHeader
        icon={<FileCode2 className="w-3.5 h-3.5" />}
        title="Code"
        subtitle={trace ? `${trace.name} · Java` : "Java"}
      />
      <div className="flex-1 min-h-0" data-testid={TF.monacoEditor}>
        <Editor
          height="100%"
          defaultLanguage="java"
          language="java"
          value={trace?.code ?? "// Loading sample…"}
          onMount={handleMount}
          theme="traceflow-dark"
          options={{
            readOnly: true,
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
          }}
        />
      </div>
    </div>
  );
}

function PanelHeader({ icon, title, subtitle }) {
  return (
    <div className="h-9 flex items-center gap-2 px-3 border-b border-[hsl(var(--tf-border))] bg-[hsl(var(--tf-panel))] shrink-0">
      <span className="text-[hsl(var(--tf-text-muted))]">{icon}</span>
      <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[hsl(var(--tf-text))]">
        {title}
      </span>
      {subtitle && (
        <span className="text-[11px] text-[hsl(var(--tf-text-dim))] mono ml-1 truncate">
          · {subtitle}
        </span>
      )}
    </div>
  );
}
