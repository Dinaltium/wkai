// LiveKit integration — access tokens + RTMP ingress management.
//
// Zero external deps: mints HS256 JWTs and calls the LiveKit twirp API with the
// global fetch. This is the same approach proven end-to-end in the Phase 0 spike
// (spike/mint-livekit-token.mjs + spike/create-ingress.mjs).
//
// Egress model (see native-capture-obs-level-plan.md): the instructor's native
// pipeline pushes one RTMP stream into a per-session LiveKit ingress; LiveKit
// transcodes to WebRTC and fans out to that room's students. Students subscribe
// with a short-lived access token. FFmpeg's WHIP muxer can't do LiveKit (TCP ICE
// candidates), so RTMP is the v1 transport.

import crypto from "node:crypto";

const LIVEKIT_URL = process.env.LIVEKIT_URL || "";
const API_KEY = process.env.LIVEKIT_API_KEY || "";
const API_SECRET = process.env.LIVEKIT_API_SECRET || "";

/** LiveKit is optional: without config the streaming endpoints report unavailable
 *  rather than crashing, so the rest of the app runs fine. */
export function isLiveKitConfigured() {
  return Boolean(LIVEKIT_URL && API_KEY && API_SECRET);
}

function assertConfigured() {
  if (!isLiveKitConfigured()) {
    throw new Error("LiveKit is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).");
  }
}

/** Deterministic LiveKit room name for a WKAI session. */
export function roomNameForSession(sessionId) {
  return `wkai-${sessionId}`;
}

function httpBase() {
  return LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/$/, "");
}

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mint a LiveKit access token (JWT, HS256) with a video grant.
 * @param {object} opts
 * @param {string} opts.identity   Unique participant identity.
 * @param {string} [opts.name]     Display name.
 * @param {string} opts.roomName   Room to join.
 * @param {boolean} [opts.canPublish=false]  Publishing rights (students: false).
 * @param {number} [opts.ttlSeconds=3600]
 */
export function mintAccessToken({ identity, name, roomName, canPublish = false, ttlSeconds = 3600 }) {
  assertConfigured();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: API_KEY,
    sub: identity,
    name,
    nbf: now,
    exp: now + ttlSeconds,
    video: {
      room: roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish,
      canPublishData: canPublish,
    },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(crypto.createHmac("sha256", API_SECRET).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

/** Mint an admin token (ingressAdmin) for management calls. */
function mintAdminToken(ttlSeconds = 600) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: API_KEY,
    sub: API_KEY,
    nbf: now,
    exp: now + ttlSeconds,
    video: { ingressAdmin: true, roomCreate: true },
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = b64url(crypto.createHmac("sha256", API_SECRET).update(signingInput).digest());
  return `${signingInput}.${sig}`;
}

async function twirp(service, method, body) {
  assertConfigured();
  const res = await fetch(`${httpBase()}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${mintAdminToken()}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`LiveKit ${service}.${method} failed (${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/**
 * Create (or the caller may reuse) an RTMP ingress for a session's room.
 * Returns the RTMP publish URL + stream key for the instructor's encoder.
 */
export async function createRtmpIngress({ sessionId, roomName }) {
  const info = await twirp("Ingress", "CreateIngress", {
    input_type: "RTMP_INPUT",
    name: `wkai-${sessionId}`,
    room_name: roomName,
    participant_identity: "instructor",
    participant_name: "Instructor",
  });
  return {
    ingressId: info.ingress_id ?? info.ingressId,
    url: info.url ?? info.Url,
    streamKey: info.stream_key ?? info.streamKey,
  };
}

/** Tear down an ingress (on session end). Best-effort. */
export async function deleteIngress(ingressId) {
  if (!ingressId) return;
  try {
    await twirp("Ingress", "DeleteIngress", { ingress_id: ingressId });
  } catch (err) {
    console.warn("[LiveKit] deleteIngress failed:", err.message);
  }
}

export function getLiveKitUrl() {
  return LIVEKIT_URL;
}
