import { useCallback } from "react";
import { useAppStore } from "../store";

/**
 * useBrowserCapture
 * 
 * Uses the standard browser-based getDisplayMedia API.
 * This is much more efficient as it uses hardware-accelerated 
 * video encoding, but it shows the OS "Sharing your screen" indicator.
 */
export function useBrowserCapture() {
  const { setSharedDisplayStream, setCapture, addDebugLog } = useAppStore();

  const stopBrowserCapture = useCallback(() => {
    const stream = useAppStore.getState().sharedDisplayStream;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setCapture({ isCapturing: false });
    setSharedDisplayStream(null);
    addDebugLog("Browser capture stopped", "info");
  }, [setCapture, setSharedDisplayStream, addDebugLog]);

  const startBrowserCapture = useCallback(async () => {
    try {
      addDebugLog("Requesting browser screen capture...", "info");
      
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor",
          frameRate: 30,
        },
        audio: false,
      });

      setSharedDisplayStream(stream);
      setCapture({ isCapturing: true, framesSent: 0 });

      stream.getVideoTracks()[0].onended = () => {
        stopBrowserCapture();
      };

      addDebugLog("Browser capture active (High FPS)", "success");
      return stream;
    } catch (err) {
      addDebugLog(`Browser capture failed: ${String(err)}`, "error");
      throw err;
    }
  }, [setSharedDisplayStream, setCapture, addDebugLog, stopBrowserCapture]);

  return { startBrowserCapture, stopBrowserCapture };
}
