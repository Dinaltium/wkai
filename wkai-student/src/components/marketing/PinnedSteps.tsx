import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { RevealHeading } from "./Reveal";
import { FramedWindowVideo } from "./FramedWindowVideo";
import { gsap, prefersReducedMotion } from "../../lib/motion";

const STEPS = [
  {
    n: "01",
    title: "It captures the session",
    text: "The desktop app streams your screen and your microphone. You start it once and forget it — there is nothing to operate while you teach.",
  },
  {
    n: "02",
    title: "It works out what is happening",
    text: "Speech becomes text, frames become context, and a chain of models decides what a student actually needs to know at that moment.",
  },
  {
    n: "03",
    title: "It reaches every student",
    text: "Guide steps, fixes, files and checks arrive in the browser in real time. Students only need the room code.",
  },
];

/**
 * The section holds the viewport while the story advances inside it: the page
 * keeps scrolling, but you stay here and the step, the number and the scene all
 * change in place. Below `lg` it un-pins and becomes an ordinary stack, because
 * pinning a viewport-height scene on a phone traps the reader.
 */
export function PinnedSteps() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;

      const mm = gsap.matchMedia();

      mm.add("(min-width: 1024px)", () => {
        const items = gsap.utils.toArray<HTMLElement>(".pin-step");
        const scenes = gsap.utils.toArray<HTMLElement>(".pin-scene");

        gsap.set(items.slice(1), { autoAlpha: 0, y: 40 });
        gsap.set(scenes.slice(1), { autoAlpha: 0 });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=260%",
            pin: ".pin-stage",
            scrub: 0.6,
            anticipatePin: 1,
          },
        });

        for (let i = 1; i < items.length; i += 1) {
          tl.to(items[i - 1], { autoAlpha: 0, y: -40, duration: 0.45 }, i - 1 + 0.55)
            .to(scenes[i - 1], { autoAlpha: 0, duration: 0.45 }, i - 1 + 0.55)
            .to(items[i], { autoAlpha: 1, y: 0, duration: 0.45 }, i - 1 + 0.62)
            .to(scenes[i], { autoAlpha: 1, duration: 0.45 }, i - 1 + 0.62);
        }

        tl.fromTo(
          ".pin-rail-fill",
          { scaleY: 0 },
          { scaleY: 1, ease: "none", duration: items.length - 1 },
          0
        );

        return () => {
          gsap.set([...items, ...scenes], { clearProps: "all" });
        };
      });
    },
    { scope: root }
  );

  return (
    <section id="how" ref={root} className="scroll-mt-20 border-b border-wkai-border">
      <div className="pin-stage flex min-h-[100dvh] items-center py-24 lg:py-0">
        <div className="shell w-full">
          <RevealHeading
            lines={["Three things happen,", "and you do none of them."]}
            className="display max-w-[22ch] text-3xl text-wkai-text sm:text-4xl"
          />

          <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-20">
            {/* Copy column. On desktop the three sit on top of each other and
                swap; on mobile they simply stack and all stay visible. */}
            <div className="flex min-w-0 gap-6">
              <div className="relative hidden w-px shrink-0 bg-wkai-border lg:block">
                <div className="pin-rail-fill absolute inset-x-0 top-0 h-full origin-top bg-accent" />
              </div>

              <div className="relative min-w-0 flex-1 lg:h-[16rem]">
                {STEPS.map((s, i) => (
                  <div
                    key={s.n}
                    className={`pin-step mb-12 last:mb-0 lg:absolute lg:inset-0 lg:mb-0 ${
                      i > 0 ? "lg:pointer-events-none" : ""
                    }`}
                  >
                    <span className="font-mono text-sm text-accent-text">{s.n}</span>
                    <h3 className="display mt-3 text-2xl text-wkai-text sm:text-3xl">{s.title}</h3>
                    <p className="mt-4 max-w-[46ch] text-base leading-relaxed text-wkai-text-dim">
                      {s.text}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scene column: one framed window, three states.
                On desktop the three sit on top of each other and GSAP scrubs
                between them. On mobile they stack vertically. */}
            <div className="relative w-full min-w-0 lg:aspect-[16/10]">
              {[<CaptureScene key="a" />, <UnderstandScene key="b" />, <DeliverScene key="c" />].map(
                (scene, i) => (
                  <div
                    key={i}
                    className="pin-scene aspect-[16/10] inset-0 lg:absolute lg:aspect-auto [&:not(:first-child)]:mt-6 lg:[&:not(:first-child)]:mt-0"
                  >
                    {scene}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CaptureScene() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-join.mp4"
      title="wkai — desktop session capture"
      badge="Recording"
      fillContainer
    />
  );
}

function UnderstandScene() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-guide.mp4"
      title="wkai — live speech-to-text & AI context"
      badge="AI Generating"
      fillContainer
    />
  );
}

function DeliverScene() {
  return (
    <FramedWindowVideo
      src="/videos/wkai-feature-qa.mp4"
      title="wkai — real-time student delivery & fixes"
      badge="Synced"
      fillContainer
    />
  );
}
