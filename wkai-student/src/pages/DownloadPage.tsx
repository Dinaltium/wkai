import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Download, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { SettingsFab } from "../components/shared/SettingsFab";

type OsOption = "windows" | "macos" | "linux";

const OS_LABEL: Record<OsOption, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

const DEFAULT_REPO_OWNER = import.meta.env.VITE_GITHUB_REPO_OWNER ?? "Dinaltium";
const DEFAULT_REPO_NAME = import.meta.env.VITE_GITHUB_REPO_NAME ?? "wkai";
const RELEASES_URL = `https://github.com/${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}/releases/latest`;

type Asset = { name: string; browser_download_url: string; size: number };
type Release = { tag_name: string; assets: Asset[] };

// Preferred installer per OS, in order. Linux users on Debian/Ubuntu get the
// .deb; the AppImage is the fallback and is also what the in-app updater uses.
const PREFERENCE: Record<OsOption, string[]> = {
  windows: [".msi", ".exe"],
  macos: [".dmg", ".app.tar.gz"],
  linux: [".deb", ".appimage"],
};

function pickAsset(assets: Asset[], os: OsOption): Asset | undefined {
  for (const ext of PREFERENCE[os]) {
    const hit = assets.find((a) => a.name.toLowerCase().endsWith(ext));
    if (hit) return hit;
  }
  return undefined;
}

function detectOs(): OsOption {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Mac|iPhone|iPad/i.test(ua)) return "macos";
  if (/Linux|Android/i.test(ua)) return "linux";
  return "windows";
}

function formatSize(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DownloadPage() {
  const [os, setOs] = useState<OsOption>(detectOs);
  const [release, setRelease] = useState<Release | null>(null);
  const [error, setError] = useState<string | null>(null);

  const repoLabel = useMemo(() => `${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}`, []);

  // Resolve the latest release once, up front. The download control is then a
  // plain link, so the click is a direct, user-initiated download rather than
  // a script navigation after an await — which browsers may treat as a page
  // load or block as an automatic download.
  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${DEFAULT_REPO_OWNER}/${DEFAULT_REPO_NAME}/releases/latest`,
          { signal: ctrl.signal, headers: { Accept: "application/vnd.github+json" } }
        );
        if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
        const data = await res.json();
        setRelease({ tag_name: data.tag_name, assets: Array.isArray(data.assets) ? data.assets : [] });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Could not reach GitHub.");
      }
    })();
    return () => ctrl.abort();
  }, []);

  const asset = release ? pickAsset(release.assets, os) : undefined;

  return (
    <div className="flex min-h-full items-center justify-center bg-wkai-bg px-4 py-10 sm:py-16">
      <div className="w-full max-w-lg">
        <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-wkai-text-dim transition-colors hover:text-wkai-text">
          <ArrowLeft size={13} /> Back
        </Link>

        <div className="rounded-2xl border border-wkai-border bg-wkai-surface p-5 sm:p-6">
          <h1 className="text-xl font-semibold text-wkai-text">Download WKAI Desktop</h1>
          <p className="mt-2 text-sm leading-relaxed text-wkai-text-dim">
            The instructor app. Students don't need it — joining a room from the browser is enough.
          </p>

          <div className="mt-5 seg" role="radiogroup" aria-label="Operating system">
            {(Object.keys(OS_LABEL) as OsOption[]).map((value) => (
              <button
                key={value}
                role="radio"
                aria-checked={value === os}
                className={clsx("seg-item", value === os && "seg-item-active")}
                onClick={() => setOs(value)}
              >
                {OS_LABEL[value]}
              </button>
            ))}
          </div>

          {!release && !error && (
            <button className="btn-primary mt-4 w-full" disabled>
              <Loader2 size={15} className="animate-spin" /> Finding the latest build…
            </button>
          )}

          {release && asset && (
            <a className="btn-primary mt-4 w-full" href={asset.browser_download_url} download={asset.name} rel="noopener">
              <Download size={15} /> Download for {OS_LABEL[os]}
            </a>
          )}

          {release && !asset && (
            <a className="btn-primary mt-4 w-full" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
              <Download size={15} /> No {OS_LABEL[os]} build yet — see all releases
            </a>
          )}

          {error && (
            <>
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger">
                <AlertCircle size={14} className="mt-px shrink-0" />
                {error}
              </p>
              <a className="btn-primary mt-3 w-full" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
                <Download size={15} /> Open the releases page
              </a>
            </>
          )}

          <p className="mt-4 text-xs text-wkai-text-dim">
            {release && asset
              ? <>{release.tag_name} · {asset.name} · {formatSize(asset.size)}</>
              : <>Builds come from GitHub Releases · {repoLabel}</>}
          </p>
        </div>
      </div>

      <SettingsFab />
    </div>
  );
}
