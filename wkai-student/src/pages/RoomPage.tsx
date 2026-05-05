import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { joinRoom } from "../lib/api";
import { SessionEndedBanner } from "../components/shared/SessionEndedBanner";
import { CodeEditor } from "../components/shared/CodeEditor";
import { ErrorHelper } from "../components/error/ErrorHelper";
import { ComprehensionModal } from "../components/comprehension/ComprehensionModal";

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { studentId, session, sessionEnded, activeTab, pendingQuestion, setSession, setGuideBlocks, setSharedFiles } = useStore();
  const { send } = useRoomSocket(code!);
  const { remoteStream } = useWebRtcReceiver(send);
  const bootstrappingRef = useRef(!session && !sessionEnded);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (session || sessionEnded || !code) return;

      bootstrappingRef.current = true;
      try {
        const studentName = localStorage.getItem("wkai_student_name") || "Student";
        const data = await joinRoom(code, studentId, studentName);
        if (cancelled) return;

        if (data.session.status === "ended") {
          navigate("/");
          return;
        }

        setSession(data.session);
        setGuideBlocks(data.guideBlocks);
        setSharedFiles(data.sharedFiles);
      } catch {
        if (!cancelled) navigate("/");
      } finally {
        if (!cancelled) bootstrappingRef.current = false;
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [code, navigate, session, sessionEnded, setSession, setGuideBlocks, setSharedFiles]);

  if ((bootstrappingRef.current || (!session && !sessionEnded)) && !sessionEnded) {
    return (
      <div className="flex h-full items-center justify-center bg-wkai-bg text-wkai-text-dim">
        Joining room...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-wkai-bg">
      <RoomHeader />
      {sessionEnded && <SessionEndedBanner />}
      <TabBar />

      <div className="flex-1 overflow-hidden">
        {activeTab === "guide"  && <GuideFeed />}
        {activeTab === "files"  && <FilesPanel />}
        {activeTab === "ai-helper" && <AIHelperPanel send={send} />}
        {activeTab === "live"   && <ScreenPreview remoteStream={remoteStream} />}
        {activeTab === "messages" && <MessagePanel send={send} />}
        {activeTab === "editor" && <CodeEditor />}
        {activeTab === "error"  && <ErrorHelper send={send} />}
      </div>

      {/* Comprehension gate — modal overlay */}
      {pendingQuestion && <ComprehensionModal send={send} />}
    </div>
  );
}
