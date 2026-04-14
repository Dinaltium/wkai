import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAppStore } from "../store";

/**
 * Listens to Tauri events from the Rust backend.
 * - screen-frame  → updates capture stats, triggers AI pipeline via WS
 * - audio-chunk   → POSTs to Whisper, then sends transcript to WS server
 *                   for both guide generation context AND intent detection
 * - file-changed  → logs file watcher events
 */
export function useTauriEvents() {
  const { setCapture, settings, addDebugLog } = useAppStore();

  useEffect(() => {
    const windowApi = getCurrentWebviewWindow();
    const listenWindow = windowApi.listen.bind(windowApi);
    const addDualListener = <T,>(eventName: string, handler: Parameters<typeof listen<T>>[1]) =>
      Promise.all([listen<T>(eventName, handler), listenWindow<T>(eventName, handler)]).then(
        ([offA, offB]) => () => {
          offA();
          offB();
        }
      );

    const unlistenCaptureDebug = addDualListener<{
      stage: string;
      frameCount: number;
      elapsedMs?: number;
      w?: number;
      h?: number;
      error?: string;
      ts?: string;
    }>("capture-debug", (event) => {
      const p = event.payload;
      if (p.stage === "attempt") {
        addDebugLog(`Capture attempt #${p.frameCount}`, "info");
      } else if (p.stage === "captured") {
        addDebugLog(
          `Capture OK (${p.w}x${p.h}, ${p.elapsedMs ?? "?"}ms)`,
          "success"
        );
      } else if (p.stage === "failed") {
        addDebugLog(
          `Capture FAILED (${p.elapsedMs ?? "?"}ms): ${p.error ?? "unknown"}`,
          "error"
        );
      }
    });

    // ── Screen frame captured ─────────────────────────────────────────────────
    const unlistenFrame = addDualListener<{
      sessionId?: string;
      session_id?: string;
      frameB64?: string;
      frame_b64?: string;
      timestamp: string;
      width: number;
      height: number;
      streamToStudents?: boolean;
      stream_to_students?: boolean;
    }>("screen-frame", (event) => {
      const normalizedPayload = {
        sessionId: event.payload.sessionId ?? event.payload.session_id ?? "",
        frameB64: event.payload.frameB64 ?? event.payload.frame_b64 ?? "",
        timestamp: event.payload.timestamp,
        width: event.payload.width,
        height: event.payload.height,
        streamToStudents:
          event.payload.streamToStudents ?? event.payload.stream_to_students ?? false,
      };
      const previous = useAppStore.getState().capture.framesSent ?? 0;
      setCapture({
        lastFrameAt: normalizedPayload.timestamp,
        aiProcessing: true,
        framesSent: previous + 1,
      });
      setTimeout(() => setCapture({ aiProcessing: false }), 3000);

      addDebugLog(`Frame captured ${normalizedPayload.width}x${normalizedPayload.height}`, "info");
      window.dispatchEvent(new CustomEvent("wkai:screen-frame", { detail: normalizedPayload }));
    });

    const unlistenStatus = addDualListener<{ running: boolean }>("capture-status", (event) => {
      setCapture({ isCapturing: event.payload.running });
      addDebugLog(
        event.payload.running ? "Screen capture started" : "Screen capture stopped",
        event.payload.running ? "success" : "warn"
      );
    });

    const unlistenError = addDualListener<{ message: string; timestamp: string }>(
      "capture-error",
      (event) => {
        addDebugLog(`Capture error: ${event.payload.message}`, "error");
      }
    );

    // ── Audio chunk → Whisper → send transcript to WS for context + intent ────
    const unlistenAudio = addDualListener<{
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

        addDebugLog("Audio chunk received, transcribing...", "info");
        addDebugLog(`Transcript: "${String(transcript).slice(0, 60)}..."`, "success");

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
        addDebugLog("Audio transcription failed", "warn");
      }
    });

    // ── File changed in watched folder ────────────────────────────────────────
    const unlistenFile = addDualListener<{ file: { name: string }; event: string }>(
      "file-changed",
      (event) => console.log(`[WKAI] File ${event.payload.event}: ${event.payload.file.name}`)
    );

    return () => {
      unlistenCaptureDebug.then((fn) => fn());
      unlistenFrame.then((fn) => fn());
      unlistenStatus.then((fn) => fn());
      unlistenError.then((fn) => fn());
      unlistenAudio.then((fn) => fn());
      unlistenFile.then((fn) => fn());
    };
  }, [setCapture, settings.backendUrl]);
}
