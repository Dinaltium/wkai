import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// Registered once for the whole app; every scroll-driven component imports
// from here rather than calling registerPlugin again.
gsap.registerPlugin(ScrollTrigger);

/** True when the visitor has asked the OS for less motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The page's one easing curve: heavy start, long settle, no bounce. */
export const EASE = "expo.out";

export { gsap, ScrollTrigger };
