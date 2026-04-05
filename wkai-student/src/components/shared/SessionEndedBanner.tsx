import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

export function SessionEndedBanner() {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5">
      <p className="text-xs text-amber-400 font-medium">
        The instructor has ended this session. Your guide is saved below.
      </p>
      <button
        className="flex items-center gap-1.5 text-xs text-wkai-text-dim hover:text-wkai-text transition-colors"
        onClick={() => navigate("/")}
      >
        <LogOut size={12} /> Leave
      </button>
    </div>
  );
}
