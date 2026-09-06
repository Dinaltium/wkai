import { useEffect, useState } from "react";

function format(totalSeconds: number) {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Elapsed time since the session started. Derived from the session's own
 * timestamp on every tick rather than counted up in state, so it stays correct
 * after the app sleeps, the window is hidden, or the page reloads.
 */
export function SessionClock({ startedAt }: { startedAt: string }) {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (Number.isNaN(start)) return null;

  return (
    <span className="font-mono tabular-nums" title="Time since this session started">
      {format(Math.floor((now - start) / 1000))}
    </span>
  );
}
