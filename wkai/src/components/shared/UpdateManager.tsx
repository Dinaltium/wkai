import { useEffect, useMemo, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { open } from "@tauri-apps/plugin-shell";

/** Hourly check interval while app stays open */
const CHECK_INTERVAL_MS = 1000 * 60 * 60;

type UpdateStatus = "idle" | "available" | "downloading" | "done" | "installError";

const DISMISSED_UPDATE_KEY = "wkai_dismissed_update_version";
const RELEASES_API_URL = "https://api.github.com/repos/Dinaltium/wkai/releases/latest";
const RELEASES_PAGE_URL = "https://github.com/Dinaltium/wkai/releases/latest";

function parseVersionParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(".")
    .map((part) => {
      const n = Number(part);
      return Number.isFinite(n) ? n : 0;
    });
}

function isVersionGreater(nextVersion: string, currentVersion: string): boolean {
  const next = parseVersionParts(nextVersion);
  const current = parseVersionParts(currentVersion);
  const maxLen = Math.max(next.length, current.length);
  for (let i = 0; i < maxLen; i += 1) {
    const a = next[i] ?? 0;
    const b = current[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

export function UpdateManager() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [installErrorText, setInstallErrorText] = useState<string | null>(null);
  const [manualUpdateMode, setManualUpdateMode] = useState(false);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() =>
    localStorage.getItem(DISMISSED_UPDATE_KEY)
  );

  const visible = useMemo(() => {
    if (status === "available" && latestVersion && dismissedVersion === latestVersion) {
      return false;
    }
    return status === "available" || status === "downloading" || status === "done" || status === "installError";
  }, [status, latestVersion, dismissedVersion]);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    let cancelled = false;
    let currentVersion = "";

    async function checkGitHubFallback() {
      try {
        if (!currentVersion) currentVersion = await getVersion();
        const response = await fetch(RELEASES_API_URL, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!response.ok) return false;
        const data = (await response.json()) as { tag_name?: string };
        const tagVersion = String(data.tag_name ?? "").replace(/^v/i, "");
        if (!tagVersion) return false;
        if (!isVersionGreater(tagVersion, currentVersion)) return false;
        if (cancelled) return true;
        setManualUpdateMode(true);
        setLatestVersion(tagVersion);
        setStatus("available");
        return true;
      } catch {
        return false;
      }
    }

    async function runCheck() {
      try {
        setManualUpdateMode(false);
        const update = await check();
        if (cancelled) return;

        if (!update) {
          const hasFallback = await checkGitHubFallback();
          if (cancelled) return;
          if (!hasFallback) {
            setStatus("idle");
          }
          return;
        }

        if (!update.version) {
          const hasFallback = await checkGitHubFallback();
          if (!hasFallback) setStatus("idle");
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
        const hasFallback = await checkGitHubFallback();
        if (!hasFallback) {
          if (import.meta.env.DEV) {
            console.warn("[WKAI updater] check failed:", err);
          }
          setStatus("idle");
        }
      }
    }

    void runCheck();
    const timer = window.setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function handleUpdateNow() {
    if (manualUpdateMode) {
      try {
        await open(RELEASES_PAGE_URL);
      } catch {
        window.open(RELEASES_PAGE_URL, "_blank");
      }
      return;
    }
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
          {manualUpdateMode && (
            <p className="text-xs text-amber-300">
              Auto-install metadata is missing for this release. Selecting Update now will open the release page.
            </p>
          )}
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
