import { useEffect, useRef, useState } from "react";
import { Settings, X } from "lucide-react";
import { ThemeControls } from "./ThemeControls";

/**
 * Floating appearance button for the pages outside a room (landing, join,
 * download). Inside a room the same controls live in the header instead, so
 * this never overlaps the mobile tab bar.
 */
export function SettingsFab() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Appearance settings"
        aria-expanded={open}
        aria-haspopup="dialog"
        className="fixed right-4 z-fab flex h-11 w-11 items-center justify-center rounded-full border border-wkai-border bg-wkai-surface text-wkai-text-dim shadow-lg transition-colors hover:text-wkai-text"
        style={{ bottom: "max(1rem, var(--safe-b))" }}
      >
        <Settings size={18} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-overlay" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Appearance"
            className="fixed right-4 z-overlay w-[min(17rem,calc(100vw-2rem))] rounded-xl border border-wkai-border bg-wkai-surface p-4 shadow-2xl outline-none animate-fade-in"
            style={{ bottom: "calc(max(1rem, var(--safe-b)) + 3.25rem)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-wkai-text">Appearance</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close appearance settings"
                className="text-wkai-text-dim transition-colors hover:text-wkai-text"
              >
                <X size={16} />
              </button>
            </div>
            <ThemeControls />
          </div>
        </>
      )}
    </>
  );
}
