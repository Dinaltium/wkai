import { useAppStore } from "../../store";
import { clsx } from "clsx";
import type { SessionAiSettings } from "../../types";

const ITEMS: { key: keyof SessionAiSettings; label: string; hint: string }[] = [
  {
    key: "aiGuideBlocksEnabled",
    label: "Guide summarization",
    hint: "Screen → AI → guide blocks (~1 API call/25s)",
  },
  {
    key: "aiTranscriptionEnabled",
    label: "Audio transcription",
    hint: "Mic → Whisper (1 API call per audio chunk)",
  },
  {
    key: "saveLocalRecording",
    label: "Auto-save recording",
    hint: "Writes the live stream to disk",
  },
];

/**
 * Session-scoped overrides of the AI/recording toggles in global Settings.
 * Starts equal to the global default (see initSessionAiSettings, seeded once
 * when the session starts) but flipping one here only affects this session —
 * it never writes back to `settings`.
 */
export function SessionAiSettingsPanel() {
  const sessionAiSettings = useAppStore((s) => s.sessionAiSettings);
  const setSessionAiSettings = useAppStore((s) => s.setSessionAiSettings);

  // Not seeded yet (session just mounted) — render nothing rather than a
  // panel that would toggle the wrong (uninitialized) state.
  if (!sessionAiSettings) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
        AI &amp; Recording
      </p>
      {ITEMS.map((item) => {
        const on = sessionAiSettings[item.key];
        return (
          <div key={item.key} className="flex items-center justify-between p-1">
            <div className="flex flex-col gap-0.5 pr-2">
              <span className="text-sm font-medium text-wkai-text">{item.label}</span>
              <span className="text-[10px] text-wkai-text-dim">{item.hint}</span>
            </div>
            <button
              onClick={() =>
                setSessionAiSettings({ [item.key]: !on } as Partial<SessionAiSettings>)
              }
              className={clsx(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                on ? "bg-accent" : "bg-wkai-surface border border-wkai-border"
              )}
            >
              <span
                className={clsx(
                  "pointer-events-none block h-3.5 w-3.5 rounded-full bg-white shadow-lg ring-0 transition-transform",
                  on ? "translate-x-[18px]" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        );
      })}
      <p className="text-[10px] text-wkai-text-dim pt-1">
        Session-only — doesn't change your Settings defaults.
      </p>
    </div>
  );
}
