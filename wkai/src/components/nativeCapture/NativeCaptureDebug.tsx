import { useEffect, useRef } from "react";
import { Trash2, Terminal } from "lucide-react";

export interface DebugLogEntry {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error" | "success";
}

interface NativeCaptureDebugProps {
  logs: DebugLogEntry[];
  onClear: () => void;
}

const LEVEL_COLORS: Record<string, string> = {
  info: "text-wkai-text-dim",
  warn: "text-amber-400",
  error: "text-red-400",
  success: "text-green-400",
};

const LEVEL_PREFIX: Record<string, string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERR ",
  success: " OK ",
};

export function NativeCaptureDebug({ logs, onClear }: NativeCaptureDebugProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  return (
    <div className="rounded-xl bg-wkai-bg border border-wkai-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-wkai-border bg-wkai-surface">
        <div className="flex items-center gap-2">
          <Terminal size={12} className="text-wkai-text-dim" />
          <span className="text-xs font-medium text-wkai-text-dim">
            Debug Log
          </span>
          <span className="text-[10px] text-wkai-text-dim bg-wkai-bg px-1.5 py-0.5 rounded">
            {logs.length}
          </span>
        </div>
        <button
          onClick={onClear}
          className="p-1 rounded hover:bg-wkai-border transition-colors"
          title="Clear logs"
        >
          <Trash2 size={12} className="text-wkai-text-dim" />
        </button>
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="h-40 overflow-y-auto font-mono text-[11px] p-2 space-y-0.5 no-scrollbar"
      >
        {logs.length === 0 ? (
          <p className="text-wkai-text-dim text-center py-6">
            No log entries yet
          </p>
        ) : (
          logs.map((entry, i) => (
            <div key={i} className="flex gap-2 leading-relaxed">
              <span className="text-wkai-text-dim shrink-0 select-none">
                {entry.timestamp}
              </span>
              <span
                className={`shrink-0 font-bold ${
                  LEVEL_COLORS[entry.level] ?? "text-wkai-text-dim"
                }`}
              >
                [{LEVEL_PREFIX[entry.level] ?? "INFO"}]
              </span>
              <span
                className={LEVEL_COLORS[entry.level] ?? "text-wkai-text-dim"}
              >
                {entry.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
