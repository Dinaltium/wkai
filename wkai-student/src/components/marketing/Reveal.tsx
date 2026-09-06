import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { clsx } from "clsx";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion";

/**
 * Line-mask heading reveal: each line sits in its own overflow-hidden box and
 * slides up from below as the heading enters. This is the move the reference
 * sites use — the text arrives, it does not just fade in.
 *
 * Lines are authored explicitly rather than measured, so the reveal never
 * disagrees with how the browser actually wrapped the text.
 */
export function RevealHeading({
  lines,
  as: Tag = "h2",
  className,
}: {
  lines: string[];
  as?: "h1" | "h2" | "h3";
  className?: string;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(".reveal-line > span", {
        yPercent: 118,
        duration: 1.1,
        ease: EASE,
        stagger: 0.09,
        scrollTrigger: { trigger: root.current, start: "top 85%" },
      });
    },
    { scope: root }
  );

  return (
    <div ref={root}>
      <Tag className={className}>
        {lines.map((line) => (
          <span key={line} className="reveal-line block overflow-hidden pb-[0.12em]">
            <span className="block">{line}</span>
          </span>
        ))}
      </Tag>
    </div>
  );
}

/**
 * Generic scroll-in for supporting content. Applies its hidden state from JS,
 * so a page rendered without JS still shows everything.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 26,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(root.current, {
        y,
        autoAlpha: 0,
        filter: "blur(6px)",
        duration: 1,
        delay,
        ease: EASE,
        scrollTrigger: { trigger: root.current, start: "top 88%" },
      });
    },
    { scope: root }
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}

/** Thin scroll-position bar pinned to the very top of the page. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (prefersReducedMotion()) return;
    gsap.fromTo(
      bar.current,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: "none",
        // Whole-page progress: map scroll 0 -> max directly rather than
        // triggering off an element, which measures the wrong box here.
        scrollTrigger: { start: 0, end: "max", scrub: 0.3 },
      }
    );
  });

  return (
    <div
      ref={bar}
      aria-hidden="true"
      className={clsx(
        "fixed inset-x-0 top-0 z-toast h-[2px] origin-left bg-teal-400",
        "pointer-events-none"
      )}
      style={{ transform: "scaleX(0)" }}
    />
  );
}

/**
 * Scroll-scrubbed text: the sentence is dim until you reach it, then lights up
 * word by word as it crosses the viewport. The reading pace is set by the
 * scroll, which is the one text effect that rewards scrolling rather than just
 * decorating it.
 */
export function ScrollHighlightText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const root = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.fromTo(
        ".hl-word",
        { opacity: 0.18 },
        {
          opacity: 1,
          ease: "none",
          stagger: 0.5,
          scrollTrigger: {
            trigger: root.current,
            start: "top 78%",
            end: "bottom 55%",
            scrub: 0.35,
          },
        }
      );
    },
    { scope: root }
  );

  return (
    <p ref={root} className={className}>
      {words.map((w, i) => (
        <span key={`${w}-${i}`} className="hl-word">
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
