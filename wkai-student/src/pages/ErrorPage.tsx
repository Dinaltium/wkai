import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { ArrowRight, RefreshCw, RotateCcw } from "lucide-react";
import { SettingsFab } from "../components/shared/SettingsFab";

interface Props {
  /** Render the not-found copy without a thrown router error (the `*` route). */
  notFound?: boolean;
}

/**
 * One page for every way the app can fail: a bad URL, a render crash, or a
 * stale chunk after a deploy. Each case gets copy that says what happened and
 * an action that actually resolves it, rather than a shared "oops".
 */
export function ErrorPage({ notFound = false }: Props) {
  const error = useRouteError();

  const status = isRouteErrorResponse(error) ? error.status : notFound ? 404 : 500;
  const detail =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? error.statusText || String(error.data ?? "")
        : "";

  // A failed dynamic import almost always means the tab is running a build that
  // no longer exists on the server. Reloading is the fix, so say so.
  const isStaleBuild =
    /dynamically imported module|Importing a module script failed|ChunkLoadError|Failed to fetch/i.test(detail);

  const view = notFound || status === 404
    ? {
        code: "404",
        title: "That page isn't here",
        body: "Workshops aren't reached by link — you join one with the six-character code your instructor reads out.",
      }
    : isStaleBuild
      ? {
          code: "STALE",
          title: "This tab is running an old version",
          body: "WKAI was updated while you had the page open. A reload pulls the current version; nothing you did is lost.",
        }
      : {
          code: String(status),
          title: "Something broke on this page",
          body: "The error is on our side, not yours. Reload to try again — if you were in a workshop, your room code still works.",
        };

  return (
    <div className="flex min-h-full items-center justify-center bg-wkai-bg px-5 py-16">
      <div className="w-full max-w-lg">
        <p className="display text-5xl text-wkai-text-dim/60 sm:text-6xl">{view.code}</p>

        <h1 className="display mt-4 text-2xl text-wkai-text sm:text-3xl">{view.title}</h1>

        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-wkai-text-dim">{view.body}</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          {view.code === "404" ? (
            <Link className="btn-primary" to="/join">
              Join with a code <ArrowRight size={16} />
            </Link>
          ) : (
            <button className="btn-primary" onClick={() => window.location.reload()}>
              <RefreshCw size={16} /> Reload the page
            </button>
          )}
          <Link className="btn-outline" to="/">
            <RotateCcw size={15} /> Back to the start
          </Link>
        </div>

        {detail && (
          <details className="mt-10 border-t border-wkai-border pt-5">
            <summary className="cursor-pointer text-sm text-wkai-text-dim marker:content-['']">
              Technical detail (useful if you are reporting this)
            </summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-wkai-border bg-wkai-surface p-3 font-mono text-xs leading-relaxed text-wkai-text-dim">
              {detail}
            </pre>
          </details>
        )}
      </div>

      <SettingsFab />
    </div>
  );
}
