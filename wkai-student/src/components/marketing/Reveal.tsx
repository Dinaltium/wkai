import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion";

/**
 * Where a scroll-in starts.
 *
 * These used to fire at 85–88% of the viewport, which is the moment an element
 * clips the bottom edge — so on a phone the animation had run to completion
 * before the reader had scrolled far enough to look at it, and the content just
 * sat there static. Starting nearer the middle means the movement happens while
 * the element is somewhere you are actually looking.
 */
const REVEAL_START = "top 68%";
const REVEAL_START_SOFT = "top 74%";

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
        scrollTrigger: { trigger: root.current, start: REVEAL_START },
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
        scrollTrigger: { trigger: root.current, start: REVEAL_START_SOFT },
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
            start: "top 72%",
            end: "bottom 65%",
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

/**
 * Monospace label that types itself in when it scrolls into view, with a caret
 * that blinks while it runs.
 *
 * The full string is always in the DOM for assistive tech and for a page with
 * no JS; only a visual copy is animated. Width is reserved in `ch` up front so
 * a label typing itself never reflows the heading underneath it.
 */
export function TypeLine({ text, className }: { text: string; className?: string }) {
  const out = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = out.current;
      if (!el || prefersReducedMotion()) return;

      const state = { n: 0 };
      el.textContent = "";

      gsap.to(state, {
        n: text.length,
        duration: Math.min(1.2, text.length * 0.055),
        ease: "none",
        scrollTrigger: { trigger: root.current, start: REVEAL_START, once: true },
        onUpdate: () => {
          el.textContent = text.slice(0, Math.round(state.n));
        },
        onComplete: () => {
          el.textContent = text;
          el.dataset.done = "true";
        },
      });
    },
    { scope: root }
  );

  return (
    <span
      ref={root}
      className={className}
      style={{ minWidth: `${text.length}ch` }}
      aria-label={text}
    >
      <span ref={out} aria-hidden="true">
        {text}
      </span>
      <span className="type-caret" aria-hidden="true" />
    </span>
  );
}
