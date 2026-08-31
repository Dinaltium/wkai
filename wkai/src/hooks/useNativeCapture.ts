import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useAppStore } from "../store";
import type {
  CaptureStatus,
  CaptureMetrics,
  CaptureTarget,
  CaptureConfig,
  CaptureErrorPayload,
} from "../types/nativeCapture";

const DEFAULT_STATUS: CaptureStatus = {
  status: "idle",
  error: undefined,
  backend: "unknown",
};

const DEFAULT_METRICS: CaptureMetrics = {
  fps: 0,
  dropped_frames: 0,
  total_frames: 0,
  capture_time_ms: 0,
  frame_size_bytes: 0,
};

export function useNativeCapture() {
  const [status, setStatus] = useState<CaptureStatus>(DEFAULT_STATUS);
  const [metrics, setMetrics] = useState<CaptureMetrics>(DEFAULT_METRICS);
  const [platform, setPlatform] = useState<string>("unknown");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const addDebugLog = useAppStore((s) => s.addDebugLog);

  // Canvas rendering refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // True while a frame is being decoded. The pull loop skips a tick rather
  // than queuing while this is set — the backend hands out "current state",
  // never a backlog, so there is never anything worth queuing.
  const decodingRef = useRef(false);
  const capturingRef = useRef(false);
  const lastFrameTimestampRef = useRef(0);
  const pumpActiveRef = useRef(false);
  const pumpTimerRef = useRef<number | null>(null);

  // Attach canvas for rendering
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const streamRef = useRef<MediaStream | null>(null);
  const targetFpsRef = useRef<number>(30);
  const onStreamReadyRef = useRef<((stream: MediaStream) => void)[]>([]);

  // Hands out the capture MediaStream once the first frame has been drawn.
  // Resolves null on timeout instead of hanging forever: callers set
  // sharedDisplayStream from this, and a promise that never settles left the
  // publisher with no stream and no way to know why.
  const getStream = useCallback((fps = 30, timeoutMs = 10_000) => {
    return new Promise<MediaStream | null>((resolve) => {
      targetFpsRef.current = fps;
      if (streamRef.current) {
        resolve(streamRef.current);
        return;
      }

      let settled = false;
      const settle = (stream: MediaStream | null) => {
        if (settled) return;
        settled = true;
        resolve(stream);
      };

      onStreamReadyRef.current.push(settle);

      if (timeoutMs > 0) {
        window.setTimeout(() => {
          if (settled) return;
          console.error(
            `[NativeCapture] No frame drawn within ${timeoutMs}ms — capture stream unavailable`
          );
          settle(null);
        }, timeoutMs);
      }
    });
  }, []);

  // Pushes the just-drawn canvas contents into the outgoing track. Only
  // CanvasCaptureMediaStreamTrack has requestFrame, and only a stream created
  // with captureStream(0) needs it.
  const requestTrackFrame = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const [track] = stream.getVideoTracks();
    const canvasTrack = track as CanvasCaptureMediaStreamTrack | undefined;
    if (canvasTrack && typeof canvasTrack.requestFrame === "function") {
      canvasTrack.requestFrame();
    }
  }, []);

  // Creates the captureStream on the first drawn frame and releases anyone
  // waiting in getStream(). Deliberately not created before a frame exists —
  // an empty canvas yields a track WebRTC will not negotiate against.
  //
  // captureStream(0) rather than captureStream(fps): an fps argument ties frame
  // production to the page painting, and this canvas is deliberately mounted
  // 1x1 and transparent, in a window the instructor is expected to minimise
  // while they teach. Under those conditions the browser stops compositing and
  // the track quietly stops emitting — the desktop equivalent of the camera
  // being unplugged, with no error anywhere. With 0 we own frame production
  // and push each captured frame explicitly via requestFrame().
  const publishStream = useCallback((canvas: HTMLCanvasElement) => {
    if (streamRef.current) {
      requestTrackFrame();
      return;
    }
    streamRef.current = canvas.captureStream(0);
    requestTrackFrame();
    const waiters = onStreamReadyRef.current;
    onStreamReadyRef.current = [];
    waiters.forEach((resolve) => resolve(streamRef.current!));
  }, []);

  // Initialize platform and event listeners
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    async function init() {
      try {
        const backend = await invoke<string>("get_platform_backend");
        setPlatform(backend);
      } catch {
        setPlatform("unknown");
      }

      // Pull loop — asks the backend for whatever frame is current right now,
      // once per animation frame, instead of listening for a per-frame push
      // event. A push event has no backpressure once it lands in the webview's
      // IPC queue: if decode falls behind for even a moment the queue backs up
      // and the display spends the next several seconds replaying stale
      // frames instead of catching up. Pulling "the latest" can never build a
      // backlog — a slow decode just means fewer distinct frames get shown,
      // not a delayed replay of old ones.
      // Layout from the Rust side: [width:u32 LE][height:u32 LE][timestamp_ms:u64 LE][jpeg bytes].
      // Raw bytes, not JSON — a base64 string in a JSON envelope meant every
      // pull paid for JSON.stringify + IPC postMessage + JSON.parse on a
      // ~1MB string, which was the real source of the multi-hundred-ms
      // per-frame stall (not JPEG decode). tauri::ipc::Response skips all of
      // that.
      const drawFrame = async (buf: ArrayBuffer) => {
        if (buf.byteLength < 16) return;
        const view = new DataView(buf);
        const width = view.getUint32(0, true);
        const height = view.getUint32(4, true);
        const timestamp = Number(view.getBigUint64(8, true));
        if (timestamp === lastFrameTimestampRef.current) return;
        lastFrameTimestampRef.current = timestamp;

        const jpegBytes = new Uint8Array(buf, 16);
        const bitmap = await createImageBitmap(
          new Blob([jpegBytes], { type: "image/jpeg" })
        );

        const canvas = canvasRef.current;
        if (!canvas) {
          bitmap.close();
          return;
        }
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          bitmap.close();
          return;
        }
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        publishStream(canvas);
      };

      const pumpTick = () => {
        if (!pumpActiveRef.current) return;
        if (canvasRef.current && capturingRef.current && !decodingRef.current) {
          decodingRef.current = true;
          invoke<ArrayBuffer>("get_latest_frame")
            .then((buf) => (buf && buf.byteLength > 0 ? drawFrame(buf) : undefined))
            .catch((err) =>
              console.error("[NativeCapture] Frame pull failed:", err)
            )
            .finally(() => {
              decodingRef.current = false;
            });
        }
      };

      // A timer, not requestAnimationFrame. rAF does not fire while the window
      // is minimised or fully occluded, which is the normal state of this app
      // during a workshop — the instructor is looking at the thing being
      // captured, not at WKAI. On rAF the pull loop stopped there, the canvas
      // stopped being drawn, and the outgoing track went silent while capture
      // and the AI screen-frame path both carried on working, which is why
      // this looked like a WebRTC fault rather than a paint one.
      //
      // Self-rescheduling rather than a fixed setInterval so the selected
      // framerate is read every tick: getStream() sets it after this loop has
      // already started, and the instructor can change it mid-session.
      const scheduleNextPump = () => {
        if (!pumpActiveRef.current) return;
        const fps = targetFpsRef.current || 30;
        const delay = Math.max(8, Math.round(1000 / fps));
        pumpTimerRef.current = window.setTimeout(() => {
          pumpTick();
          scheduleNextPump();
        }, delay);
      };
      pumpActiveRef.current = true;
      scheduleNextPump();

      // Listen to status events
      const unStatus = await listen<CaptureStatus>(
        "native-capture:status",
        (event) => {
          setStatus(event.payload);
          capturingRef.current = event.payload.status === "capturing";
          if (event.payload.status === "error") {
            setError(event.payload.error ?? "Unknown error");
          }
        }
      );
      unlisteners.push(unStatus);

      // Listen to metrics events
      const unMetrics = await listen<CaptureMetrics>(
        "native-capture:metrics",
        (event) => {
          setMetrics(event.payload);
        }
      );
      unlisteners.push(unMetrics);

      // Listen to error events
      const unError = await listen<CaptureErrorPayload>(
        "native-capture:error",
        (event) => {
          setError(event.payload.message);
        }
      );
      unlisteners.push(unError);
    }

    init();

    return () => {
      pumpActiveRef.current = false;
      if (pumpTimerRef.current !== null) {
        window.clearTimeout(pumpTimerRef.current);
        pumpTimerRef.current = null;
      }
      unlisteners.forEach((fn) => fn());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [publishStream]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // Start writing the live stream to disk. Split out from startCapture so it
  // can be toggled independently mid-session (a session-level "auto-save
  // recording" override that flips on/off without tearing down capture) —
  // previously this only ever ran once, baked into the initial
  // startCapture() call.
  const startLocalRecording = useCallback(
    (dir: string, format: "mp4" | "webm") => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;
      const stream = streamRef.current;
      if (!stream || !dir) return;

      const ext = format === "mp4" ? "mp4" : "webm";
      let mimeType = "video/webm";
      if (ext === "mp4" && MediaRecorder.isTypeSupported("video/mp4")) {
        mimeType = "video/mp4";
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const cleanDir = dir.replace(/[\\/]$/, "");
      const filePath = `${cleanDir}/wkai_recording_${timestamp}.${ext}`;

      recorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          const buffer = await e.data.arrayBuffer();
          const chunk = Array.from(new Uint8Array(buffer));
          try {
            await invoke("append_to_recording", { path: filePath, chunk });
          } catch (err) {
            console.error("Failed to write recording chunk:", err);
          }
        }
      };

      recorder.start(2000); // chunk every 2 seconds
      mediaRecorderRef.current = recorder;
      addDebugLog(`Auto-saving screen recording to disk: ${filePath}`, "warn");
    },
    [addDebugLog]
  );

  const stopLocalRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
      addDebugLog("Auto-saved screen recording stopped", "info");
    }
  }, [addDebugLog]);

  // Start capture
  const startCapture = useCallback(
    async (
      target: CaptureTarget,
      config: CaptureConfig,
      recordingOptions?: {
        saveLocal: boolean;
        dir: string;
        format: "mp4" | "webm";
      }
    ) => {
      setIsLoading(true);
      setError(null);
      lastFrameTimestampRef.current = 0;
      try {
        await invoke("start_native_capture", { target, config });
        // Drive the pull loop from here, not the "capturing" status event —
        // the backend never actually emits that event, so gating on it left
        // the pump permanently idle and every startCapture() timed out
        // waiting for a frame that was never pulled.
        capturingRef.current = true;

        if (recordingOptions?.saveLocal && recordingOptions.dir) {
          const fps = config.fps || 30;
          const stream = await getStream(fps);
          if (!stream) return;
          startLocalRecording(recordingOptions.dir, recordingOptions.format);
        }
      } catch (e) {
        capturingRef.current = false;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [getStream, startLocalRecording]
  );

  // Stop capture
  const stopCapture = useCallback(async () => {
    setIsLoading(true);
    capturingRef.current = false;
    try {
      await invoke("stop_native_capture");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      stopLocalRecording();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [stopLocalRecording]);

  // Refresh status manually
  const refreshStatus = useCallback(async () => {
    try {
      const s = await invoke<CaptureStatus>("get_capture_status");
      setStatus(s);
    } catch {
      // ignore
    }
  }, []);

  return {
    status,
    metrics,
    platform,
    isLoading,
    error,
    startCapture,
    stopCapture,
    startLocalRecording,
    stopLocalRecording,
    refreshStatus,
    canvasRef,
    attachCanvas,
    getStream,
  };
}
