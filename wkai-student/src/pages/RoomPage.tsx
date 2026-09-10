import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "../store";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { RoomHeader } from "../components/shared/RoomHeader";
import { TabBar } from "../components/shared/TabBar";
import { GuideFeed } from "../components/guide/GuideFeed";
import { FilesPanel } from "../components/files/FilesPanel";
import { AIHelperPanel } from "../components/ai/AIHelperPanel";
import { ScreenPreview } from "../components/guide/ScreenPreview";
import { MessagePanel } from "../components/messages/MessagePanel";
import { useWebRtcReceiver } from "../hooks/useWebRtcReceiver";
import { useSfuReceiver } from "../hooks/useSfuReceiver";
import { SessionEndedBanner } from "../components/shared/SessionEndedBanner";
import { InstructorOfflineBanner } from "../components/shared/InstructorOfflineBanner";
import { CodeEditor } from "../components/shared/CodeEditor";
import { ErrorHelper } from "../components/error/ErrorHelper";
import { ComprehensionModal } from "../components/comprehension/ComprehensionModal";
import { AssessmentPanel } from "../components/quiz/AssessmentPanel";
import { InstructorAwayModal } from "../components/shared/InstructorAwayModal";
import { RemovedFromSessionModal } from "../components/shared/RemovedFromSessionModal";
import { RoomEntryGate } from "../components/shared/RoomEntryGate";

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const { session, sessionEnded, instructorOffline, removedFromSession, activeTab, setActiveTab, pendingQuestion } = useStore();
  // "I know, I am staying" — dismissing the away prompt drops back to the
  // banner rather than nagging every time the instructor's socket flaps.
  const [awayDismissed, setAwayDismissed] = useState(false);
  const [removalDismissed, setRemovalDismissed] = useState(false);
  const { send } = useRoomSocket(code!);
  const { remoteStream: sfuStream, active: sfuActive } = useSfuReceiver();
  // The SFU wins when it has a stream: an instructor publishing to it is
  // deliberately in online mode, and the mesh offer is then the stale path.
  //
  // The mesh is switched off rather than merely ignored. Leaving it connected
  // pulled a second full copy of the same screen down the same connection just
  // to throw it away, which is what made the picture crawl and black out.
  const { remoteStream: meshStream } = useWebRtcReceiver(send, !sfuActive);
  const remoteStream = sfuActive && sfuStream ? sfuStream : meshStream;
  // A returning instructor makes the prompt relevant again next time.
  useEffect(() => {
    if (!instructorOffline) setAwayDismissed(false);
  }, [instructorOffline]);

  // Once the session ends only Guide and Files remain; a student parked on any
  // other tab would otherwise be left staring at an empty pane.
  useEffect(() => {
    if (sessionEnded && activeTab !== "guide" && activeTab !== "files") {
      setActiveTab("guide");
    }
  }, [sessionEnded, activeTab, setActiveTab]);

  // Arriving on an invite link with nothing in this tab yet: ask who they are
  // (and for the room password, if this room has one) before joining. A reload
  // mid-session restores the stored session and skips straight past this.
  //
  // The stored session is checked against the code in the URL, because it is
  // kept per tab rather than per room: opening a second invite link in a tab
  // that had already joined somewhere else used to re-render the first room
  // under the new room's URL.
  const storedRoomMatches =
    !!session && session.roomCode?.toUpperCase() === (code ?? "").toUpperCase();

  if (!storedRoomMatches && !sessionEnded) {
    return (
      <div className="h-full overflow-y-auto bg-wkai-bg">
        <RoomEntryGate code={(code ?? "").toUpperCase()} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-wkai-bg">
      <RoomHeader />
      {sessionEnded && <SessionEndedBanner />}
      {!sessionEnded && instructorOffline && <InstructorOfflineBanner />}
      <TabBar sessionEnded={sessionEnded} />

      <main className="min-h-0 flex-1 overflow-hidden pb-[calc(var(--nav-h)+var(--safe-b))] sm:pb-0">
        {activeTab === "guide"  && <GuideFeed />}
        {activeTab === "files"  && <FilesPanel />}
        {activeTab === "ai-helper" && <AIHelperPanel send={send} />}
        {activeTab === "live"   && <ScreenPreview remoteStream={remoteStream} />}
        {activeTab === "messages" && <MessagePanel send={send} />}
        {activeTab === "editor" && <CodeEditor />}
        {activeTab === "error"  && <ErrorHelper send={send} />}
        {activeTab === "quiz"   && <AssessmentPanel />}
      </main>

      {/* Comprehension gate — modal overlay */}
      {pendingQuestion && !removedFromSession && <ComprehensionModal send={send} />}

      {removedFromSession && !removalDismissed && (
        <RemovedFromSessionModal onReview={() => setRemovalDismissed(true)} />
      )}

      {!removedFromSession && !sessionEnded && instructorOffline && !awayDismissed && (
        <InstructorAwayModal onStay={() => setAwayDismissed(true)} />
      )}
    </div>
  );
}
