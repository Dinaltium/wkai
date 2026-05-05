import { useAppStore } from "../store";
import { Save, Network } from "lucide-react";
import { useEffect, useState } from "react";
import { MicTest } from "../components/instructor/MicTest";
import { AITest } from "../components/instructor/AITest";

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

        {/* Recording */}
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
            Recording
          </h2>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-medium">Save to system</p>
              <p className="text-[10px] text-wkai-text-dim">Simultaneously save recordings to your local drive</p>
            </div>
            <input
              type="checkbox"
              className="w-4 h-4 rounded border-wkai-border bg-wkai-surface text-indigo-500 focus:ring-indigo-500"
              checked={settings.saveLocalRecording}
              onChange={(e) => updateSettings({ saveLocalRecording: e.target.checked })}
            />
          </div>

          {settings.saveLocalRecording && (
            <Field label="Save Location">
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-xs"
                  readOnly
                  value={settings.recordingDirectory || "No location selected"}
                />
                <button 
                  className="btn-secondary whitespace-nowrap text-xs py-1"
                  onClick={async () => {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const selected = await open({
                      directory: true,
                      multiple: false,
                      title: "Select Recording Directory"
                    });
                    if (typeof selected === "string") {
                      updateSettings({ recordingDirectory: selected });
                    }
                  }}
                >
                  Pick Folder
                </button>
              </div>
            </Field>
          )}
        </section>

        <section className="card space-y-5 p-4">
          <h2 className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
            Testing
          </h2>
          <MicTest />
          <div className="border-t border-wkai-border pt-4">
            <AITest />
          </div>
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