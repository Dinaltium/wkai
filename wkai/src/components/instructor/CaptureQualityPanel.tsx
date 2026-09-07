import { Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useAppStore } from "../../store";
import { useSessionRuntime } from "../../session/SessionRuntimeProvider";

const FRAMERATES: { value: "auto" | 15 | 24 | 30 | 60; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: 15, label: "15" },
  { value: 24, label: "24" },
  { value: 30, label: "30" },
  { value: 60, label: "60" },
];

const QUALITIES: { value: "auto" | "low" | "medium" | "high"; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

/**
 * Framerate and quality where they are actually needed — in the bar, mid-class,
 * when a student says the screen is unreadable. They still write through to
 * the same Settings values; this just stops the instructor having to leave the
 * session to reach them.
 */
export function CaptureQualityPanel() {
  const settings = useAppStore((s) => s.settings);
  const { applyCaptureQuality, restartingCapture, selectedTarget } = useSessionRuntime();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-wkai-text-dim">Framerate</p>
        <div className="flex gap-1">
          {FRAMERATES.map((f) => (
            <button
              key={String(f.value)}
              onClick={() => applyCaptureQuality({ captureFramerate: f.value })}
              className={clsx(
                "flex-1 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                String(settings.captureFramerate) === String(f.value)
                  ? "border-accent bg-accent/15 text-accent-text"
                  : "border-wkai-border text-wkai-text-dim hover:text-wkai-text"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-wkai-text-dim">Quality</p>
        <div className="flex gap-1">
          {QUALITIES.map((q) => (
            <button
              key={q.value}
              onClick={() => applyCaptureQuality({ captureQuality: q.value })}
              className={clsx(
                "flex-1 rounded-md border px-1.5 py-1.5 text-[11px] font-medium transition-colors",
                settings.captureQuality === q.value
                  ? "border-accent bg-accent/15 text-accent-text"
                  : "border-wkai-border text-wkai-text-dim hover:text-wkai-text"
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {restartingCapture ? (
        <p className="flex items-center gap-1.5 text-[10px] text-wkai-text-dim">
          <Loader2 size={12} className="animate-spin" />
          Restarting capture — students reconnect on their own.
        </p>
      ) : (
        <p className="text-[10px] text-wkai-text-dim">
          {selectedTarget
            ? "Applies immediately; the stream blinks for a moment."
            : "Applies to the next source you share."}
        </p>
      )}
    </div>
  );
}
