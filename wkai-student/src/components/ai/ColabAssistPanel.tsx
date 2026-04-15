import { useMemo, useState } from "react";
import { Brain, Loader2, Link2, ClipboardList, Sparkles } from "lucide-react";
import { useStore } from "../../store";

interface Props {
  send: <T>(type: string, payload: T) => void;
}

function detectContentType(input: string): "url" | "log" | "code" | "error" {
  const trimmed = input.trim();
  if (trimmed.startsWith("https://colab.research.google.com")) return "url";
  if (/traceback/i.test(trimmed)) return "error";
  if (/^\s*(def |class |import |from |print\(|for |while |if )/m.test(trimmed)) return "code";
  return "log";
}

export function ColabAssistPanel({ send }: Props) {
  const { session, studentId, colabAdvice, colabFollowUps } = useStore();
  const [mode, setMode] = useState<"paste" | "url">("paste");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const placeholder = useMemo(
    () =>
      mode === "url"
        ? "Paste your Colab notebook URL"
        : "Paste Colab output, traceback, or code snippet",
    [mode]
  );

  function askAi() {
    const colabContent = input.trim();
    if (!colabContent || !session?.id || loading) return;
    const contentType = mode === "url" ? "url" : detectContentType(colabContent);
    setLoading(true);
    send("colab-assist-request", {
      sessionId: session.id,
      studentId,
      colabContent,
      contentType,
    });
    const unsub = useStore.subscribe((state) => {
      if (state.colabAdvice) {
        setLoading(false);
        unsub();
      }
    });
    window.setTimeout(() => {
      setLoading(false);
      unsub();
    }, 20000);
  }

  function sendFollowUp(question: string) {
    window.dispatchEvent(
      new CustomEvent("wkai:prefill-question", {
        detail: { text: question, autoSend: true },
      })
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-wkai-border px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-wkai-text-dim">
          Colab Assistant
        </p>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto">
        <div className="flex gap-2">
          <button
            className={`btn-ghost text-xs ${mode === "paste" ? "border border-indigo-400 text-indigo-400" : ""}`}
            onClick={() => setMode("paste")}
          >
            <ClipboardList size={12} />
            Paste Output
          </button>
          <button
            className={`btn-ghost text-xs ${mode === "url" ? "border border-indigo-400 text-indigo-400" : ""}`}
            onClick={() => setMode("url")}
          >
            <Link2 size={12} />
            Share URL
          </button>
        </div>

        {mode === "url" ? (
          <input
            className="input"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
        ) : (
          <textarea
            className="input font-mono text-xs resize-none h-36"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
        )}

        <button
          className="btn-primary w-full justify-center"
          disabled={!input.trim() || loading}
          onClick={askAi}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          {loading ? "Analyzing..." : "Ask AI"}
        </button>

        {colabAdvice && (
          <div className="rounded-xl border border-wkai-border bg-wkai-surface p-3 space-y-2">
            <p className="text-xs uppercase tracking-widest text-indigo-400 flex items-center gap-1">
              <Sparkles size={12} />
              Advice
            </p>
            <p className="text-sm text-wkai-text leading-relaxed">{colabAdvice}</p>
          </div>
        )}

        {colabFollowUps.length > 0 && (
          <div className="rounded-xl border border-wkai-border bg-wkai-surface p-3 space-y-2">
            <p className="text-xs uppercase tracking-widest text-wkai-text-dim">
              Suggested Follow-ups
            </p>
            <div className="space-y-1.5">
              {colabFollowUps.map((q) => (
                <button
                  key={q}
                  className="w-full text-left rounded-lg border border-wkai-border px-2.5 py-2 text-xs text-wkai-text-dim hover:text-wkai-text hover:border-indigo-400 transition-colors"
                  onClick={() => sendFollowUp(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
