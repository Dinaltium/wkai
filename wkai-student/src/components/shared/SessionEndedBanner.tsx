import { useNavigate } from "react-router-dom";
import { LogOut, CheckCircle } from "lucide-react";

export function SessionEndedBanner() {
  const navigate = useNavigate();
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-warn/30 bg-warn/10 px-3 py-2.5 sm:px-4">
      <p className="flex min-w-0 flex-1 items-start gap-2 text-xs font-medium leading-relaxed text-warn">
        <CheckCircle size={14} className="mt-px shrink-0" />
        Session over. Your guide and files stay here as long as this tab is open.
      </p>
      <button
        className="btn-ghost btn-sm shrink-0"
        onClick={() => navigate("/")}
      >
        <LogOut size={13} /> Leave
      </button>
    </div>
  );
}
