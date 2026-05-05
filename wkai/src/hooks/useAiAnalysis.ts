import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { captureScreen } from "../lib/tauri";

/**
 * useAiAnalysis
 * 
 * Automatically captures the screen every 5 seconds and sends it 
 * to the backend AI pipeline for analysis.
 */
export function useAiAnalysis(send: (type: string, payload: any) => void) {
  const { session, capture, setCapture, addDebugLog } = useAppStore();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Only run if session is active and capture is enabled
    if (!session || !capture.isCapturing) {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
        addDebugLog("AI analysis loop stopped", "info");
      }
      return;
    }

    if (timerRef.current !== null) return;

    const analyze = async () => {
      const currentState = useAppStore.getState();
      if (!currentState.session || !currentState.capture.isCapturing) return;

      try {
        setCapture({ aiProcessing: true });
        
        let b64 = "";
        if (currentState.sharedDisplayStream) {
          // Grab frame from the active WebRTC stream (Zero OS stutter!)
          const stream = currentState.sharedDisplayStream;
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            const imageCapture = new (window as any).ImageCapture(videoTrack);
            const bitmap = await imageCapture.grabFrame();
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(bitmap, 0, 0);
            b64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];
          }
        }
        
        // Fallback to Rust native capture if WebRTC is not active
        if (!b64) {
          b64 = await captureScreen();
        }
        
        send("screen-frame", {
          sessionId: currentState.session.id,
          frameB64: b64,
        });

        addDebugLog("AI screen frame sent", "info");
      } catch (err) {
        console.error("[AiAnalysis] Frame analysis failed:", err);
        addDebugLog("AI analysis frame grab failed", "error");
      } finally {
        setCapture({ aiProcessing: false });
      }
    };

    // Run every 7 seconds to be gentle on tokens/bandwidth
    timerRef.current = window.setInterval(() => {
      void analyze();
    }, 7000);

    // Initial analysis
    void analyze();

    addDebugLog("AI analysis loop started (7s interval)", "success");

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [session, capture.isCapturing, send, setCapture, addDebugLog]);
}
