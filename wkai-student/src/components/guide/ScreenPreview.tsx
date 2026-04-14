import { useEffect, useRef } from "react";
import { useStore } from "../../store";
import { Monitor } from "lucide-react";
import { useWebRtcReceiver } from "../../hooks/useWebRtcReceiver";

interface ScreenPreviewProps {
  send: <T>(type: string, payload: T) => void;
}

export function ScreenPreview({ send }: ScreenPreviewProps) {
  const { session, latestLiveExplanation } = useStore();
  const { remoteStream } = useWebRtcReceiver(send);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  if (!remoteStream) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-wkai-text-dim">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-wkai-border bg-wkai-surface">
          <Monitor size={28} />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-wkai-text">Screen preview not available</p>
          <p className="text-xs text-wkai-text-dim max-w-xs text-center">
            {session?.status === "ended"
              ? "The session has ended. Guide blocks and files remain available."
              : "Live stream starts when the instructor enables WebRTC sharing."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-wkai-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
          <p className="text-xs font-medium text-wkai-text">Live Screen</p>
        </div>
        <p className="text-xs text-wkai-text-dim">
          WebRTC live
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full rounded-lg border border-wkai-border object-contain shadow-lg"
        />
      </div>
      {latestLiveExplanation && (
        <div className="border-t border-wkai-border px-4 py-3 space-y-1 bg-wkai-surface">
          <p className="text-[11px] uppercase tracking-wider text-indigo-400 font-semibold">AI Live Notes</p>
          <p className="text-xs text-wkai-text-dim">
            Heard: "{latestLiveExplanation.transcript}"
          </p>
          <p className="text-sm text-wkai-text">{latestLiveExplanation.explanation}</p>
        </div>
      )}
    </div>
  );
}
