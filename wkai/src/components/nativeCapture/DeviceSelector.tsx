import { useState } from "react";
import { Monitor, AppWindow, RefreshCw, Crown } from "lucide-react";
import type {
  MonitorInfo,
  WindowInfo,
  CaptureTarget,
} from "../../types/nativeCapture";

interface DeviceSelectorProps {
  monitors: MonitorInfo[];
  windows: WindowInfo[];
  selectedTarget: CaptureTarget | null;
  onSelect: (target: CaptureTarget) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

type Tab = "monitors" | "windows";

export function DeviceSelector({
  monitors,
  windows,
  selectedTarget,
  onSelect,
  isLoading,
  onRefresh,
}: DeviceSelectorProps) {
  const [tab, setTab] = useState<Tab>("monitors");

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
          Sources
        </h3>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 rounded hover:bg-wkai-border transition-colors disabled:opacity-40"
          title="Refresh devices"
        >
          <RefreshCw
            size={12}
            className={`text-wkai-text-dim ${isLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg bg-wkai-bg border border-wkai-border p-0.5">
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-all ${
            tab === "monitors"
              ? "bg-wkai-surface text-wkai-text shadow-sm"
              : "text-wkai-text-dim hover:text-wkai-text"
          }`}
          onClick={() => setTab("monitors")}
        >
          <Monitor size={12} />
          Monitors
        </button>
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-all ${
            tab === "windows"
              ? "bg-wkai-surface text-wkai-text shadow-sm"
              : "text-wkai-text-dim hover:text-wkai-text"
          }`}
          onClick={() => setTab("windows")}
        >
          <AppWindow size={12} />
          Windows
        </button>
      </div>

      {/* List */}
      <div className="space-y-1 max-h-48 overflow-y-auto no-scrollbar">
        {tab === "monitors" &&
          monitors.map((m) => {
            const isSelected =
              selectedTarget?.type === "monitor" && selectedTarget.id === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onSelect({ type: "monitor", id: m.id })}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                  isSelected
                    ? "bg-indigo-500/15 border border-indigo-500/40 text-wkai-text"
                    : "bg-wkai-bg border border-transparent hover:border-wkai-border hover:bg-wkai-surface text-wkai-text-dim"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Monitor size={12} />
                    <span className="font-medium text-wkai-text">{m.name}</span>
                    {m.isPrimary && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 text-[10px]">
                        <Crown size={8} />
                        Primary
                      </span>
                    )}
                  </div>
                  <span className="text-wkai-text-dim">
                    {m.width}×{m.height}
                  </span>
                </div>
              </button>
            );
          })}

        {tab === "windows" &&
          windows.map((w) => {
            const isSelected =
              selectedTarget?.type === "window" && selectedTarget.id === w.id;
            return (
              <button
                key={w.id}
                onClick={() => onSelect({ type: "window", id: w.id })}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                  isSelected
                    ? "bg-indigo-500/15 border border-indigo-500/40 text-wkai-text"
                    : "bg-wkai-bg border border-transparent hover:border-wkai-border hover:bg-wkai-surface text-wkai-text-dim"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <AppWindow size={12} className="shrink-0" />
                    <span className="font-medium text-wkai-text truncate">
                      {w.title || w.appName}
                    </span>
                  </div>
                  <span className="text-wkai-text-dim shrink-0 ml-2">
                    {w.width}×{w.height}
                  </span>
                </div>
                {w.title && w.appName && (
                  <p className="text-[10px] text-wkai-text-dim pl-5 mt-0.5 truncate">
                    {w.appName}
                  </p>
                )}
              </button>
            );
          })}

        {tab === "monitors" && monitors.length === 0 && (
          <p className="text-xs text-wkai-text-dim text-center py-4">
            No monitors found
          </p>
        )}
        {tab === "windows" && windows.length === 0 && (
          <p className="text-xs text-wkai-text-dim text-center py-4">
            No windows found
          </p>
        )}
      </div>
    </div>
  );
}
