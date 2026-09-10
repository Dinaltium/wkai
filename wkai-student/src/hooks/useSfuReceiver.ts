import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { getBackendUrl } from "../lib/api";

/**
 * Pulls the instructor's screen from the SFU, when there is one to pull from.
 *
 * Deliberately self-configuring rather than told which transport to use: the
 * student asks whether anyone is publishing, and only takes the SFU path if
 * somebody is. An instructor in LAN mode never publishes, so students fall
 * through to the direct mesh with nothing to coordinate — no extra WS event, no
 * mode to keep in sync, and no way for the two sides to disagree about which
 * transport is in play.
 *
 * The poll exists because the instructor usually starts sharing *after* the
 * students have joined; without it, everyone who arrived early would sit on the
 * mesh path for a session that had since moved to the SFU.
 */

const POLL_INTERVAL_MS = 4000;

/**
 * How long to give the subscriber's own connection before giving up on this
 * attempt. Longer than a healthy handshake by a wide margin, short enough that
 * a genuinely stuck student falls back to the mesh within a poll or two.
 */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * How long the SFU has to produce an actual decoded frame after handing over a
 * track before the student stops believing it and falls back to the direct
 * path. Comfortably longer than a working handshake, short enough that nobody
 * watches a black rectangle wondering whether the class has started.
 */
const MEDIA_PROOF_TIMEOUT_MS = 8_000;

/**
 * Cloudflare will not attach a track to a PeerConnection that has not finished
 * connecting — it answers 425. Asking the moment the answer is applied is too
 * early: ICE and DTLS have not run yet. Wait for the connection to come up
 * first, so the pull lands on a session the SFU is willing to serve.
 */
function waitUntilConnected(peer: RTCPeerConnection): Promise<void> {
  if (peer.connectionState === "connected") return Promise.resolve();

  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      peer.removeEventListener("connectionstatechange", onChange);
      err ? reject(err) : resolve();
    };
    const onChange = () => {
      if (peer.connectionState === "connected") done();
      // "failed" and "closed" are terminal; "disconnected" can still recover,
      // so let the timeout be the judge of that one.
      else if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        done(new Error(`SFU connection ${peer.connectionState} before subscribe`));
      }
    };
    const timer = setTimeout(
      () => done(new Error("SFU connection did not come up in time")),
      CONNECT_TIMEOUT_MS
    );
    peer.addEventListener("connectionstatechange", onChange);
    onChange();
  });
}

