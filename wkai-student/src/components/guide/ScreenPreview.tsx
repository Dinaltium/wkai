import { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { Monitor, Volume2, VolumeX, Maximize2 } from "lucide-react";

interface ScreenPreviewProps {
  remoteStream: MediaStream | null;
}

export function ScreenPreview({ remoteStream }: ScreenPreviewProps) {
  const { session, latestLiveExplanation, backgroundLiveEnabled, setBackgroundLiveEnabled } = useStore();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Autoplay only survives while muted, so the student opts into audio.
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const hasAudio = (remoteStream?.getAudioTracks().length ?? 0) > 0;

  function toggleFullscreen() {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }

  if (!remoteStream) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
          <Monitor size={26} className="text-wkai-text-dim" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-wkai-text">No live screen right now</p>
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-wkai-text-dim">
            {session?.status === "ended"
              ? "The session has ended. Your guide and the shared files are still available."
              : "The stream appears here the moment your instructor starts sharing. The Guide tab keeps working meanwhile."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-wkai-border bg-wkai-surface px-3 py-2 sm:px-4">
        <span className="flex items-center gap-2 text-xs font-medium text-wkai-text">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          Live screen
        </span>

        <div className="ml-auto flex items-center gap-1">
          {hasAudio && (
            <button
              onClick={() => setMuted((m) => !m)}
              className="btn-icon btn-sm text-wkai-text-dim hover:text-wkai-text"
              aria-label={muted ? "Unmute instructor audio" : "Mute instructor audio"}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="btn-icon btn-sm text-wkai-text-dim hover:text-wkai-text"
            aria-label="Toggle fullscreen"
            title="Fullscreen"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      <div ref={wrapRef} className="min-h-0 flex-1 overflow-hidden bg-black/40 p-2 sm:p-3">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="h-full w-full rounded-lg object-contain"
        />
      </div>

      {latestLiveExplanation && (
        <div className="shrink-0 space-y-1 border-t border-wkai-border bg-wkai-surface px-3 py-3 sm:px-4">
          <p className="text-xs font-semibold text-accent-text">AI live notes</p>
          <p className="text-xs italic text-wkai-text-dim">“{latestLiveExplanation.transcript}”</p>
          <p className="max-w-[70ch] text-sm leading-relaxed text-wkai-text">
            {latestLiveExplanation.explanation}
          </p>
        </div>
      )}

      {/* Bandwidth control lives with the video it affects, not in the header. */}
      <label className="flex shrink-0 items-center gap-2.5 border-t border-wkai-border px-3 py-2.5 text-xs text-wkai-text-dim sm:px-4">
        <input
          type="checkbox"
          checked={backgroundLiveEnabled}
          onChange={(e) => setBackgroundLiveEnabled(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        Keep the stream running when this tab is in the background
      </label>
    </div>
  );
}
