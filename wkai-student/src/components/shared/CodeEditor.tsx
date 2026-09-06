import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Play, Loader2, RotateCcw, ChevronDown, X } from "lucide-react";
import { useTheme } from "../../lib/theme";

const LANGUAGES = [
  { id: "python",     label: "Python",     starter: '# Write your Python here\nprint("Hello, workshop!")\n' },
  { id: "javascript", label: "JavaScript", starter: '// Write your JavaScript here\nconsole.log("Hello, workshop!");\n' },
  { id: "typescript", label: "TypeScript", starter: '// Write your TypeScript here\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("workshop"));\n' },
  { id: "bash",       label: "Bash",       starter: '#!/bin/bash\necho "Hello, workshop!"\n' },
  { id: "sql",        label: "SQL",        starter: '-- Write your SQL here\nSELECT "Hello, workshop!" AS greeting;\n' },
];

export function CodeEditor() {
  const { mode } = useTheme();
  const [langId, setLangId] = useState("python");
  const [code, setCode]     = useState(LANGUAGES[0].starter);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showLangs, setShowLangs] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<unknown>(null);

  const currentLang = LANGUAGES.find((l) => l.id === langId)!;

  useEffect(() => {
    if (!showLangs) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowLangs(false);
    }
    function onPointer(e: PointerEvent) {
      if (!langRef.current?.contains(e.target as Node)) setShowLangs(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [showLangs]);

  function handleLangChange(id: string) {
    const lang = LANGUAGES.find((l) => l.id === id)!;
    setLangId(id);
    setCode(lang.starter);
    setOutput(null);
    setShowLangs(false);
  }

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setOutput(null);

    try {
      // Calls our backend sandbox endpoint
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: langId, code }),
      });
      const data = await res.json();
      setOutput(data.output ?? data.error ?? "No output");
    } catch {
      setOutput("Could not reach the code runner. Ask your instructor to check the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-wkai-border bg-wkai-surface px-2 py-2 sm:px-3">
        <div className="relative" ref={langRef}>
          <button
            className="flex h-9 items-center gap-1.5 rounded-lg [@media(pointer:coarse)]:h-11 border border-wkai-border bg-wkai-bg px-3 font-mono text-xs text-wkai-text transition-colors hover:border-wkai-text-dim"
            onClick={() => setShowLangs((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={showLangs}
          >
            {currentLang.label}
            <ChevronDown size={12} className="text-wkai-text-dim" />
          </button>

          {showLangs && (
            <ul
              role="listbox"
              className="absolute left-0 top-full z-dropdown mt-1 w-40 overflow-hidden rounded-lg border border-wkai-border bg-wkai-surface shadow-xl"
            >
              {LANGUAGES.map((l) => (
                <li key={l.id}>
                  <button
                    role="option"
                    aria-selected={l.id === langId}
                    onClick={() => handleLangChange(l.id)}
                    className={`w-full px-3 py-2.5 text-left text-xs transition-colors hover:bg-wkai-surface2 ${
                      l.id === langId ? "font-medium text-accent-text" : "text-wkai-text"
                    }`}
                  >
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex-1" />

        <button
          className="btn-ghost btn-sm btn-icon"
          onClick={() => { setCode(currentLang.starter); setOutput(null); }}
          title="Reset to starter code"
          aria-label="Reset to starter code"
        >
          <RotateCcw size={14} />
        </button>

        <button className="btn-primary btn-sm" onClick={handleRun} disabled={running}>
          {running
            ? <><Loader2 size={13} className="animate-spin" /> Running…</>
            : <><Play size={13} /> Run</>
          }
        </button>
      </div>

      {/* Editor */}
      <div className="min-h-0 flex-[3]">
        <Editor
          height="100%"
          language={langId}
          value={code}
          onChange={(v) => setCode(v ?? "")}
          onMount={(editor) => { editorRef.current = editor; }}
          theme={mode === "light" ? "light" : "vs-dark"}
          options={{
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontLigatures: true,
            minimap: { enabled: false },
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            padding: { top: 12, bottom: 12 },
            renderLineHighlight: "gutter",
            scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
          }}
        />
      </div>

      {/* Output pane */}
      {output !== null && (
        <div className="flex min-h-0 flex-[2] flex-col border-t border-wkai-border bg-wkai-bg">
          <div className="flex shrink-0 items-center justify-between border-b border-wkai-border px-3 py-1.5">
            <span className="font-mono text-xs text-wkai-text-dim">Output</span>
            <button
              className="rounded-md p-1.5 text-wkai-text-dim transition-colors hover:bg-wkai-surface2 hover:text-wkai-text"
              onClick={() => setOutput(null)}
              aria-label="Close output"
            >
              <X size={14} />
            </button>
          </div>
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-relaxed text-wkai-text">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
