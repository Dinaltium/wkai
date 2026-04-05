import { useAppStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import { GuidePanel } from "../components/instructor/GuidePanel";
import { FileSharePanel } from "../components/instructor/FileSharePanel";
import { CaptureStatus } from "../components/instructor/CaptureStatus";
import { RoomInfo } from "../components/instructor/RoomInfo";
import { EndSessionButton } from "../components/instructor/EndSessionButton";
import { ShareIntentToast } from "../components/instructor/ShareIntentToast";

export function SessionPage() {
  const { session, settings } = useAppStore();
  const { send } = useWebSocket({
    sessionId: session?.id ?? null,
    backendUrl: settings.backendUrl,
  });

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-wkai-text-dim">
        No active session. Go back to Setup.
      </div>
    );
  }

  return (
    <div className="relative flex h-full gap-0">
      {/* ─── Left column: status + files ──────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-wkai-border">
        <div className="border-b border-wkai-border p-4">
          <RoomInfo session={session} />
        </div>
        <div className="border-b border-wkai-border p-4">
          <CaptureStatus />
        </div>
        <div className="flex-1 overflow-hidden">
          <FileSharePanel sessionId={session.id} send={send} />
        </div>
        <div className="border-t border-wkai-border p-4">
          <EndSessionButton sessionId={session.id} />
        </div>
      </div>

      {/* ─── Right column: live guide feed ────────────────────────── */}
      <div className="flex-1 overflow-hidden">
        <GuidePanel />
      </div>

      {/* ─── LangGraph intent detection toast ─────────────────────── */}
      {/* Appears automatically when the audio transcript reveals    */}
      {/* "share this file" intent — instructor confirms with one tap */}
      <ShareIntentToast sessionId={session.id} />
    </div>
  );
}