export function useSfuReceiver(): {
  remoteStream: MediaStream | null;
  active: boolean;
} {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const publisherRef = useRef<string | null>(null);
  /**
   * A publisher that was subscribed to successfully and then never sent a
   * frame. Remembered so the poll below stops re-attempting it; a real new
   * publish arrives under a different session id and is tried normally.
   */
  const deadPublisherRef = useRef<string | null>(null);

  const session = useStore((s) => s.session);
  const joinToken = useStore((s) => s.joinToken);
  const addDebugLog = useStore((s) => s.addDebugLog);

  const sessionId = session?.id ?? null;

  useEffect(() => {
    if (!sessionId || !joinToken) return;

    let cancelled = false;
    let timer: number | undefined;

    const base = `${getBackendUrl()}/api/webrtc/${sessionId}/sfu`;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${joinToken}`,
    };

    const teardown = () => {
      if (peerRef.current) {
        try {
          peerRef.current.close();
        } catch {
          // ignore
        }
        peerRef.current = null;
      }
      publisherRef.current = null;
      setRemoteStream(null);
      setActive(false);
    };

    /**
     * Watch for the first decoded frame and only then hand the room to the
     * SFU. If none arrives, tear down so the direct path — which is still
     * sitting there waiting for exactly this — can take over instead.
     */
    async function confirmMediaFlowing(peer: RTCPeerConnection, publisherSfuSession: string) {
      const deadline = Date.now() + MEDIA_PROOF_TIMEOUT_MS;
      while (!cancelled && peerRef.current === peer && Date.now() < deadline) {
        let decoded = 0;
        (await peer.getStats()).forEach((s) => {
          if (s.type === "inbound-rtp" && (s as RTCInboundRtpStreamStats).kind === "video") {
            decoded = (s as RTCInboundRtpStreamStats).framesDecoded ?? 0;
          }
        });
        if (decoded > 0) {
          if (!cancelled) setActive(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (cancelled || peerRef.current !== peer) return;
      addDebugLog(
        "The SFU offered a stream but never sent a frame — using the direct connection",
        "warn",
      );
      deadPublisherRef.current = publisherSfuSession;
      teardown();
    }

    async function subscribe(publisherSfuSession: string) {
      const peer = new RTCPeerConnection({ bundlePolicy: "max-bundle" });
      peerRef.current = peer;

      const incoming = new MediaStream();
      peer.ontrack = (event) => {
        incoming.addTrack(event.track);
        if (!cancelled) setRemoteStream(incoming);
        // Deliberately not marking the SFU active here. A track arrives as
        // soon as Cloudflare attaches one, whether or not anything is being
        // sent down it — so a publisher that has stopped (or a stale record
        // pointing at a finished session) produced a track that never carried
        // a frame. Claiming "active" on that switched the direct path off,
        // the black screen that followed was reported as no stream, and the
        // two paths traded the room back and forth every few seconds.
        // Frames decoding is the only honest evidence, so wait for one.
        void confirmMediaFlowing(peer, publisherSfuSession);
      };
      peer.onconnectionstatechange = () => {
        if (cancelled) return;
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          addDebugLog(`SFU connection ${peer.connectionState} — will retry`, "warn");
          teardown();
        }
      };

      // A subscriber has nothing to send, but still needs a session, so it
      // offers with a recvonly transceiver.
      peer.addTransceiver("video", { direction: "recvonly" });
      await peer.setLocalDescription(await peer.createOffer());

      const sessionRes = await fetch(`${base}/session`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sdp: peer.localDescription!.sdp }),
      });
      if (!sessionRes.ok) throw new Error(`SFU session ${sessionRes.status}`);
      const { sfuSessionId, sessionDescription } = await sessionRes.json();
      if (cancelled) return;

      await peer.setRemoteDescription({ type: "answer", sdp: sessionDescription.sdp });

      // Not optional: the SFU refuses a pull until this side is actually
      // connected, and asking early fails the whole join instead of waiting.
      await waitUntilConnected(peer);
      if (cancelled) return;

      const subRes = await fetch(`${base}/subscribe`, {
        method: "POST",
        headers,
        body: JSON.stringify({ sfuSessionId }),
      });
      if (subRes.status === 409) {
        // The instructor stopped sharing between the poll and this call.
        teardown();
        return;
      }
      if (subRes.status === 425 || subRes.status === 504) {
        // Still settling on the SFU's side of the handshake, or Cloudflare is
        // slow right now. The next poll picks it up; neither is a failure worth
        // dropping to the mesh over.
        addDebugLog("SFU not ready for this connection yet — retrying", "info");
        teardown();
        return;
      }
      if (!subRes.ok) throw new Error(`SFU subscribe ${subRes.status}`);
      const pulled = await subRes.json();
      if (cancelled) return;

      // Subscribing changes the shape of the connection, so Cloudflare answers
      // with an offer of its own that has to be accepted before media flows.
      if (pulled?.requiresImmediateRenegotiation) {
        await peer.setRemoteDescription({ type: "offer", sdp: pulled.sessionDescription.sdp });
        await peer.setLocalDescription(await peer.createAnswer());
        const renegRes = await fetch(`${base}/renegotiate`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ sfuSessionId, sdp: peer.localDescription!.sdp }),
        });
        if (!renegRes.ok) throw new Error(`SFU renegotiate ${renegRes.status}`);
      }

      publisherRef.current = publisherSfuSession;
      addDebugLog("Receiving the screen share over the SFU", "success");
    }

    async function poll() {
      try {
        const res = await fetch(`${base}/status`, { headers });
        if (!res.ok) return;
        const { configured, publisher } = await res.json();
        if (cancelled) return;

        if (!configured || !publisher) {
          // Nobody publishing: either LAN mode, or sharing has not started.
          // Leave the mesh path to it.
          if (publisherRef.current) teardown();
          return;
        }

        // Already watching this publisher.
        if (publisherRef.current === publisher.sfuSessionId && peerRef.current) return;

        // A publisher that has already been given its chance and sent nothing
        // is not worth re-subscribing to every four seconds; that retry loop
        // is what made the stream appear and disappear on a cycle. A genuinely
        // new publish gets a new session id, and so gets a fresh try.
        if (deadPublisherRef.current === publisher.sfuSessionId) return;

        teardown();
        await subscribe(publisher.sfuSessionId);
      } catch (err) {
        if (cancelled) return;
        addDebugLog(
          `SFU subscribe failed, staying on the direct connection: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "warn"
        );
        teardown();
      }
    }

    void poll();
    timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      teardown();
    };
  }, [sessionId, joinToken, addDebugLog]);

  return { remoteStream, active };
}
