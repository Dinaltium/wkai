import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StopCircle, Loader2 } from "lucide-react";
import { useAppStore } from "../../store";
import { endSession, stopCapture } from "../../lib/tauri";

export function EndSessionButton({ sessionId }: { sessionId: string }) {
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const { setSession, setCapture, clearGuide } = useAppStore();
  const navigate = useNavigate();

  async function handleEnd() {
    if (!confirm) {
      setConfirm(true);
      setTimeout(() => setConfirm(false), 3000);
      return;
    }

    setLoading(true);
    try {
      await stopCapture();
      const { settings } = useAppStore.getState();
      await endSession(sessionId, settings.backendUrl);
      setSession(null);
      setCapture({ isCapturing: false, framesSent: 0, lastFrameAt: null });
      clearGuide();
      navigate("/");
    } catch (err) {
      console.error("Failed to end session", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleEnd}
      disabled={loading}
      className={`w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all ${
        confirm
          ? "bg-red-500 text-white hover:bg-red-600"
          : "btn-danger"
      }`}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <StopCircle size={13} />
      )}
      {loading ? "Ending…" : confirm ? "Tap again to confirm" : "End Session"}
    </button>
  );
}