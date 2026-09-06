import { useEffect, useRef } from "react";

/**
 * Scroll reveal that enhances an already-visible default.
 *
 * The hidden state is applied by JS, never by CSS, so a page rendered without
 * JS (or in a headless crawler, or with IntersectionObserver missing) shows the
 * finished content instead of a blank section waiting for a class that never
 * arrives. Reduced-motion opts out entirely.
 */
export function useReveal<T extends HTMLElement>(options?: { delay?: number }) {
  const ref = useRef<T>(null);
  const delay = options?.delay ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    el.style.opacity = "0";
    el.style.transform = "translateY(14px)";
    el.style.transition = `opacity 620ms var(--ease-out) ${delay}ms, transform 620ms var(--ease-out) ${delay}ms`;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          el.style.opacity = "1";
          el.style.transform = "none";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 }
    );

    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return ref;
}
