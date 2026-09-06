import { Check, FileCode, FileText, Terminal, X } from "lucide-react";

/**
 * Small honest renderings of the four things WKAI actually does. These are
 * static compositions in the app's own component vocabulary, not screenshots —
 * so they stay sharp, follow the theme, and never go stale when the UI moves.
 */

export function GuideVisual() {
  return (
    <div className="card space-y-2 p-3">
      <Row label="Step" tone="bg-accent/15 text-accent-text" time="10:04">
        Create the virtual environment before installing anything.
      </Row>
      <Row label="Code" tone="bg-ok/15 text-ok" time="10:05">
        <span className="font-mono text-xs">python -m venv .venv</span>
      </Row>
      <Row label="Tip" tone="bg-warn/15 text-warn" time="10:07">
        Activate it in every new terminal, or pip installs to the wrong place.
      </Row>
    </div>
  );
}

function Row({
  label,
  tone,
  time,
  children,
}: {
  label: string;
  tone: string;
  time: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-wkai-border bg-wkai-bg p-3">
      <div className="flex items-center gap-2">
        <span className={`badge ${tone}`}>{label}</span>
        <time className="ml-auto text-xs tabular-nums text-wkai-text-dim">{time}</time>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-wkai-text">{children}</p>
    </div>
  );
}

export function ErrorVisual() {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-wkai-border bg-wkai-bg px-3 py-2.5">
        <p className="font-mono text-xs leading-relaxed text-danger">
          ModuleNotFoundError: No module named 'pandas'
        </p>
      </div>
      <div className="space-y-3 p-3">
        <p className="text-sm leading-relaxed text-wkai-text">
          The environment running your script is not the one you installed into. Activate the
          virtual environment first, then reinstall.
        </p>
        <div className="overflow-hidden rounded-lg border border-ok/30 bg-ok/5">
          <div className="flex items-center gap-2 border-b border-ok/20 px-3 py-1.5">
            <Terminal size={12} className="text-ok" />
            <span className="text-xs font-semibold text-ok">Run this</span>
          </div>
          <p className="px-3 py-2 font-mono text-xs text-wkai-text">
            source .venv/bin/activate &amp;&amp; pip install pandas
          </p>
        </div>
      </div>
    </div>
  );
}

export function CheckVisual() {
  const options = [
    { text: "It installs into the active environment", state: "right" as const },
    { text: "It installs system-wide, always", state: "wrong" as const },
    { text: "It only works inside a notebook", state: "idle" as const },
  ];

  return (
    <div className="card p-4">
      <p className="text-sm font-medium leading-relaxed text-wkai-text">
        Where does <span className="font-mono text-[13px]">pip install</span> put a package?
      </p>
      <div className="mt-3 space-y-2">
        {options.map((o) => (
          <div
            key={o.text}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
              o.state === "right"
                ? "border-ok bg-ok/10 text-wkai-text"
                : o.state === "wrong"
                  ? "border-danger bg-danger/10 text-wkai-text"
                  : "border-wkai-border bg-wkai-bg text-wkai-text-dim"
            }`}
          >
            <span className="flex-1 leading-relaxed">{o.text}</span>
            {o.state === "right" && <Check size={15} className="shrink-0 text-ok" />}
            {o.state === "wrong" && <X size={15} className="shrink-0 text-danger" />}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-wkai-text-dim">
        The guide stays locked until the answer is right.
      </p>
    </div>
  );
}

export function RoomVisual() {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-wkai-border px-3 py-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-danger" />
        <span className="text-xs font-medium text-wkai-text">Live screen</span>
        <span className="ml-auto font-mono text-xs tracking-widest text-accent-text">AB12CD</span>
      </div>
      <div className="aspect-[16/9] w-full bg-gradient-to-br from-wkai-surface2 to-wkai-bg" />
      <div className="space-y-2 border-t border-wkai-border p-3">
        {[
          { icon: FileCode, name: "clean.py", meta: "2.1 KB" },
          { icon: FileText, name: "sales.csv", meta: "184 KB" },
        ].map(({ icon: Icon, name, meta }) => (
          <div key={name} className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-wkai-border bg-wkai-bg">
              <Icon size={14} className="text-accent-text" />
            </span>
            <span className="flex-1 truncate text-sm text-wkai-text">{name}</span>
            <span className="text-xs text-wkai-text-dim">{meta}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
