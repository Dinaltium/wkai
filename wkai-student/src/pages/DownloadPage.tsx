import { useMemo, useState } from "react";
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

function matchesOs(name: string, os: OsOption) {
  const lower = name.toLowerCase();
  if (os === "windows") return lower.endsWith(".msi") || lower.endsWith(".exe");
  if (os === "macos") return lower.endsWith(".dmg") || lower.endsWith(".app.tar.gz");
  return lower.endsWith(".appimage") || lower.endsWith(".deb");
}

function detectOs(): OsOption {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/Mac|iPhone|iPad/i.test(ua)) return "macos";
  if (/Linux|Android/i.test(ua)) return "linux";
  return "windows";
}

export function DownloadPage() {
  const [os, setOs] = useState<OsOption>(detectOs);
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
        throw new Error(`GitHub returned ${res.status}. Try again in a moment.`);
      }
      const release = await res.json();
      const assets = Array.isArray(release.assets) ? release.assets : [];
      const target = assets.find((asset: { name: string }) => matchesOs(asset.name, os));
      if (!target?.browser_download_url) {
        throw new Error(`The latest release has no ${OS_LABEL[os]} build yet.`);
      }
      window.location.href = target.browser_download_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

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

          <button className="btn-primary mt-4 w-full" onClick={handleDownload} disabled={loading}>
            {loading
              ? <><Loader2 size={15} className="animate-spin" /> Finding the latest build…</>
              : <><Download size={15} /> Download for {OS_LABEL[os]}</>
            }
          </button>

          {error && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs leading-relaxed text-danger">
              <AlertCircle size={14} className="mt-px shrink-0" />
              {error}
            </p>
          )}

          <p className="mt-4 text-xs text-wkai-text-dim">
            Builds come from GitHub Releases · {repoLabel}
          </p>
        </div>
      </div>

      <SettingsFab />
    </div>
  );
}
