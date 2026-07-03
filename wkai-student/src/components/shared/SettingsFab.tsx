import { useState } from "react";
import { Settings, X } from "lucide-react";
import { ThemeControls } from "./ThemeControls";

/** App-wide floating appearance button (student app has no dedicated settings page). */
export function SettingsFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Appearance settings"
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-wkai-border bg-wkai-surface text-wkai-text-dim shadow-lg transition-colors hover:text-wkai-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Settings size={17} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="fixed bottom-16 right-4 z-50 w-72 rounded-xl border border-wkai-border bg-wkai-surface p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-wkai-text">Appearance</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-wkai-text-dim transition-colors hover:text-wkai-text"
              >
                <X size={15} />
              </button>
            </div>
            <ThemeControls />
          </div>
        </>
      )}
    </>
  );
}
