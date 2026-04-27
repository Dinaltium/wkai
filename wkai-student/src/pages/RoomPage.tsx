import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { RoomHeader } from "../components/shared/RoomHeader";
import { TabBar } from "../components/shared/TabBar";
import { GuideFeed } from "../components/guide/GuideFeed";
import { FilesPanel } from "../components/files/FilesPanel";
import { ErrorHelper } from "../components/error/ErrorHelper";
import { CodeEditor } from "../components/shared/CodeEditor";
import { SessionEndedBanner } from "../components/shared/SessionEndedBanner";
import { ComprehensionModal } from "../components/comprehension/ComprehensionModal";
import { joinRoom } from "../lib/api";

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { studentId, session, sessionEnded, activeTab, pendingQuestion, setSession, setGuideBlocks, setSharedFiles } = useStore();
  const { send } = useRoomSocket(code!);
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
        {activeTab === "editor" && <CodeEditor />}
        {activeTab === "error"  && <ErrorHelper send={send} />}
      </div>

      {/* Comprehension gate — modal overlay */}
      {pendingQuestion && <ComprehensionModal send={send} />}
    </div>
  );
}
