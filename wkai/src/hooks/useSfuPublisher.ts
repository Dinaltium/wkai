import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import { getRtcConfig } from "../lib/ice";

/**
 * Publishes the shared screen once, to the SFU, instead of once per student.
 *
 * The mesh publisher this stands beside opens a peer connection per student:
 * thirty students means thirty encoders and thirty copies of the same screen
 * leaving one wifi uplink, so the share degrades as the class fills. Here the
 * cost is flat — one encode, one upload — and Cloudflare fans it out.
 *
 * Only used in "online" mode. For a room where everyone is on the same wifi,
 * sending the screen out to Cloudflare and pulling copies back through one
 * campus uplink is worse than the direct mesh, so LAN mode keeps the mesh.
 */

/** One upload, so it can afford the full ceiling regardless of class size. */
const SFU_VIDEO_BITRATE_BPS = 5_000_000;

/**
 * @returns publishing — true only while the SFU is actually carrying the
 * screen. The mesh publisher stands down on this, so it must mean "the SFU has
 * this covered", not "we asked it to".
 */
export function useSfuPublisher(enabled: boolean): { publishing: boolean } {
  const [publishing, setPublishing] = useState(false);
  const session = useAppStore((s) => s.session);
  const backendUrl = useAppStore((s) => s.settings.backendUrl);
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  const streamingToStudents = useAppStore((s) => s.streamingToStudents);
  const addDebugLog = useAppStore((s) => s.addDebugLog);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const publishedStreamRef = useRef<MediaStream | null>(null);

  const sessionId = session?.id ?? null;
  const token = session?.instructorToken;

  useEffect(() => {
    const shouldPublish = enabled && streamingToStudents && !!sharedDisplayStream && !!sessionId;

    const teardown = () => {
      if (!peerRef.current) return;
      try {
        peerRef.current.close();
      } catch {
        // ignore
      }
      peerRef.current = null;
      publishedStreamRef.current = null;
      setPublishing(false);
      // Withdraw the advertisement too. Closing the peer only ends our side of
      // it; students read the published record, so leaving it behind sends
      // them to a Cloudflare session that has stopped carrying anything, and
      // they flip between that dead stream and the direct path forever.
      if (sessionId && token) {
        void fetch(`${backendUrl}/api/webrtc/${sessionId}/sfu/publish`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {
          // Best effort: the record also expires on its own, and a student who
          // cannot reach it falls back on the receiving side regardless.
        });
      }
    };

    if (!shouldPublish) {
      teardown();
      return;
    }

    // Already publishing this exact stream — the effect re-runs on unrelated
    // store changes, and re-publishing would drop everyone watching.
    if (peerRef.current && publishedStreamRef.current === sharedDisplayStream) return;

    let cancelled = false;
    teardown();

    (async () => {
      try {
        const base = `${backendUrl}/api/webrtc/${sessionId}/sfu`;
        const headers = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        const track = sharedDisplayStream!.getVideoTracks()[0];
        if (!track) {
          addDebugLog("SFU publish skipped: the capture stream has no video track", "warn");
          return;
        }
        // "detail" is the still-screenshare profile: it pins resolution and
        // pays for it in frames. Measured here on a link clamped to 150kbps,
        // feeding the encoder 60fps of moving content:
        //
        //   detail + maintain-resolution   5.1fps @ 1920x1080
        //   detail + balanced              5.1fps @ 1920x1080
        //   motion + balanced             14fps  @ 640x360
        //   motion + maintain-framerate   60fps  @ 320x180
        //
        // Note the first two rows: while the hint is "detail" the
        // degradationPreference below is inert, so the hint is the setting
        // that actually decides this. Five frames a second is a screen that
        // has stopped moving mid-demonstration, which is what students saw.
        //
        // Given room to breathe this costs nothing — on an unclamped link
        // "motion" + "balanced" still reaches 1920x1080 at 60fps.
        track.contentHint = "motion";

        const peer = new RTCPeerConnection({
          ...(await getRtcConfig("online")),
          bundlePolicy: "max-bundle",
        });
        peerRef.current = peer;
        publishedStreamRef.current = sharedDisplayStream;

        const transceiver = peer.addTransceiver(track, { direction: "sendonly" });

        const params = transceiver.sender.getParameters();
        // Balanced trades a little of each as the uplink varies, rather than
        // sacrificing one outright: "maintain-framerate" alone bottoms out at
        // 320x180, which is unreadable for code or slides, and
        // "maintain-resolution" is what froze the picture. Only meaningful now
        // that the hint above is "motion" — see the table there.
        params.degradationPreference = "balanced";
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings[0].maxBitrate = SFU_VIDEO_BITRATE_BPS;
        // Only a ceiling, never a target: the encoder cannot outrun the
        // capture source anyway, so this just removes any lower default the
        // browser would otherwise apply to a screenshare sender.
        params.encodings[0].maxFramerate = 60;
        await transceiver.sender.setParameters(params).catch(() => {
          addDebugLog("Could not set the SFU publish bitrate", "warn");
        });

        await peer.setLocalDescription(await peer.createOffer());
        if (cancelled) return;

        const sessionRes = await fetch(`${base}/session`, {
          method: "POST",
          headers,
          body: JSON.stringify({ sdp: peer.localDescription!.sdp }),
        });
        if (!sessionRes.ok) throw new Error(`SFU session ${sessionRes.status}`);
        const { sfuSessionId, sessionDescription } = await sessionRes.json();
        if (cancelled) return;

        await peer.setRemoteDescription({ type: "answer", sdp: sessionDescription.sdp });

        const publishRes = await fetch(`${base}/publish`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sfuSessionId,
            sdp: peer.localDescription!.sdp,
            tracks: [{ mid: transceiver.mid, trackName: "screen" }],
          }),
        });
        if (!publishRes.ok) throw new Error(`SFU publish ${publishRes.status}`);
        if (cancelled) return;

        addDebugLog(`Publishing to the SFU (session ${sfuSessionId.slice(0, 8)}…)`, "success");

        peer.onconnectionstatechange = () => {
          addDebugLog(`SFU publish connection: ${peer.connectionState}`, "info");
          if (cancelled) return;
          // Only a live connection lets the mesh stand down. Anything else and
          // the mesh has to pick the session back up.
          setPublishing(peer.connectionState === "connected");
          if (peer.connectionState === "failed" || peer.connectionState === "closed") {
            addDebugLog("SFU publish dropped — direct connections take over again", "warn");
          }
        };
        setPublishing(peer.connectionState === "connected");
      } catch (err) {
        if (cancelled) return;
        // Not fatal: the mesh publisher is still running underneath, so a
        // failure here costs efficiency rather than the session.
        addDebugLog(
          `SFU publish failed, falling back to direct connections: ${
            err instanceof Error ? err.message : String(err)
          }`,
          "error"
        );
        teardown();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, streamingToStudents, sharedDisplayStream, sessionId, backendUrl, token, addDebugLog]);

  useEffect(() => {
    return () => {
      try {
        peerRef.current?.close();
      } catch {
        // ignore
      }
      peerRef.current = null;
    };
  }, []);

  return { publishing };
}
