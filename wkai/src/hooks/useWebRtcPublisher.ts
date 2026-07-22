import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import type {
  WebRtcAnswerPayload,
  WebRtcIceCandidatePayload,
  WebRtcRequestOfferPayload,
  WsEventType,
} from "../types";

type WsSend = <T>(type: WsEventType | string, payload: T) => void;
type WsOn = <T>(type: WsEventType, handler: (payload: T) => void) => void;
type WsOff = (type: WsEventType) => void;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};



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
    if (!sessionId || !streamingToStudents) return;
    if (forceRestart) {
      closePeer(studentId);
    }
    if (peersRef.current.has(studentId)) return;

    const stream = sharedDisplayStream;
    if (!stream) return;
    const peer = new RTCPeerConnection(RTC_CONFIG);
    peersRef.current.set(studentId, peer);

    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      send("webrtc-ice-candidate", {
        candidate: event.candidate.toJSON(),
        studentId,
      });
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

    void Promise.all(students.map((s) => createPeerForStudent(s.studentId)));
    [...peersRef.current.keys()].forEach((studentId) => {
      if (!activeIds.has(studentId)) closePeer(studentId);
    });
  }, [sessionId, streamingToStudents, students, sharedDisplayStream]);

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
