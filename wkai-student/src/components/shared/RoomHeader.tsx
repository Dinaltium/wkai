import { useStore } from "../../store";
import { clsx } from "clsx";
import { Users, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function RoomHeader() {
  const { session, connected, instructorOffline, studentCount, backgroundLiveEnabled, setBackgroundLiveEnabled } = useStore();
  const navigate = useNavigate();

  // Status reflects instructor presence, not the student's own socket: a
  // connected student with no instructor in the room is "waiting", not "live".
  const status = !connected
    ? { label: "Reconnecting…", live: false }
    : instructorOffline
      ? { label: "Instructor offline", live: false }
      : { label: "Live", live: true };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-wkai-border bg-wkai-surface px-4">
      {/* Left: brand + session title */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center">
          <img src="/wkai-logo.svg" alt="WKAI Logo" className="h-7 w-7 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-wkai-text leading-tight">
            {session?.workshopTitle ?? "Workshop"}
          </p>
          <p className="text-xs text-wkai-text-dim leading-tight">
            {session?.instructorName}
          </p>
        </div>
      </div>

      {/* Right: status indicators + leave button */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="flex items-center gap-1.5 text-xs text-wkai-text-dim">
          <Users size={12} />
          {studentCount}
        </span>

        <span className="font-mono text-xs font-bold tracking-widest text-accent-text">
          {session?.roomCode}
        </span>

        <span
          className={clsx(
            "flex items-center gap-1.5 text-xs font-medium",
            status.live ? "text-emerald-400" : "text-wkai-text-dim"
          )}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              status.live ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
            )}
          />
          {status.label}
        </span>
        <label className="hidden md:flex items-center gap-1.5 text-[11px] text-wkai-text-dim">
          <input
            type="checkbox"
            checked={backgroundLiveEnabled}
            onChange={(e) => setBackgroundLiveEnabled(e.target.checked)}
            className="accent-[rgb(var(--accent))]"
          />
          Bg Live
        </label>
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-wkai-text-dim hover:text-red-400 transition-colors"
          title="Leave session"
        >
          <LogOut size={13} />
          <span className="hidden sm:inline">Leave</span>
        </button>
      </div>
    </header>
  );
}
