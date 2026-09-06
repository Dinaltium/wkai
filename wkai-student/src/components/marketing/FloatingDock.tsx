import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useGSAP } from "@gsap/react";
import { ArrowRight, Menu, X } from "lucide-react";
import { clsx } from "clsx";
import { EASE, ScrollTrigger, gsap, prefersReducedMotion } from "../../lib/motion";

const SECTIONS = [
  { id: "how", label: "How it works" },
  { id: "features", label: "What it does" },
  { id: "stack", label: "Under the hood" },
  { id: "faq", label: "FAQ" },
];

/**
 * A dock rather than a bar: it floats clear of the page, so it works over the
 * hero footage and over a light section without needing its own gradient.
 *
 * The thing that makes it feel built rather than dropped in is the indicator —
 * a pill that physically slides between links as the matching section takes
 * over the viewport, so the nav reports where you are instead of just linking.
 */
export function FloatingDock() {
  const root = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Scroll-spy: whichever section owns the middle of the viewport is active.
  useGSAP(() => {
    const triggers = SECTIONS.map(({ id }) =>
      ScrollTrigger.create({
        trigger: `#${id}`,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => self.isActive && setActive(id),
      })
    );
    // Above the first section there is no active link at all.
    const top = ScrollTrigger.create({
      trigger: "#how",
      start: "top 55%",
      onLeaveBack: () => setActive(null),
    });
    return () => {
      triggers.forEach((t) => t.kill());
      top.kill();
    };
  });

  // Slide the indicator onto the active link.
  useLayoutEffect(() => {
    const list = listRef.current;
    const pill = pillRef.current;
    if (!list || !pill) return;

    if (!active) {
      gsap.to(pill, { autoAlpha: 0, duration: 0.25, overwrite: true });
      return;
    }

    const target = list.querySelector<HTMLElement>(`[data-nav="${active}"]`);
    if (!target) return;

    gsap.to(pill, {
      x: target.offsetLeft,
      width: target.offsetWidth,
      autoAlpha: 1,
      duration: prefersReducedMotion() ? 0 : 0.55,
      ease: EASE,
      overwrite: true,
    });
  }, [active]);

  // The dock tightens once you leave the hero, so it takes less room while reading.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.to(root.current, {
        scale: 0.96,
        ease: "none",
        scrollTrigger: { start: 80, end: 260, scrub: 0.4 },
      });
    },
    { scope: root }
  );

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <>
      <div
        ref={root}
        className="fixed inset-x-0 top-3 z-sticky flex justify-center px-4 sm:top-5"
        style={{ transformOrigin: "top center" }}
      >
        <nav
          className={clsx(
            "flex items-center gap-1 rounded-full border p-1.5",
            // Its own surface, so it reads on footage and on a light page alike.
            "border-wkai-border bg-wkai-surface/85 backdrop-blur-xl",
            "shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)]"
          )}
        >
          <Link to="/" className="flex items-center gap-2 rounded-full px-3 py-1.5" aria-label="WKAI home">
            <img src="/wkai-logo.svg" alt="" className="h-6 w-6 object-contain" />
            <span className="display text-sm tracking-[-0.02em] text-wkai-text">WKAI</span>
          </Link>

          <span className="mx-1 hidden h-5 w-px bg-wkai-border lg:block" />

          <div ref={listRef} className="relative hidden items-center lg:flex">
            <span
              ref={pillRef}
              aria-hidden="true"
              className="absolute inset-y-0 left-0 rounded-full bg-wkai-surface2"
              style={{ opacity: 0 }}
            />
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                data-nav={s.id}
                className={clsx(
                  "relative z-10 whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors",
                  active === s.id ? "text-wkai-text" : "text-wkai-text-dim hover:text-wkai-text"
                )}
              >
                {s.label}
              </a>
            ))}
          </div>

          <span className="mx-1 hidden h-5 w-px bg-wkai-border sm:block" />

          <Link
            to="/download"
            className="hidden whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium text-wkai-text-dim transition-colors hover:text-wkai-text sm:block"
          >
            Download
          </Link>

          <Link
            to="/join"
            className="group flex items-center gap-2 whitespace-nowrap rounded-full bg-accent py-2 pl-4 pr-3 text-sm font-semibold text-accent-fg transition-[filter] hover:brightness-110"
          >
            Join
            <ArrowRight
              size={14}
              className="transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5"
            />
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="ml-0.5 flex h-9 w-9 items-center justify-center rounded-full text-wkai-text-dim transition-colors hover:bg-wkai-surface2 hover:text-wkai-text lg:hidden"
          >
            <Menu size={17} />
          </button>
        </nav>
      </div>

      {menuOpen && <MobileMenu onClose={() => setMenuOpen(false)} />}
    </>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap
        .timeline({ defaults: { ease: EASE } })
        .from(root.current, { autoAlpha: 0, duration: 0.3 })
        .from(".menu-line > span", { yPercent: 115, duration: 0.8, stagger: 0.07 }, 0.05);
    },
    { scope: root }
  );

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className="fixed inset-0 z-overlay flex flex-col bg-wkai-bg/95 backdrop-blur-xl"
    >
      <div className="flex h-16 items-center justify-end px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="flex h-11 w-11 items-center justify-center rounded-full text-wkai-text-dim hover:text-wkai-text"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-24">
        {SECTIONS.map((s) => (
          <span key={s.id} className="menu-line block overflow-hidden">
            <a
              href={`#${s.id}`}
              onClick={onClose}
              className="display block py-2 text-3xl text-wkai-text transition-colors hover:text-accent-text"
            >
              {s.label}
            </a>
          </span>
        ))}
        <span className="menu-line mt-6 block overflow-hidden">
          <Link to="/download" onClick={onClose} className="block py-2 text-base text-wkai-text-dim">
            Download the instructor app
          </Link>
        </span>
      </div>
    </div>
  );
}
