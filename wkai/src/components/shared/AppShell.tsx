import { Outlet, NavLink, useLocation } from "react-router-dom";
import { Home, Settings, Radio, Terminal, Users } from "lucide-react";
import { useTauriEvents } from "../../hooks/useTauriEvents";
import { useAppStore } from "../../store";
import { clsx } from "clsx";
import { DebugPanel } from "../instructor/DebugPanel";
import { UpdateManager } from "./UpdateManager";
import { SessionClock } from "./SessionClock";

const TITLES: Record<string, string> = {
  "/": "Start a workshop",
  "/session": "Live session",
  "/settings": "Settings",
  "/native-capture-test": "Capture diagnostics",
};

export function AppShell() {
  useTauriEvents(); // wire up all Tauri event listeners

  const { session, streamingToStudents, recording, studentCount, debugPanelOpen, setDebugPanelOpen } =
    useAppStore();
  const location = useLocation();
  const inSession = !!session;

  return (
    <div className="flex h-full w-full bg-wkai-bg text-wkai-text">
      {/* ─── Navigation rail ─────────────────────────────────────────── */}
      <aside className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1 border-r border-wkai-border bg-wkai-surface py-3">
        <img src="/wkai-logo.svg" alt="WKAI" className="mb-3 h-8 w-8 select-none object-contain" />

        <NavItem to="/" icon={Home} label="Setup" end />
        {inSession && <NavItem to="/session" icon={Radio} label="Session" />}

        <div className="flex-1" />

        {/* Every rail item is labelled: an icon-only rail makes the user guess,
            and these four destinations are not guessable from glyphs alone. */}
        <RailButton
          icon={Terminal}
          label="Logs"
          active={debugPanelOpen}
          onClick={() => setDebugPanelOpen(!debugPanelOpen)}
          title={debugPanelOpen ? "Hide the activity log" : "Show the activity log"}
        />
        <NavItem to="/settings" icon={Settings} label="Settings" />
      </aside>

      {/* ─── Main content ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-wkai-border bg-wkai-surface px-4">
          <span className="truncate text-sm font-semibold text-wkai-text">
            {TITLES[location.pathname] ?? "WKAI"}
          </span>

          {inSession && session && (
            <>
              <span className="truncate text-sm text-wkai-text-dim">· {session.workshopTitle}</span>

              <div className="ml-auto flex items-center gap-2.5 text-xs">
                <Pill
                  tone={streamingToStudents ? "ok" : "idle"}
                  label={streamingToStudents ? "Presenting" : "Not presenting"}
                  pulse={streamingToStudents}
                />
                {recording.isRecording && (
                  <Pill
                    tone="danger"
                    label={recording.isPaused ? "Recording paused" : "Recording"}
                    pulse={!recording.isPaused}
                  />
                )}
                <span className="flex items-center gap-1.5 text-wkai-text-dim">
                  <Users size={13} />
                  {studentCount}
                </span>
                <span className="text-wkai-text-dim">
                  <SessionClock startedAt={session.startedAt} />
                </span>
                <span className="selectable font-mono text-sm font-bold tracking-widest text-accent-text">
                  {session.roomCode}
                </span>
              </div>
            </>
          )}
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {debugPanelOpen && <DebugPanel />}
      <UpdateManager />
    </div>
  );
}

function Pill({ tone, label, pulse }: { tone: "ok" | "danger" | "idle"; label: string; pulse?: boolean }) {
  return (
    <span
      className={clsx(
        "flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-medium",
        tone === "ok" && "border-ok/30 bg-ok/10 text-ok",
        tone === "danger" && "border-danger/30 bg-danger/10 text-danger",
        tone === "idle" && "border-wkai-border bg-wkai-surface2 text-wkai-text-dim"
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-ok",
          tone === "danger" && "bg-danger",
          tone === "idle" && "bg-wkai-text-dim",
          pulse && "animate-pulse"
        )}
      />
      {label}
    </span>
  );
}

const RAIL_ITEM =
  "flex w-14 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium transition-colors";

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          RAIL_ITEM,
          isActive
            ? "bg-accent/15 text-accent-text"
            : "text-wkai-text-dim hover:bg-wkai-surface2 hover:text-wkai-text"
        )
      }
    >
      <Icon size={18} />
      {label}
    </NavLink>
  );
}

function RailButton({
  icon: Icon,
  label,
  active,
  onClick,
  title,
}: {
  icon: typeof Home;
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={clsx(
        RAIL_ITEM,
        active
          ? "bg-accent/15 text-accent-text"
          : "text-wkai-text-dim hover:bg-wkai-surface2 hover:text-wkai-text"
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  );
}
