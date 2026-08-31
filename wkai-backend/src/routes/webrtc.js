import { Router } from "express";

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
 * Set TURN_URL / TURN_USERNAME / TURN_PASSWORD to use a real TURN service.
 * TURN_URL may hold several comma-separated URLs (udp/tcp/tls variants).
 */
function buildIceServers() {
  const stunUrls = (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);

  const servers = [{ urls: stunUrls }];

  const turnUrls = (process.env.TURN_URL ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const username = process.env.TURN_USERNAME;
  const credential = process.env.TURN_PASSWORD;

  if (turnUrls.length && username && credential) {
    servers.push({ urls: turnUrls, username, credential });
  }

  return servers;
}

webrtcRouter.get("/ice", (_req, res) => {
  const iceServers = buildIceServers();
  const hasTurn = iceServers.some((s) =>
    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn:") || u.startsWith("turns:"))
  );
  if (!hasTurn) {
    // Worth saying out loud: without a relay, any pair that cannot reach each
    // other directly will fail ICE with no other symptom than silence.
    console.warn("[WebRTC] No TURN configured (TURN_URL/TURN_USERNAME/TURN_PASSWORD) — relay-only peers will fail");
  }
  res.json({ iceServers, hasTurn });
});
