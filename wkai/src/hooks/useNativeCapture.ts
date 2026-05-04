import { useCallback, useRef } from "react";
import { useAppStore } from "../store";
import { captureScreen } from "../lib/tauri";

/**
 * useNativeCapture
 * 
 * Bypasses the OS-level "Sharing your screen" indicator by using 
 * native Rust-based screen capture and drawing frames to a canvas.
 * This canvas is then converted to a silent MediaStream.
 */
export function useNativeCapture() {
  const { setSharedDisplayStream, setCapture, addDebugLog } = useAppStore();
  const pollRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopNativeCapture = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setCapture({ isCapturing: false });
    setSharedDisplayStream(null);
    addDebugLog("Native capture stopped", "info");
  }, [setCapture, setSharedDisplayStream, addDebugLog]);

  const startNativeCapture = useCallback(async () => {
    if (pollRef.current !== null) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
      // Fallback size, will be updated dynamically
      canvasRef.current.width = 1920;
      canvasRef.current.height = 1080;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      addDebugLog("Failed to get canvas context for native capture", "error");
      return;
    }

    addDebugLog("Starting native capture (silent mode)", "info");

    const poll = async () => {
      const b64 = await captureScreen();
      if (!b64) throw new Error("Empty frame received from native capture");

      const img = new Image();
      img.src = `data:image/jpeg;base64,${b64}`;
      
      // Wait for image to load with timeout
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("Image load timeout")), 2000);
        img.onload = () => {
          window.clearTimeout(timeout);
          resolve(true);
        };
        img.onerror = (e) => {
          window.clearTimeout(timeout);
          reject(new Error("Image load failed"));
        };
      });

      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      
      ctx.drawImage(img, 0, 0);
      
      // Update store metrics
      const now = Date.now();
      const state = useAppStore.getState();
      setCapture({
        lastFrameAt: now,
        framesSent: (state.capture.framesSent || 0) + 1,
      });
    };

    // Grab first frame to ensure stream is ready
    try {
      await poll();
    } catch (err) {
      const msg = `Initial native capture failed: ${String(err)}`;
      addDebugLog(msg, "error");
      setCapture({ isCapturing: false });
      throw err;
    }

    setCapture({ isCapturing: true });

    // Create stream from canvas at 12 FPS (good balance for screen sharing)
    const stream = (canvas as any).captureStream(12);
    setSharedDisplayStream(stream);

    // Continue polling with recursive setTimeout to avoid overlaps
    const scheduleNext = () => {
      pollRef.current = window.setTimeout(async () => {
        try {
          await poll();
          scheduleNext();
        } catch (err) {
          addDebugLog(`Capture loop error: ${String(err)}`, "error");
          // Try to recover after a short delay
          scheduleNext();
        }
      }, 1000 / 12);
    };

    scheduleNext();

    addDebugLog("Native capture active (12 FPS)", "success");
    
    return stream;
  }, [setSharedDisplayStream, setCapture, addDebugLog]);

  return { startNativeCapture, stopNativeCapture };
}
