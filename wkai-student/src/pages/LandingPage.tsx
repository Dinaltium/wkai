import { Link } from "react-router-dom";

export function LandingPage() {
  return (
    <div className="min-h-full bg-wkai-bg text-wkai-text">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-6 py-16">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center">
              <img src="/wkai-logo.svg" alt="WKAI Logo" className="h-10 w-10 object-contain" />
            </div>
            <div>
              <p className="text-sm font-semibold">WKAI</p>
              <p className="text-xs text-wkai-text-dim">Workshop AI Platform</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link className="btn-ghost text-xs" to="/join">
              Join as Student
            </Link>
            <Link className="btn-primary text-xs" to="/download">
              Download App
            </Link>
          </div>
        </header>

        <main className="mt-20 grid gap-8 md:grid-cols-2">
          <section className="space-y-5">
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-400">Live Workshops</p>
            <h1 className="text-4xl font-bold leading-tight">
              Run secure coding workshops with real-time AI support.
            </h1>
            <p className="text-sm text-wkai-text-dim">
              Instructors share live sessions from the desktop app. Students join securely
              from browser with room code, password, and signed access token.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary" to="/download">
                Download Desktop App
              </Link>
              <Link className="btn-ghost" to="/join">
                Join Session
              </Link>
            </div>
          </section>

          <section className="rounded-2xl border border-wkai-border bg-wkai-surface p-6">
            <h2 className="text-sm font-semibold">How it works</h2>
            <ol className="mt-4 space-y-3 text-xs text-wkai-text-dim">
              <li>1. Instructor downloads WKAI and starts a workshop session.</li>
              <li>2. Students receive room code + session password.</li>
              <li>3. Student receives a signed join token after verification.</li>
              <li>4. Live stream and AI guidance are delivered in real time.</li>
            </ol>
          </section>
        </main>
      </div>
    </div>
  );
}
