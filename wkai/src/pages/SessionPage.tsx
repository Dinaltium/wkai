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
import { SessionAiSettingsPanel } from "../components/instructor/SessionAiSettingsPanel";
import { useWebRtcPublisher } from "../hooks/useWebRtcPublisher";
import { useNativeCapture } from "../hooks/useNativeCapture";
import { useCaptureDevices } from "../hooks/useCaptureDevices";
import { DeviceSelector } from "../components/nativeCapture/DeviceSelector";
import { CapturePreview } from "../components/nativeCapture/CapturePreview";
import type { CaptureTarget } from "../types/nativeCapture";
import { useEffect, useRef } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { captureScreen, startAudioCapture, stopAudioCapture } from "../lib/tauri";

const SCREEN_FRAME_INTERVAL_MS = 25_000;

export function SessionPage() {
  const { session, settings, studentCount } = useAppStore();
  const { send, on, off } = useWebSocket({
    sessionId: session?.id ?? null,
    backendUrl: settings.backendUrl,
    token: session?.instructorToken,
  });
  useWebRtcPublisher(session?.id ?? null, send, on, off);

  const [leftTab, setLeftTab] = useState<"students" | "inbox">("students");
  const [selectedTarget, setSelectedTarget] = useState<CaptureTarget | null>(null);
  const capture = useNativeCapture();
  const devices = useCaptureDevices();
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const sessionAiSettings = useAppStore((s) => s.sessionAiSettings);
  const initSessionAiSettings = useAppStore((s) => s.initSessionAiSettings);
  // Mic track lives outside the native-capture stream (getUserMedia, not
  // canvas.captureStream) so it needs its own handle to stop on cleanup —
  // capture.stopCapture() only knows about its own video track.
  const micStreamRef = useRef<MediaStream | null>(null);

  // Seed the session-level AI/recording overrides from the global defaults
  // once per session. Deliberately not re-run on settings changes — this is
  // a one-time snapshot at session start, exactly like the fps/quality
  // capture config below.
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
      capture.startCapture(selectedTarget, {
        fps,
        quality: settings.captureQuality,
        preview_width: previewWidth
      }).then(async () => {
        const stream = await capture.getStream(fps);
        if (!stream) {
          addDebugLog(
            "Capture started but produced no frames — live stream and recording unavailable",
            "error"
          );
          return;
        }

        // Add the instructor's mic to the same stream so it rides along
        // wherever this stream already goes — WebRTC (useWebRtcPublisher
        // adds every track on it), local recording (MediaRecorder over the
        // same stream), and the existing RecordingPanel mute toggle (which
        // already calls stream.getAudioTracks(), previously a no-op since
        // the stream was video-only).
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
  // baking it into the one-shot startCapture() call — lets the instructor
  // flip "auto-save recording" off mid-session (stop burning disk I/O)
  // without tearing down and restarting the whole capture pipeline.
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  useEffect(() => {
    if (!sharedDisplayStream || !sessionAiSettings) return;
    if (sessionAiSettings.saveLocalRecording) {
      capture.startLocalRecording(settings.recordingDirectory || "", settings.recordingFormat || "mp4");
    } else {
      capture.stopLocalRecording();
    }
  }, [sharedDisplayStream, sessionAiSettings?.saveLocalRecording]);

  // Periodic screen-frame → AI guide-block generation. processScreenFrame
  // existed backend-side already but nothing ever called it — this is the
  // missing trigger. Separate xcap-based grab (commands::ai::capture_screen)
  // rather than reusing the native-capture pipeline: that pipeline is tuned
  // for continuous low-latency streaming frames, not an occasional
  // AI-analysis snapshot, and coupling them would mean every fps/quality
  // change also has to reason about the AI cadence.
  //
  // Gated on the session override, not the raw global setting — each tick
  // is a real Groq vision API call, and the whole point of the toggle is to
  // let the instructor kill that spend for "this session" without touching
  // their global default.
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

  // Mic → Whisper → guide blocks. Gated on the same session-level override as
  // the screen pipeline (each chunk is a Whisper call), and keyed on the
  // session rather than the capture target: what the instructor says is worth
  // transcribing whether or not a screen source is selected.
  useEffect(() => {
    if (!session?.id || !isTauri()) return;
    if (!sessionAiSettings?.aiTranscriptionEnabled) return;

    startAudioCapture(session.id, settings.micDevice)
      .then((device) =>
        addDebugLog(`Microphone transcription started on "${device}" — speech becomes guide blocks`, "success")
      )
      .catch((err) =>
        addDebugLog(`Could not start microphone transcription: ${err}`, "error")
      );

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
          <DeviceSelector
            monitors={devices.monitors}
            windows={devices.windows}
            selectedTarget={selectedTarget}
            onSelect={setSelectedTarget}
            isLoading={devices.isLoading}
            onRefresh={devices.refreshDevices}
          />
        </div>
        <div className="border-b border-wkai-border p-4">
          <ShareToggle />
        </div>
        <div className="border-b border-wkai-border p-4">
          <RecordingPanel roomCode={session.roomCode} />
        </div>
        <div className="border-b border-wkai-border p-4">
          <SessionAiSettingsPanel />
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
                    ? "border-b-2 border-accent text-accent-text"
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

      {/* Visually-hidden native capture renderer — MUST stay rendered/composited
          (not display:none) or canvas.captureStream() freezes and WebRTC/recording
          get a dead track. Off-screen + opacity-0 keeps it painting. */}
      <div className="fixed bottom-0 right-0 w-[1px] h-[1px] opacity-0 pointer-events-none overflow-hidden">
        <CapturePreview
          canvasRef={capture.canvasRef}
          attachCanvas={capture.attachCanvas}
          status={capture.status.status}
        />
      </div>
    </div>
  );
}
