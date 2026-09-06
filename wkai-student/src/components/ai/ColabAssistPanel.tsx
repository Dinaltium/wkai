import { useMemo, useState } from "react";
import { Brain, Loader2, Link2, ClipboardList, Sparkles } from "lucide-react";
import { clsx } from "clsx";
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
        ? "https://colab.research.google.com/drive/…"
        : "Paste Colab output, a traceback, or the cell you are stuck on",
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
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Colab assistant</h2>
          <p className="panel-sub">Share a notebook or its output and get feedback with workshop context.</p>
        </div>
      </div>

      <div className="scroll-area space-y-3 p-3 sm:p-4">
        <div className="seg" role="tablist" aria-label="Input type">
          <button
            role="tab"
            aria-selected={mode === "paste"}
            className={clsx("seg-item", mode === "paste" && "seg-item-active")}
            onClick={() => setMode("paste")}
          >
            <ClipboardList size={13} />
            Paste output
          </button>
          <button
            role="tab"
            aria-selected={mode === "url"}
            className={clsx("seg-item", mode === "url" && "seg-item-active")}
            onClick={() => setMode("url")}
          >
            <Link2 size={13} />
            Share URL
          </button>
        </div>

        {mode === "url" ? (
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="Colab notebook URL"
          />
        ) : (
          <textarea
            className="input h-36 resize-none font-mono text-xs"
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            aria-label="Colab output"
          />
        )}

        <button className="btn-primary w-full" disabled={!input.trim() || loading} onClick={askAi}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
          {loading ? "Analysing…" : "Ask AI"}
        </button>

        {colabAdvice && (
          <div className="card space-y-2 p-3.5 animate-slide-up">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-text">
              <Sparkles size={13} />
              Advice
            </p>
            <p className="max-w-[70ch] text-sm leading-relaxed text-wkai-text">{colabAdvice}</p>
          </div>
        )}

        {colabFollowUps.length > 0 && (
          <div className="card space-y-2 p-3.5">
            <p className="text-xs font-semibold text-wkai-text">Ask a follow-up</p>
            <div className="space-y-1.5">
              {colabFollowUps.map((q: string) => (
                <button
                  key={q}
                  className="w-full rounded-lg border border-wkai-border px-3 py-2.5 text-left text-xs leading-relaxed text-wkai-text-dim transition-colors hover:border-accent/60 hover:text-wkai-text"
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
