import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { getRtcConfig } from "../lib/ice";
import type {
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



export function useWebRtcPublisher(
  sessionId: string | null,
  send: WsSend,
  on: WsOn,
  off: WsOff
) {
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const streamingToStudents = useAppStore((s) => s.streamingToStudents);
  const students = useAppStore((s) => s.students);
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const createPeerRef = useRef<(studentId: string, forceRestart?: boolean) => Promise<void>>(async () => {});
  // Students who asked for an offer before the capture stream existed.
  const pendingOffersRef = useRef<Set<string>>(new Set());



  const closePeer = (studentId: string) => {
    const peer = peersRef.current.get(studentId);
    if (!peer) return;
    try {
      peer.close();
    } catch {
      // ignore
    }
    peersRef.current.delete(studentId);
  };

  const createPeerForStudent = async (studentId: string, forceRestart = false) => {
    if (!sessionId) {
      addDebugLog(`No offer for ${studentId}: no active session id`, "warn");
      return;
    }
    // Already connected and not being restarted — the steady state, not worth
    // logging: the reconcile effect re-runs on every roster change.
    if (peersRef.current.has(studentId) && !forceRestart) return;
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
        "warn"
      );
      return;
    }
    pendingOffersRef.current.delete(studentId);
    const peer = new RTCPeerConnection(await getRtcConfig());
    peersRef.current.set(studentId, peer);

    stream.getTracks().forEach((track) => {
      // Screen content, not camera: tell the encoder to protect detail (text,
      // code) instead of smoothness. Without this the browser treats the canvas
      // track as motion video and blurs static text to hold framerate.
      if (track.kind === "video") track.contentHint = "detail";
      peer.addTrack(track, stream);
    });

    // The browser otherwise ramps a fresh sender from a few hundred kbps, which
    // is nowhere near enough for a full-resolution desktop and is what makes the
    // student's view look soft. Ask for a real ceiling and keep resolution
    // rather than shedding it under pressure.
    for (const sender of peer.getSenders()) {
      if (sender.track?.kind !== "video") continue;
      const params = sender.getParameters();
      params.degradationPreference = "maintain-resolution";
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = MAX_VIDEO_BITRATE_BPS;
      try {
        await sender.setParameters(params);
      } catch {
        addDebugLog(`Could not raise video bitrate for ${studentId}`, "warn");
      }
    }
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      // TEMP DIAGNOSTIC — "sent" in the log means the offer left this
      // machine, not that ICE completed. Logging candidate types (host /
      // srflx / relay) to see whether ICE is gathering anything usable at
      // all before guessing further.
      addDebugLog(
        `WebRTC[${studentId}] ICE candidate: type=${event.candidate.type} proto=${event.candidate.protocol} addr=${event.candidate.address ?? "?"}`,
        "info"
      );
      send("webrtc-ice-candidate", {
        candidate: event.candidate.toJSON(),
        studentId,
      });
    };
    peer.onicegatheringstatechange = () => {
      addDebugLog(`WebRTC[${studentId}] ICE gathering: ${peer.iceGatheringState}`, "info");
    };
    peer.oniceconnectionstatechange = () => {
      addDebugLog(`WebRTC[${studentId}] ICE connection: ${peer.iceConnectionState}`, "info");
    };
    peer.onconnectionstatechange = () => {
      addDebugLog(`WebRTC[${studentId}] ${peer.connectionState}`, "info");
      if (
        peer.connectionState === "failed" ||
        peer.connectionState === "closed" ||
        peer.connectionState === "disconnected"
      ) {
        closePeer(studentId);
        window.setTimeout(() => {
          void createPeerRef.current(studentId, true);
        }, 750);
      }
    };

    const offer = await peer.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    });
    await peer.setLocalDescription(offer);
    send("webrtc-offer", { sdp: offer, targetStudentId: studentId });
    addDebugLog(`WebRTC offer sent to ${studentId}`, "success");
  };
  createPeerRef.current = createPeerForStudent;

  useEffect(() => {
    if (!sessionId || !streamingToStudents) return;
    // sharedDisplayStream is a dep: the capture stream often becomes ready AFTER
    // a student has already joined/requested. Without it here, createPeerForStudent
    // early-returns (no stream) and never retries → no offer, no video.
    if (!sharedDisplayStream) return;
    const activeIds = new Set(students.map((s) => s.studentId));

    // Serve anyone who asked while the stream was still warming up.
    const deferred = [...pendingOffersRef.current].filter((id) => activeIds.has(id));
    pendingOffersRef.current.clear();
    deferred.forEach((id) => {
      addDebugLog(`Retrying deferred offer for ${id}`, "info");
      void createPeerForStudent(id, true);
    });

    void Promise.all(students.map((s) => createPeerForStudent(s.studentId)));
    [...peersRef.current.keys()].forEach((studentId) => {
      if (!activeIds.has(studentId)) closePeer(studentId);
    });
  }, [sessionId, streamingToStudents, students, sharedDisplayStream, addDebugLog]);

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

  useEffect(() => {
    if (streamingToStudents) return;
    send("webrtc-session-reset", { reason: "stream-disabled" });
    [...peersRef.current.keys()].forEach(closePeer);
  }, [streamingToStudents, send]);

  useEffect(() => {
    return () => {
      [...peersRef.current.keys()].forEach(closePeer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setSharedDisplayStream(null);
    };
  }, [setSharedDisplayStream]);
}
