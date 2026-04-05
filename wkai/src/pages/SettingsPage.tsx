import { useAppStore } from "../store";
import { Save } from "lucide-react";
import { useState } from "react";

export function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // Settings are already live in Zustand; this just gives user feedback
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-semibold">Settings</h1>

        {/* Profile */}
        <section className="card space-y-4">
          <h2 className="text-sm font-medium text-wkai-text-dim uppercase tracking-wide">
            Profile
          </h2>
          <Field label="Your Name">
            <input
              className="input"
              value={settings.instructorName}
              onChange={(e) => updateSettings({ instructorName: e.target.value })}
              placeholder="Instructor name shown to students"
            />
          </Field>
        </section>

        {/* AI */}
        <section className="card space-y-4">
          <h2 className="text-sm font-medium text-wkai-text-dim uppercase tracking-wide">
            AI Pipeline
          </h2>
          <Field label="OpenAI API Key">
            <input
              className="input font-mono text-xs"
              type="password"
              value={settings.openaiApiKey}
              onChange={(e) => updateSettings({ openaiApiKey: e.target.value })}
              placeholder="sk-..."
            />
          </Field>
        </section>

        {/* Backend */}
        <section className="card space-y-4">
          <h2 className="text-sm font-medium text-wkai-text-dim uppercase tracking-wide">
            Backend
          </h2>
          <Field label="Backend URL">
            <input
              className="input font-mono text-xs"
              value={settings.backendUrl}
              onChange={(e) => updateSettings({ backendUrl: e.target.value })}
              placeholder="http://localhost:4000"
            />
          </Field>
        </section>

        {/* Capture */}
        <section className="card space-y-4">
          <h2 className="text-sm font-medium text-wkai-text-dim uppercase tracking-wide">
            Capture
          </h2>
          <Field label="Frames per minute" hint="Higher = more AI context, more API cost">
            <select
              className="input"
              value={settings.framesPerMinute}
              onChange={(e) =>
                updateSettings({ framesPerMinute: Number(e.target.value) })
              }
            >
              <option value={2}>2 (every 30s)</option>
              <option value={4}>4 (every 15s)</option>
              <option value={6}>6 (every 10s) — recommended</option>
              <option value={12}>12 (every 5s)</option>
            </select>
          </Field>
          <Field label="Audio capture">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.captureAudio}
                onChange={(e) => updateSettings({ captureAudio: e.target.checked })}
                className="accent-indigo-500"
              />
              <span className="text-sm text-wkai-text">
                Capture microphone audio for transcription
              </span>
            </label>
          </Field>
        </section>

        <button className="btn-primary" onClick={handleSave}>
          <Save size={14} />
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-wkai-text">{label}</label>
      {children}
      {hint && <p className="text-xs text-wkai-text-dim">{hint}</p>}
    </div>
  );
}
