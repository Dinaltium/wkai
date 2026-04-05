import { useEffect } from "react";
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

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, sessionEnded, activeTab, pendingQuestion } = useStore();
  const { send } = useRoomSocket(code!);

  // If no session in store (e.g. hard refresh), redirect to join
  useEffect(() => {
    if (!session && !sessionEnded) navigate("/");
  }, [session, sessionEnded, navigate]);

  if (!session && !sessionEnded) return null;

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
