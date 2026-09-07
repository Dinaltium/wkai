import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../../store";
import { check } from "@tauri-apps/plugin-updater";

/** Hourly check interval while app stays open */
const CHECK_INTERVAL_MS = 1000 * 60 * 60;

type UpdateStatus =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "done"
  | "installError";

/** Fired by Settings → "Check for updates". */
export const CHECK_FOR_UPDATES_EVENT = "wkai:check-for-updates";

const DISMISSED_UPDATE_KEY = "wkai_dismissed_update_version";

export function UpdateManager() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [installErrorText, setInstallErrorText] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_UPDATE_KEY)
  );

  const visible = useMemo(() => {
    if (status === "available" && latestVersion && dismissedVersion === latestVersion) {
      return false;
    }
    return (
      status === "available" ||
      status === "checking" ||
      status === "upToDate" ||
      status === "downloading" ||
      status === "done" ||
      status === "installError"
    );
  }, [status, latestVersion, dismissedVersion]);

  // `manual` is what the instructor pressed a button for: it deserves an
  // answer either way ("up to date", or the actual failure). A background poll
  // stays quiet unless there is genuinely something to install — but it no
  // longer swallows failures silently, which is how a published release could
  // sit on GitHub for weeks with the app insisting it was current.
  const runCheck = useCallback(async (manual: boolean) => {
    if (manual) setStatus("checking");
    try {
      const update = await check();

      if (!update || !update.version) {
        setStatus(manual ? "upToDate" : "idle");
        return;
      }

      if (localStorage.getItem(DISMISSED_UPDATE_KEY) !== update.version) {
        localStorage.removeItem(DISMISSED_UPDATE_KEY);
        setDismissedVersion(null);
      }
      setLatestVersion(update.version);
      setStatus("available");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.warn("[WKAI updater] check failed:", errMsg);
      useAppStore.getState().addDebugLog(`Update check failed: ${errMsg}`, "warn");
      if (manual || /latest\.json|updater|signature|metadata/i.test(errMsg)) {
        setInstallErrorText(
          /latest\.json|metadata|404/i.test(errMsg)
            ? `No update metadata was found for this release (${errMsg}). The release needs a signed latest.json artifact before in-app updates can work.`
            : errMsg
        );
        setStatus("installError");
      } else {
        setStatus("idle");
      }
    }
  }, []);

  useEffect(() => {
    // A manual check still works in dev; only the hourly poll is skipped, so a
    // dev build does not hammer the release endpoint.
    const onManual = () => void runCheck(true);
    window.addEventListener(CHECK_FOR_UPDATES_EVENT, onManual);

    if (import.meta.env.DEV) {
      return () => window.removeEventListener(CHECK_FOR_UPDATES_EVENT, onManual);
    }

    void runCheck(false);
    const timer = window.setInterval(() => {
      void runCheck(false);
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(CHECK_FOR_UPDATES_EVENT, onManual);
    };
  }, [runCheck]);

  async function handleUpdateNow() {
    try {
      setInstallErrorText(null);
      setStatus("downloading");
      const update = await check();
      if (!update) {
        setStatus("idle");
        return;
      }
      await update.downloadAndInstall();
      setStatus("done");
    } catch (err) {
      setInstallErrorText(err instanceof Error ? err.message : String(err));
      setStatus("installError");
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

      {status === "checking" && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-wkai-text">Checking for updates…</h3>
        </div>
      )}

      {status === "upToDate" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-wkai-text">WKAI is up to date</h3>
          <div className="flex justify-end">
            <button
              className="rounded-md border border-wkai-border px-3 py-1.5 text-xs text-wkai-text-dim"
              onClick={() => setStatus("idle")}
            >
              Close
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

      {status === "installError" && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-red-400">Update failed</h3>
          <p className="text-xs text-wkai-text-dim">{installErrorText ?? "Could not install update."}</p>
          <div className="flex justify-end gap-2">
            <button className="rounded-md border border-wkai-border px-3 py-1.5 text-xs text-wkai-text-dim" onClick={() => setStatus("idle")}>
              Dismiss
            </button>
            <button className="btn-primary !h-auto px-3 py-1.5 text-xs" onClick={handleUpdateNow}>
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
