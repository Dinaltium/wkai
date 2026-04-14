import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { RoomHeader } from "../components/shared/RoomHeader";
import { TabBar } from "../components/shared/TabBar";
import { GuideFeed } from "../components/guide/GuideFeed";
import { FilesPanel } from "../components/files/FilesPanel";
import { ErrorHelper } from "../components/error/ErrorHelper";
import { CodeEditor } from "../components/shared/CodeEditor";
import { SessionEndedModal } from "../components/shared/SessionEndedModal";
import { ComprehensionModal } from "../components/comprehension/ComprehensionModal";
import { ScreenPreview } from "../components/guide/ScreenPreview";
import { MessagePanel } from "../components/messages/MessagePanel";
import { StudentDebugPanel } from "../components/shared/StudentDebugPanel";
import { joinRoom } from "../lib/api";

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, sessionEnded, activeTab, pendingQuestion, setSession, setGuideBlocks, setSharedFiles } = useStore();
  const { send } = useRoomSocket(code!);
  const bootstrappingRef = useRef(!session && !sessionEnded);
  const [endedModalDismissed, setEndedModalDismissed] = useState(false);

  function handleStay() {
    setEndedModalDismissed(true);
    const { activeTab: currentTab, setActiveTab } = useStore.getState();
    if (currentTab === "live" || currentTab === "messages") {
      setActiveTab("guide");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!code) return;
      if (session?.roomCode === code.toUpperCase() && !sessionEnded) return;

      bootstrappingRef.current = true;
      try {
        const data = await joinRoom(code);
        if (cancelled) return;

        if (data.session.status === "ended") {
          setSession(null);
          navigate("/");
          return;
        }

        setEndedModalDismissed(false);
        useStore.getState().setSessionEnded(false);
        useStore.getState().setActiveTab("live");
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
    <div className="relative flex h-full flex-col overflow-hidden bg-wkai-bg">
      <RoomHeader />
      <TabBar sessionEnded={sessionEnded} />

      <div className="flex-1 overflow-hidden">
        {activeTab === "guide"  && <GuideFeed />}
        {activeTab === "files"  && <FilesPanel />}
        {activeTab === "editor" && <CodeEditor />}
        {activeTab === "error"  && <ErrorHelper send={send} />}
        {activeTab === "live" && <ScreenPreview send={send} />}
        {activeTab === "messages" && <MessagePanel send={send} />}
      </div>

      {/* Comprehension gate — modal overlay */}
      {pendingQuestion && <ComprehensionModal send={send} />}
      {sessionEnded && !endedModalDismissed && (
        <SessionEndedModal onStay={handleStay} />
      )}
      <StudentDebugPanel />
    </div>
  );
}
