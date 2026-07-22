import { Play, Square, Settings2 } from "lucide-react";
import type {
  CaptureStatus,
  CaptureTarget,
  CaptureQualityType,
  CaptureFramerateType,
} from "../../types/nativeCapture";

interface CaptureControlsProps {
  status: CaptureStatus;
  onStart: () => void;
  onStop: () => void;
  selectedTarget: CaptureTarget | null;
  framerate: CaptureFramerateType;
  quality: CaptureQualityType;
  onFramerateChange: (fps: CaptureFramerateType) => void;
  onQualityChange: (quality: CaptureQualityType) => void;
  isLoading: boolean;
}

const FRAMERATE_OPTIONS: { label: string; value: CaptureFramerateType }[] = [
  { label: "Auto", value: "auto" },
  { label: "15 fps", value: 15 },
  { label: "24 fps", value: 24 },
  { label: "30 fps", value: 30 },
  { label: "60 fps", value: 60 },
];

const QUALITY_OPTIONS: { label: string; value: CaptureQualityType }[] = [
  { label: "Auto", value: "auto" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

const STATUS_COLORS: Record<string, string> = {
  idle: "text-wkai-text-dim",
  initializing: "text-amber-400",
  capturing: "text-green-400",
  stopping: "text-amber-400",
  error: "text-red-400",
};

export function CaptureControls({
  status,
  onStart,
  onStop,
  selectedTarget,
  framerate,
  quality,
  onFramerateChange,
  onQualityChange,
  isLoading,
}: CaptureControlsProps) {
  const isCapturing = status.status === "capturing";
  const canStart =
    !!selectedTarget &&
    !isCapturing &&
    status.status !== "initializing" &&
    !isLoading;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Controls
      </h3>

      {/* Start / Stop */}
      <div className="flex gap-2">
        {!isCapturing ? (
          <button
            onClick={onStart}
            disabled={!canStart}
            className="btn flex-1 justify-center bg-green-500/15 text-green-400 hover:bg-green-500/25 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={14} />
            Start
          </button>
        ) : (
          <button
            onClick={onStop}
            disabled={isLoading}
            className="btn flex-1 justify-center bg-red-500/15 text-red-400 hover:bg-red-500/25 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Square size={14} />
            Stop
          </button>
        )}
      </div>

      {/* Config dropdowns */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-wkai-text-dim">
          <Settings2 size={12} />
          <span>Capture Settings</span>
        </div>

        {/* Framerate */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-wkai-text">Framerate</label>
          <select
            className="input w-28 text-xs py-1 px-2"
            value={String(framerate)}
            onChange={(e) => {
              const v = e.target.value;
              onFramerateChange(
                v === "auto" ? "auto" : (Number(v) as 15 | 24 | 30 | 60)
              );
            }}
            disabled={isCapturing}
          >
            {FRAMERATE_OPTIONS.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Quality */}
        <div className="flex items-center justify-between">
          <label className="text-xs text-wkai-text">Quality</label>
          <select
            className="input w-28 text-xs py-1 px-2"
            value={quality}
            onChange={(e) =>
              onQualityChange(e.target.value as CaptureQualityType)
            }
            disabled={isCapturing}
          >
            {QUALITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-wkai-bg border border-wkai-border">
        <span
          className={`w-2 h-2 rounded-full ${
            isCapturing ? "bg-green-400 animate-pulse" : "bg-wkai-text-dim"
          }`}
        />
        <span
          className={`text-xs font-medium capitalize ${
            STATUS_COLORS[status.status] ?? "text-wkai-text-dim"
          }`}
        >
          {status.status}
        </span>
        {status.error && (
          <span className="text-[10px] text-red-400 truncate ml-auto">
            {status.error}
          </span>
        )}
      </div>
    </div>
  );
}
