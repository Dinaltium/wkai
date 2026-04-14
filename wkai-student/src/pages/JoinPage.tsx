import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { joinRoom } from "../lib/api";
import { useStore } from "../store";

export function JoinPage() {
  const navigate = useNavigate();
  const { setSession, setGuideBlocks, setSharedFiles, setSessionEnded, setConnected, setActiveTab } = useStore();

  const [studentName, setStudentName] = useState(
    sessionStorage.getItem("wkai_student_name") ?? ""
  );

  // 6 individual digit/letter inputs
  const [chars, setChars] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [backendUrl, setBackendUrl] = useState(
    sessionStorage.getItem('wkai_backend_url') ?? ''
  );

  function saveBackendUrl() {
    if (backendUrl.trim()) {
      sessionStorage.setItem('wkai_backend_url', backendUrl.trim());
    } else {
      sessionStorage.removeItem('wkai_backend_url');
    }
  }

  // Auto-focus first input on mount
  useEffect(() => { refs.current[0]?.focus(); }, []);

  const roomCode = chars.join("").toUpperCase();
  const isComplete = chars.every((c) => c !== "");

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
    if (!studentName.trim()) {
      setError("Please enter your name before joining.");
      return;
    }
    sessionStorage.setItem("wkai_student_name", studentName.trim());
    setLoading(true);
    setError(null);
    try {
      const data = await joinRoom(roomCode);
      if (data.session.status === "ended") {
        setError("This session has already ended.");
        return;
      }
      // Reset stale state from any previous ended/disconnected room before entering a new one.
      setSessionEnded(false);
      setConnected(false);
      setActiveTab("live");
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
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-white font-bold text-xl shadow-lg shadow-indigo-500/30">
          WK
        </div>
        <h1 className="text-2xl font-bold text-wkai-text">Join Workshop</h1>
        <p className="text-sm text-wkai-text-dim">
          Enter the 6-character code your instructor shared
        </p>
      </div>

      <div className="w-full max-w-xs mb-6">
        <input
          className="input text-center"
          placeholder="Your name"
          value={studentName}
          onChange={(e) => setStudentName(e.target.value)}
          maxLength={40}
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

      {/* Advanced toggle */}
      <button
        className="mt-4 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
        onClick={() => setShowAdvanced(v => !v)}
      >
        {showAdvanced ? 'Hide' : 'Advanced settings'}
      </button>

      {showAdvanced && (
        <div className="mt-3 w-full max-w-xs space-y-2">
          <p className="text-xs text-wkai-text-dim text-center">
            Enter the instructor's backend URL if not on localhost
          </p>
          <input
            className="h-10 w-full rounded-lg border border-wkai-border bg-wkai-surface px-3 text-xs font-mono text-wkai-text focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all"
            placeholder="http://192.168.1.x:4000"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            onBlur={saveBackendUrl}
          />
        </div>
      )}

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
