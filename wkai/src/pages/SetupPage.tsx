import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, AlertCircle } from "lucide-react";
import { useAppStore } from "../store";
import { createSession, watchFolder, listWatchedFiles } from "../lib/tauri";
import type { Workspace } from "../types";

export function SetupPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, setSession, setWatchedFiles, resetSessionState } = useAppStore();

  const [workshopTitle, setWorkshopTitle] = useState("");
  const [sessionPassword, setSessionPassword] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Existing folders, so a returning instructor picks last week's course rather
  // than retyping (and misspelling) its name into a brand-new one.
  useEffect(() => {
    fetch(`${settings.backendUrl}/api/workspaces`)
      .then((r) => r.json())
      .then((d) => setWorkspaces(d.workspaces ?? []))
      .catch(() => setWorkspaces([]));
  }, [settings.backendUrl]);

  async function handleStart() {
    if (!settings.instructorName.trim()) {
      setError("Please enter your name in Settings first.");
      return;
    }
    if (!workshopTitle.trim()) {
      setError("Please enter a workshop title.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Clear any leftover state from a previous session in this app instance
      // (sharing toggle, guide, students, recording) so the new room starts clean.
      resetSessionState();

      // 1. Create session — registers with backend, returns room code
      const session = await createSession(
        settings.instructorName,
        workshopTitle,
        settings.backendUrl,
        sessionPassword.trim() || undefined,
        workspaceName.trim() || undefined
      );
      setSession(session);

      // 2. Watch folder and pre-load file list (if configured)
      if (settings.watchFolder) {
        await watchFolder(settings.watchFolder).catch(() => {
          // Non-fatal — folder watch is optional
        });
        const files = await listWatchedFiles(settings.watchFolder).catch(() => []);
        setWatchedFiles(files);
      }

      navigate("/session");
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-wkai-text">
            Start a Workshop
          </h1>
          <p className="text-sm text-wkai-text-dim">
            WKAI will silently monitor your session and generate live guides for
            students.
          </p>
        </div>

        {/* Form */}
        <div className="card space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              Instructor
            </label>
            <input
              className="input"
              placeholder="Your name"
              value={settings.instructorName}
              onChange={(e) => updateSettings({ instructorName: e.target.value })}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              Workshop Title
            </label>
            <input
              className="input"
              placeholder="e.g. Introduction to React Hooks"
              value={workshopTitle}
              onChange={(e) => setWorkshopTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              Workspace <span className="normal-case text-wkai-text-dim/60">(optional)</span>
            </label>
            <input
              className="input"
              list="wkai-workspaces"
              placeholder="e.g. Blockchain Bootcamp — Batch 3"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              maxLength={120}
            />
            <datalist id="wkai-workspaces">
              {workspaces.map((w) => (
                <option key={w.id} value={w.name}>
                  {w.sessionCount ? `${w.sessionCount} session(s)` : "new"}
                </option>
              ))}
            </datalist>
            <p className="text-xs text-wkai-text-dim">
              Sessions in the same workspace share their memory: what you taught in
              earlier sessions is available to the AI in this one. Pick an existing
              folder or type a new name.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              Session Password <span className="normal-case text-wkai-text-dim/60">(optional)</span>
            </label>
            <input
              className="input"
              type="password"
              placeholder="Protect student join with a password"
              value={sessionPassword}
              onChange={(e) => setSessionPassword(e.target.value)}
              maxLength={128}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-wkai-text-dim uppercase tracking-wide">
              File Share Folder{" "}
              <span className="normal-case text-wkai-text-dim/60">(optional)</span>
            </label>
            <div className="flex gap-2">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="/home/rafan/workshop-files"
                value={settings.watchFolder}
                onChange={(e) => updateSettings({ watchFolder: e.target.value })}
              />
              <button
                type="button"
                className="btn-secondary whitespace-nowrap text-xs py-1"
                onClick={async () => {
                  const { open } = await import("@tauri-apps/plugin-dialog");
                  const selected = await open({
                    directory: true,
                    multiple: false,
                    title: "Select File Share Folder"
                  });
                  if (typeof selected === "string") {
                    updateSettings({ watchFolder: selected });
                  }
                }}
              >
                Browse
              </button>
            </div>
            <p className="text-xs text-wkai-text-dim">
              You can now manage folder path, file upload, and URL upload from the right-side explorer during live session.
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* CTA */}
        <button
          className="btn-primary w-full justify-center py-2.5"
          onClick={handleStart}
          disabled={loading}
        >
          <Play size={15} />
          {loading ? "Starting…" : "Start Session"}
        </button>

        <p className="text-center text-xs text-wkai-text-dim">
          The app will move to your system tray. Students join with the room
          code.
        </p>
      </div>
    </div>
  );
}