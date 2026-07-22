import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser-only anti-cheat for a proctored quiz. Enforces fullscreen and detects
 * the student leaving it (exit-fullscreen, alt-tab, minimise, tab-switch).
 *
 * Honest limits (browser sandbox): this deters casual cheating. It CANNOT block a
 * second physical device, and it CANNOT block OS screenshots (no browser API for
 * that — real capture-blocking needs a native window, i.e. the companion app).
 * Frame it to users as "attempt deterrence", not "cheat prevention".
 */
export type ProctorViolation = "fullscreen-exit" | "tab-hidden";

interface Options {
  /** When false the hook is inert (no listeners, no enforcement). */
  enabled: boolean;
  /** Called once when the first violation happens. Use to submit-and-lock. */
  onViolation: (kind: ProctorViolation) => void;
}

export function useProctoring({ enabled, onViolation }: Options) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [violation, setViolation] = useState<ProctorViolation | null>(null);
  // "Armed" only after the student has entered fullscreen, so entering/leaving
  // during setup doesn't count as a violation. Latches off after the first hit.
  const armed = useRef(false);

  const fire = useCallback(
    (kind: ProctorViolation) => {
      if (!armed.current) return;
      armed.current = false;
      setViolation(kind);
      onViolation(kind);
    },
    [onViolation]
  );

  const enterFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      armed.current = true;
      setIsFullscreen(true);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    // Intentional exit (e.g. quiz finished) — disarm first so it isn't a violation.
    armed.current = false;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
    setIsFullscreen(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const onFsChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      if (!fs) fire("fullscreen-exit");
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") fire("tab-hidden");
    };
    // A blur to another window/app is also a leave signal on most platforms.
    const onBlur = () => {
      if (document.visibilityState === "hidden") fire("tab-hidden");
    };

    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled, fire]);

  // Safety: leave fullscreen if the component using this unmounts mid-quiz.
  useEffect(() => {
    return () => {
      armed.current = false;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  return { isFullscreen, violation, enterFullscreen, exitFullscreen };
}
