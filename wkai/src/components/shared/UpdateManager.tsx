import { useEffect, useMemo, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";

type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "done" | "error";
const DISMISSED_UPDATE_KEY = "wkai_dismissed_update_version";

export function UpdateManager() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_UPDATE_KEY)
  );

  const visible = useMemo(() => {
    if (status === "available" && latestVersion && dismissedVersion === latestVersion) {
      return false;
    }
    return status === "available" || status === "downloading" || status === "done" || status === "error";
  }, [status, latestVersion, dismissedVersion]);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let cancelled = false;

    async function runCheck() {
      try {
        setStatus("checking");
        const update = await check();
        if (cancelled) return;

        if (!update) {
          setStatus("idle");
          return;
        }

        if (localStorage.getItem(DISMISSED_UPDATE_KEY) !== update.version) {
          localStorage.removeItem(DISMISSED_UPDATE_KEY);
          setDismissedVersion(null);
        }
        setLatestVersion(update.version);
        setStatus("available");
      } catch (err) {
        if (cancelled) return;
        setErrorText(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    }

    void runCheck();
    const timer = window.setInterval(() => {
      void runCheck();
    }, 1000 * 60 * 30);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function handleUpdateNow() {
    try {
      setStatus("downloading");
      const update = await check();
      if (!update) {
        setStatus("idle");
        return;
      }
      await update.downloadAndInstall();
      setStatus("done");
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function handleLater() {
    if (latestVersion) {
      localStorage.setItem(DISMISSED_UPDATE_KEY, latestVersion);
      setDismissedVersion(latestVersion);
    }
    setStatus("idle");
  }

  if (!visible) return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-[360px] rounded-xl border border-wkai-border bg-wkai-surface p-4 shadow-lg">
      {status === "available" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-wkai-text">Update available</h3>
          <p className="text-xs text-wkai-text-dim">
            WKAI {latestVersion ? `v${latestVersion}` : "new version"} is available.
          </p>
          <div className="flex justify-end gap-2">
            <button className="rounded-md border border-wkai-border px-3 py-1.5 text-xs text-wkai-text-dim" onClick={handleLater}>
              Later
            </button>
            <button className="btn-primary !h-auto px-3 py-1.5 text-xs" onClick={handleUpdateNow}>
              Update now
            </button>
          </div>
        </div>
      )}

      {status === "downloading" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-wkai-text">Updating WKAI</h3>
          <p className="text-xs text-wkai-text-dim">
            Downloading and installing update. The app will relaunch automatically.
          </p>
        </div>
      )}

      {status === "done" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-wkai-text">Update installed</h3>
          <p className="text-xs text-wkai-text-dim">Restart WKAI to use the latest version.</p>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-400">Update check failed</h3>
          <p className="text-xs text-wkai-text-dim">{errorText ?? "Unknown updater error."}</p>
          <div className="flex justify-end">
            <button className="rounded-md border border-wkai-border px-3 py-1.5 text-xs text-wkai-text-dim" onClick={() => setStatus("idle")}>
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
