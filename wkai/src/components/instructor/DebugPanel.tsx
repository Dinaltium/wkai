import { useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { X, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import type { DebugLogLevel } from "../../types";

const LEVEL_STYLE: Record<DebugLogLevel, string> = {
  info: "text-wkai-text-dim",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-emerald-400",
};

const LEVEL_PREFIX: Record<DebugLogLevel, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERR ",
  success: "OK  ",
};

export function DebugPanel() {
  const {
    debugLogs,
    clearDebugLogs,
    setDebugPanelOpen,
    capture,
    session,
    streamingToStudents,
    studentCount,
  } = useAppStore();

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debugLogs]);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-wkai-border bg-wkai-bg">
      <div className="flex items-center justify-between border-b border-wkai-border px-3 py-2">
        <span className="text-xs font-medium text-wkai-text">Debug Console</span>
        <div className="flex items-center gap-1">
          <button
            onClick={clearDebugLogs}
            className="p-1 text-wkai-text-dim transition-colors hover:text-wkai-text"
            title="Clear logs"
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={() => setDebugPanelOpen(false)}
            className="p-1 text-wkai-text-dim transition-colors hover:text-wkai-text"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      <div className="space-y-1 border-b border-wkai-border px-3 py-2">
        <StatusRow label="WebSocket" value={session ? "Connected" : "Disconnected"} active={!!session} />
        <StatusRow label="Screen capture" value={capture.isCapturing ? "Active" : "Stopped"} active={capture.isCapturing} />
        <StatusRow label="AI processing" value={capture.aiProcessing ? "Running" : "Idle"} active={capture.aiProcessing} />
        <StatusRow label="Stream to students" value={streamingToStudents ? "On" : "Off"} active={streamingToStudents} />
        <StatusRow label="Students online" value={String(studentCount)} active={studentCount > 0} />
        <StatusRow label="Frames sent" value={String(capture.framesSent ?? 0)} active={true} />
      </div>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2 font-mono text-xs">
        {debugLogs.length === 0 ? (
          <p className="py-4 text-center text-wkai-text-dim">No log entries yet</p>
        ) : (
          debugLogs.map((log) => (
            <div key={log.id} className={clsx("flex gap-2 leading-5", LEVEL_STYLE[log.level])}>
              <span className="shrink-0 text-wkai-text-dim/50">{log.timestamp}</span>
              <span className="shrink-0">{LEVEL_PREFIX[log.level]}</span>
              <span className="break-all">{log.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  active,
}: {
  label: string;
  value: string;
  active: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-wkai-text-dim">{label}</span>
      <span
        className={clsx(
          "flex items-center gap-1.5",
          active ? "text-emerald-400" : "text-wkai-text-dim"
        )}
      >
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-emerald-400" : "bg-gray-600"
          )}
        />
        {value}
      </span>
    </div>
  );
}

