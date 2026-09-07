import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  Circle,
  Gauge,
  Download,
  Loader2,
  Mic,
  MicOff,
  MonitorUp,
  Pause,
  Play,
  Share2,
  Sparkles,
  Square,
} from "lucide-react";
import { clsx } from "clsx";
import type { LastRecording } from "../../hooks/useSessionRecorder";
import type { RecordingState } from "../../types";
import { EndSessionButton } from "./EndSessionButton";
import { CaptureQualityPanel } from "./CaptureQualityPanel";
import { ShareSessionDialog } from "./ShareSessionDialog";
import { useAppStore } from "../../store";
import { useSessionRuntime } from "../../session/SessionRuntimeProvider";

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
  const [qualityOpen, setQualityOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

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

      {/* Mic — icon mutes, the chevron picks the device (the way every call
          app does it). */}
      <MicControl muted={muted} disabled={!canRecord} onToggleMute={onToggleMute} />

      {/* Stream quality, in the bar rather than three clicks away in Settings. */}
      <Popover
        open={qualityOpen}
        onOpenChange={setQualityOpen}
        label="Stream quality"
        trigger={
          <button
            className={clsx("ctl", qualityOpen && "ctl-on")}
            title="Framerate and quality"
            aria-label="Framerate and quality"
          >
            <Gauge size={18} />
          </button>
        }
      >
        <CaptureQualityPanel />
      </Popover>

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
        <button
          className="btn-secondary btn-sm whitespace-nowrap"
          onClick={() => setShareOpen(true)}
          title="Show the room code and join link"
        >
          <Share2 size={14} />
          Invite
        </button>
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

      {shareOpen && <ShareSessionDialog onClose={() => setShareOpen(false)} />}
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

/**
 * Mute is one click on the icon; the device list is behind the chevron. The
 * button used to be mute-only, which left changing microphone mid-session as a
 * trip to Settings.
 */
function MicControl({
  muted,
  disabled,
  onToggleMute,
}: {
  muted: boolean;
  disabled: boolean;
  onToggleMute: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const selectedId = useAppStore((s) => s.settings.micDeviceId);
  const { switchMicrophone } = useSessionRuntime();

  // Labels are blank until the page holds a mic permission, so the list is
  // only worth reading once there is something to show.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (!cancelled) setDevices(all.filter((d) => d.kind === "audioinput"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open]);

  return (
    <div className="flex items-stretch">
      <button
        onClick={onToggleMute}
        disabled={disabled}
        className={clsx("ctl rounded-r-none pr-2", muted && "ctl-danger")}
        title={muted ? "Unmute your microphone" : "Mute your microphone"}
        aria-label={muted ? "Unmute your microphone" : "Mute your microphone"}
        aria-pressed={muted}
      >
        {muted ? <MicOff size={18} /> : <Mic size={18} />}
      </button>

      <Popover
        open={open}
        onOpenChange={setOpen}
        label="Microphone"
        trigger={
          <button
            className={clsx("ctl w-6 rounded-l-none border-l-0 px-0", open && "ctl-on")}
            title="Choose a microphone"
            aria-label="Choose a microphone"
          >
            <ChevronUp size={14} />
          </button>
        }
      >
        <div className="space-y-1">
          <MicOption
            label="System default"
            active={!selectedId}
            onClick={() => {
              void switchMicrophone("");
              setOpen(false);
            }}
          />
          {devices.map((d) => (
            <MicOption
              key={d.deviceId}
              label={d.label || "Microphone"}
              active={selectedId === d.deviceId}
              onClick={() => {
                void switchMicrophone(d.deviceId);
                setOpen(false);
              }}
            />
          ))}
          <button
            onClick={() => {
              onToggleMute();
              setOpen(false);
            }}
            disabled={disabled}
            className="mt-1 w-full rounded-md border border-wkai-border px-2 py-1.5 text-left text-xs text-wkai-text-dim hover:text-wkai-text"
          >
            {muted ? "Unmute microphone" : "Mute microphone"}
          </button>
        </div>
      </Popover>
    </div>
  );
}

function MicOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
        active ? "bg-accent/15 text-accent-text" : "text-wkai-text hover:bg-wkai-surface2"
      )}
    >
      <Check size={13} className={clsx(!active && "opacity-0")} />
      <span className="truncate">{label}</span>
    </button>
  );
}
