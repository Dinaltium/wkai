import { Outlet, NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Settings, Radio, Bug } from "lucide-react";
import { useTauriEvents } from "../../hooks/useTauriEvents";
import { useAppStore } from "../../store";
import { clsx } from "clsx";
import { DebugPanel } from "../instructor/DebugPanel";
import { UpdateManager } from "./UpdateManager";

export function AppShell() {
  useTauriEvents(); // wire up all Tauri event listeners

  const { session, capture, studentCount, debugPanelOpen } = useAppStore();
  const location = useLocation();
  const inSession = !!session;

  return (
    <div className="flex h-full w-full bg-wkai-bg text-wkai-text">
      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="flex w-14 flex-col items-center border-r border-wkai-border bg-wkai-surface py-4 gap-1">
        {/* Logo */}
        <div className="mb-4 flex h-8 w-8 items-center justify-center select-none">
          <img src="/wkai-logo.svg" alt="WKAI Logo" className="h-8 w-8 object-contain" />
        </div>

        <NavItem to="/" icon={<LayoutDashboard size={18} />} label="Setup" />
        {inSession && (
          <NavItem to="/session" icon={<Radio size={18} />} label="Session" />
        )}
        <div className="flex-1" />
        <button
          title="Debug Console"
          onClick={() =>
            useAppStore.getState().setDebugPanelOpen(
              !useAppStore.getState().debugPanelOpen
            )
          }
          className={clsx(
            "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
            debugPanelOpen
              ? "bg-amber-500/20 text-amber-400"
              : "text-wkai-text-dim hover:bg-wkai-border hover:text-wkai-text"
          )}
        >
          <Bug size={18} />
        </button>
        <NavItem to="/settings" icon={<Settings size={18} />} label="Settings" />
      </aside>

      {/* ─── Main content ────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-10 items-center justify-between border-b border-wkai-border bg-wkai-surface px-4">
          <span className="text-xs font-medium text-wkai-text-dim tracking-wide uppercase">
            {location.pathname === "/" && "Setup"}
            {location.pathname === "/session" && "Live Session"}
            {location.pathname === "/settings" && "Settings"}
          </span>

          <div className="flex items-center gap-3 text-xs text-wkai-text-dim">
            {inSession && (
              <>
                <span className="flex items-center gap-1.5">
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-full",
                      capture.isCapturing ? "bg-green-400 animate-pulse" : "bg-gray-500"
                    )}
                  />
                  {capture.isCapturing ? "Capturing" : "Idle"}
                </span>
                <span className="text-wkai-border">|</span>
                <span>
                  {studentCount} student{studentCount !== 1 ? "s" : ""}
                </span>
                <span className="text-wkai-border">|</span>
                <span className="font-mono text-indigo-400">
                  {session?.roomCode}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {debugPanelOpen && <DebugPanel />}
      <UpdateManager />
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        clsx(
          "flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
          isActive
            ? "bg-indigo-500/20 text-indigo-400"
            : "text-wkai-text-dim hover:bg-wkai-border hover:text-wkai-text"
        )
      }
    >
      {icon}
    </NavLink>
  );
}
