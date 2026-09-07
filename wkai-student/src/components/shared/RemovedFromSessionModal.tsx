import { useNavigate } from "react-router-dom";
import { LogOut, UserMinus } from "lucide-react";
import { useStore } from "../../store";

/**
 * The instructor removed this student. Unlike a dropped connection there is
 * nothing to wait for, so this blocks the room outright — but it still lets
 * them keep what they already have (the guide, the shared files) rather than
 * ejecting them mid-sentence with no explanation.
 */
export function RemovedFromSessionModal({ onReview }: { onReview: () => void }) {
  const navigate = useNavigate();
  const message = useStore((s) => s.removedFromSession);
  const guideBlocks = useStore((s) => s.guideBlocks);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-slide-up space-y-6 rounded-2xl border border-wkai-border bg-wkai-surface p-6 shadow-2xl">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-danger/15">
            <UserMinus size={22} className="text-danger" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">You were removed</h2>
          <p className="text-sm text-wkai-text-dim">{message}</p>
        </div>

        <div className="rounded-lg border border-wkai-border bg-wkai-bg p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            You can still read the {guideBlocks.length} guide card
            {guideBlocks.length !== 1 ? "s" : ""} and download the files from before you left. The
            live stream and Q&amp;A are closed.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={onReview}
          >
            Review what I have
          </button>
          <button className="btn-primary flex-1 justify-center" onClick={() => navigate("/")}>
            <LogOut size={14} />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
