import { useAppStore } from "../../store";
import { clsx } from "clsx";
import { Cpu, Camera } from "lucide-react";

export function CaptureStatus() {
  const { capture, studentCount } = useAppStore();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Status
      </p>

      <StatusRow
        icon={<Camera size={12} />}
        label="Screen capture"
        active={capture.isCapturing}
        activeText="Live"
        idleText="Stopped"
      />
      <StatusRow
        icon={<Cpu size={12} />}
        label="AI processing"
        active={capture.aiProcessing}
        activeText="Running"
        idleText="Waiting"
      />

      <div className="pt-1 flex items-center justify-between text-xs text-wkai-text-dim">
        <span>Students online</span>
        <span
          className={clsx(
            "font-medium",
            studentCount > 0 ? "text-green-400" : "text-wkai-text-dim"
          )}
        >
          {studentCount}
        </span>
      </div>

      {capture.lastFrameAt && (
        <p className="text-xs text-wkai-text-dim">
          Last frame:{" "}
          {new Date(capture.lastFrameAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </p>
      )}

      <p className="text-xs text-wkai-text-dim">
        {capture.framesSent} frame{capture.framesSent !== 1 ? "s" : ""} sent
      </p>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  active,
  activeText,
  idleText,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  activeText: string;
  idleText: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1.5 text-xs text-wkai-text-dim">
        {icon}
        {label}
      </span>
      <span
        className={clsx(
          "flex items-center gap-1 text-xs font-medium",
          active ? "text-green-400" : "text-wkai-text-dim"
        )}
      >
        <span
          className={clsx(
            "h-1.5 w-1.5 rounded-full",
            active ? "bg-green-400 animate-pulse" : "bg-gray-600"
          )}
        />
        {active ? activeText : idleText}
      </span>
    </div>
  );
}
