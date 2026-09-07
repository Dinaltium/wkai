import { useEffect, useState } from "react";
import { BookOpen, ClipboardList, FolderOpen, MessageSquare, Users } from "lucide-react";
import { useAppStore } from "../store";
import { useSessionRuntime } from "../session/SessionRuntimeProvider";
import { GuidePanel } from "../components/instructor/GuidePanel";
import { FileSharePanel } from "../components/instructor/FileSharePanel";
import { StudentPanel } from "../components/instructor/StudentPanel";
import { StudentJoinToast } from "../components/instructor/StudentJoinToast";
import { InboxPanel } from "../components/instructor/InboxPanel";
import { ShareIntentToast } from "../components/instructor/ShareIntentToast";
import { SessionAiSettingsPanel } from "../components/instructor/SessionAiSettingsPanel";
import { StagePreview } from "../components/instructor/StagePreview";
import { PresentBar } from "../components/instructor/PresentBar";
import { AssessmentPanel } from "../components/instructor/AssessmentPanel";
import { SessionRailTabs, type RailTabDef } from "../components/instructor/SessionRailTabs";
import { DeviceSelector } from "../components/nativeCapture/DeviceSelector";

const RAIL_WIDTH_KEY = "wkai_session_rail_width";
const RAIL_MIN_WIDTH = 260;
const RAIL_MAX_WIDTH = 640;

function clampRailWidth(width: number) {
  return Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, Math.round(width)));
}

function readStoredRailWidth() {
  const raw = Number(localStorage.getItem(RAIL_WIDTH_KEY));
  return Number.isFinite(raw) && raw > 0 ? clampRailWidth(raw) : 320;
}

type RailTab = "guide" | "files" | "people" | "qa" | "tests";

const RAIL_TABS: RailTabDef<RailTab>[] = [
  { id: "guide", label: "Guide", icon: BookOpen },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "people", label: "People", icon: Users },
  { id: "qa", label: "Q&A", icon: MessageSquare },
  { id: "tests", label: "Quiz", icon: ClipboardList },
];

/**
 * The session view is only a view. Capture, WebRTC, the socket and the
 * recorder all live in SessionRuntimeProvider above the router, so leaving
 * this page (for Settings, say) no longer takes the stream down with it.
 */
