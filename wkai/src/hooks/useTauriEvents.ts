import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";

/**
 * Listens to Tauri events from the Rust backend.
 * - screen-frame  → updates capture stats, triggers AI pipeline via WS
 * - audio-chunk   → POSTs to Whisper, then sends transcript to WS server
 *                   for both guide generation context AND intent detection
 * - file-changed  → logs file watcher events
 */
export function useTauriEvents() {
  const { setCapture, settings } = useAppStore();

  // Temporary until F4 debug panel is implemented
  function addDebugLog(msg: string, level?: string) {
    console.log(`[WKAI Debug] [${level ?? "info"}] ${msg}`);
  }

  useEffect(() => {
    // ── Screen frame captured ─────────────────────────────────────────────────
    const unlistenFrame = listen<{
      session_id: string;
      frame_b64: string;
      timestamp: string;
      width: number;
      height: number;
      stream_to_students: boolean;
    }>("screen-frame", (event) => {
      const previous = useAppStore.getState().capture.framesSent ?? 0;
      setCapture({
        lastFrameAt: event.payload.timestamp,
        aiProcessing: true,
        framesSent: previous + 1,
      });
      setTimeout(() => setCapture({ aiProcessing: false }), 3000);

      window.dispatchEvent(new CustomEvent("wkai:screen-frame", { detail: event.payload }));
    });

    const unlistenStatus = listen<{ running: boolean }>("capture-status", (event) => {
      setCapture({ isCapturing: event.payload.running });
      addDebugLog(event.payload.running ? "Screen capture started" : "Screen capture stopped");
    });

    const unlistenError = listen<{ message: string; timestamp: string }>(
      "capture-error",
      (event) => {
        addDebugLog(`[ERROR] Capture: ${event.payload.message}`, "error");
      }
    );

    // ── Audio chunk → Whisper → send transcript to WS for context + intent ────
    const unlistenAudio = listen<{
      session_id: string;
      audio_b64: string;
    }>("audio-chunk", async (event) => {
      try {
        // 1. Transcribe with Groq Whisper
        const whisperRes = await fetch(`${settings.backendUrl}/api/ai/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioB64: event.payload.audio_b64, mimeType: "audio/wav" }),
        });
        const { transcript } = await whisperRes.json();
        if (!transcript?.trim()) return;

        // 2. Send transcript to WS server — used for:
        //    a) Enriching the next screen-frame AI pipeline call
        //    b) Running the LangGraph intent detection agent
        // This is handled by the "audio-transcript" WS message type
        // (The WS hook in useWebSocket.ts sends this when we trigger it)
        window.dispatchEvent(new CustomEvent("wkai:transcript", {
          detail: {
            transcript,
            sessionId: event.payload.session_id,
          },
        }));
      } catch (err) {
        console.warn("[Audio] Transcription failed:", err);
      }
    });

    // ── File changed in watched folder ────────────────────────────────────────
    const unlistenFile = listen<{ file: { name: string }; event: string }>(
      "file-changed",
      (event) => console.log(`[WKAI] File ${event.payload.event}: ${event.payload.file.name}`)
    );

    return () => {
      unlistenFrame.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenAudio.then((fn) => fn());
      unlistenFile.then((fn) => fn());
    };
  }, [setCapture, settings.backendUrl]);
}
