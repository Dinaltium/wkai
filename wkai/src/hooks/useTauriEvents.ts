import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useAppStore } from "../store";

/**
 * Listens to Tauri events from the Rust backend.
 * - audio-chunk   → POSTs to Whisper, then sends transcript to WS server
 *                   for intent detection and live explanations
 * - file-changed  → logs file watcher events
 */
export function useTauriEvents() {
  const { settings, addDebugLog } = useAppStore();

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

    // ── Audio chunk → Whisper → send transcript to WS for intent/explanations ──
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

        // 2. Send transcript to WS server for intent/explanation pipelines.
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
      unlistenAudio.then((fn) => fn());
      unlistenFile.then((fn) => fn());
    };
  }, [settings.backendUrl]);
}
