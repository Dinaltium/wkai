import { useAppStore } from "../store";
import type { StreamingMode } from "../types";

/**
 * ICE servers come from the backend so both peers agree on one configuration
 * and TURN credentials live in one place. The hardcoded free relay this
 * replaced was defunct, which meant any pair that could not connect directly
 * failed ICE silently — offers sent, nothing ever connected. That is the usual
 * outcome here: a desktop whose only host candidates belong to a virtual
 * adapter (Hyper-V/WSL 172.x) has no direct path to a remote student at all.
 *
 * In "lan" mode no relay is requested at all. Everyone is in the room, so a
 * direct path exists by definition, and asking for a relay would offer a route
 * out to the internet and back for two machines a few metres apart.
 *
 * Worth being precise about the limit of that: ICE pairs our candidates with
 * theirs, so declining a relay here stops *us* offering one, not the far side.
 * It is a default about where media should go, not an enforced boundary.
 */
const STUN_ONLY: RTCConfiguration = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

const cache = new Map<StreamingMode, RTCConfiguration>();
const inFlight = new Map<StreamingMode, Promise<RTCConfiguration>>();

export function currentStreamingMode(): StreamingMode {
  return useAppStore.getState().settings.streamingMode ?? "lan";
}

/** Drop cached configs — call when the mode changes so the next peer re-fetches. */
export function resetRtcConfigCache() {
  cache.clear();
  inFlight.clear();
}

export async function getRtcConfig(
  mode: StreamingMode = currentStreamingMode()
): Promise<RTCConfiguration> {
  // On the LAN the host candidates are the answer; there is nothing to fetch.
  if (mode === "lan") return STUN_ONLY;

  const cached = cache.get(mode);
  if (cached) return cached;
  const pending = inFlight.get(mode);
  if (pending) return pending;

  const request = (async () => {
    try {
      const { settings, session } = useAppStore.getState();
      const backendUrl = settings.backendUrl;
      // The endpoint is guarded: TURN credentials are metered, so the backend
      // hands them only to someone who already holds a session. Without this
      // header the request comes back 401 and we fall through to STUN — which
      // looks like working code right up until a student has no direct path.
      const token = session?.instructorToken;
      const res = await fetch(`${backendUrl}/api/webrtc/ice`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error(`ICE config ${res.status}`);
      const data = (await res.json()) as {
        iceServers: RTCIceServer[];
        hasTurn: boolean;
        turnSource?: string;
      };
      if (!data.iceServers?.length) throw new Error("ICE config empty");
      if (!data.hasTurn) {
        console.warn(
          "[WebRTC] Online mode, but the backend has no TURN relay — a student with no direct path will not connect"
        );
      }
      const config = { iceServers: data.iceServers };
      cache.set(mode, config);
      return config;
    } catch (err) {
      console.warn("[WebRTC] Falling back to STUN-only ICE config:", err);
      return STUN_ONLY;
    } finally {
      inFlight.delete(mode);
    }
  })();

  inFlight.set(mode, request);
  return request;
}
