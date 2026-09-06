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
                  "flex h-9 w-9 items-center justify-center rounded-full transition-transform hover:scale-110",
                  "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11",
                  active && "ring-2 ring-wkai-text ring-offset-2 ring-offset-wkai-surface"
                )}
                style={{ backgroundColor: p.hex }}
              >
                {active && <Check size={14} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" />}
              </button>
            );
          })}
          {/* custom color */}
          <label
            className="flex h-9 w-9 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-wkai-border [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
            title="Custom color"
            style={{ background: "conic-gradient(from 180deg, #f43f5e, #f59e0b, #10b981, #3b82f6, #8b5cf6, #f43f5e)" }}
          >
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-12 w-12 cursor-pointer opacity-0"
              aria-label="Custom accent color"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
