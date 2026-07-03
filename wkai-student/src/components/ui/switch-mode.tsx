import { Sun, Moon } from "lucide-react";
import { clsx } from "clsx";
import { useTheme } from "../../lib/theme";

/**
 * Animated light/dark toggle. Adapted from watermelon.sh's switch-mode for a
 * Vite/Tauri stack: no next-themes / react-icons / framer-motion — wired to the
 * app's own theme store, lucide icons, and CSS transitions (works in both apps,
 * zero new deps, respects prefers-reduced-motion via the global reset).
 */
export function SwitchMode({ className }: { className?: string }) {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={clsx(
        "relative inline-flex h-8 w-[60px] shrink-0 items-center rounded-full border border-wkai-border bg-wkai-surface2 px-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-wkai-bg",
        className
      )}
    >
      {/* static icons behind the knob */}
      <Sun size={13} className="absolute left-2 text-amber-400/80" />
      <Moon size={13} className="absolute right-2 text-wkai-text-dim" />
      {/* sliding knob */}
      <span
        className={clsx(
          "relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ease-out",
          isDark ? "translate-x-[26px]" : "translate-x-0"
        )}
      >
        {isDark ? (
          <Moon size={13} className="text-zinc-700" fill="currentColor" />
        ) : (
          <Sun size={13} className="text-amber-500" fill="currentColor" />
        )}
      </span>
    </button>
  );
}
