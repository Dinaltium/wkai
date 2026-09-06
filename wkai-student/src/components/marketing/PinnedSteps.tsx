import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { Mic, Monitor, Users } from "lucide-react";
import { RevealHeading } from "./Reveal";
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
            <div className="flex gap-6">
              <div className="relative hidden w-px shrink-0 bg-wkai-border lg:block">
                <div className="pin-rail-fill absolute inset-x-0 top-0 h-full origin-top bg-accent" />
              </div>

              <div className="relative flex-1 lg:h-[16rem]">
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

            {/* Scene column: one frame, three states. */}
            <div className="relative aspect-[4/3] w-full">
              {[<CaptureScene key="a" />, <UnderstandScene key="b" />, <DeliverScene key="c" />].map(
                (scene, i) => (
                  <div key={i} className="pin-scene inset-0 lg:absolute [&:not(:first-child)]:mt-6 lg:[&:not(:first-child)]:mt-0">
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

/** Shared chrome so the three states read as the same machine changing. */
function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-wkai-border bg-wkai-surface">
      <div className="flex items-center gap-2 border-b border-wkai-border px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-wkai-border" />
          <span className="h-2 w-2 rounded-full bg-wkai-border" />
        </span>
        <span className="font-mono text-[11px] text-wkai-text-dim">{label}</span>
      </div>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </div>
  );
}

function CaptureScene() {
  return (
    <Frame label="your screen">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-danger">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
          Recording
          <Monitor size={13} className="ml-auto text-wkai-text-dim" />
        </div>
        <div className="flex-1 rounded-lg bg-gradient-to-br from-wkai-surface2 to-wkai-bg" />
        <div className="flex items-center gap-2">
          <Mic size={13} className="text-accent-text" />
          <span className="flex flex-1 items-end gap-[3px]">
            {[6, 12, 20, 9, 16, 24, 11, 7, 18, 13, 8, 15, 22, 10].map((h, i) => (
              <span
                key={i}
                className="w-[3px] rounded-sm bg-accent/70"
                style={{ height: h, animation: `pulse 1.4s ease-in-out ${i * 0.09}s infinite` }}
              />
            ))}
          </span>
        </div>
      </div>
    </Frame>
  );
}

function UnderstandScene() {
  return (
    <Frame label="what it understood">
      <div className="grid h-full grid-cols-2 gap-3">
        <div className="rounded-lg bg-gradient-to-br from-wkai-surface2 to-wkai-bg" />
        <div className="flex flex-col justify-center gap-2.5">
          {[
            { w: "85%", strong: true },
            { w: "70%" },
            { w: "92%" },
            { w: "58%", strong: true },
            { w: "76%" },
          ].map((l, i) => (
            <span key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 bg-accent" />
              <span
                className={`h-2 rounded-sm ${l.strong ? "bg-wkai-text/80" : "bg-wkai-text-dim/40"}`}
                style={{ width: l.w }}
              />
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function DeliverScene() {
  return (
    <Frame label="every student, at once">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2 text-xs text-wkai-text-dim">
          <Users size={13} className="text-accent-text" />
          14 in the room
        </div>
        <div className="grid flex-1 grid-cols-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col justify-end gap-1 rounded-md border border-wkai-border bg-wkai-bg p-1.5"
            >
              <span className="h-1 w-full rounded-sm bg-accent/60" />
              <span className="h-1 w-2/3 rounded-sm bg-wkai-text-dim/30" />
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
