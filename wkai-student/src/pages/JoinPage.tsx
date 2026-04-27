import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { joinRoom } from "../lib/api";
import { useStore } from "../store";

export function JoinPage() {
  const navigate = useNavigate();
  const { studentId, setSession, setGuideBlocks, setSharedFiles } = useStore();

  const [name, setName] = useState(localStorage.getItem("wkai_student_name") || "");
  // 6 individual digit/letter inputs
  const [chars, setChars] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus first input on mount if name exists, else focus name
  useEffect(() => {
    if (name) {
      refs.current[0]?.focus();
    }
  }, []);

  const roomCode = chars.join("").toUpperCase();
  const isComplete = chars.every((c) => c !== "") && name.trim().length > 0;

  function handleChar(i: number, val: string) {
    const ch = val.replace(/[^a-zA-Z0-9]/g, "").slice(-1).toUpperCase();
    const next = [...chars];
    next[i] = ch;
    setChars(next);
    if (ch && i < 5) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !chars[i] && i > 0) {
      refs.current[i - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
    const next = ["", "", "", "", "", ""];
    text.split("").forEach((c, i) => { next[i] = c; });
    setChars(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  async function handleJoin() {
    if (!isComplete) return;
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem("wkai_student_name", name);
      const data = await joinRoom(roomCode, studentId, name);
      if (data.session.status === "ended") {
        setError("This session has already ended.");
        return;
      }
      setSession(data.session);
      setGuideBlocks(data.guideBlocks);
      setSharedFiles(data.sharedFiles);
      navigate(`/room/${roomCode}`, { replace: true });
    } catch {
      setError("Room not found. Check the code and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
      {/* Brand */}
      <div className="mb-10 text-center space-y-2">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center">
          <img src="/wkai-logo.svg" alt="WKAI Logo" className="h-14 w-14 object-contain drop-shadow-lg" />
        </div>
        <h1 className="text-2xl font-bold text-wkai-text">Join Workshop</h1>
        <p className="text-sm text-wkai-text-dim">
          Enter the 6-character code your instructor shared
        </p>
      </div>

      {/* Name input */}
      <div className="mb-6 w-full max-w-[320px]">
        <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-wkai-text-dim">
          Your Name
        </label>
        <input
          className="h-12 w-full rounded-xl border border-wkai-border bg-wkai-surface px-4 text-sm font-medium text-wkai-text focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all placeholder:text-wkai-text-dim/30"
          placeholder="e.g. Alex Smith"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          spellCheck={false}
        />
      </div>

      {/* Code input */}
      <div className="flex gap-2" onPaste={handlePaste}>
        {chars.map((ch, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            className="h-14 w-12 rounded-xl border border-wkai-border bg-wkai-surface text-center text-xl font-bold font-mono text-wkai-text uppercase
              focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 transition-all
              placeholder:text-wkai-border"
            maxLength={1}
            value={ch}
            placeholder="·"
            onChange={(e) => handleChar(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            autoComplete="off"
            spellCheck={false}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Join button */}
      <button
        className="btn-primary mt-6 px-8 py-3 text-base"
        onClick={handleJoin}
        disabled={!isComplete || loading}
      >
        {loading
          ? <><Loader2 size={16} className="animate-spin" /> Joining…</>
          : <><ArrowRight size={16} /> Join Session</>
        }
      </button>

      <p className="mt-8 text-xs text-wkai-text-dim text-center max-w-xs">
        WKAI automatically generates a step-by-step guide of everything your
        instructor is teaching — in real time.
      </p>
    </div>
  );
}
