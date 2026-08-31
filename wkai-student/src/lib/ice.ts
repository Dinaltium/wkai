import { getBackendUrl } from "./api";

/**
 * ICE servers come from the backend so both peers agree on one configuration
 * and TURN credentials live in one place. The hardcoded free relay this
 * replaced was defunct, which meant any pair that could not connect directly
 * failed ICE silently — offers sent, nothing ever connected.
 */
const FALLBACK: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

let cached: RTCConfiguration | null = null;
let inFlight: Promise<RTCConfiguration> | null = null;

export async function getRtcConfig(): Promise<RTCConfiguration> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/api/webrtc/ice`);
      if (!res.ok) throw new Error(`ICE config ${res.status}`);
      const data = (await res.json()) as { iceServers: RTCIceServer[]; hasTurn: boolean };
      if (!data.iceServers?.length) throw new Error("ICE config empty");
      if (!data.hasTurn) {
        console.warn("[WebRTC] Backend reports no TURN server — a relay-only peer will not connect");
      }
      cached = { iceServers: data.iceServers };
      return cached;
    } catch (err) {
      console.warn("[WebRTC] Falling back to STUN-only ICE config:", err);
      return FALLBACK;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
