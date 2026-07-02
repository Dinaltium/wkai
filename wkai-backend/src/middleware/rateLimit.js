// Zero-dependency in-memory rate limiter.
//
// Fixed-window per-key counter. Intended for a single backend instance (which is
// what WKAI runs today). If/when the backend is horizontally scaled, this should
// be swapped for a Redis-backed limiter so the window is shared across instances.

const buckets = new Map(); // key -> { count, resetAt }

// Periodically evict expired buckets so the Map does not grow unbounded.
const SWEEP_INTERVAL_MS = 60_000;
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
sweeper.unref?.(); // don't keep the process alive just for the sweeper

function clientIp(req) {
  // Render/most proxies set x-forwarded-for; take the first hop.
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) return fwd.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

/**
 * Build an Express middleware that allows `max` requests per `windowMs` per key.
 *
 * @param {object}   opts
 * @param {number}   opts.windowMs  Window length in milliseconds.
 * @param {number}   opts.max       Max requests allowed per window per key.
 * @param {string}   [opts.name]    Label used in the 429 message.
 * @param {(req)=>string} [opts.keyGenerator]  Defaults to client IP.
 */
export function rateLimit({ windowMs, max, name = "requests", keyGenerator = clientIp }) {
  return function rateLimitMiddleware(req, res, next) {
    const key = `${name}:${keyGenerator(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({
        error: `Too many ${name}. Try again in ${retryAfterSec}s.`,
      });
    }

    next();
  };
}
