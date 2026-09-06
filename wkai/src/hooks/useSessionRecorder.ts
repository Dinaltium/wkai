import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store";

function pickMimeType() {
  const preferred = [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mime of preferred) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

export interface LastRecording {
  url: string;
  name: string;
  mime: string;
  sizeBytes: number;
}

/**
 * Owns the MediaRecorder for the session, so the control bar and the
 * end-session flow drive the same instance.
 *
 * Fixes three defects from the panel this replaces:
 *  - `wkai:force-stop-recording` was dispatched when a session ended but
 *    nothing listened, so ending a session mid-recording never flushed the
 *    file and the take was lost.
 *  - the duration interval listed `recording.duration` as a dependency, so it
 *    was torn down and rebuilt on every tick and drifted.
 *  - `onstop` closed over a stale `lastUrl`, leaking every previous blob URL.
 */
export function useSessionRecorder(roomCode: string) {
  const { addDebugLog, sharedDisplayStream, recording, setRecording, settings, sessionAiSettings } =
    useAppStore();
  const saveLocalRecording = sessionAiSettings?.saveLocalRecording ?? settings.saveLocalRecording;

  const [starting, setStarting] = useState(false);
  const [last, setLast] = useState<LastRecording | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const lastUrlRef = useRef<string | null>(null);
  const mimeType = useMemo(() => pickMimeType(), []);

  // Tick from a single stable interval; read and write duration through the
  // store so the effect never needs the current value as a dependency.
  useEffect(() => {
    if (!recording.isRecording || recording.isPaused) return;
    const id = window.setInterval(() => {
      const current = useAppStore.getState().recording.duration;
      useAppStore.getState().setRecording({ duration: current + 1 });
    }, 1000);
    return () => window.clearInterval(id);
  }, [recording.isRecording, recording.isPaused]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || starting) return;
    const stream = useAppStore.getState().sharedDisplayStream;
    if (!stream) {
      addDebugLog("Cannot record: pick a screen or window to share first.", "error");
      return;
    }

    setStarting(true);
    try {
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        const mime = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        chunksRef.current = [];
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const name = `wkai-recording-${roomCode}-${Date.now()}.${ext}`;

        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        const url = URL.createObjectURL(blob);
        lastUrlRef.current = url;
        setLast({ url, name, mime, sizeBytes: blob.size });

        addDebugLog(`Recording stopped — ${Math.round(blob.size / 1024)} KB`, "success");

        // Uses the unrestricted `append_to_recording` Rust command: the fs
        // plugin ACL only covers app-scoped dirs, not a user-picked folder.
        if (saveLocalRecording && settings.recordingDirectory) {
          try {
            const { invoke } = await import("@tauri-apps/api/core");
            const { join } = await import("@tauri-apps/api/path");
            const arrayBuffer = await blob.arrayBuffer();
            const chunk = Array.from(new Uint8Array(arrayBuffer));
            const fullPath = await join(settings.recordingDirectory, name);
            await invoke("append_to_recording", { path: fullPath, chunk });
            addDebugLog(`Recording saved to ${fullPath}`, "success");
          } catch (err) {
            addDebugLog(`Could not save the recording to disk: ${String(err)}`, "error");
          }
        }

        recorderRef.current = null;
        setRecording({ isRecording: false, isPaused: false, duration: 0 });
      };

      recorder.start(1000);
      recorderRef.current = recorder;
      setRecording({ isRecording: true, isPaused: false, duration: 0 });
      addDebugLog("Recording started", "success");
    } catch (err) {
      addDebugLog(`Could not start recording: ${String(err)}`, "error");
    } finally {
      setStarting(false);
    }
  }, [addDebugLog, mimeType, roomCode, saveLocalRecording, settings.recordingDirectory, setRecording, starting]);

  const togglePause = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec) return;
    const { recording: state, setRecording: set, addDebugLog: log } = useAppStore.getState();
    if (state.isPaused) {
      rec.resume();
      set({ isPaused: false });
      log("Recording resumed", "info");
    } else {
      rec.pause();
      set({ isPaused: true });
      log("Recording paused", "info");
    }
  }, []);

  const toggleMute = useCallback(() => {
    const stream = useAppStore.getState().sharedDisplayStream;
    if (!stream) return;
    const { recording: state, setRecording: set, addDebugLog: log } = useAppStore.getState();
    const nextMuted = !state.isMuted;
    // The mic track rides on the shared stream, so this mutes what students
    // hear as well as what is recorded — which is what the instructor means.
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    set({ isMuted: nextMuted });
    log(nextMuted ? "Microphone muted" : "Microphone unmuted", "info");
  }, []);

  // Ending the session has to flush the file rather than drop it on the floor.
  useEffect(() => {
    const onForceStop = () => stop();
    window.addEventListener("wkai:force-stop-recording", onForceStop);
    return () => window.removeEventListener("wkai:force-stop-recording", onForceStop);
  }, [stop]);

  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  return {
    recording,
    starting,
    last,
    canRecord: !!sharedDisplayStream,
    start,
    stop,
    togglePause,
    toggleMute,
  };
}
