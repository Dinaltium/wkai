import { useState } from "react";
import { Bug, X, Trash2 } from "lucide-react";
import { useStore } from "../../store";
import { clsx } from "clsx";
import type { DebugLogLevel } from "../../types";

const LEVEL_COLOR: Record<DebugLogLevel, string> = {
  info: "text-wkai-text-dim",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-emerald-400",
};

export function StudentDebugPanel() {
  const [open, setOpen] = useState(false);
  const { debugLogs, clearDebugLogs, connected, screenPreview } = useStore();

  return (
    <div className="absolute top-14 right-2 z-40">
      <button
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-7 w-7 items-center justify-center rounded-lg border transition-colors",
          open
            ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
            : "border-wkai-border bg-wkai-surface text-wkai-text-dim hover:text-wkai-text"
        )}
        title="Debug console"
      >
        <Bug size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 w-72 rounded-xl border border-wkai-border bg-wkai-bg shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between border-b border-wkai-border px-3 py-2">
            <span className="text-xs font-medium text-wkai-text">Debug</span>
            <div className="flex gap-1">
              <button
                onClick={clearDebugLogs}
                className="text-wkai-text-dim hover:text-wkai-text p-0.5"
              >
                <Trash2 size={11} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-wkai-text-dim hover:text-wkai-text p-0.5"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          <div className="border-b border-wkai-border px-3 py-1.5 space-y-0.5">
            <StatusRow
              label="WS connection"
              active={connected}
              value={connected ? "Live" : "Disconnected"}
            />
            <StatusRow
              label="Screen preview"
              active={!!screenPreview}
              value={screenPreview ? "Receiving" : "None"}
            />
          </div>

          <div className="max-h-48 overflow-y-auto px-2 py-2 font-mono text-xs space-y-0.5">
            {debugLogs.length === 0 ? (
              <p className="text-wkai-text-dim text-center py-2">No events yet</p>
            ) : (
              [...debugLogs].reverse().map((log: import("../../types").DebugLogEntry) => (
                <div key={log.id} className={clsx("flex gap-2 leading-5", LEVEL_COLOR[log.level])}>
                  <span className="shrink-0 text-wkai-text-dim/50">{log.timestamp.split("T")[1].slice(0, 8)}</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, active, value }: { label: string; active: boolean; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-wkai-text-dim">{label}</span>
      <span className={clsx("flex items-center gap-1", active ? "text-emerald-400" : "text-wkai-text-dim")}>
        <span className={clsx("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-400" : "bg-gray-600")} />
        {value}
      </span>
    </div>
  );
}
