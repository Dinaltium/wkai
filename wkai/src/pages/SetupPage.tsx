import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, FolderOpen, Loader2, Play } from "lucide-react";
import { useAppStore } from "../store";
import { createSession, watchFolder, listWatchedFiles } from "../lib/tauri";
import type { Workspace } from "../types";

export function SetupPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, setSession, setWatchedFiles, resetSessionState, addDebugLog } =
    useAppStore();

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

  const canStart = settings.instructorName.trim().length > 0 && workshopTitle.trim().length > 0;

  async function handleStart() {
    if (!canStart || loading) return;

    setLoading(true);
    setError(null);

    try {
      // Clear any leftover state from a previous session in this app instance
      // so the new room starts clean.
      resetSessionState();

      const session = await createSession(
        settings.instructorName,
        workshopTitle,
        settings.backendUrl,
        sessionPassword.trim() || undefined,
        workspaceName.trim() || undefined
      );
      setSession(session);
      addDebugLog(`Session ${session.roomCode} created`, "success");

      if (settings.watchFolder) {
        await watchFolder(settings.watchFolder).catch(() => {
          // Non-fatal — folder watch is optional
        });
        const files = await listWatchedFiles(settings.watchFolder).catch(() => []);
        setWatchedFiles(files);
      }

      navigate("/session");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(
        /fetch|network|Failed to fetch|ECONNREFUSED/i.test(detail)
          ? "Could not reach the WKAI backend. Check your connection, then try again."
          : detail
      );
      addDebugLog(`Could not start the session: ${detail}`, "error");
    } finally {
      setLoading(false);
    }
  }

  async function browseFolder() {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select the folder to share files from",
    });
    if (typeof selected === "string") updateSettings({ watchFolder: selected });
  }

  return (
    <div className="min-h-full px-6 py-8">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold text-wkai-text">Start a workshop</h1>
          <p className="max-w-[60ch] text-sm leading-relaxed text-wkai-text-dim">
            Nothing is captured until you pick a screen on the next page. Starting a session only
            creates the room your students join.
          </p>
        </div>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleStart();
          }}
        >
          <div className="card space-y-4">
            <Field label="Your name" hint="Students see this next to the workshop title.">
              <input
                className="input"
                placeholder="e.g. Priya Nair"
                value={settings.instructorName}
                onChange={(e) => updateSettings({ instructorName: e.target.value })}
                autoComplete="name"
              />
            </Field>

            <Field label="Workshop title">
              <input
                className="input"
                placeholder="e.g. Data cleaning with pandas"
                value={workshopTitle}
                onChange={(e) => setWorkshopTitle(e.target.value)}
              />
            </Field>
          </div>

          <div className="card space-y-4">
            <p className="panel-label">Optional</p>

            <Field
              label="Workspace"
              hint="Sessions in the same workspace share memory: what you taught earlier is available to the AI now. Pick an existing folder or type a new name."
            >
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
            </Field>

            <Field label="Session password" hint="Leave empty to let anyone with the room code join.">
              <input
                className="input"
                type="password"
                placeholder="Required from students on join"
                value={sessionPassword}
                onChange={(e) => setSessionPassword(e.target.value)}
                maxLength={128}
              />
            </Field>

            <Field
              label="File share folder"
              hint="Anything you drop in this folder is offered to students during the session. You can also change this later from the Files tab."
            >
              <div className="flex gap-2">
                <input
                  className="input flex-1 font-mono text-xs"
                  placeholder="C:\\Users\\you\\workshop-files"
                  value={settings.watchFolder}
                  onChange={(e) => updateSettings({ watchFolder: e.target.value })}
                />
                <button type="button" className="btn-secondary shrink-0" onClick={() => void browseFolder()}>
                  <FolderOpen size={15} />
                  Browse
                </button>
              </div>
            </Field>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm leading-relaxed text-danger"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              {error}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button className="btn-primary h-11 px-5" type="submit" disabled={!canStart || loading}>
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
              {loading ? "Creating the room…" : "Start session"}
            </button>
            {!canStart && (
              <span className="text-xs text-wkai-text-dim">
                Add your name and a workshop title to continue.
              </span>
            )}
          </div>
        </form>
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
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-wkai-text">{label}</span>
      {children}
      {hint && <span className="block max-w-[70ch] text-xs leading-relaxed text-wkai-text-dim">{hint}</span>}
    </label>
  );
}
