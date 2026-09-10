import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { getRtcConfig } from "../lib/ice";
import type {
  StreamingMode,
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
  WebRtcRequestOfferPayload,
  WsEventType,
} from "../types";

type WsSend = <T>(type: WsEventType | string, payload: T) => void;
type WsOn = <T>(type: WsEventType, handler: (payload: T) => void) => void;
type WsOff = (type: WsEventType) => void;

/// Upper bound for the outgoing screen share. Desktop content at native
/// resolution needs far more headroom than the browser's default ramp.
const MAX_VIDEO_BITRATE_BPS = 5_000_000;

/// Floor for the same. Screen content is mostly static text, which stays
/// readable far below what moving video needs; going under this starts to cost
/// legibility on a scroll.
const MIN_VIDEO_BITRATE_BPS = 800_000;

/// How long a peer may sit in ICE "disconnected" before it is treated as dead.
/// Long enough for a normal relay hiccup or candidate switch to heal itself,
/// short enough that a genuinely dropped student is not left staring at a
/// frozen frame.
const DISCONNECT_GRACE_MS = 6_000;

/// How long a student may report having no picture, while the SFU is supposed
/// to be carrying the screen, before this side gives up on Cloudflare for them
/// and serves a direct connection instead. Long enough to cover an ordinary
/// SFU handshake, short enough that nobody watches an empty room for long.
const SFU_GRACE_MS = 10_000;

/// What the instructor's uplink is assumed to sustain in total.
///
/// This is a mesh: every student gets their own encoder and their own copy of
/// the screen, so the ceiling above is charged once *per student*. Thirty
/// students at 5 Mbps is 150 Mbps of upload, which no room wifi delivers — the
/// bandwidth estimator then throttles everyone at once, and because we ask for
/// maintain-resolution it pays for that in framerate. The result is a share
/// that gets progressively more stuttery as a class fills up, for no reason
/// the instructor can see.
///
/// Dividing a fixed budget keeps the total roughly constant instead: a handful
/// of students each get a generous stream, a full room gets a leaner one that
/// still reads cleanly because the content is text.
const ONLINE_UPLINK_BUDGET_BPS = 12_000_000;

/// The same budget on the local network, where the constraint is different.
/// A LAN carries far more than an internet uplink, so a full room can keep a
/// generous per-student share instead of being squeezed down to the floor.
/// The access point's airtime is still shared, which is why this is not
/// unlimited.
const LAN_UPLINK_BUDGET_BPS = 40_000_000;

/** Per-student ceiling for a class of `peerCount` in the given mode. */
function videoBitrateForPeerCount(
  peerCount: number,
  mode: StreamingMode,
): number {
  const budget =
    mode === "lan" ? LAN_UPLINK_BUDGET_BPS : ONLINE_UPLINK_BUDGET_BPS;
  const share = budget / Math.max(peerCount, 1);
  return Math.round(
    Math.min(MAX_VIDEO_BITRATE_BPS, Math.max(MIN_VIDEO_BITRATE_BPS, share)),
  );
}

/** Apply a ceiling to every video sender on one peer connection. */
async function applyVideoBitrate(
  peer: RTCPeerConnection,
  bitrate: number,
  onError: (message: string) => void,
) {
  for (const sender of peer.getSenders()) {
    if (sender.track?.kind !== "video") continue;
    const params = sender.getParameters();
    // The browser otherwise ramps a fresh sender from a few hundred kbps, which
    // is nowhere near enough for a full-resolution desktop and is what makes the
    // student's view look soft. Ask for a real ceiling.
    //
    // Balanced sheds a little resolution and a little framerate as the link
    // varies, instead of sacrificing one outright — see the measured table in
    // useSfuPublisher, which this deliberately matches so a student sees the
    // same picture whichever path carries it.
    params.degradationPreference = "balanced";
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    params.encodings[0].maxBitrate = bitrate;
    params.encodings[0].maxFramerate = 60;
    try {
      await sender.setParameters(params);
    } catch {
      onError(`Could not set video bitrate to ${bitrate}`);
    }
  }
}

