import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, StopCircle } from "lucide-react";
import { clsx } from "clsx";
import { useAppStore } from "../../store";
import { endSession } from "../../lib/tauri";

/**
 * Ending a session is destructive for everyone in the room, so it asks twice.
 * The confirm state times out on its own rather than sticking around armed.
 */
export function EndSessionButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const { setSession, clearGuide, addDebugLog } = useAppStore();
  const navigate = useNavigate();

  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  async function handleEnd() {
    if (!confirm) {
      setConfirm(true);
      timeoutRef.current = window.setTimeout(() => setConfirm(false), 4000);
      return;
    }
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);

    setLoading(true);
    try {
      // Flush any in-progress recording first — the listener lives in
      // useSessionRecorder, which owns the MediaRecorder.
      window.dispatchEvent(new Event("wkai:force-stop-recording"));
      const { settings, session } = useAppStore.getState();
      await endSession(sessionId, settings.backendUrl, session?.instructorToken);
      setSession(null);
      clearGuide();
      navigate("/");
    } catch (err) {
      addDebugLog(`Could not end the session: ${String(err)}`, "error");
      setConfirm(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleEnd}
      disabled={loading}
      className={clsx(
        "btn h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-semibold",
        confirm
          ? "bg-danger text-white hover:brightness-110"
          : "border border-danger/30 bg-danger/10 text-danger hover:bg-danger/20"
      )}
      title="End the session for everyone"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : <StopCircle size={16} />}
      {loading ? "Ending…" : confirm ? "Tap again to end" : "End session"}
    </button>
  );
}
