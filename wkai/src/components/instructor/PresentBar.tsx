import { useEffect, useRef, useState } from "react";
import {
  Circle,
  Download,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  Play,
  Sparkles,
  Square,
} from "lucide-react";
import { clsx } from "clsx";
import type { LastRecording } from "../../hooks/useSessionRecorder";
import type { RecordingState } from "../../types";
import { EndSessionButton } from "./EndSessionButton";

interface Props {
  sessionId: string;
  presenting: boolean;
  canPresent: boolean;
  onTogglePresent: () => void;
  muted: boolean;
  onToggleMute: () => void;
  recording: RecordingState;
  starting: boolean;
  canRecord: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onTogglePause: () => void;
  lastRecording: LastRecording | null;
  sourcePanel: React.ReactNode;
  aiPanel: React.ReactNode;
  sourceOpen: boolean;
  onSourceOpenChange: (open: boolean) => void;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The single row of controls that runs the session. Everything the instructor
 * touches mid-teaching lives here, at a fixed place on screen, the way a call
 * app does it — instead of being spread over six stacked sidebar panels.
 */
export function PresentBar({
  sessionId,
  presenting,
  canPresent,
  onTogglePresent,
  muted,
  onToggleMute,
  recording,
  starting,
  canRecord,
  onStartRecording,
  onStopRecording,
  onTogglePause,
  lastRecording,
  sourcePanel,
  aiPanel,
  sourceOpen,
  onSourceOpenChange,
}: Props) {
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div className="relative z-30 flex shrink-0 items-center gap-2 border-t border-wkai-border bg-wkai-surface px-4 py-3">
      {/* Source */}
      <Popover
        open={sourceOpen}
        onOpenChange={onSourceOpenChange}
        label="Screen or window to share"
        trigger={
          <button
            className={clsx("ctl", sourceOpen && "ctl-on")}
            title="Choose what to share"
            aria-label="Choose what to share"
          >
            <MonitorUp size={18} />
          </button>
        }
      >
        {sourcePanel}
      </Popover>

      {/* Mic */}
      <button
        onClick={onToggleMute}
        disabled={!canRecord}
        className={clsx("ctl", muted && "ctl-danger")}
        title={muted ? "Unmute your microphone" : "Mute your microphone"}
        aria-label={muted ? "Unmute your microphone" : "Mute your microphone"}
        aria-pressed={muted}
      >
        {muted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>

      {/* Recording */}
      {!recording.isRecording ? (
        <button
          onClick={onStartRecording}
          disabled={!canRecord || starting}
          className="ctl"
          title={canRecord ? "Start recording to a local file" : "Pick a source before recording"}
          aria-label="Start recording"
        >
          {starting ? <Loader2 size={18} className="animate-spin" /> : <Circle size={18} />}
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 py-1 pl-3 pr-1">
          <span className="flex items-center gap-1.5 font-mono text-xs tabular-nums text-danger">
            <span
              className={clsx("h-1.5 w-1.5 rounded-full bg-danger", !recording.isPaused && "animate-pulse")}
            />
            {formatDuration(recording.duration)}
          </span>
          <button
            onClick={onTogglePause}
            className="ctl h-9 w-9 border-transparent bg-transparent"
            title={recording.isPaused ? "Resume recording" : "Pause recording"}
            aria-label={recording.isPaused ? "Resume recording" : "Pause recording"}
          >
            {recording.isPaused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            onClick={onStopRecording}
            className="ctl h-9 w-9 border-transparent bg-transparent text-danger"
            title="Stop recording and save the file"
            aria-label="Stop recording"
          >
            <Square size={15} className="fill-current" />
          </button>
        </div>
      )}

      {/* AI */}
      <Popover
        open={aiOpen}
        onOpenChange={setAiOpen}
        label="What the AI does this session"
        trigger={
          <button
            className={clsx("ctl", aiOpen && "ctl-on")}
            title="AI settings for this session"
            aria-label="AI settings for this session"
          >
            <Sparkles size={18} />
          </button>
        }
      >
        {aiPanel}
      </Popover>

      {/* Present — the main action, so it is the only labelled control here. */}
      <button
        onClick={onTogglePresent}
        disabled={!canPresent && !presenting}
        className={clsx(
          "btn ml-2 h-11 shrink-0 whitespace-nowrap rounded-full px-5 text-sm font-semibold",
          presenting
            ? "border border-danger/40 bg-danger/15 text-danger hover:bg-danger/25"
            : "bg-accent text-accent-fg hover:brightness-110"
        )}
        title={
          presenting
            ? "Stop sending your screen to students"
            : canPresent
              ? "Send your screen to every student in the room"
              : "Pick a screen or window first"
        }
      >
        <MonitorUp size={17} />
        {presenting ? "Stop presenting" : "Present to students"}
      </button>

      <div className="ml-auto flex items-center gap-2">
        {lastRecording && (
          <a
            href={lastRecording.url}
            download={lastRecording.name}
            className="btn-ghost btn-sm hidden whitespace-nowrap lg:inline-flex"
            title={`${lastRecording.name} — ${Math.round(lastRecording.sizeBytes / 1024)} KB`}
          >
            <Download size={14} />
            Save last recording
          </a>
        )}
        <EndSessionButton sessionId={sessionId} />
      </div>
    </div>
  );
}

/** Small popover anchored above its trigger; closes on Escape or outside click. */
function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onOpenChange]);

  return (
    <div className={clsx("relative", open && "z-50")} ref={wrapRef}>
      <div onClick={() => onOpenChange(!open)}>{trigger}</div>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute bottom-full left-0 z-50 mb-2 w-80 rounded-xl border border-wkai-border bg-wkai-surface p-3 shadow-2xl animate-slide-up"
        >
          <p className="mb-2 text-xs font-semibold text-wkai-text">{label}</p>
          {children}
        </div>
      )}
    </div>
  );
}
