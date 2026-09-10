/**
 * Cloudflare Realtime SFU client.
 *
 * The mesh this exists to replace charges the instructor's laptop once per
 * student: thirty students means thirty encoders and thirty copies of the same
 * screen leaving one wifi uplink. An SFU takes one copy and fans it out, so the
 * instructor's cost stops growing with the class.
 *
 * The app secret never leaves the server. Clients talk to our routes, we talk
 * to Cloudflare — which is also why the SFU routes sit behind the same session
 * token guard as everything else: these calls spend a metered quota.
 *
 * Cloudflare's SFU is deliberately minimal — it has no notion of rooms,
 * participants or presence. That suits us: WKAI already has all three over its
 * own WebSocket, so the only thing missing was somewhere to forward media.
 */

const API_BASE = "https://rtc.live.cloudflare.com/v1/apps";

export function isSfuConfigured() {
  return Boolean(process.env.CLOUDFLARE_SFU_APP_ID && process.env.CLOUDFLARE_SFU_APP_TOKEN);
}

/**
 * Cloudflare does not always answer promptly — a call about a session whose
 * PeerConnection never came up can sit for twelve seconds before returning, and
 * a flaky uplink stalls one indefinitely. Neither is worth holding a client's
 * request open for, so every call gets a ceiling.
 */
const REQUEST_TIMEOUT_MS = 10_000;

async function callSfu(path, { method = "POST", body } = {}) {
  const appId = process.env.CLOUDFLARE_SFU_APP_ID;
  let res;
  try {
    res = await fetch(`${API_BASE}/${appId}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_SFU_APP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError" || err?.name === "AbortError";
    const wrapped = new Error(
      timedOut
        ? `Cloudflare SFU did not respond within ${REQUEST_TIMEOUT_MS}ms`
        : `Cloudflare SFU unreachable: ${err?.message ?? err}`
    );
    wrapped.status = 504;
    wrapped.cause = err;
    throw wrapped;
  }

  const text = await res.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Cloudflare SFU ${res.status}: unparseable response ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    // Cloudflare reports its own errors in the body; surface them rather than
    // a bare status, because "400" alone says nothing about which field.
    const detail = payload?.errorDescription ?? payload?.errorCode ?? text.slice(0, 200);
    const err = new Error(`Cloudflare SFU ${res.status}: ${detail}`);
    // Carry the status so callers can tell "try again shortly" apart from
    // "this will never work"; without it every failure looks like a 500.
    err.status = res.status;
    err.sfuErrorCode = payload?.errorCode;
    throw err;
  }

  // A 200 can still carry a per-track error — a pull for a track that has not
  // been published yet comes back this way.
  return payload;
}

/**
 * Open an SFU session for one client, handshaking with its offer.
 * @returns {Promise<{ sessionId: string, sessionDescription: object }>}
 */
export function createSfuSession(offerSdp) {
  return callSfu("/sessions/new", {
    body: { sessionDescription: { type: "offer", sdp: offerSdp } },
  });
}

/**
 * Publish tracks the client is already sending on its peer connection.
 * `tracks` entries are { mid, trackName }.
 */
export function pushTracks(sfuSessionId, offerSdp, tracks) {
  return callSfu(`/sessions/${sfuSessionId}/tracks/new`, {
    body: {
      sessionDescription: { type: "offer", sdp: offerSdp },
      tracks: tracks.map((t) => ({ location: "local", mid: t.mid, trackName: t.trackName })),
    },
  });
}

/** Cloudflare's "your PeerConnection is not connected yet" status. */
export const SFU_NOT_READY = 425;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Subscribe to tracks published by another SFU session.
 * `tracks` entries are { sessionId, trackName }.
 *
 * The response usually carries requiresImmediateRenegotiation with an offer the
 * client must answer — subscribing changes the shape of its peer connection.
 *
 * Cloudflare will not attach a track until the subscriber's PeerConnection has
 * actually finished connecting, and answers 425 until it has. The client waits
 * for that before asking, but ICE and DTLS finish on their own schedule and the
 * two can still cross — a few hundred milliseconds apart on a slow uplink. A
 * short retry here turns that race into a pause instead of a failed join.
 *
 * Bounded by wall-clock rather than a count, because a 425 about a session that
 * will never connect takes Cloudflare about twelve seconds to return: counting
 * attempts alone held one request open for the better part of a minute. The
 * student polls every few seconds regardless, so there is nothing to gain by
 * waiting longer here than a handshake would plausibly take.
 */
const PULL_RETRY_BUDGET_MS = 2_000;

export async function pullTracks(sfuSessionId, tracks) {
  const body = {
    tracks: tracks.map((t) => ({
      location: "remote",
      sessionId: t.sessionId,
      trackName: t.trackName,
    })),
  };

  const deadline = Date.now() + PULL_RETRY_BUDGET_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await callSfu(`/sessions/${sfuSessionId}/tracks/new`, { body });
    } catch (err) {
      const backoff = 250 * 2 ** attempt;
      if (err?.status !== SFU_NOT_READY || Date.now() + backoff >= deadline) throw err;
      await sleep(backoff);
    }
  }
}

/** Hand back the answer to an offer Cloudflare raised (after a pull). */
export function renegotiate(sfuSessionId, answerSdp) {
  return callSfu(`/sessions/${sfuSessionId}/renegotiate`, {
    method: "PUT",
    body: { sessionDescription: { type: "answer", sdp: answerSdp } },
  });
}

export function getSfuSession(sfuSessionId) {
  return callSfu(`/sessions/${sfuSessionId}`, { method: "GET" });
}
