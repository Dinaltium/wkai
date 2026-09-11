/**
 * Reading Groq's failures.
 *
 * Kept apart from groqClient.js because that module instantiates a client at
 * import time and throws without an API key — which would put these, the only
 * unit-testable part of the error handling, out of reach of the test suite.
 */
/**
 * A 429 that will still be a 429 in twenty minutes.
 *
 * Groq's per-minute limits clear on their own and are worth a backoff. The
 * daily token allowance is not: it comes back with `retry-after: 1235`, and
 * the three retries here — multiplied by LangChain's own, and again by the
 * OutputFixingParser repair call — turned one exhausted quota into seven
 * requests that could not have succeeded. Worse, the failure surfaced as a
 * generic "AI frame analysis failed" after ~15s of backoff, which reads as a
 * broken pipeline rather than a spent budget.
 */
export function isQuotaExhausted(err) {
  const status = err?.status ?? err?.response?.status;
  if (status !== 429) return false;
  const msg = String(err?.error?.error?.message ?? err?.message ?? "").toLowerCase();
  if (msg.includes("per day") || msg.includes("(tpd)") || msg.includes("(rpd)")) return true;
  const retryAfter = Number(err?.headers?.["retry-after"]);
  return Number.isFinite(retryAfter) && retryAfter > 120;
}

/**
 * A 429 that says the request itself is too big.
 *
 * Groq checks max_tokens against the per-minute output ceiling before it runs
 * anything, and answers "Request too large … reduce max_tokens" with
 * `x-should-retry: false`. Waiting changes nothing — the identical request will
 * be too large next time too. Retrying it only delays the real fix, which is a
 * smaller max_tokens.
 */
export function isRequestTooLarge(err) {
  const msg = String(err?.error?.error?.message ?? err?.message ?? "").toLowerCase();
  return msg.includes("request too large") || msg.includes("reduce max_tokens");
}

/** How long until the quota is worth trying again, in whole minutes. */
export function quotaRetryMinutes(err) {
  const retryAfter = Number(err?.headers?.["retry-after"]);
  return Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter / 60)) : null;
}
