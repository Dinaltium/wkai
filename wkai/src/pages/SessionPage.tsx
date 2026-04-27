import { useState } from "react";
import { clsx } from "clsx";
import { useAppStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import { GuidePanel } from "../components/instructor/GuidePanel";
import { FileSharePanel } from "../components/instructor/FileSharePanel";
import { CaptureStatus } from "../components/instructor/CaptureStatus";
import { ShareToggle } from "../components/instructor/ShareToggle";
import { StudentPanel } from "../components/instructor/StudentPanel";
import { StudentJoinToast } from "../components/instructor/StudentJoinToast";
import { InboxPanel } from "../components/instructor/InboxPanel";
import { RoomInfo } from "../components/instructor/RoomInfo";
import { EndSessionButton } from "../components/instructor/EndSessionButton";
import { ShareIntentToast } from "../components/instructor/ShareIntentToast";
import { RecordingPanel } from "../components/instructor/RecordingPanel";
import { useWebRtcPublisher } from "../hooks/useWebRtcPublisher";

export function SessionPage() {
  const { session, settings, studentCount } = useAppStore();
  const { send, on, off } = useWebSocket({
    sessionId: session?.id ?? null,
    backendUrl: settings.backendUrl,
  });
  useWebRtcPublisher(session?.id ?? null, send, on, off);

  const [leftTab, setLeftTab] = useState<"students" | "inbox">("students");

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center text-wkai-text-dim">
        No active session. Go back to Setup.
      </div>
    );
  }

  return (
    <div className="relative flex h-full gap-0">
      {/* ─── Left column: status + people ─────────────────────────── */}
      <div className="flex w-64 shrink-0 flex-col border-r border-wkai-border min-h-0 overflow-y-auto no-scrollbar">
        <div className="border-b border-wkai-border p-4">
          <RoomInfo session={session} />
        </div>
        <div className="border-b border-wkai-border p-4">
          <CaptureStatus />
        </div>
        <div className="border-b border-wkai-border p-4">
          <ShareToggle />
        </div>
        <div className="border-b border-wkai-border p-4">
          <RecordingPanel roomCode={session.roomCode} />
        </div>
        <div className="flex flex-col">
          <div className="flex border-b border-wkai-border">
            {(["students", "inbox"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setLeftTab(tab)}
                className={clsx(
                  "flex-1 py-2 text-xs font-medium capitalize transition-colors",
                  leftTab === tab
                    ? "border-b-2 border-indigo-400 text-indigo-400"
                    : "text-wkai-text-dim hover:text-wkai-text"
                )}
              >
                {tab === "students" ? `Students (${studentCount})` : "Q&A"}
              </button>
            ))}
          </div>
          <div className="">
            {leftTab === "students" && <StudentPanel />}
            {leftTab === "inbox" && <InboxPanel send={send} />}
          </div>
        </div>
        <div className="border-t border-wkai-border p-4">
          <EndSessionButton sessionId={session.id} />
        </div>
      </div>

      {/* ─── Middle column: live guide feed ───────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <GuidePanel />
      </div>

      {/* ─── Right column: file explorer ──────────────────────────── */}
      <div className="w-80 shrink-0 border-l border-wkai-border min-h-0">
        <FileSharePanel sessionId={session.id} send={send} />
      </div>

      {/* ─── LangGraph intent detection toast ─────────────────────── */}
      {/* Appears automatically when the audio transcript reveals    */}
      {/* "share this file" intent — instructor confirms with one tap */}
      <ShareIntentToast sessionId={session.id} />

      <StudentJoinToast />
    </div>
  );
}
