import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  CaptureStatus,
  CaptureMetrics,
  CaptureTarget,
  CaptureConfig,
  FramePayload,
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

  // Canvas rendering refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef(new Image());

  // Attach canvas for rendering
  const attachCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    canvasRef.current = canvas;
  }, []);

  const streamRef = useRef<MediaStream | null>(null);
  const targetFpsRef = useRef<number>(30);
  const onStreamReadyRef = useRef<((stream: MediaStream) => void)[]>([]);

  const getStream = useCallback((fps = 30) => {
    return new Promise<MediaStream | null>((resolve) => {
      targetFpsRef.current = fps;
      if (streamRef.current) {
        resolve(streamRef.current);
      } else {
        onStreamReadyRef.current.push(resolve as (stream: MediaStream) => void);
      }
    });
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

      // Listen to frame events — draw directly on the IPC event, not rAF
      // (rAF drifts from the native capture cadence and causes stream stalls)
      const unFrame = await listen<FramePayload>(
        "native-capture:frame",
        (event) => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          if (
            canvas.width !== event.payload.width ||
            canvas.height !== event.payload.height
          ) {
            canvas.width = event.payload.width;
            canvas.height = event.payload.height;
          }
          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) return;
          const img = imgRef.current;
          img.onload = () => {
            if (!canvasRef.current) return;
            ctx.drawImage(img, 0, 0, canvasRef.current.width, canvasRef.current.height);
            if (!streamRef.current) {
              streamRef.current = canvasRef.current.captureStream(targetFpsRef.current);
              if (onStreamReadyRef.current.length > 0) {
                onStreamReadyRef.current.forEach((resolve) => resolve(streamRef.current!));
                onStreamReadyRef.current = [];
              }
            }
          };
          img.src = `data:image/jpeg;base64,${event.payload.data}`;
        }
      );
      unlisteners.push(unFrame);

      // Listen to status events
      const unStatus = await listen<CaptureStatus>(
        "native-capture:status",
        (event) => {
          setStatus(event.payload);
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
      unlisteners.forEach((fn) => fn());
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

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
      try {
        await invoke("start_native_capture", { target, config });

        if (recordingOptions?.saveLocal && recordingOptions.dir) {
          const ext = recordingOptions.format === "mp4" ? "mp4" : "webm";
          let mimeType = "video/webm";
          if (ext === "mp4" && MediaRecorder.isTypeSupported("video/mp4")) {
            mimeType = "video/mp4";
          }

          const fps = config.fps || 30;
          const stream = await getStream(fps);
          if (!stream) return;
          const recorder = new MediaRecorder(stream, { mimeType });

          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const dir = recordingOptions.dir.replace(/[\\/]$/, "");
          const filePath = `${dir}/wkai_recording_${timestamp}.${ext}`;

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
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [getStream]
  );

  // Stop capture
  const stopCapture = useCallback(async () => {
    setIsLoading(true);
    try {
      await invoke("stop_native_capture");
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

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
    refreshStatus,
    canvasRef,
    attachCanvas,
    getStream,
  };
}
