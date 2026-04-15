import { useEffect, useMemo, useRef, useState } from "react";
import { Circle, Download, Loader2, Square } from "lucide-react";
import { useAppStore } from "../../store";

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
  const { addDebugLog, sharedDisplayStream, setSharedDisplayStream } = useAppStore();
  const [isRecording, setIsRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [lastMime, setLastMime] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const mimeType = useMemo(() => pickMimeType(), []);

  function cleanupStream(stopTracks = false) {
    if (stopTracks) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setSharedDisplayStream(null);
    }
    streamRef.current = null;
  }

  async function startRecording() {
    if (isRecording || starting) return;
    setStarting(true);
    try {
      const display =
        sharedDisplayStream ??
        (await navigator.mediaDevices.getDisplayMedia({
          video: {
            displaySurface: "monitor",
          },
          audio: false,
          preferCurrentTab: false,
          selfBrowserSurface: "exclude",
        } as MediaStreamConstraints & {
          preferCurrentTab?: boolean;
          selfBrowserSurface?: "exclude";
        }));
      if (!sharedDisplayStream) {
        setSharedDisplayStream(display);
      }
      streamRef.current = display;
      const recorder = new MediaRecorder(
        display,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const mime = recorder.mimeType || mimeType || "video/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        const ext = mime.includes("mp4") ? "mp4" : "webm";
        const filename = `wkai-recording-${roomCode}-${Date.now()}.${ext}`;
        if (lastUrl) URL.revokeObjectURL(lastUrl);
        const url = URL.createObjectURL(blob);
        setLastUrl(url);
        setLastName(filename);
        setLastMime(mime);
        addDebugLog(`Recording saved (${ext.toUpperCase()}, ${Math.round(blob.size / 1024)} KB)`, "success");
        mediaRecorderRef.current = null;
        setIsRecording(false);
        cleanupStream(false);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      addDebugLog(
        `Recording started (${mimeType || "default"})`,
        "success"
      );
    } catch (err) {
      addDebugLog(`Recording start failed: ${String(err)}`, "error");
    } finally {
      setStarting(false);
    }
  }

  function stopRecording() {
    const rec = mediaRecorderRef.current;
    if (!rec) {
      cleanupStream(false);
      setIsRecording(false);
      return;
    }
    if (rec.state === "inactive") {
      cleanupStream(false);
      mediaRecorderRef.current = null;
      setIsRecording(false);
      return;
    }
    rec.stop();
    addDebugLog("Recording stop requested", "warn");
  }

  useEffect(() => {
    const handleForceStop = () => {
      stopRecording();
    };
    window.addEventListener("wkai:force-stop-recording", handleForceStop);
    return () => {
      window.removeEventListener("wkai:force-stop-recording", handleForceStop);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      cleanupStream(false);
      if (lastUrl) URL.revokeObjectURL(lastUrl);
    };
  }, [lastUrl, setSharedDisplayStream]);

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">Recording</p>
      <div className="flex items-center justify-between text-xs">
        <span className="text-wkai-text-dim">Session recording</span>
        <span className={isRecording ? "text-red-400 flex items-center gap-1" : "text-wkai-text-dim"}>
          <Circle size={10} className={isRecording ? "fill-red-400 animate-pulse" : ""} />
          {isRecording ? "Recording" : "Stopped"}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          className="btn-primary flex-1 justify-center"
          onClick={() => void startRecording()}
          disabled={isRecording || starting}
        >
          {starting ? <Loader2 size={14} className="animate-spin" /> : <Circle size={14} />}
          Start
        </button>
        <button
          className="btn-danger flex-1 justify-center"
          onClick={stopRecording}
          disabled={!isRecording}
        >
          <Square size={14} />
          Stop
        </button>
      </div>
      {lastUrl && lastName && (
        <a
          href={lastUrl}
          download={lastName}
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-wkai-border py-2 text-xs text-wkai-text-dim hover:text-wkai-text hover:bg-wkai-surface transition-colors"
        >
          <Download size={14} />
          Download last recording ({lastMime?.includes("mp4") ? "MP4" : "WEBM"})
        </a>
      )}
    </div>
  );
}
