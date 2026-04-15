// Self-ping utility to prevent Render free tier from sleeping.
// Sends GET /health to itself at random intervals between 8-14 minutes.
// Only activates in production (NODE_ENV === "production").

export function startKeepAlive() {
  if (process.env.NODE_ENV !== "production") return;

  const selfUrl =
    process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT ?? 4000}`;

  function scheduleNextPing() {
    const minMs = 8 * 60 * 1000;
    const maxMs = 14 * 60 * 1000;
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;

    setTimeout(async () => {
      try {
        const response = await fetch(`${selfUrl}/health`);
        console.log(`[KeepAlive] ping ${response.status} at ${new Date().toISOString()}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[KeepAlive] ping failed: ${message}`);
      }
      scheduleNextPing();
    }, delay);
  }

  scheduleNextPing();
  console.log("[KeepAlive] Self-ping scheduler started (production mode)");
}
