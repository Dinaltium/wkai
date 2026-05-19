import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Download, Loader2, Square, Play, Pause, Mic, MicOff } from "lucide-react";
import { useAppStore } from "../../store";
import { clsx } from "clsx";

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

export function RecordingPanel({ roomCode }: { roomCode: string }) {
  const { 
    addDebugLog, 
    sharedDisplayStream, 
    setSharedDisplayStream,
    recording,
    setRecording,
    settings
  } = useAppStore();

  const [starting, setStarting] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [lastMime, setLastMime] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeType = useMemo(() => pickMimeType(), []);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (recording.isRecording && !recording.isPaused) {
      timerRef.current = window.setInterval(() => {
        setRecording({ duration: recording.duration + 1 });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [recording.isRecording, recording.isPaused, recording.duration, setRecording]);

  async function startRecording() {
    if (recording.isRecording || starting) return;
    setStarting(true);
    try {
      let display = sharedDisplayStream;
      
      if (!display) {
        addDebugLog("Native capture stream not active. Please select a display to capture.", "error");
        throw new Error("Could not acquire display stream (no native capture source)");
      }
      
      if (!display) throw new Error("Could not acquire display stream");

      const recorder = new MediaRecorder(
        display,
        mimeType ? { mimeType } : undefined
      );
      
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      
      recorder.onstop = async () => {
        const mime = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const filename = `wkai-recording-${roomCode}-${Date.now()}.${ext}`;
        
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        const url = URL.createObjectURL(blob);
        setLastUrl(url);
        setLastName(filename);
        setLastMime(mime);
        
        addDebugLog(`Recording stopped. Size: ${Math.round(blob.size / 1024)} KB`, "success");

        // Handle local saving if enabled
        if (settings.saveLocalRecording && settings.recordingDirectory) {
          try {
            const { join } = await import("@tauri-apps/api/path");
            const { writeFile } = await import("@tauri-apps/plugin-fs");
            
            const arrayBuffer = await blob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            const fullPath = await join(settings.recordingDirectory, filename);
            
            await writeFile(fullPath, uint8Array);
            addDebugLog(`Recording saved to system: ${fullPath}`, "success");
          } catch (err) {
            console.error("Local save failed:", err);
            addDebugLog(`Failed to save recording locally: ${String(err)}`, "error");
          }
        }

        mediaRecorderRef.current = null;
        setRecording({ isRecording: false, isPaused: false, duration: 0 });
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setRecording({ isRecording: true, isPaused: false, duration: 0 });
      addDebugLog("Recording started", "success");
    } catch (err) {
      addDebugLog(`Recording start failed: ${String(err)}`, "error");
    } finally {
      setStarting(false);
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function togglePause() {
    if (!mediaRecorderRef.current) return;
    if (recording.isPaused) {
      mediaRecorderRef.current.resume();
      setRecording({ isPaused: false });
      addDebugLog("Recording resumed", "info");
    } else {
      mediaRecorderRef.current.pause();
      setRecording({ isPaused: true });
      addDebugLog("Recording paused", "info");
    }
  }

  function toggleMute() {
    // In this context, mute typically means muting the audio track being recorded
    if (!sharedDisplayStream) return;
    const audioTracks = sharedDisplayStream.getAudioTracks();
    const nextMuted = !recording.isMuted;
    audioTracks.forEach(track => {
      track.enabled = !nextMuted;
    });
    setRecording({ isMuted: nextMuted });
    addDebugLog(nextMuted ? "Audio muted" : "Audio unmuted", "info");
  }

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">Recording</p>
        {recording.isRecording && (
          <span className="text-[10px] font-mono text-red-400 animate-pulse">
            {formatDuration(recording.duration)}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {!recording.isRecording ? (
          <button
            className="btn-primary w-full justify-center py-2.5"
            onClick={() => void startRecording()}
            disabled={starting}
          >
            {starting ? <Loader2 size={16} className="animate-spin" /> : <Circle size={16} className="fill-white" />}
            Begin Recording
          </button>
        ) : (
          <div className="flex flex-col gap-2 p-2 bg-wkai-surface rounded-lg border border-wkai-border">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-wkai-text-dim flex items-center gap-1">
                <Circle size={8} className={clsx("fill-red-400", !recording.isPaused && "animate-pulse")} />
                {recording.isPaused ? "Paused" : "Recording Live"}
              </span>
              <button 
                onClick={toggleMute}
                className={clsx(
                  "p-1.5 rounded-md transition-colors",
                  recording.isMuted ? "bg-red-500/10 text-red-400" : "text-wkai-text-dim hover:bg-wkai-bg"
                )}
              >
                {recording.isMuted ? <MicOff size={14} /> : <Mic size={14} />}
              </button>
            </div>
            
            <div className="flex gap-2 mt-1">
              <button
                className="btn-secondary flex-1 justify-center py-2"
                onClick={togglePause}
              >
                {recording.isPaused ? <Play size={14} /> : <Pause size={14} />}
                {recording.isPaused ? "Resume" : "Pause"}
              </button>
              <button
                className="btn-danger flex-1 justify-center py-2"
                onClick={stopRecording}
              >
                <Square size={14} className="fill-current" />
                Stop
              </button>
            </div>
          </div>
        )}

        {lastUrl && lastName && (
          <a
            href={lastUrl}
            download={lastName}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-wkai-border py-2 text-[10px] text-wkai-text-dim hover:text-wkai-text hover:bg-wkai-surface transition-colors"
          >
            <Download size={12} />
            Download last recording ({lastMime?.includes("mp4") ? "MP4" : "WEBM"})
          </a>
        )}
      </div>
    </div>
  );
}
