import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { Check } from "lucide-react";
import { CheckVisual, ErrorVisual, GuideVisual, RoomVisual } from "./FeatureVisuals";
import { gsap, prefersReducedMotion } from "../../lib/motion";

const FEATURES = [
  {
    id: "guide",
    kicker: "The guide",
    title: "Keeps pace with you",
    body: "Every step, command and aside becomes a timestamped block the moment you say it. A student who looked away for two minutes reads those two minutes instead of interrupting you.",
    points: ["Written from your actual words and screen", "Stays readable after the session ends"],
    visual: <GuideVisual />,
  },
  {
    id: "errors",
    kicker: "Error help",
    title: "Answered in seconds, not in the queue",
    body: "A student pastes the red text and gets the cause in plain language plus a command they can run — without putting a hand up, and without waiting for you.",
    points: ["Private to that student", "Falls back to a direct diagnosis if the socket drops"],
    visual: <ErrorVisual />,
  },
  {
    id: "checks",
    kicker: "Comprehension",
    title: "Checks you did not have to write",
    body: "At the points that matter, WKAI asks one question. Getting it wrong is not a score — it is a signal, before the next section makes it worse.",
    points: ["Generated from what was just taught", "Explains the answer either way"],
    visual: <CheckVisual />,
  },
  {
    id: "room",
    kicker: "The room",
    title: "Screen and files in one place",
    body: "Your shared screen streams over WebRTC into the same room as the guide, and any file you drop is one tap away. No second link, no chat thread.",
    points: ["Low-latency peer streaming with a relay fallback", "Files land instantly, with a badge on the tab"],
    visual: <RoomVisual />,
  },
];

/**
 * Vertical scroll drives horizontal travel: the section pins and the four
 * panels slide past while the page keeps scrolling. The tween must use
 * `ease: "none"`, otherwise scroll distance and panel position stop matching
 * and the whole thing feels like it is fighting the wheel.
 *
 * Under `lg` it reverts to a normal vertical stack — a pinned horizontal rail
 * on a touch device fights the browser's own scrolling.
 */
export function HorizontalFeatures() {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        const el = track.current;
        if (!el) return;

        const distance = () => Math.max(0, el.scrollWidth - window.innerWidth);

        const tween = gsap.to(el, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.8,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        // Panels lift slightly as they reach the middle of the screen, so the
        // rail reads as a sequence rather than one long slab moving sideways.
        gsap.utils.toArray<HTMLElement>(".hf-panel").forEach((panel) => {
          gsap.fromTo(
            panel.querySelector(".hf-visual"),
            { y: 34 },
            {
              y: -34,
              ease: "none",
              scrollTrigger: {
                trigger: panel,
                containerAnimation: tween,
                start: "left right",
                end: "right left",
                scrub: true,
              },
            }
          );
        });

        return () => tween.kill();
      });
    },
    { scope: root }
  );

  return (
    <section id="features" ref={root} className="scroll-mt-20 overflow-hidden border-b border-wkai-border">
      <div
        ref={track}
        className="flex flex-col gap-16 py-20 lg:h-[100dvh] lg:w-max lg:flex-row lg:items-center lg:gap-0 lg:py-0"
      >
        {FEATURES.map((f, i) => (
          <article
            key={f.id}
            className="hf-panel shell lg:flex lg:w-screen lg:max-w-none lg:items-center lg:gap-16 lg:px-[8vw] xl:gap-24"
          >
            <div className="lg:w-[42%]">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent-text">
                {String(i + 1).padStart(2, "0")} · {f.kicker}
              </p>
              <h3 className="display mt-4 max-w-[18ch] text-2xl text-wkai-text sm:text-4xl">
                {f.title}
              </h3>
              <p className="mt-5 max-w-[48ch] text-base leading-relaxed text-wkai-text-dim">{f.body}</p>
              <ul className="mt-6 space-y-2.5">
                {f.points.map((p) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed text-wkai-text">
                    <Check size={16} className="mt-0.5 shrink-0 text-accent-text" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="hf-visual mt-8 lg:mt-0 lg:w-[58%] lg:max-w-xl">{f.visual}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
