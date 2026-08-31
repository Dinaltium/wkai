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
  } else {
    // No configured relay. Keep the public openrelay project as a last resort
    // rather than dropping to STUN-only: it costs nothing to offer, and a peer
    // with no direct path has no other option. It is a shared free service, so
    // treat it as best-effort, not as a substitute for real TURN credentials.
    servers.push({
      urls: [
        "turn:openrelay.metered.ca:80",
        "turn:openrelay.metered.ca:443",
        "turn:openrelay.metered.ca:443?transport=tcp",
      ],
      username: "openrelayproject",
      credential: "openrelayproject",
    });
  }

  return servers;
}

webrtcRouter.get("/ice", (_req, res) => {
  const iceServers = buildIceServers();
  const hasConfiguredTurn = Boolean(
    process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD
  );
  const hasTurn = iceServers.some((s) =>
    (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith("turn:") || u.startsWith("turns:"))
  );
  if (!hasConfiguredTurn) {
    // Worth saying out loud: without a relay, any pair that cannot reach each
    // other directly will fail ICE with no other symptom than silence.
    console.warn("[WebRTC] No TURN configured (TURN_URL/TURN_USERNAME/TURN_PASSWORD) — falling back to the shared public relay, which is best-effort");
  }
  res.json({ iceServers, hasTurn });
});
