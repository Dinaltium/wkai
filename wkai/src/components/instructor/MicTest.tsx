import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

export function MicTest() {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const animRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);

  async function startTest() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      setTesting(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setLevel(Math.min(100, (avg / 128) * 100));
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setLevel(0);
    }
  }

  function stopTest() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    setTesting(false);
    setLevel(0);
  }

  useEffect(() => () => stopTest(), []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-wkai-text">Microphone Test</span>
        <button
          className={testing ? "btn-ghost border border-wkai-border text-xs" : "btn-primary text-xs py-1.5"}
          onClick={testing ? stopTest : startTest}
        >
          {testing ? (
            <>
              <MicOff size={12} /> Stop
            </>
          ) : (
            <>
              <Mic size={12} /> Test Mic
            </>
          )}
        </button>
      </div>

      {testing && (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-wkai-border overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all duration-75"
              style={{ width: `${level}%` }}
            />
          </div>
          <p className="text-xs text-wkai-text-dim">
            {level > 10 ? "Microphone is working." : "No audio detected. Speak or check your mic settings."}
          </p>
        </div>
      )}
    </div>
  );
}
