import { useAppStore } from "../../store";
import { clsx } from "clsx";
import { Radio, Circle } from "lucide-react";

export function CaptureStatus() {
  const { streamingToStudents, recording, studentCount } = useAppStore();

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        Live Status
      </p>

      <StatusRow
        icon={<Radio size={12} />}
        label="Streaming"
        active={streamingToStudents}
        activeText="Live"
        idleText="Offline"
      />
      <StatusRow
        icon={<Circle size={12} />}
        label="Recording"
        active={recording.isRecording}
        activeText={recording.isPaused ? "Paused" : "Active"}
        idleText="Stopped"
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
