import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import { useAppStore } from "../store";

/**
 * Listens to Tauri events from the Rust backend.
 * - audio-chunk   → POSTs to Whisper, then sends transcript to WS server
 *                   for intent detection and live explanations
 * - file-changed  → logs file watcher events
 */
// Whisper never returns an empty string for silence — it emits a stock phrase
// ("you", "Thank you.", "Thanks for watching!"), sometimes several stitched
// together ("Thank you. you"). Matching whole strings missed the stitched
// variants, so treat a transcript as silence when every word in it is filler.
const FILLER_WORDS = new Set([
  "you", "thank", "thanks", "for", "watching", "bye", "goodbye",
  "okay", "ok", "so", "um", "uh", "hmm", "yeah", "the", "a",
]);

function isSilenceArtifact(transcript: string): boolean {
  const words = transcript
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return true;
  // Long enough to be real speech even if it opens with filler.
  if (words.length > 8) return false;
  return words.every((word) => FILLER_WORDS.has(word));
}

export function useTauriEvents() {
  const { settings, addDebugLog } = useAppStore();

  useEffect(() => {
    // Browser preview (no native runtime): skip native event wiring.
    if (!isTauri()) return;
    const windowApi = getCurrentWebviewWindow();
    const listenWindow = windowApi.listen.bind(windowApi);
    const addDualListener = <T,>(eventName: string, handler: Parameters<typeof listen<T>>[1]) =>
      Promise.all([listen<T>(eventName, handler), listenWindow<T>(eventName, handler)]).then(
        ([offA, offB]) => () => {
          offA();
          offB();
        }
      );

    // A Tauri `emit` reaches both the global and the webview listener, so every
    // dual-listened event fires its handler twice. Harmless for a console log,
    // not for audio: each chunk was paying for two Whisper calls and feeding
    // the transcript into the guide pipeline twice. Chunks carry a timestamp,
    // so drop the second delivery.
    const seenChunks = new Set<string>();

    // ── Audio chunk → Whisper → send transcript to WS for intent/explanations ──
    const unlistenAudio = addDualListener<{
      session_id: string;
      audio_b64: string;
      timestamp: string;
    }>("audio-chunk", async (event) => {
      const chunkKey = `${event.payload.session_id}:${event.payload.timestamp}`;
      if (seenChunks.has(chunkKey)) return;
      seenChunks.add(chunkKey);
      // 120 chunks ≈ an hour of session; older keys can never recur.
      if (seenChunks.size > 120) seenChunks.delete(seenChunks.values().next().value as string);

      // Session override wins once a session has seeded one; falls back to
      // the global default outside of an active session. Checked here (not
      // by stopping Rust-side mic capture) since the actual cost this
      // toggle guards against is the Whisper API call below, not local
      // audio buffering.
      const { sessionAiSettings, settings: currentSettings } = useAppStore.getState();
      const transcriptionEnabled =
        sessionAiSettings?.aiTranscriptionEnabled ?? currentSettings.aiTranscriptionEnabled;
      if (!transcriptionEnabled) return;

      try {
        // 1. Transcribe with Groq Whisper
        const whisperRes = await fetch(`${settings.backendUrl}/api/ai/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioB64: event.payload.audio_b64, mimeType: "audio/wav" }),
        });
        const { transcript } = await whisperRes.json();
        if (!transcript?.trim()) return;
        // Whisper does not return an empty string for silence — it invents a
        // stock phrase ("you", "Thank you.", "Thanks for watching!"). Left in,
        // 30s of quiet slowly fills the summary buffer with filler and the
        // student eventually gets a guide card built out of nothing.
        if (isSilenceArtifact(String(transcript))) {
          addDebugLog("Audio chunk was silent — skipped", "info");
          return;
        }

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
