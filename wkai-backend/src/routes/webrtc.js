import { Router } from "express";
import { requireSessionToken } from "../auth/sessionAccess.js";
import {
  isSfuConfigured,
  createSfuSession,
  pushTracks,
  pullTracks,
  renegotiate,
  SFU_NOT_READY,
} from "../sfu/cloudflare.js";
import { setSfuPublisher, getSfuPublisher, clearSfuPublisher } from "../db/redis.js";

export const webrtcRouter = Router();

/**
 * ICE servers, served from one place so both clients agree.
 *
 * They used to be hardcoded per app, pointing at the free openrelay.metered.ca
 * project. When an instructor's only host candidates belong to a virtual
 * adapter (Hyper-V/WSL give out 172.x addresses that are unroutable to anyone
 * else), a relay is the only remaining path — and a dead relay means the offer
 * is sent, ICE gathers, nothing connects, and the peer retries forever.
 *
 * Two ways to supply a relay, in order of preference:
 *
 *   1. Cloudflare Realtime TURN (CLOUDFLARE_TURN_KEY_ID + _API_TOKEN). Its
 *      credentials are deliberately short-lived, so they are minted here and
 *      cached until shortly before they expire rather than living in env vars.
 *   2. A static relay (TURN_URL / TURN_USERNAME / TURN_PASSWORD), for anyone
 *      self-hosting coturn.
 *
 * With neither, this serves STUN only and says so. The openrelay fallback that
 * used to sit here was worse than nothing: the project is defunct, so it
 * advertised a relay that could not carry a packet, and `hasTurn` reported true
 * on the strength of a URL that began with "turn:".
 */

const CF_TURN_ENDPOINT = "https://rtc.live.cloudflare.com/v1/turn/keys";

// Long enough to outlast a workshop, so a session never loses its relay
// half-way through.
const CF_TURN_TTL_SECONDS = Number(process.env.CLOUDFLARE_TURN_TTL_SECONDS ?? 12 * 60 * 60);

// Re-mint a little before expiry rather than on it, so a request arriving as
// the clock runs out does not hand out credentials the client cannot use.
const CF_TURN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const STUN_FALLBACK = "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302";

let cfCache = null; // { iceServers, expiresAt }
let cfInFlight = null;

function stunServers() {
  const urls = (process.env.STUN_URLS ?? STUN_FALLBACK)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return urls.length ? [{ urls }] : [];
}

function staticTurnServer() {
  const urls = (process.env.TURN_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_PASSWORD;
  if (!urls.length || !username || !credential) return null;
  return { urls, username, credential };
}

function isCloudflareTurnConfigured() {
  return Boolean(process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN);
}

/**
 * Mint Cloudflare TURN credentials, reusing the cached set until it is close to
 * expiring. Concurrent callers share one request: a room full of students
 * asking for ICE at the same moment should cost one API call, not thirty.
 */
async function cloudflareTurnServers() {
  if (cfCache && Date.now() < cfCache.expiresAt - CF_TURN_REFRESH_MARGIN_MS) {
    return cfCache.iceServers;
  }
  if (cfInFlight) return cfInFlight;

  cfInFlight = (async () => {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const res = await fetch(`${CF_TURN_ENDPOINT}/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl: CF_TURN_TTL_SECONDS }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Cloudflare TURN ${res.status}${detail ? `: ${detail}` : ""}`);
    }

    const body = await res.json();
    // The API has returned iceServers as a single object; accept a list too so
    // a shape change does not silently drop the relay.
    const raw = body?.iceServers;
    const servers = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((s) => s?.urls);
    if (!servers.length) {
      throw new Error("Cloudflare TURN returned no iceServers");
    }

    cfCache = {
      iceServers: servers,
      expiresAt: Date.now() + CF_TURN_TTL_SECONDS * 1000,
    };
    return servers;
  })();

  try {
    return await cfInFlight;
  } finally {
    cfInFlight = null;
  }
}

/**
 * @returns {Promise<{ iceServers: object[], hasTurn: boolean, turnSource: string }>}
 */
async function buildIceConfig() {
  const servers = stunServers();

  if (isCloudflareTurnConfigured()) {
    try {
      servers.push(...(await cloudflareTurnServers()));
      return { iceServers: servers, hasTurn: true, turnSource: "cloudflare" };
    } catch (err) {
      // Fall through to a static relay if there is one. Worth logging loudly:
      // from the client's side the symptom is silence.
      console.error(`[WebRTC] Could not mint Cloudflare TURN credentials: ${err.message}`);
    }
  }

  const staticTurn = staticTurnServer();
  if (staticTurn) {
    servers.push(staticTurn);
    return { iceServers: servers, hasTurn: true, turnSource: "static" };
  }

  return { iceServers: servers, hasTurn: false, turnSource: "none" };
}

// Guarded: these credentials are metered, and an open endpoint hands working
// relay credentials to anyone who finds the URL. Every real caller — student or
// instructor — already holds a session token by the time it needs ICE.
webrtcRouter.get("/ice", requireSessionToken(), async (_req, res, next) => {
  try {
    const config = await buildIceConfig();
    if (!config.hasTurn) {
      // Worth saying out loud: without a relay, any pair that cannot reach each
      // other directly will fail ICE with no other symptom than silence.
      console.warn(
        "[WebRTC] No TURN relay available — set CLOUDFLARE_TURN_KEY_ID/CLOUDFLARE_TURN_API_TOKEN, or TURN_URL/TURN_USERNAME/TURN_PASSWORD. Peers with no direct path will not connect."
      );
    }
    res.json(config);
  } catch (err) {
    next(err);
  }
});


