import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

export function MicTest() {
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const animRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const levelRef = useRef(0);
  const lastCommitRef = useRef(0);

  async function startTest() {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      setTesting(true);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const bins = Math.max(1, Math.floor(analyser.fftSize / 4));
        let sum = 0;
        for (let i = 0; i < bins; i += 1) {
          sum += data[i];
        }
        const avg = sum / bins;
        const raw = Math.min(100, (avg / 255) * 100 * 2.5);
        // Meter behavior: fast attack, slow decay
        const prev = levelRef.current;
        const next = raw > prev ? prev + (raw - prev) * 0.6 : prev * 0.92;
        levelRef.current = next < 0.5 ? 0 : next;
        const now = performance.now();
        if (now - lastCommitRef.current >= 50) {
          lastCommitRef.current = now;
          setLevel(levelRef.current);
        }
        animRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLevel(0);
      setTesting(false);
    }
  }

  function stopTest() {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    animRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    setTesting(false);
    setLevel(0);
    levelRef.current = 0;
    lastCommitRef.current = 0;
    setError(null);
  }

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void ctxRef.current?.close();
    };
  }, []);

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

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
          Microphone access failed: {error}
        </div>
      )}
    </div>
  );
}
