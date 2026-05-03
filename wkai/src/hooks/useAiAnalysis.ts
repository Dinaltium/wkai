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
        
        // Grab a fresh frame specifically for AI (can be lower quality/resolution)
        const b64 = await captureScreen();
        
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
