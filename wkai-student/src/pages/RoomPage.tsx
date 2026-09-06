import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
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
import { InstructorOfflineBanner } from "../components/shared/InstructorOfflineBanner";
import { CodeEditor } from "../components/shared/CodeEditor";
import { ErrorHelper } from "../components/error/ErrorHelper";
import { ComprehensionModal } from "../components/comprehension/ComprehensionModal";

export function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, sessionEnded, instructorOffline, activeTab, setActiveTab, pendingQuestion, setAuth, setSession, setGuideBlocks, setSharedFiles } = useStore();
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
        const data = await joinRoom(code, studentName);
        if (cancelled) return;

        if (data.session.status === "ended") {
          navigate("/join", {
            replace: true,
            state: { error: "That session has ended. Ask your instructor for a new code." },
          });
          return;
        }

        // Re-issued identity + token (e.g. after a page reload); the WS hook
        // reconnects once the token lands in the store.
        setAuth(data.studentId, data.joinToken);
        setSession(data.session);
        setGuideBlocks(data.guideBlocks);
        setSharedFiles(data.sharedFiles);
      } catch {
        // Send them back to the one place that can fix this — the code entry —
        // with a reason, rather than dropping them on the marketing page.
        if (!cancelled) {
          navigate("/join", {
            replace: true,
            state: { error: `Could not join room ${code}. Check the code with your instructor.` },
          });
        }
      } finally {
        if (!cancelled) bootstrappingRef.current = false;
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [code, navigate, session, sessionEnded, setAuth, setSession, setGuideBlocks, setSharedFiles]);

  // Once the session ends only Guide and Files remain; a student parked on any
  // other tab would otherwise be left staring at an empty pane.
  useEffect(() => {
    if (sessionEnded && activeTab !== "guide" && activeTab !== "files") {
      setActiveTab("guide");
    }
  }, [sessionEnded, activeTab, setActiveTab]);

  if ((bootstrappingRef.current || (!session && !sessionEnded)) && !sessionEnded) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-wkai-bg px-6 text-center">
        <Loader2 size={22} className="animate-spin text-accent-text" />
        <p className="text-sm font-medium text-wkai-text">Joining room {code}</p>
        <p className="text-xs text-wkai-text-dim">Checking the code and setting up your live connection.</p>
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
      </main>

      {/* Comprehension gate — modal overlay */}
      {pendingQuestion && <ComprehensionModal send={send} />}
    </div>
  );
}
