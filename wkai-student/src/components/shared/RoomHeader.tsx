import { useState } from "react";
import { useStore } from "../../store";
import { clsx } from "clsx";
import { Users, LogOut, Check, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ThemeMenu } from "./ThemeMenu";

export function RoomHeader() {
  const { session, connected, instructorOffline, studentCount } = useStore();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Status reflects instructor presence, not the student's own socket: a
  // connected student with no instructor in the room is "waiting", not "live".
  const status = !connected
    ? { label: "Reconnecting", short: "Offline", live: false }
    : instructorOffline
      ? { label: "Instructor offline", short: "Away", live: false }
      : { label: "Live", short: "Live", live: true };

  function copyCode() {
    if (!session?.roomCode) return;
    navigator.clipboard?.writeText(session.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-wkai-border bg-wkai-surface px-3 sm:px-4">
      {/* Identity: who is teaching, what this session is */}
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <img src="/wkai-logo.svg" alt="" className="h-7 w-7 shrink-0 object-contain" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-wkai-text">
            {session?.workshopTitle ?? "Workshop"}
          </p>
          <p className="truncate text-xs leading-tight text-wkai-text-dim">
            {session?.instructorName ?? "Waiting for instructor"}
          </p>
        </div>
      </div>

      {/* Status: the one thing a student checks constantly. Dot + word, never
          colour alone. */}
      <span
        className={clsx(
          "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
          status.live
            ? "border-ok/30 bg-ok/10 text-ok"
            : "border-warn/30 bg-warn/10 text-warn"
        )}
      >
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            status.live ? "animate-pulse bg-ok" : "bg-warn"
          )}
        />
        <span className="sm:hidden">{status.short}</span>
        <span className="hidden sm:inline">{status.label}</span>
      </span>

      <span className="hidden items-center gap-1.5 text-xs text-wkai-text-dim md:flex">
        <Users size={13} />
        {studentCount}
      </span>

      {session?.roomCode && (
        <button
          type="button"
          onClick={copyCode}
          title="Copy room code"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-wkai-border px-2.5 py-1.5 font-mono text-xs font-bold tracking-widest text-accent-text transition-colors hover:border-accent/60 sm:flex"
        >
          {session.roomCode}
          {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} className="text-wkai-text-dim" />}
        </button>
      )}

      <ThemeMenu />

      <button
        onClick={() => navigate("/")}
        className="btn-icon shrink-0 text-wkai-text-dim hover:bg-danger/10 hover:text-danger"
        aria-label="Leave session"
        title="Leave session"
      >
        <LogOut size={16} />
      </button>
    </header>
  );
}
