import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, BookOpen } from "lucide-react";
import { useStore } from "../../store";

interface Props {
  onStay: () => void;
}

export function SessionEndedModal({ onStay }: Props) {
  const navigate = useNavigate();
  const { guideBlocks } = useStore();
  const [countdown, setCountdown] = useState(10);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-wkai-border bg-wkai-surface shadow-2xl space-y-6 p-6 animate-slide-up">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
            <BookOpen size={22} className="text-amber-400" />
          </div>
          <h2 className="text-base font-semibold text-wkai-text">Session Ended</h2>
          <p className="text-sm text-wkai-text-dim">
            The instructor has ended this session.
          </p>
          <p className="text-xs text-wkai-text-dim">
            You will be redirected in{" "}
            <span className="font-bold text-amber-400">{countdown}</span> seconds.
          </p>
        </div>

        <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 text-center">
          <p className="text-xs text-wkai-text-dim">
            {guideBlocks.length} guide block{guideBlocks.length !== 1 ? "s" : ""} available to review
          </p>
        </div>

        <div className="flex gap-3">
          <button
            className="btn-ghost flex-1 justify-center border border-wkai-border"
            onClick={onStay}
          >
            View Guide
          </button>
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => navigate("/")}
          >
            <LogOut size={14} />
            Leave Now
          </button>
        </div>
      </div>
    </div>
  );
}
