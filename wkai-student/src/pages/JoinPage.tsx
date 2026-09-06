import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, AlertCircle } from "lucide-react";
import axios from "axios";
import { joinRoom } from "../lib/api";
import { useStore } from "../store";
import { SettingsFab } from "../components/shared/SettingsFab";

export function JoinPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const handoffError = (location.state as { error?: string } | null)?.error ?? null;
  const { setAuth, setSession, setGuideBlocks, setSharedFiles } = useStore();

  const [name, setName] = useState(localStorage.getItem("wkai_student_name") || "");
  const [password, setPassword] = useState("");
  // 6 individual digit/letter inputs
  const [chars, setChars] = useState<string[]>(["", "", "", "", "", ""]);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(handoffError);

  // Returning student: the name is remembered, so start on the code.
  useEffect(() => {
    if (name) refs.current[0]?.focus();
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
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
    const next = ["", "", "", "", "", ""];
    text.split("").forEach((c, i) => { next[i] = c; });
    setChars(next);
    refs.current[Math.min(text.length, 5)]?.focus();
  }

  async function handleJoin(e?: React.FormEvent) {
    e?.preventDefault();
    if (!isComplete || loading) return;
    setLoading(true);
    setError(null);
    try {
      localStorage.setItem("wkai_student_name", name);
      const data = await joinRoom(roomCode, name, password.trim() || undefined);
      if (data.session.status === "ended") {
        setError("That session has already ended. Ask your instructor for a new code.");
        return;
      }
      // Persist the server-assigned identity + signed token for the WS connection.
      setAuth(data.studentId, data.joinToken);
      setSession(data.session);
      setGuideBlocks(data.guideBlocks);
      setSharedFiles(data.sharedFiles);
      navigate(`/room/${roomCode}`, { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else if (!err.response) {
          setError("Can't reach the WKAI server. Check your network, then try again.");
        } else {
          setError("No room with that code. Check the six characters and try again.");
        }
      } else {
        setError("No room with that code. Check the six characters and try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:py-16">
      <form onSubmit={handleJoin} className="w-full max-w-[22rem]">
        <div className="mb-8 space-y-2 text-center">
          <img src="/wkai-logo.svg" alt="" className="mx-auto mb-4 h-12 w-12 object-contain" />
          <h1 className="text-2xl font-bold text-wkai-text">Join the workshop</h1>
          <p className="text-sm text-wkai-text-dim">
            Enter the six-character code your instructor showed on screen.
          </p>
        </div>

        <div className="mb-5">
          <label htmlFor="student-name" className="mb-1.5 block text-sm font-medium text-wkai-text">
            Your name
          </label>
          <input
            id="student-name"
            className="input h-12 px-4"
            placeholder="Alex Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            spellCheck={false}
          />
          <p className="mt-1.5 text-xs text-wkai-text-dim">
            Shown to your instructor so they know who is asking.
          </p>
        </div>

        <fieldset className="mb-5 min-w-0">
          <legend className="mb-1.5 block text-sm font-medium text-wkai-text">Room code</legend>
          <div className="flex gap-2" onPaste={handlePaste}>
            {chars.map((ch, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el; }}
                aria-label={`Room code character ${i + 1}`}
                className="h-14 min-w-0 flex-1 rounded-xl border border-wkai-border bg-wkai-surface text-center font-mono text-xl font-bold uppercase text-wkai-text transition-colors placeholder:text-wkai-text-dim/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                maxLength={1}
                value={ch}
                placeholder="·"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                onChange={(e) => handleChar(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                spellCheck={false}
              />
            ))}
          </div>
        </fieldset>

        <div className="mb-5">
          <label htmlFor="room-password" className="mb-1.5 block text-sm font-medium text-wkai-text">
            Room password <span className="font-normal text-wkai-text-dim">(only if asked for one)</span>
          </label>
          <input
            id="room-password"
            className="input h-12 px-4"
            type="password"
            placeholder="Leave empty if there is none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
        </div>

        {error && (
          <p
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm leading-relaxed text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button className="btn-primary w-full py-3 text-base" type="submit" disabled={!isComplete || loading}>
          {loading
            ? <><Loader2 size={16} className="animate-spin" /> Joining…</>
            : <>Join session <ArrowRight size={16} /></>
          }
        </button>

        <p className="mx-auto mt-8 max-w-[30ch] text-center text-xs leading-relaxed text-wkai-text-dim">
          WKAI writes a step-by-step guide of the session as it happens, so you can catch up
          without stopping the class.
        </p>
      </form>

      <SettingsFab />
    </div>
  );
}
