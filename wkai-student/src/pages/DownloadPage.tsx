import { useMemo, useState } from "react";

type OsOption = "windows" | "macos" | "linux";

const DEFAULT_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER ?? "Dinaltium";
const DEFAULT_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME ?? "wkai";

function matchesOs(name: string, os: OsOption) {
  const lower = name.toLowerCase();
  if (os === "windows") return lower.endsWith(".msi") || lower.endsWith(".exe");
  if (os === "macos") return lower.endsWith(".dmg") || lower.endsWith(".app.tar.gz");
  return lower.endsWith(".appimage") || lower.endsWith(".deb");
}

export function DownloadPage() {
  const [os, setOs] = useState<OsOption>("windows");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const repoLabel = useMemo(() => `${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}`, []);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}/releases/latest`
      );
      if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status}`);
      }
      const release = await res.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const target = assets.find((asset: { name: string }) => matchesOs(asset.name, os));
      if (!target?.browser_download_url) {
        throw new Error(`No ${os} build found in latest release assets`);
      }
      window.location.href = target.browser_download_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-wkai-bg px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-wkai-border bg-wkai-surface p-6">
        <h1 className="text-xl font-semibold text-wkai-text">Download WKAI Desktop</h1>
        <p className="mt-2 text-sm text-wkai-text-dim">
          Select your OS and download the latest build from GitHub Releases.
        </p>
        <p className="mt-1 text-xs text-wkai-text-dim">Source: {repoLabel}</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {(["windows", "macos", "linux"] as const).map((value) => (
            <button
              key={value}
              className={value === os ? "btn-primary justify-center" : "btn-ghost justify-center"}
              onClick={() => setOs(value)}
            >
              {value}
            </button>
          ))}
        </div>

        <button className="btn-primary mt-5 w-full justify-center" onClick={handleDownload} disabled={loading}>
          {loading ? "Fetching latest build..." : `Download for ${os}`}
        </button>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
