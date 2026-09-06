import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { ThemeControls } from "./ThemeControls";

/**
 * Appearance popover for the room shell. Anchored to the header button rather
 * than floating over the content, so it never collides with the mobile tab bar.
 */
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="btn-icon text-wkai-text-dim hover:text-wkai-text"
      >
        <Settings size={16} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Appearance"
          className="absolute right-0 top-full z-dropdown mt-2 w-[17rem] rounded-xl border border-wkai-border bg-wkai-surface p-4 shadow-xl animate-fade-in"
        >
          <ThemeControls />
        </div>
      )}
    </div>
  );
}