// ─── Cloudflare SFU ──────────────────────────────────────────────────────────
//
// Only used in "online" mode. A room full of students on the same wifi is
// better served by the direct mesh: sending their screen out to Cloudflare and
// pulling thirty copies back through one campus uplink is strictly worse than
// keeping it on the local network.
//
// Every route is scoped to :id and guarded, so a token for one session cannot
// touch another's tracks — and cannot spend the quota at all without one.

const sfuRouter = Router({ mergeParams: true });

sfuRouter.get("/status", async (req, res, next) => {
  try {
    const publisher = await getSfuPublisher(req.params.id);
    res.json({ configured: isSfuConfigured(), publisher });
  } catch (err) {
    next(err);
  }
});

/** Open an SFU session for this client, using the offer it has already made. */
sfuRouter.post("/session", async (req, res, next) => {
  try {
    if (!isSfuConfigured()) {
      return res.status(503).json({ error: "The SFU is not configured on this server." });
    }
    const { sdp } = req.body ?? {};
    if (!sdp) return res.status(400).json({ error: "An SDP offer is required." });

    const result = await createSfuSession(sdp);
    res.json({ sfuSessionId: result.sessionId, sessionDescription: result.sessionDescription });
  } catch (err) {
    next(err);
  }
});

/**
 * Publish. Instructor only: a student who could publish here would replace the
 * screen everyone else is watching.
 */
sfuRouter.post(
  "/publish",
  requireSessionToken({ requiredRole: "instructor" }),
  async (req, res, next) => {
    try {
      if (!isSfuConfigured()) {
        return res.status(503).json({ error: "The SFU is not configured on this server." });
      }
      const { sfuSessionId, sdp, tracks } = req.body ?? {};
      if (!sfuSessionId || !sdp || !Array.isArray(tracks) || !tracks.length) {
        return res.status(400).json({ error: "sfuSessionId, sdp and tracks are required." });
      }

      const result = await pushTracks(sfuSessionId, sdp, tracks);

      // Students cannot pull what they cannot name. Record where the screen
      // now lives so anyone joining later can find it.
      await setSfuPublisher(req.params.id, {
        sfuSessionId,
        tracks: tracks.map((t) => t.trackName),
        publishedAt: new Date().toISOString(),
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * Stop advertising this session's SFU publisher.
 *
 * Without this the record outlived the thing it described: an instructor who
 * stopped presenting, switched to LAN mode, or simply closed the app left a
 * publisher on file, and every student went on subscribing to a Cloudflare
 * session that no longer carried anything. What they saw was the stream
 * appearing and vanishing on a loop — the SFU path claiming the screen,
 * failing, handing back to the direct path, and being claimed again on the
 * next poll.
 */
sfuRouter.delete(
  "/publish",
  requireSessionToken({ requiredRole: "instructor" }),
  async (req, res, next) => {
    try {
      await clearSfuPublisher(req.params.id);
      res.json({ cleared: true });
    } catch (err) {
      next(err);
    }
  }
);

/** Subscribe to whatever the instructor is publishing for this session. */
sfuRouter.post("/subscribe", async (req, res, next) => {
  try {
    if (!isSfuConfigured()) {
      return res.status(503).json({ error: "The SFU is not configured on this server." });
    }
    const { sfuSessionId } = req.body ?? {};
    if (!sfuSessionId) return res.status(400).json({ error: "sfuSessionId is required." });

    const publisher = await getSfuPublisher(req.params.id);
    if (!publisher) {
      // Not an error: the instructor may simply not be sharing yet. The client
      // polls rather than failing, so say so plainly.
      return res.status(409).json({ error: "Nobody is publishing to this session yet." });
    }

    const result = await pullTracks(
      sfuSessionId,
      publisher.tracks.map((trackName) => ({ sessionId: publisher.sfuSessionId, trackName }))
    );
    res.json(result);
  } catch (err) {
    // The subscriber's own connection is not up yet, even after the retries.
    // That is the student's side to finish, not a fault here, and it clears on
    // its own — so say "ask again" rather than reporting a server error the
    // client can only give up on.
    if (err?.status === SFU_NOT_READY) {
      return res.status(SFU_NOT_READY).json({
        error: "Your connection to the SFU is not ready yet — retrying shortly.",
        retryable: true,
      });
    }
    // A stalled or unreachable Cloudflare is also the student's cue to try
    // again rather than to give up on the SFU for the rest of the session.
    if (err?.status === 504) {
      return res.status(504).json({ error: err.message, retryable: true });
    }
    next(err);
  }
});

/** Answer an offer Cloudflare raised after a subscribe changed the session. */
sfuRouter.put("/renegotiate", async (req, res, next) => {
  try {
    const { sfuSessionId, sdp } = req.body ?? {};
    if (!sfuSessionId || !sdp) {
      return res.status(400).json({ error: "sfuSessionId and sdp are required." });
    }
    res.json(await renegotiate(sfuSessionId, sdp));
  } catch (err) {
    next(err);
  }
});

webrtcRouter.use("/:id/sfu", requireSessionToken(), sfuRouter);
