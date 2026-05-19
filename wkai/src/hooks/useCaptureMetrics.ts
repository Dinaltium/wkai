import { useState, useEffect, useRef } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CaptureMetrics } from "../types/nativeCapture";

const DEFAULT_METRICS: CaptureMetrics = {
  fps: 0,
  dropped_frames: 0,
  total_frames: 0,
  capture_time_ms: 0,
  frame_size_bytes: 0,
};

const FPS_HISTORY_SIZE = 30;

export function useCaptureMetrics() {
  const [metrics, setMetrics] = useState<CaptureMetrics>(DEFAULT_METRICS);
  const [fpsHistory, setFpsHistory] = useState<number[]>([]);
  const historyRef = useRef<number[]>([]);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    async function init() {
      unlisten = await listen<CaptureMetrics>(
        "native-capture:metrics",
        (event) => {
          setMetrics(event.payload);
          const next = [
            ...historyRef.current.slice(-(FPS_HISTORY_SIZE - 1)),
            event.payload.fps,
          ];
          historyRef.current = next;
          setFpsHistory(next);
        }
      );
    }

    init();

    return () => {
      unlisten?.();
    };
  }, []);

  return { metrics, fpsHistory };
}
