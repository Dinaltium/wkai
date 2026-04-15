import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import type { WebRtcAnswerPayload, WebRtcIceCandidatePayload, WsEventType } from "../types";

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
  const hasRequestedStreamRef = useRef(false);
  const addDebugLog = useAppStore((s) => s.addDebugLog);
  const streamingToStudents = useAppStore((s) => s.streamingToStudents);
  const students = useAppStore((s) => s.students);
  const sharedDisplayStream = useAppStore((s) => s.sharedDisplayStream);
  const setSharedDisplayStream = useAppStore((s) => s.setSharedDisplayStream);
  const createPeerRef = useRef<(studentId: string) => Promise<void>>(async () => {});

  const ensureStream = async () => {
    if (streamRef.current) return streamRef.current;
    if (sharedDisplayStream) {
      streamRef.current = sharedDisplayStream;
      return sharedDisplayStream;
    }
    if (hasRequestedStreamRef.current) return null;
    hasRequestedStreamRef.current = true;
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 24, max: 30 },
        displaySurface: "monitor",
      },
      audio: false,
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      // Browser-specific hints; ignored where unsupported.
      // Cast is required because these properties are not in all TS lib DOM versions.
    } as MediaStreamConstraints & {
      preferCurrentTab?: boolean;
      selfBrowserSurface?: "exclude";
    });
    streamRef.current = stream;
    setSharedDisplayStream(stream);
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        setSharedDisplayStream(null);
        streamRef.current = null;
        hasRequestedStreamRef.current = false;
        send("webrtc-session-reset", { reason: "display-track-ended" });
        addDebugLog("WebRTC stream ended by OS/user", "warn");
      };
    });
    return stream;
  };

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

  const createPeerForStudent = async (studentId: string) => {
    if (!sessionId || !streamingToStudents) return;
    if (peersRef.current.has(studentId)) return;

    const stream = await ensureStream();
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
      if (peer.connectionState === "failed" || peer.connectionState === "closed") {
        closePeer(studentId);
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
    const handleRequest = () => {
      void ensureStream();
    };
    window.addEventListener("wkai:request-stream", handleRequest);
    return () => window.removeEventListener("wkai:request-stream", handleRequest);
  }, [sharedDisplayStream]);

  useEffect(() => {
    if (!sessionId || !streamingToStudents) return;
    const activeIds = new Set(students.map((s) => s.studentId));

    void Promise.all(students.map((s) => createPeerForStudent(s.studentId)));
    [...peersRef.current.keys()].forEach((studentId) => {
      if (!activeIds.has(studentId)) closePeer(studentId);
    });
  }, [sessionId, streamingToStudents, students]);

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

    on("webrtc-answer", handleAnswer);
    on("webrtc-ice-candidate", handleIce);
    return () => {
      off("webrtc-answer");
      off("webrtc-ice-candidate");
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
      hasRequestedStreamRef.current = false;
    };
  }, [setSharedDisplayStream]);
}
