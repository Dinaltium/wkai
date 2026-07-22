import { Check } from "lucide-react";
import { clsx } from "clsx";
import { SwitchMode } from "../ui/switch-mode";
import { useTheme, ACCENT_PRESETS } from "../../lib/theme";

/** Appearance controls: light/dark toggle + accent color (presets + custom). */
export function ThemeControls() {
  const { mode, accent, setAccent } = useTheme();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-wkai-text">Theme</p>
          <p className="text-xs text-wkai-text-dim">{mode === "dark" ? "Dark" : "Light"} mode</p>
        </div>
        <SwitchMode />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-wkai-text">Accent color</p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENT_PRESETS.map((p) => {
            const active = accent.toLowerCase() === p.hex.toLowerCase();
            return (
              <button
                key={p.hex}
                type="button"
                onClick={() => setAccent(p.hex)}
                title={p.name}
                aria-label={`Accent ${p.name}`}
                aria-pressed={active}
                className={clsx(
                  "flex h-7 w-7 items-center justify-center rounded-full border transition-transform hover:scale-110",
                  active ? "border-wkai-text" : "border-transparent"
                )}
                style={{ backgroundColor: p.hex }}
              >
                {active && <Check size={13} className="text-white drop-shadow" />}
              </button>
            );
          })}
          {/* custom color */}
          <label
            className="flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-wkai-border"
            title="Custom color"
            style={{ background: "conic-gradient(from 180deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e)" }}
          >
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-8 w-8 cursor-pointer opacity-0"
              aria-label="Custom accent color"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