export function SessionPage() {
  const { session, studentCount, streamingToStudents, setStreamingToStudents } = useAppStore();
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const { send, capture, devices, recorder, selectedTarget, setSelectedTarget, sourceLabel, selectCamera, cameraStream } =
    useSessionRuntime();

  const [railTab, setRailTab] = useState<RailTab>("guide");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [railWidth, setRailWidth] = useState(readStoredRailWidth);

  useEffect(() => {
    localStorage.setItem(RAIL_WIDTH_KEY, String(railWidth));
  }, [railWidth]);

  // A width dragged out on a maximised window must not survive into a small
  // one: the rail is fixed-px and the stage is what gets squeezed, so a
  // restored 640px rail on a 900px window left almost nothing for the preview.
  useEffect(() => {
    const clampToWindow = () =>
      setRailWidth((w) => Math.min(w, Math.max(RAIL_MIN_WIDTH, window.innerWidth * 0.45)));
    clampToWindow();
    window.addEventListener("resize", clampToWindow);
    return () => window.removeEventListener("resize", clampToWindow);
  }, []);

  // Pointer capture rather than window listeners: the drag keeps working when
  // the cursor crosses the video canvas, which swallows mouse events.
  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = railWidth;

    const onMove = (e: PointerEvent) => setRailWidth(clampRailWidth(startWidth + (startX - e.clientX)));
    const onUp = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  if (!session) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-wkai-text">No session is running</p>
        <p className="max-w-sm text-xs leading-relaxed text-wkai-text-dim">
          Head back to Setup to start one. Students can only join a session that is live.
        </p>
      </div>
    );
  }

  function handleTogglePresent() {
    if (!streamingToStudents && !sharedDisplayStream) {
      // Nothing to send yet — take them straight to the thing that fixes it.
      setSourceOpen(true);
      return;
    }
    const next = !streamingToStudents;
    setStreamingToStudents(next);
    addDebugLog(
      next ? "Presenting to students" : "Stopped presenting — students keep the guide",
      next ? "success" : "info"
    );
  }

  return (
    // Column, not row: the control bar runs the full width of the window
    // beneath both the stage and the rail, the way a call app does it. Nested
    // inside the stage column it stopped at the rail edge, leaving the
    // session's main controls boxed into two thirds of the screen.
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-0 flex-1">
        {/* ─── Stage: what you are sharing ─────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          <StagePreview
            canvasRef={capture.canvasRef}
            attachCanvas={capture.attachCanvas}
            status={cameraStream ? "capturing" : capture.status.status}
            previewStream={cameraStream}
            sourceLabel={sourceLabel}
            presenting={streamingToStudents}
            recording={recorder.recording.isRecording}
            onPickSource={() => setSourceOpen(true)}
          />
        </div>

        {/* Drag handle. The rail was a fixed 20rem, which is too narrow for a
            code-heavy guide block and too wide when the stage matters more. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the side panel"
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setRailWidth((w) => clampRailWidth(w + 24));
            if (e.key === "ArrowRight") setRailWidth((w) => clampRailWidth(w - 24));
          }}
          className="w-1 shrink-0 cursor-col-resize bg-wkai-border transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
        />

        {/* ─── Right rail: everything the session produces ──────────── */}
        <aside
          className="flex shrink-0 flex-col border-l border-wkai-border"
          style={{ width: railWidth }}
        >
          <SessionRailTabs
            tabs={RAIL_TABS.map((t) =>
              t.id === "people" ? { ...t, badge: studentCount } : t
            )}
            active={railTab}
            onChange={setRailTab}
            width={railWidth}
          />

          <div className="min-h-0 flex-1 overflow-hidden">
            {railTab === "guide" && <GuidePanel />}
            {railTab === "files" && <FileSharePanel sessionId={session.id} send={send} />}
            {railTab === "people" && <StudentPanel send={send} />}
            {railTab === "qa" && <InboxPanel send={send} />}
            {railTab === "tests" && <AssessmentPanel />}
          </div>
        </aside>
      </div>

      {/* ─── Controls: one row across the whole window ──────────────── */}
      <PresentBar
        sessionId={session.id}
        presenting={streamingToStudents}
        canPresent={!!sharedDisplayStream}
        onTogglePresent={handleTogglePresent}
        muted={recorder.recording.isMuted}
        onToggleMute={recorder.toggleMute}
        recording={recorder.recording}
        starting={recorder.starting}
        canRecord={recorder.canRecord}
        onStartRecording={() => void recorder.start()}
        onStopRecording={recorder.stop}
        onTogglePause={recorder.togglePause}
        lastRecording={recorder.last}
        sourceOpen={sourceOpen}
        onSourceOpenChange={setSourceOpen}
        sourcePanel={
          <DeviceSelector
            monitors={devices.monitors}
            windows={devices.windows}
            cameras={devices.cameras}
            selectedCameraLabel={cameraStream ? sourceLabel : null}
            onSelectCamera={(deviceId, label) => {
              void selectCamera(deviceId, label);
              setSourceOpen(false);
            }}
            selectedTarget={selectedTarget}
            onSelect={(t) => {
              setSelectedTarget(t);
              setSourceOpen(false);
            }}
            isLoading={devices.isLoading}
            onRefresh={devices.refreshDevices}
          />
        }
        aiPanel={<SessionAiSettingsPanel />}
      />

      {/* LangGraph "share this file" intent, confirmed with one tap. */}
      <ShareIntentToast sessionId={session.id} />
      <StudentJoinToast />
    </div>
  );
}
