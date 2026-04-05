import { useEffect, useState } from "react";
import { Share2, X, Loader2 } from "lucide-react";
import { shareFile } from "../../lib/tauri";
import type { WatchedFile } from "../../types";

interface IntentPayload {
  file: WatchedFile;
  confidence: number;
}

export function ShareIntentToast({ sessionId }: { sessionId: string }) {
  const [pending, setPending] = useState<IntentPayload | null>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const payload = (e as CustomEvent<IntentPayload>).detail;
      setPending(payload);
      // Auto-dismiss after 12 seconds if no action taken
      setTimeout(() => setPending(null), 12_000);
    };
    window.addEventListener("wkai:shareIntent", handler);
    return () => window.removeEventListener("wkai:shareIntent", handler);
  }, []);

  if (!pending) return null;

  async function handleShare() {
    if (!pending) return;
    setSharing(true);
    try {
      await shareFile(sessionId, pending.file.path);
    } catch (err) {
      console.error("Share failed", err);
    } finally {
      setSharing(false);
      setPending(null);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-indigo-500/40 bg-wkai-surface shadow-2xl shadow-black/40 animate-slide-up">
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500/20">
          <Share2 size={15} className="text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-wkai-text">Share intent detected</p>
          <p className="text-xs text-wkai-text-dim mt-0.5 truncate">
            "{pending.file.name}"
          </p>
          <p className="text-xs text-indigo-400 mt-0.5">
            {(pending.confidence * 100).toFixed(0)}% confident
          </p>
        </div>
        <button
          onClick={() => setPending(null)}
          className="text-wkai-text-dim hover:text-wkai-text"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex gap-2 border-t border-wkai-border px-4 py-3">
        <button
          className="btn-ghost flex-1 justify-center text-xs py-1.5"
          onClick={() => setPending(null)}
        >
          Dismiss
        </button>
        <button
          className="btn-primary flex-1 justify-center text-xs py-1.5"
          onClick={handleShare}
          disabled={sharing}
        >
          {sharing
            ? <><Loader2 size={12} className="animate-spin" /> Sharing…</>
            : <><Share2 size={12} /> Share Now</>
          }
        </button>
      </div>
    </div>
  );
}
