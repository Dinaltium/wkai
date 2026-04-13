import { useAppStore } from "../store";
import { Save, Network } from "lucide-react";
import { useEffect, useState } from "react";

export function SettingsPage() {
  const { settings, updateSettings } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<{
    localIp: string | null;
    studentUrl: string | null;
  } | null>(null);

  useEffect(() => {
    fetch(`${settings.backendUrl}/api/network-info`)
      .then((r) => r.json())
      .then(setNetworkInfo)
      .catch(() => setNetworkInfo(null));
  }, [settings.backendUrl]);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="h-full overflow-auto p-8">
      <div className="mx-auto max-w-lg space-y-6">
        <h1 className="text-xl font-semibold">Settings</h1>

        {/* Profile */}
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
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

        {/* Backend */}
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
            Backend
          </h2>
          <Field label="Backend URL" hint="Where your Node.js server is running">
            <input
              className="input font-mono text-xs"
              value={settings.backendUrl}
              onChange={(e) => updateSettings({ backendUrl: e.target.value })}
              placeholder="http://localhost:4000"
            />
          </Field>
        </section>

        {/* Network Info */}
        {networkInfo?.localIp && (
          <section className="card space-y-3 p-4">
            <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              Network
            </h2>
            <div className="rounded-lg bg-wkai-bg border border-wkai-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Network size={12} className="text-indigo-400" />
                  <span className="text-xs text-wkai-text-dim">Instructor IP</span>
                </div>
                <span className="font-mono text-xs text-indigo-400">{networkInfo.localIp}</span>
              </div>
              {networkInfo.studentUrl && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-wkai-text-dim pl-5">Student URL</span>
                  <span className="font-mono text-xs text-emerald-400">{networkInfo.studentUrl}</span>
                </div>
              )}
            </div>
            <p className="text-xs text-wkai-text-dim">
              Share the Student URL with participants. All devices must be on the same network.
            </p>
          </section>
        )}

        {/* AI */}
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
            AI — Groq
          </h2>
          <Field
            label="Groq API Key"
            hint="Get yours free at console.groq.com — no credit card needed"
          >
            <input
              className="input font-mono text-xs"
              type="password"
              value={settings.groqApiKey}
              onChange={(e) => updateSettings({ groqApiKey: e.target.value })}
              placeholder="gsk_..."
            />
          </Field>
        </section>

        {/* Capture */}
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
            Capture
          </h2>
          <Field
            label="Frames per minute"
            hint="Higher = more AI context, more Groq API usage"
          >
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
                Capture microphone audio for Whisper transcription
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