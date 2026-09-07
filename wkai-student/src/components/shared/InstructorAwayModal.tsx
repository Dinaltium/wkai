import { LogOut, WifiOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../store";

/**
 * The instructor's socket has been gone long enough that the server gave up on
 * a blip. A banner was too easy to miss: students sat in front of a frozen
 * stream assuming it was their own connection. This asks the question outright
 * and makes staying the safe, obvious default — everything already delivered
 * (guide cards, shared files) keeps working while they wait.
 */
export function InstructorAwayModal({ onStay }: { onStay: () => void }) {
  const navigate = useNavigate();
  const guideBlocks = useStore((s) => s.guideBlocks);
  const sharedFiles = useStore((s) => s.sharedFiles);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm animate-slide-up space-y-6 rounded-2xl border border-wkai-border bg-wkai-surface p-6 shadow-2xl">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warn/15">
            <WifiOff size={22} className="text-warn" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">The instructor is not here</h2>
          <p className="text-sm text-wkai-text-dim">
            Their connection dropped, so the live stream has stopped. The session itself is still
            open — if they come back, everything resumes on its own.
          </p>
        </div>

        <div className="rounded-lg border border-wkai-border bg-wkai-bg p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            Stay and you keep {guideBlocks.length} guide card
            {guideBlocks.length !== 1 ? "s" : ""} and {sharedFiles.length} file
            {sharedFiles.length !== 1 ? "s" : ""} to read and download in the meantime.
          </p>
        </div>

        <div className="flex gap-3">
          <button className="btn-primary flex-1 justify-center" onClick={onStay}>
            Stay in the session
          </button>
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={() => navigate("/")}
          >
            <LogOut size={14} />
            Leave now
          </button>
        </div>
      </div>
    </div>
  );
}
