import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import axios from "axios";
import { getRoomPreflight, joinRoom } from "../../lib/api";
import { useStore } from "../../store";

/**
 * The door for anyone arriving on /room/:code from an invite link.
 *
 * Following a link used to drop the student straight into the session under
 * the name "Student" — the instructor's participant list filled up with
 * identical strangers, and a room with a password bounced to the code entry
 * saying "check the code" when the code had been right all along.
 *
 * So ask, and ask only for what this particular room actually needs: the
 * preflight says whether there is a password before anyone types one.
 */
export function RoomEntryGate({ code }: { code: string }) {
  const { setAuth, setSession, setGuideBlocks, setSharedFiles } = useStore();

  const [name, setName] = useState(() => localStorage.getItem("wkai_student_name") || "");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [checking, setChecking] = useState(true);
  const [joining, setJoining] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRoomPreflight(code)
      .then((room) => {
        if (cancelled) return;
        if (room.status === "ended") {
          setFatal("That session has already ended. Ask your instructor for a new code.");
          return;
        }
        setPasswordRequired(room.passwordRequired);
      })
      .catch((err) => {
        if (cancelled) return;
        setFatal(
          axios.isAxiosError(err) && !err.response
            ? "Can't reach the WKAI server. Check your network, then try again."
            : `No room with the code ${code}. Check it with your instructor.`
        );
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!checking && !fatal) nameRef.current?.focus();
  }, [checking, fatal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (joining || !name.trim() || (passwordRequired && !password)) return;

    setJoining(true);
    setError(null);
    try {
      localStorage.setItem("wkai_student_name", name.trim());
      const data = await joinRoom(code, name.trim(), password.trim() || undefined);

      if (data.session.status === "ended") {
        setFatal("That session has already ended. Ask your instructor for a new code.");
        return;
      }

      setAuth(data.studentId, data.joinToken);
      setSession(data.session);
      setGuideBlocks(data.guideBlocks);
      setSharedFiles(data.sharedFiles);
    } catch (err) {
      // The server distinguishes a wrong password from a missing room; say
      // which, so nobody retypes a code that was never the problem.
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401) {
          setError("That password does not match. Check it with your instructor.");
          setPasswordRequired(true);
        } else if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else if (!err.response) {
          setError("Can't reach the WKAI server. Check your network, then try again.");
        } else {
          setError("Could not join this room. Try again in a moment.");
        }
      } else {
        setError("Could not join this room. Try again in a moment.");
      }
    } finally {
      setJoining(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-10">
        <p className="flex items-center gap-2 text-sm text-wkai-text-dim">
          <Loader2 size={16} className="animate-spin" />
          Checking room {code}…
        </p>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-[22rem] text-center">
          <img src="/wkai-logo.svg" alt="" className="mx-auto mb-4 h-12 w-12 object-contain" />
          <p
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-3 text-left text-sm leading-relaxed text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {fatal}
          </p>
          <Link to="/join" className="btn-primary inline-flex w-full justify-center py-3 text-base">
            Enter a different code
          </Link>
        </div>
      </div>
    );
  }

  const canSubmit = name.trim().length > 0 && (!passwordRequired || password.length > 0);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 sm:py-16">
      <form onSubmit={handleSubmit} className="w-full max-w-[22rem]">
        <div className="mb-8 space-y-2 text-center">
          <img src="/wkai-logo.svg" alt="" className="mx-auto mb-4 h-12 w-12 object-contain" />
          <h1 className="text-2xl font-bold text-wkai-text">What's your name?</h1>
          <p className="text-sm text-wkai-text-dim">
            You're joining room{" "}
            <span className="font-mono font-semibold tracking-wider text-wkai-text">{code}</span>.
          </p>
        </div>

        <div className="mb-5">
          <label htmlFor="gate-name" className="mb-1.5 block text-sm font-medium text-wkai-text">
            Your name
          </label>
          <input
            id="gate-name"
            ref={nameRef}
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

        {passwordRequired && (
          <div className="mb-5">
            <label htmlFor="gate-password" className="mb-1.5 block text-sm font-medium text-wkai-text">
              Room password
            </label>
            {/* "new-password" keeps Chrome from filling a saved credential pair
                into this field and whatever text input precedes it. */}
            <input
              id="gate-password"
              name="gate-password"
              className="input h-12 px-4"
              type="password"
              placeholder="Ask your instructor"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              data-lpignore="true"
              data-1p-ignore
            />
            <p className="mt-1.5 text-xs text-wkai-text-dim">This room is password protected.</p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-3 text-sm leading-relaxed text-danger"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button className="btn-primary w-full py-3 text-base" type="submit" disabled={!canSubmit || joining}>
          {joining ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Joining…
            </>
          ) : (
            <>
              Join session <ArrowRight size={16} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
