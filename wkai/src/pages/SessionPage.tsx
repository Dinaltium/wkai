import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { BookOpen, FolderOpen, MessageSquare, Users } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import { useWebRtcPublisher } from "../hooks/useWebRtcPublisher";
import { useNativeCapture } from "../hooks/useNativeCapture";
import { useCaptureDevices } from "../hooks/useCaptureDevices";
import { useSessionRecorder } from "../hooks/useSessionRecorder";
import { GuidePanel } from "../components/instructor/GuidePanel";
import { FileSharePanel } from "../components/instructor/FileSharePanel";
import { StudentPanel } from "../components/instructor/StudentPanel";
import { StudentJoinToast } from "../components/instructor/StudentJoinToast";
import { InboxPanel } from "../components/instructor/InboxPanel";
import { ShareIntentToast } from "../components/instructor/ShareIntentToast";
import { SessionAiSettingsPanel } from "../components/instructor/SessionAiSettingsPanel";
import { StagePreview } from "../components/instructor/StagePreview";
import { PresentBar } from "../components/instructor/PresentBar";
import { DeviceSelector } from "../components/nativeCapture/DeviceSelector";
import type { CaptureTarget } from "../types/nativeCapture";
import { captureScreen, startAudioCapture, stopAudioCapture } from "../lib/tauri";

const SCREEN_FRAME_INTERVAL_MS = 25_000;

type RailTab = "guide" | "files" | "people" | "qa";

const RAIL_TABS: { id: RailTab; label: string; icon: typeof BookOpen }[] = [
  { id: "guide", label: "Guide", icon: BookOpen },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "people", label: "People", icon: Users },
  { id: "qa", label: "Q&A", icon: MessageSquare },
];

