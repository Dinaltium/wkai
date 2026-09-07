import { useRef, useEffect } from "react";

interface FramedWindowVideoProps {
  src: string;
  title?: string;
  /** Kept for call-site compatibility; the frame no longer draws chrome. */
  badge?: string;
  poster?: string;
  className?: string;
  aspectRatio?: string;
  fillContainer?: boolean;
}

/**
 * A product clip presented the way aoagents.dev presents its app: nested dark
 * shells with a thin bezel and a soft bloom behind, on a near-black page.
 *
 * The macOS traffic lights are gone deliberately. The clips already contain the
 * WKAI app's own header — room title, tabs, live badge — so a fake window bar
 * on top of them was a second, competing chrome, and it read as a screenshot of
 * a screenshot. Measured against the real thing: shell radius 20 / border
 * white 7%, inner radius 16 / border white 4%, bloom at white 12% blurred 60px.
 */
export function FramedWindowVideo({
  src,
  title = "wkai — workshop session",
  poster,
  className = "",
  aspectRatio = "aspect-[16/10]",
  fillContainer = false,
}: FramedWindowVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Every clip has a poster beside it, so the frame is never an empty black
  // rectangle while the video is paused, buffering, or blocked from autoplay.
  const posterSrc = poster ?? src.replace(/\.mp4$/, "-poster.jpg");

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Six autoplaying clips on one page is six decoders running for content
    // nobody is looking at. Play only what is on screen — and starting on
    // intersection is also what gets the first frame moving reliably, since a
    // play() fired before the element is visible can be rejected outright.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) void v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.15 }
    );
    observer.observe(v);

    // Belt and braces for the loop: a muted looping video should never end, but
    // a throttled background tab can fire `ended` anyway, which would leave the
    // frame holding its last painted frame for good.
    const restart = () => {
      v.currentTime = 0;
      void v.play().catch(() => {});
    };
    v.addEventListener("ended", restart);

    return () => {
      observer.disconnect();
      v.removeEventListener("ended", restart);
    };
  }, [src]);

  return (
    <div
      className={`relative isolate ${fillContainer ? "flex h-full w-full flex-col" : ""} ${className}`}
    >
      {/* Ambient bloom: light coming off the panel, not a coloured glow around it. */}
      <div
        className="pointer-events-none absolute inset-[10%] top-[20%] -z-10 rounded-3xl bg-white/[0.12] blur-[60px]"
        aria-hidden="true"
      />

      {/* Outer shell */}
      <div
        className={`relative rounded-[20px] border border-white/[0.07] bg-[#141417] p-1.5 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] ${
          fillContainer ? "flex flex-1 min-h-0 flex-col" : ""
        }`}
      >
        {/* Inner pane holding the clip */}
        <div
          className={`relative w-full overflow-hidden rounded-[16px] border border-white/[0.04] bg-[#0f0f12] ${
            fillContainer ? "flex-1 min-h-0" : aspectRatio
          }`}
        >
          <video
            ref={videoRef}
            src={src}
            poster={posterSrc}
            aria-label={title}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-cover object-top"
          />
        </div>
      </div>
    </div>
  );
}
