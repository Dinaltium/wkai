import { useRef, useEffect } from "react";

interface FramedWindowVideoProps {
  src: string;
  title?: string;
  badge?: string;
  poster?: string;
  className?: string;
  aspectRatio?: string;
}

/**
 * Renders an app showcase video framed in a desktop window with macOS traffic lights,
 * subtle border, ambient backdrop glow, and smooth playback, echoing the aoagents.dev
 * presentation style.
 */
export function FramedWindowVideo({
  src,
  title = "wkai — workshop session",
  badge,
  poster,
  className = "",
  aspectRatio = "aspect-[16/10]",
}: FramedWindowVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      // Autoplay blocked fallback
    });
  }, [src]);

  return (
    <div className={`relative group isolate ${className}`}>
      {/* Subtle backdrop glow */}
      <div
        className="absolute -inset-1.5 rounded-2xl bg-gradient-to-tr from-teal-500/10 via-emerald-500/5 to-transparent blur-xl opacity-75 transition-opacity duration-700 group-hover:opacity-100"
        aria-hidden="true"
      />

      {/* Main Window Frame */}
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-950/90 shadow-2xl shadow-black/80 backdrop-blur-md">
        {/* Titlebar / Chrome */}
        <div className="flex h-9 items-center justify-between border-b border-white/[0.08] bg-zinc-900/60 px-3.5 backdrop-blur-sm">
          {/* Traffic lights */}
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]/90 shadow-[0_0_8px_rgba(255,95,86,0.3)]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]/90 shadow-[0_0_8px_rgba(255,189,46,0.3)]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]/90 shadow-[0_0_8px_rgba(39,201,63,0.3)]" />
          </div>

          {/* Window title / address pill */}
          <div className="flex items-center gap-2 rounded-md bg-white/[0.04] px-3 py-0.5 text-xs text-zinc-400 font-mono border border-white/[0.04]">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400 animate-pulse" />
            <span className="truncate max-w-[220px] sm:max-w-[340px]">{title}</span>
          </div>

          {/* Right badge / indicator */}
          <div className="flex items-center text-[11px] font-mono text-zinc-500">
            {badge ?? "Live"}
          </div>
        </div>

        {/* Video Canvas */}
        <div className={`relative w-full overflow-hidden bg-zinc-950 ${aspectRatio}`}>
          <video
            ref={videoRef}
            src={src}
            poster={poster}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}