export function SessionPage() {
  const { session, settings, studentCount, streamingToStudents, setStreamingToStudents } = useAppStore();
  const { send, on, off } = useWebSocket({
    sessionId: session?.id ?? null,
    backendUrl: settings.backendUrl,
    token: session?.instructorToken,
  });
  useWebRtcPublisher(session?.id ?? null, send, on, off);

  const [railTab, setRailTab] = useState<RailTab>("guide");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<CaptureTarget | null>(null);
  const capture = useNativeCapture();
  const devices = useCaptureDevices();
  const recorder = useSessionRecorder(session?.roomCode ?? "session");
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const sessionAiSettings = useAppStore((s) => s.sessionAiSettings);
  const initSessionAiSettings = useAppStore((s) => s.initSessionAiSettings);
  // Mic track lives outside the native-capture stream (getUserMedia, not
  // canvas.captureStream) so it needs its own handle to stop on cleanup —
  // capture.stopCapture() only knows about its own video track.
  const micStreamRef = useRef<MediaStream | null>(null);

  // Seed the session-level AI/recording overrides from the global defaults
  // once per session.
  useEffect(() => {
    if (session) initSessionAiSettings();
  }, [session?.id]);

  // Auto-start capture when target is selected
  useEffect(() => {
    if (selectedTarget) {
      const fps = settings.captureFramerate === "auto" ? 30 : parseInt(String(settings.captureFramerate));
      // 0 = capture at the display's native width. Only "low" downscales:
      // resizing a 1920x1200 frame costs ~64ms against ~50ms for the encode, so
      // for every other preset native is both sharper and faster.
      const previewWidth = settings.captureQuality === "low" ? 1280 : 0;
      capture
        .startCapture(selectedTarget, { fps, quality: settings.captureQuality, preview_width: previewWidth })
        .then(async () => {
          const stream = await capture.getStream(fps);
          if (!stream) {
            addDebugLog(
              "Capture started but produced no frames — live stream and recording unavailable",
              "error"
            );
            return;
          }

          // Add the instructor's mic to the same stream so it rides along
          // wherever this stream already goes — WebRTC, local recording, and
          // the mute control in the bar.
          try {
            const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = mic;
            mic.getAudioTracks().forEach((track) => stream.addTrack(track));
            addDebugLog("Microphone added to live stream — students will hear audio", "success");
          } catch (err) {
            addDebugLog(
              `Microphone unavailable, streaming video only: ${err instanceof Error ? err.message : String(err)}`,
              "warn"
            );
          }

          setSharedDisplayStream(stream);
        });
    } else {
      capture.stopCapture().then(() => {
        micStreamRef.current?.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
        setSharedDisplayStream(null);
      });
    }
  }, [selectedTarget]); // Intentionally omitting settings so it doesn't restart on setting change

  // Drive local disk recording off the session-level toggle instead of
  // baking it into the one-shot startCapture() call.
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  useEffect(() => {
    if (!sharedDisplayStream || !sessionAiSettings) return;
    if (sessionAiSettings.saveLocalRecording) {
      capture.startLocalRecording(settings.recordingDirectory || "", settings.recordingFormat || "mp4");
    } else {
      capture.stopLocalRecording();
    }
  }, [sharedDisplayStream, sessionAiSettings?.saveLocalRecording]);

  // Periodic screen-frame → AI guide-block generation. Separate xcap-based grab
  // rather than reusing the native-capture pipeline: that pipeline is tuned for
  // continuous low-latency streaming, not an occasional AI snapshot.
  //
  // Gated on the session override, not the raw global setting — each tick is a
  // real Groq vision call.
  useEffect(() => {
    if (!selectedTarget || !isTauri()) return;
    if (!sessionAiSettings?.aiGuideBlocksEnabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const frameB64 = await captureScreen();
        if (!cancelled) send("screen-frame", { frameB64 });
      } catch (err) {
        addDebugLog(
          `Screen frame capture failed: ${err instanceof Error ? err.message : String(err)}`,
          "warn"
        );
      }
    };
    void tick();
    const interval = window.setInterval(tick, SCREEN_FRAME_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selectedTarget, send, sessionAiSettings?.aiGuideBlocksEnabled]);

  // Mic → Whisper → guide blocks. Keyed on the session rather than the capture
  // target: what the instructor says is worth transcribing whether or not a
  // screen source is selected.
  useEffect(() => {
    if (!session?.id || !isTauri()) return;
    if (!sessionAiSettings?.aiTranscriptionEnabled) return;

    startAudioCapture(session.id, settings.micDevice)
      .then((device) =>
        addDebugLog(`Microphone transcription started on "${device}" — speech becomes guide blocks`, "success")
      )
      .catch((err) => addDebugLog(`Could not start microphone transcription: ${err}`, "error"));

    return () => {
      void stopAudioCapture();
    };
  }, [session?.id, sessionAiSettings?.aiTranscriptionEnabled, settings.micDevice]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      capture.stopCapture();
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setSharedDisplayStream(null);
    };
  }, []);

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

  const sourceLabel = (() => {
    if (!selectedTarget) return null;
    if (selectedTarget.type === "monitor") {
      const m = devices.monitors.find((x) => x.id === selectedTarget.id);
      return m ? `${m.name} · ${m.width}×${m.height}` : "Screen";
    }
    const w = devices.windows.find((x) => x.id === selectedTarget.id);
    return w ? w.title || w.appName : "Window";
  })();

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
    <div className="flex h-full min-h-0">
      {/* ─── Stage: what you are sharing, plus the controls ────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <StagePreview
          canvasRef={capture.canvasRef}
          attachCanvas={capture.attachCanvas}
          status={capture.status.status}
          sourceLabel={sourceLabel}
          presenting={streamingToStudents}
          recording={recorder.recording.isRecording}
          onPickSource={() => setSourceOpen(true)}
        />

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
      </div>

      {/* ─── Right rail: everything the session produces ───────────── */}
      <aside className="flex w-[20rem] shrink-0 flex-col border-l border-wkai-border 2xl:w-[22rem]">
        <div className="flex shrink-0 border-b border-wkai-border bg-wkai-surface" role="tablist">
          {RAIL_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="tab"
              aria-selected={railTab === id}
              onClick={() => setRailTab(id)}
              className={clsx(
                "flex h-11 flex-1 items-center justify-center gap-1.5 text-xs font-medium transition-colors",
                railTab === id
                  ? "border-b-2 border-accent text-accent-text"
                  : "text-wkai-text-dim hover:text-wkai-text"
              )}
            >
              <Icon size={14} />
              {id === "people" ? `${label} (${studentCount})` : label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {railTab === "guide" && <GuidePanel />}
          {railTab === "files" && <FileSharePanel sessionId={session.id} send={send} />}
          {railTab === "people" && <StudentPanel />}
          {railTab === "qa" && <InboxPanel send={send} />}
        </div>
      </aside>

      {/* LangGraph "share this file" intent, confirmed with one tap. */}
      <ShareIntentToast sessionId={session.id} />
      <StudentJoinToast />
    </div>
  );
}
