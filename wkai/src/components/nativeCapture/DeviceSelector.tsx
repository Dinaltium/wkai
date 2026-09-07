import { useState } from "react";
import { Monitor, AppWindow, RefreshCw, Crown, Camera, Smartphone } from "lucide-react";
import type {
  MonitorInfo,
  WindowInfo,
  CaptureTarget,
} from "../../types/nativeCapture";

interface DeviceSelectorProps {
  monitors: MonitorInfo[];
  windows: WindowInfo[];
  cameras: MediaDeviceInfo[];
  selectedCameraLabel?: string | null;
  onSelectCamera: (deviceId: string, label: string) => void;
  selectedTarget: CaptureTarget | null;
  onSelect: (target: CaptureTarget) => void;
  isLoading: boolean;
  onRefresh: () => void;
}

type Tab = "monitors" | "windows" | "cameras";

export function DeviceSelector({
  monitors,
  windows,
  cameras,
  selectedCameraLabel,
  onSelectCamera,
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
        <h3 className="text-xs font-semibold text-wkai-text">
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
        <button
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-md transition-all ${
            tab === "cameras"
              ? "bg-wkai-surface text-wkai-text shadow-sm"
              : "text-wkai-text-dim hover:text-wkai-text"
          }`}
          onClick={() => setTab("cameras")}
        >
          <Camera size={12} />
          Camera
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
                    ? "bg-accent/15 border border-accent/40 text-wkai-text"
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
                    ? "bg-accent/15 border border-accent/40 text-wkai-text"
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

        {tab === "cameras" &&
          cameras.map((c, index) => {
            const label = c.label || `Camera ${index + 1}`;
            const isSelected = selectedCameraLabel === label;
            return (
              <button
                key={c.deviceId || label}
                onClick={() => onSelectCamera(c.deviceId, label)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                  isSelected
                    ? "bg-accent/15 border border-accent/40 text-wkai-text"
                    : "bg-wkai-bg border border-transparent hover:border-wkai-border hover:bg-wkai-surface text-wkai-text-dim"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Camera size={12} className="shrink-0" />
                  <span className="font-medium text-wkai-text truncate">{label}</span>
                </div>
              </button>
            );
          })}

        {tab === "cameras" && (
          <p className="flex items-start gap-1.5 px-1 pt-2 text-[10px] leading-relaxed text-wkai-text-dim">
            <Smartphone size={11} className="mt-px shrink-0" />
            A phone shows up here once it is acting as a webcam over USB or Wi-Fi
            (Windows "Connected Camera", DroidCam, Iriun and similar). Bluetooth
            cannot carry video, so no phone will appear over Bluetooth.
          </p>
        )}

        {tab === "cameras" && cameras.length === 0 && (
          <p className="text-xs text-wkai-text-dim text-center py-4">
            No cameras found — connect one and refresh
          </p>
        )}

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