/**
 * @param supersededBySfu the SFU is carrying the screen right now, so this mesh
 *   must stand down rather than run beside it.
 *
 *   Both paths used to run at once in online mode. That does not add
 *   redundancy, it doubles the bill: the instructor encoded and uploaded the
 *   screen once to Cloudflare *and* once per student over TURN, and each
 *   student downloaded two full copies to display one. On any ordinary uplink
 *   the two halves starve each other, and because we ask for
 *   maintain-resolution the encoder pays for the shortfall in framerate — a
 *   share that crawls, stalls and blacks out for no visible reason.
 *
 *   So the mesh is a fallback in the real sense: dormant while the SFU works,
 *   resumed the moment it stops.
 */
export function useWebRtcPublisher(
  sessionId: string | null,
  send: WsSend,
  on: WsOn,
  off: WsOff,
  supersededBySfu = false,
) {
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  /**
   * When each student first said they had no picture while the SFU was meant
   * to be carrying it. Used to give Cloudflare a moment before this side takes
   * the student back onto a direct connection.
   */
  const sfuGraceRef = useRef<Map<string, number>>(new Map());
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const streamingToStudents = useAppStore((s) => s.streamingToStudents);
  const students = useAppStore((s) => s.students);
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  const streamingMode = useAppStore((s) => s.settings.streamingMode);
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const createPeerRef = useRef<
    (studentId: string, forceRestart?: boolean) => Promise<void>
  >(async () => {});
  // Students who asked for an offer before the capture stream existed.
  const pendingOffersRef = useRef<Set<string>>(new Set());
  // Students whose offer is being built right now. peersRef alone cannot serve
  // as that record: it is only written after `await getRtcConfig()`, so every
  // concurrent caller sails past the has() check and builds its own peer.
  const buildingOfferRef = useRef<Set<string>>(new Set());
  // Pending "is this student really gone?" timers, keyed by student id.
  const disconnectTimersRef = useRef<Map<string, number>>(new Map());
  // Only log a bitrate change when it actually changes, not on every reconcile.
  const lastBitrateRef = useRef<number | null>(null);

  const closePeer = (studentId: string) => {
    // Any pending "still down?" check is moot once the peer is gone, and left
    // running it would rebuild a peer for a student who has already left.
    const timer = disconnectTimersRef.current.get(studentId);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      disconnectTimersRef.current.delete(studentId);
    }

    const peer = peersRef.current.get(studentId);
    if (!peer) return;
    try {
      peer.close();
    } catch {
      // ignore
    }
    peersRef.current.delete(studentId);
  };

  const createPeerForStudent = async (
    studentId: string,
    forceRestart = false,
  ) => {
    if (!sessionId) {
      addDebugLog(`No offer for ${studentId}: no active session id`, "warn");
      return;
    }
    // Already connected and not being restarted — the steady state, not worth
    // logging: the reconcile effect re-runs on every roster change.
    if (peersRef.current.has(studentId) && !forceRestart) return;
    // An offer for this student is already in flight. Three callers race here
    // routinely — the roster reconcile, the deferred-offer retry, and the
    // student's own request-offer — and without this each one built a peer and
    // sent an offer. The student answers the last offer it saw, handleAnswer
    // looks the peer up by student id and finds only the survivor, so the other
    // answers land on the wrong description: "WebRTC answer failed", twice,
    // exactly as the session log shows. Whichever peer wins may also be one the
    // student has already discarded, which is how a connection reports
    // "connected" while the phone renders nothing.
    if (buildingOfferRef.current.has(studentId)) {
      addDebugLog(
        `Offer for ${studentId} already in flight — not sending a second`,
        "info",
      );
      return;
    }
    if (!streamingToStudents) {
      addDebugLog(`No offer for ${studentId}: screen sharing is off`, "warn");
      return;
    }
    if (forceRestart) {
      closePeer(studentId);
    }

    const stream = sharedDisplayStream;
    if (!stream) {
      // The capture stream is not ready yet (it only exists once the first frame
      // has been drawn). Remember the request instead of dropping it — without
      // this, a student who asks before capture warms up never gets an offer.
      pendingOffersRef.current.add(studentId);
      addDebugLog(
        `Offer for ${studentId} deferred: capture stream not ready yet`,
        "warn",
      );
      return;
    }
    pendingOffersRef.current.delete(studentId);
    buildingOfferRef.current.add(studentId);
    try {
      const peer = new RTCPeerConnection(await getRtcConfig());
      peersRef.current.set(studentId, peer);

      stream.getTracks().forEach((track) => {
        // Screen content, not camera: tell the encoder to protect detail (text,
        // code) instead of smoothness. Without this the browser treats the canvas
        // track as motion video and blurs static text to hold framerate.
        // "motion", not "detail": the detail profile treats the screen as
        // still content and trades the framerate away to keep it sharp, which
        // reads as a frozen picture the moment anything moves.
        if (track.kind === "video") track.contentHint = "motion";
        peer.addTrack(track, stream);
      });

      // Sized for the class as it stands; the reconcile effect re-levels every
      // existing peer whenever the roster changes.
      await applyVideoBitrate(
        peer,
        videoBitrateForPeerCount(peersRef.current.size, streamingMode),
        (message) => addDebugLog(`${message} for ${studentId}`, "warn"),
      );
      peer.onicecandidate = (event) => {
        if (!event.candidate) return;
        // TEMP DIAGNOSTIC — "sent" in the log means the offer left this
        // machine, not that ICE completed. Logging candidate types (host /
        // srflx / relay) to see whether ICE is gathering anything usable at
        // all before guessing further.
        addDebugLog(
          `WebRTC[${studentId}] ICE candidate: type=${event.candidate.type} proto=${event.candidate.protocol} addr=${event.candidate.address ?? "?"}`,
          "info",
        );
        send("webrtc-ice-candidate", {
          candidate: event.candidate.toJSON(),
          studentId,
        });
      };
      peer.onicegatheringstatechange = () => {
        addDebugLog(
          `WebRTC[${studentId}] ICE gathering: ${peer.iceGatheringState}`,
          "info",
        );
      };
      peer.oniceconnectionstatechange = () => {
        addDebugLog(
          `WebRTC[${studentId}] ICE connection: ${peer.iceConnectionState}`,
          "info",
        );
      };
      peer.onconnectionstatechange = () => {
        addDebugLog(`WebRTC[${studentId}] ${peer.connectionState}`, "info");

        const clearDisconnectTimer = () => {
          const timer = disconnectTimersRef.current.get(studentId);
          if (timer !== undefined) {
            window.clearTimeout(timer);
            disconnectTimersRef.current.delete(studentId);
          }
        };

        if (peer.connectionState === "connected") {
          clearDisconnectTimer();
          return;
        }

        // Terminal: the connection is not coming back on its own.
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          clearDisconnectTimer();
          closePeer(studentId);
          window.setTimeout(() => {
            void createPeerRef.current(studentId, true);
          }, 750);
          return;
        }

        // "disconnected" is NOT terminal. ICE reports it for a momentary gap —
        // a candidate switch, a lost packet burst, a relay hiccup — and browsers
        // recover on their own, usually within a second or two. Tearing the peer
        // down here fought that recovery and blanked the student's video every
        // time it happened, which on a relayed path is often: the screen visibly
        // flashed on and off. The receiver side already waits this out; this now
        // matches it, and only rebuilds if the gap outlasts the grace window.
        if (peer.connectionState === "disconnected") {
          if (disconnectTimersRef.current.has(studentId)) return;
          const timer = window.setTimeout(() => {
            disconnectTimersRef.current.delete(studentId);
            const current = peersRef.current.get(studentId);
            if (!current || current.connectionState === "connected") return;
            addDebugLog(`WebRTC[${studentId}] still down after grace — rebuilding`, "warn");
            closePeer(studentId);
            void createPeerRef.current(studentId, true);
          }, DISCONNECT_GRACE_MS);
          disconnectTimersRef.current.set(studentId, timer);
        }
      };

      const offer = await peer.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false,
      });
      await peer.setLocalDescription(offer);
      send("webrtc-offer", { sdp: offer, targetStudentId: studentId });
      addDebugLog(`WebRTC offer sent to ${studentId}`, "success");
    } finally {
      buildingOfferRef.current.delete(studentId);
    }
  };
  createPeerRef.current = createPeerForStudent;

  // A new capture stream (source switched, or quality/framerate changed
  // mid-session) means every existing peer is still sending tracks from a
  // stream that has been stopped. Renegotiate rather than leaving students on
  // a frozen frame.
  const lastStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    if (!sharedDisplayStream) {
      lastStreamRef.current = null;
      return;
    }
    const previous = lastStreamRef.current;
    lastStreamRef.current = sharedDisplayStream;
    if (!previous || previous === sharedDisplayStream) return;
    addDebugLog(
      "Capture stream replaced — re-offering to every student",
      "info",
    );
    [...peersRef.current.keys()].forEach((studentId) => {
      void createPeerRef.current(studentId, true);
    });
  }, [sharedDisplayStream, addDebugLog]);

  useEffect(() => {
    if (!sessionId || !streamingToStudents || supersededBySfu) return;
    // sharedDisplayStream is a dep: the capture stream often becomes ready AFTER
    // a student has already joined/requested. Without it here, createPeerForStudent
    // early-returns (no stream) and never retries → no offer, no video.
    if (!sharedDisplayStream) return;
    const activeIds = new Set(students.map((s) => s.studentId));

    // Serve anyone who asked while the stream was still warming up.
    const deferred = [...pendingOffersRef.current].filter((id) =>
      activeIds.has(id),
    );
    pendingOffersRef.current.clear();
    deferred.forEach((id) => {
      addDebugLog(`Retrying deferred offer for ${id}`, "info");
      void createPeerForStudent(id, true);
    });

    void Promise.all(
      students.map((s) => createPeerForStudent(s.studentId)),
    ).then(() => {
      [...peersRef.current.keys()].forEach((studentId) => {
        if (!activeIds.has(studentId)) closePeer(studentId);
      });

      // Re-level everyone for the class as it now stands. Without this only the
      // student who just joined gets the right ceiling, and the peers already
      // running keep whatever share was correct when the room was emptier —
      // so a filling room quietly oversubscribes the uplink.
      const bitrate = videoBitrateForPeerCount(
        peersRef.current.size,
        streamingMode,
      );
      if (bitrate !== lastBitrateRef.current) {
        addDebugLog(
          `Screen share now ${(bitrate / 1_000_000).toFixed(1)} Mbps per student across ${peersRef.current.size} (${streamingMode})`,
          "info",
        );
        lastBitrateRef.current = bitrate;
      }
      peersRef.current.forEach((peer, studentId) => {
        void applyVideoBitrate(peer, bitrate, (message) =>
          addDebugLog(`${message} for ${studentId}`, "warn"),
        );
      });
    });
  }, [
    sessionId,
    streamingToStudents,
    students,
    sharedDisplayStream,
    streamingMode,
    supersededBySfu,
    addDebugLog,
  ]);

  useEffect(() => {
    const handleAnswer = async (payload: WebRtcAnswerPayload) => {
      const studentId = payload.studentId;
      const peer = peersRef.current.get(studentId);
      if (!peer || !payload.sdp) return;
      try {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } catch {
        addDebugLog(`WebRTC answer failed for ${studentId}`, "error");
      }
    };

    const handleIce = async (payload: WebRtcIceCandidatePayload) => {
      const studentId = payload.studentId;
      if (!studentId || !payload.candidate) return;
      const peer = peersRef.current.get(studentId);
      if (!peer) return;
      try {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        addDebugLog(`WebRTC ICE failed for ${studentId}`, "warn");
      }
    };

    const handleRequestOffer = async (payload: WebRtcRequestOfferPayload) => {
      const studentId = payload?.studentId;
      if (!studentId) return;
      if (supersededBySfuRef.current) {
        // A student only asks for a direct connection when they have no
        // picture, so a *repeated* ask is evidence the SFU is not reaching
        // them. Refusing every time deadlocked exactly those students: the SFU
        // never delivered, the mesh was never allowed to, and the room sat on
        // "No live screen right now" for the whole session while this side
        // logged that it was ignoring them.
        //
        // The first ask still gets the benefit of the doubt — a student who
        // joined a moment ago is probably mid-handshake with Cloudflare and
        // would only waste an upload slot on a stream they are about to get.
        const firstAskedAt = sfuGraceRef.current.get(studentId);
        const now = Date.now();
        if (firstAskedAt === undefined) {
          sfuGraceRef.current.set(studentId, now);
          addDebugLog(
            `${studentId} has no picture yet — giving the SFU ${Math.round(SFU_GRACE_MS / 1000)}s before falling back`,
            "info",
          );
          return;
        }
        if (now - firstAskedAt < SFU_GRACE_MS) return;
        addDebugLog(
          `SFU is not reaching ${studentId} — falling back to a direct connection`,
          "warn",
        );
        // Fall through: serve them directly.
      }
      addDebugLog(`WebRTC re-offer requested by ${studentId}`, "info");
      await createPeerRef.current(studentId, true);
    };

    on("webrtc-answer", handleAnswer);
    on("webrtc-ice-candidate", handleIce);
    on("webrtc-request-offer", handleRequestOffer);
    return () => {
      off("webrtc-answer");
      off("webrtc-ice-candidate");
      off("webrtc-request-offer");
    };
  }, [on, off, addDebugLog]);

  // Read through a ref: the socket handlers above are registered once, so a
  // captured boolean would freeze at whatever it was when they were bound.
  const supersededBySfuRef = useRef(supersededBySfu);
  useEffect(() => {
    supersededBySfuRef.current = supersededBySfu;
    // Leaving the SFU behind resets everyone's benefit of the doubt, so a
    // later hand-over starts its grace period fresh rather than falling back
    // instantly on a stale record from the last one.
    if (!supersededBySfu) sfuGraceRef.current.clear();
  }, [supersededBySfu]);

  // Hand the session over to the SFU, and take it back if the SFU drops.
  useEffect(() => {
    if (!supersededBySfu) return;
    if (peersRef.current.size) {
      addDebugLog(
        `SFU is carrying the screen — closing ${peersRef.current.size} direct connection(s)`,
        "info",
      );
    }
    pendingOffersRef.current.clear();
    [...peersRef.current.keys()].forEach(closePeer);
  }, [supersededBySfu, addDebugLog]);

  useEffect(() => {
    if (streamingToStudents) return;
    send("webrtc-session-reset", { reason: "stream-disabled" });
    [...peersRef.current.keys()].forEach(closePeer);
  }, [streamingToStudents, send]);

  // Swapping the microphone must not renegotiate: replaceTrack keeps the
  // existing sender (and the student's connection) intact.
  const replaceAudioTrack = useCallback(
    async (track: MediaStreamTrack | null) => {
      for (const peer of peersRef.current.values()) {
        for (const sender of peer.getSenders()) {
          if (sender.track?.kind !== "audio") continue;
          try {
            await sender.replaceTrack(track);
          } catch {
            addDebugLog("Could not swap the outgoing microphone track", "warn");
          }
        }
      }
    },
    [addDebugLog],
  );

  useEffect(() => {
    return () => {
      [...peersRef.current.keys()].forEach(closePeer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setSharedDisplayStream(null);
    };
  }, [setSharedDisplayStream]);

  return { replaceAudioTrack };
}
