import { createContext, useContext, useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import { useWebSocket } from "../hooks/useWebSocket";
import { useWebRtcPublisher } from "../hooks/useWebRtcPublisher";
import { useSfuPublisher } from "../hooks/useSfuPublisher";
import { useNativeCapture } from "../hooks/useNativeCapture";
import { useCaptureDevices } from "../hooks/useCaptureDevices";
import { useSessionRecorder } from "../hooks/useSessionRecorder";
import type { CaptureTarget } from "../types/nativeCapture";
import type { AppSettings } from "../types";
import { captureScreen, startAudioCapture, stopAudioCapture } from "../lib/tauri";
import { requestMediaWithConsent } from "./mediaPermission";

const SCREEN_FRAME_INTERVAL_MS = 25_000;

type Runtime = {
  send: ReturnType<typeof useWebSocket>["send"];
  on: ReturnType<typeof useWebSocket>["on"];
  off: ReturnType<typeof useWebSocket>["off"];
  capture: ReturnType<typeof useNativeCapture>;
  devices: ReturnType<typeof useCaptureDevices>;
  recorder: ReturnType<typeof useSessionRecorder>;
  selectedTarget: CaptureTarget | null;
  setSelectedTarget: (t: CaptureTarget | null) => void;
  sourceLabel: string | null;
  /** Present a camera (or a phone acting as one) instead of a screen. */
  selectCamera: (deviceId: string, label?: string) => Promise<void>;
  /** The live camera stream, when a camera is the source. Null for screen capture. */
  cameraStream: MediaStream | null;
  /** Swap the microphone students hear, without renegotiating WebRTC. */
  switchMicrophone: (deviceId: string) => Promise<void>;
  /** Change framerate/quality mid-session; restarts capture if it is running. */
  applyCaptureQuality: (next: Partial<Pick<AppSettings, "captureFramerate" | "captureQuality">>) => void;
  restartingCapture: boolean;
};

const SessionRuntimeContext = createContext<Runtime | null>(null);

/**
 * Everything that must keep running for as long as the session does: the
 * WebSocket, the WebRTC publisher, native capture, the recorder and the two
 * AI feeds.
 *
 * It lives above the router on purpose. All of this used to hang off
 * `SessionPage`, so simply opening Settings unmounted it: capture stopped, the
 * canvas backing `captureStream()` was destroyed, every peer connection was
 * closed and the socket was torn down. Students went black mid-workshop, and
 * because the torn-down socket then reconnected on its own and evicted the
 * fresh one server-side, re-sharing afterwards fixed nothing. Mounted here,
 * navigation is just navigation.
 */
export function SessionRuntimeProvider({ children }: { children: React.ReactNode }) {
  const session = useAppStore((s) => s.session);
  const settings = useAppStore((s) => s.settings);
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const sessionAiSettings = useAppStore((s) => s.sessionAiSettings);
  const initSessionAiSettings = useAppStore((s) => s.initSessionAiSettings);
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);

  const { send, on, off } = useWebSocket({
    sessionId: session?.id ?? null,
    backendUrl: settings.backendUrl,
    token: session?.instructorToken,
  });
  // Online mode publishes once to the SFU and lets Cloudflare fan it out. The
  // mesh is the fallback for when that is not working — it takes the session
  // back the moment the SFU drops, but it must not run *beside* it: two full
  // copies of the same screen leaving one uplink is what makes the share stall.
  const sfu = useSfuPublisher(settings.streamingMode === "online");
  const publisher = useWebRtcPublisher(
    session?.id ?? null,
    send,
    on,
    off,
    sfu.publishing,
  );

  const capture = useNativeCapture();
  const devices = useCaptureDevices();
  const recorder = useSessionRecorder(session?.roomCode ?? "session");
  const [selectedTarget, setSelectedTarget] = useState<CaptureTarget | null>(null);

  // Mic track lives outside the native-capture stream (getUserMedia, not
  // canvas.captureStream) so it needs its own handle to stop on cleanup —
  // capture.stopCapture() only knows about its own video track.
  const micStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // Seed the session-level AI/recording overrides from the global defaults
  // once per session.
  useEffect(() => {
    if (session) initSessionAiSettings();
  }, [session?.id]);

  const [restartingCapture, setRestartingCapture] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraLabel, setCameraLabel] = useState<string | null>(null);

  // Auto-start capture when target is selected
  useEffect(() => {
    if (selectedTarget) {
      // Switching to a screen ends the camera, and vice versa in selectCamera.
      cameraStreamRef.current?.getVideoTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
      setCameraStream(null);
      setCameraLabel(null);

      const s = useAppStore.getState().settings;
      const fps = s.captureFramerate === "auto" ? 30 : parseInt(String(s.captureFramerate));
      // 0 = capture at the display's native width. Only "low" downscales:
      // resizing a 1920x1200 frame costs ~64ms against ~50ms for the encode, so
      // for every other preset native is both sharper and faster.
      const previewWidth = s.captureQuality === "low" ? 1280 : 0;
      capture
        .startCapture(selectedTarget, { fps, quality: s.captureQuality, preview_width: previewWidth })
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
          // the mute control in the bar. Reuse the existing mic track when the
          // instructor switches source mid-session rather than opening a
          // second capture of the same device.
          if (!micStreamRef.current) {
            try {
              const preferredId = useAppStore.getState().settings.micDeviceId;
              const mic = await requestMediaWithConsent(
                "microphone",
                "Students hear you through this microphone while you present. Without it they see your screen in silence.",
                { audio: preferredId ? { deviceId: { ideal: preferredId } } : true }
              );
              if (!mic) {
                addDebugLog("Streaming video only — microphone not granted", "warn");
              } else {
                micStreamRef.current = mic;
                mic.getAudioTracks().forEach((track) => stream.addTrack(track));
                addDebugLog("Microphone added to live stream — students will hear audio", "success");
              }
            } catch (err) {
              addDebugLog(
                `Microphone unavailable, streaming video only: ${err instanceof Error ? err.message : String(err)}`,
                "warn"
              );
            }
          } else {
            micStreamRef.current.getAudioTracks().forEach((track) => {
              if (!stream.getAudioTracks().includes(track)) stream.addTrack(track);
            });
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

  // Framerate and quality used to be Settings-only, which meant leaving the
  // session view to change them — and, before the runtime moved up here, that
  // alone killed the stream. They are live controls now: write the preference,
  // then restart capture on the same target so the change actually takes.
  const applyCaptureQuality = (
    next: Partial<Pick<AppSettings, "captureFramerate" | "captureQuality">>
  ) => {
    useAppStore.getState().updateSettings(next);
    if (!selectedTarget) return;

    const s = useAppStore.getState().settings;
    const fps = s.captureFramerate === "auto" ? 30 : parseInt(String(s.captureFramerate));
    const previewWidth = s.captureQuality === "low" ? 1280 : 0;

    setRestartingCapture(true);
    void (async () => {
      try {
        await capture.stopCapture();
        await capture.startCapture(selectedTarget, {
          fps,
          quality: s.captureQuality,
          preview_width: previewWidth,
        });
        const stream = await capture.getStream(fps);
        if (!stream) {
          addDebugLog("Capture did not restart after the quality change", "error");
          return;
        }
        micStreamRef.current?.getAudioTracks().forEach((track) => {
          if (!stream.getAudioTracks().includes(track)) stream.addTrack(track);
        });
        setSharedDisplayStream(stream);
        addDebugLog(`Capture now ${fps} fps, ${s.captureQuality} quality`, "success");
      } finally {
        setRestartingCapture(false);
      }
    })();
  };

  /**
   * A camera is a source like any other, so it lands in the same
   * `sharedDisplayStream` the screen path uses — WebRTC, recording and the mute
   * control then need no idea which one is running.
   *
   * A phone reaches this list the way a webcam does: over USB or Wi-Fi through
   * a phone-as-webcam app, which registers a normal video input device.
   * Bluetooth is not a video transport, so there is nothing to offer there.
   */
  const selectCamera = async (deviceId: string, label?: string) => {
    // Screen capture and a camera are mutually exclusive sources.
    setSelectedTarget(null);
    await capture.stopCapture();

    const stream = await requestMediaWithConsent(
      "camera",
      "Students see this camera instead of your screen while you present.",
      { video: deviceId ? { deviceId: { exact: deviceId } } : true }
    );
    if (!stream) return;

    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = stream;

    if (!micStreamRef.current) {
      const preferredId = useAppStore.getState().settings.micDeviceId;
      const mic = await requestMediaWithConsent(
        "microphone",
        "Students hear you through this microphone while you present.",
        { audio: preferredId ? { deviceId: { ideal: preferredId } } : true }
      );
      if (mic) micStreamRef.current = mic;
    }
    micStreamRef.current?.getAudioTracks().forEach((track) => {
      if (!stream.getAudioTracks().includes(track)) stream.addTrack(track);
    });

    setCameraStream(stream);
    setCameraLabel(label ?? "Camera");
    setSharedDisplayStream(stream);
    addDebugLog(`Now presenting from ${label ?? "a camera"}`, "success");
  };

  const switchMicrophone = async (deviceId: string) => {
    try {
      const next = await requestMediaWithConsent(
        "microphone",
        "Switching the microphone students hear.",
        { audio: deviceId ? { deviceId: { exact: deviceId } } : true }
      );
      const nextTrack = next?.getAudioTracks()[0];
      if (!next || !nextTrack) return;

      // Carry the mute state across, or switching devices would silently
      // un-mute an instructor who muted themselves on purpose.
      nextTrack.enabled = !useAppStore.getState().recording.isMuted;

      const stream = useAppStore.getState().sharedDisplayStream;
      if (stream) {
        stream.getAudioTracks().forEach((t) => {
          stream.removeTrack(t);
          t.stop();
        });
        stream.addTrack(nextTrack);
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = next;

      await publisher.replaceAudioTrack(nextTrack);
      useAppStore.getState().updateSettings({ micDeviceId: deviceId });
      addDebugLog(`Microphone switched to ${nextTrack.label || "the selected device"}`, "success");
    } catch (err) {
      addDebugLog(
        `Could not switch microphone: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    }
  };

  // Drive local disk recording off the session-level toggle instead of
  // baking it into the one-shot startCapture() call.
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

  // Tear the pipeline down when the session itself ends, not when a view
  // unmounts. Skipped until a session has actually existed so it does not
  // fight one that is still being created.
  const hadSessionRef = useRef(false);
  useEffect(() => {
    if (session?.id) {
      hadSessionRef.current = true;
      return;
    }
    if (!hadSessionRef.current) return;
    hadSessionRef.current = false;
    setSelectedTarget(null);
    void capture.stopCapture();
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    setCameraStream(null);
    setCameraLabel(null);
    setSharedDisplayStream(null);
  }, [session?.id]);

  const sourceLabel = (() => {
    if (cameraLabel) return cameraLabel;
    if (!selectedTarget) return null;
    if (selectedTarget.type === "monitor") {
      const m = devices.monitors.find((x) => x.id === selectedTarget.id);
      return m ? `${m.name} · ${m.width}×${m.height}` : "Screen";
    }
    const w = devices.windows.find((x) => x.id === selectedTarget.id);
    return w ? w.title || w.appName : "Window";
  })();

  return (
    <SessionRuntimeContext.Provider
      value={{
        send,
        on,
        off,
        capture,
        devices,
        recorder,
        selectedTarget,
        setSelectedTarget,
        sourceLabel,
        applyCaptureQuality,
        restartingCapture,
        switchMicrophone,
        selectCamera,
        cameraStream,
      }}
    >
      {children}
    </SessionRuntimeContext.Provider>
  );
}

export function useSessionRuntime() {
  const ctx = useContext(SessionRuntimeContext);
  if (!ctx) throw new Error("useSessionRuntime must be used inside SessionRuntimeProvider");
  return ctx;
}
