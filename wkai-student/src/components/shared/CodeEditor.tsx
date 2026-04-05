import { useState, useRef } from "react";
import Editor from "@monaco-editor/react";
import { Play, Loader2, RotateCcw, ChevronDown } from "lucide-react";

const LANGUAGES = [
  { id: "python",     label: "Python",     starter: '# Write your Python here\nprint("Hello, workshop!")\n' },
  { id: "javascript", label: "JavaScript", starter: '// Write your JavaScript here\nconsole.log("Hello, workshop!");\n' },
  { id: "typescript", label: "TypeScript", starter: '// Write your TypeScript here\nconst greet = (name: string): string => `Hello, ${name}!`;\nconsole.log(greet("workshop"));\n' },
  { id: "bash",       label: "Bash",       starter: '#!/bin/bash\necho "Hello, workshop!"\n' },
  { id: "sql",        label: "SQL",        starter: '-- Write your SQL here\nSELECT "Hello, workshop!" AS greeting;\n' },
];

export function CodeEditor() {
  const [langId, setLangId] = useState("python");
  const [code, setCode]     = useState(LANGUAGES[0].starter);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [showLangs, setShowLangs] = useState(false);
  const editorRef = useRef<unknown>(null);

  const currentLang = LANGUAGES.find((l) => l.id === langId)!;

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
      setOutput("⚠ Could not connect to the code runner. Ask your instructor to check the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-wkai-border bg-wkai-surface px-3 py-2">
        {/* Language picker */}
        <div className="relative">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-wkai-border bg-wkai-bg px-3 py-1.5 text-xs font-mono text-wkai-text hover:border-wkai-text-dim transition-colors"
            onClick={() => setShowLangs((v) => !v)}
          >
            {currentLang.label}
            <ChevronDown size={11} className="text-wkai-text-dim" />
          </button>

          {showLangs && (
            <div className="absolute left-0 top-full mt-1 z-20 w-36 rounded-lg border border-wkai-border bg-wkai-surface shadow-xl overflow-hidden">
              {LANGUAGES.map((l) => (
                <button
                  key={l.id}
                  onClick={() => handleLangChange(l.id)}
                  className={`w-full px-3 py-2 text-left text-xs hover:bg-wkai-border transition-colors ${
                    l.id === langId ? "text-indigo-400 font-medium" : "text-wkai-text"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* Reset */}
        <button
          className="btn-ghost py-1.5 px-2 text-xs"
          onClick={() => { setCode(currentLang.starter); setOutput(null); }}
          title="Reset to starter code"
        >
          <RotateCcw size={12} />
        </button>

        {/* Run */}
        <button
          className="btn-primary py-1.5 px-3 text-xs"
          onClick={handleRun}
          disabled={running}
        >
          {running
            ? <><Loader2 size={12} className="animate-spin" /> Running…</>
            : <><Play size={12} /> Run</>
          }
        </button>
      </div>

      {/* Editor */}
      <div className={output ? "flex-[3]" : "flex-1"} style={{ minHeight: 0 }}>
        <Editor
          height="100%"
          language={langId}
          value={code}
          onChange={(v) => setCode(v ?? "")}
          onMount={(editor) => { editorRef.current = editor; }}
          theme="vs-dark"
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
        <div className="flex-1 border-t border-wkai-border bg-wkai-bg overflow-auto" style={{ minHeight: 0, maxHeight: "40%" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-wkai-border">
            <span className="text-xs font-mono text-wkai-text-dim">Output</span>
            <button
              className="text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
              onClick={() => setOutput(null)}
            >
              ✕
            </button>
          </div>
          <pre className="p-3 text-xs font-mono text-wkai-text leading-relaxed whitespace-pre-wrap">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
