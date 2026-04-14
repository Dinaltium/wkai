import { useNavigate } from "react-router-dom";
import { LogOut, BookOpen } from "lucide-react";
import { useStore } from "../../store";

interface Props {
  onDismiss: () => void;
}

export function SessionEndedModal({ onDismiss }: Props) {
  const navigate = useNavigate();
  const { guideBlocks } = useStore();

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl space-y-6 p-6 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <BookOpen size={22} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">Session Ended</h2>
          <p className="text-sm text-wkai-text-dim">
            The instructor has ended this session. Your guide has been saved below.
          </p>
        </div>

        <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            {guideBlocks.length} guide block{guideBlocks.length !== 1 ? "s" : ""} recorded
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={onDismiss}
          >
            View Guide
          </button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => navigate("/")}
          >
            <LogOut size={14} />
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}
