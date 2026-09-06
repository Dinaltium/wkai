import { useRef, useState } from "react";
import { clsx } from "clsx";
import { EASE, gsap, prefersReducedMotion } from "../../lib/motion";

/**
 * Accordion with real open/close motion. A native <details> snaps open, which
 * is the one place on this page where a state change had no transition at all.
 *
 * Heights are animated from the measured content box to `auto`, and the answer
 * text drifts up behind it so the panel does not just unfold as a blank slab.
 * One item open at a time keeps the page from jumping around under the cursor.
 */
export function Accordion({ items }: { items: [string, string][] }) {
  const [open, setOpen] = useState<number | null>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);

  function toggle(index: number) {
    const next = open === index ? null : index;
    const reduce = prefersReducedMotion();

    if (open !== null && open !== index) {
      const prev = panels.current[open];
      if (prev) gsap.to(prev, { height: 0, duration: reduce ? 0 : 0.4, ease: EASE, overwrite: true });
    }

    const el = panels.current[index];
    if (el) {
      if (next === null) {
        gsap.to(el, { height: 0, duration: reduce ? 0 : 0.4, ease: EASE, overwrite: true });
      } else {
        gsap.to(el, { height: "auto", duration: reduce ? 0 : 0.55, ease: EASE, overwrite: true });
        if (!reduce) {
          gsap.fromTo(
            el.firstElementChild,
            { y: 14, autoAlpha: 0 },
            { y: 0, autoAlpha: 1, duration: 0.6, ease: EASE, delay: 0.05, overwrite: true }
          );
        }
      }
    }

    setOpen(next);
  }

  return (
    <div className="divide-y divide-wkai-border border-y border-wkai-border">
      {items.map(([q, a], i) => {
        const isOpen = open === i;
        return (
          <div key={q}>
            <h3>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="group flex w-full items-center gap-4 py-5 text-left text-base font-medium text-wkai-text"
              >
                <span
                  className={clsx(
                    "flex-1 transition-colors duration-300",
                    isOpen ? "text-accent-text" : "group-hover:text-accent-text"
                  )}
                >
                  {q}
                </span>
                {/* Plus that becomes a minus: the bar rotates out, it does not swap. */}
                <span className="relative h-4 w-4 shrink-0 text-accent-text" aria-hidden="true">
                  <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current" />
                  <span
                    className={clsx(
                      "absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-current",
                      "transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      isOpen ? "rotate-90 scale-y-0" : "rotate-0 scale-y-100"
                    )}
                  />
                </span>
              </button>
            </h3>

            <div
              ref={(el) => {
                panels.current[i] = el;
              }}
              className="h-0 overflow-hidden"
            >
              <p className="max-w-[70ch] pb-6 text-sm leading-relaxed text-wkai-text-dim">{a}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
