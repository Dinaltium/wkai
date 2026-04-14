import { useEffect, useRef, useState } from "react";
import type { WebRtcIceCandidatePayload, WebRtcOfferPayload } from "../types";
import { useStore } from "../store";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function useWebRtcReceiver(send: <T>(type: string, payload: T) => void) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const queuedIceRef = useRef<RTCIceCandidateInit[]>([]);
  const addDebugLog = useStore((s) => s.addDebugLog);
  const studentId = useStore((s) => s.studentId);

  const closePeer = () => {
    if (!peerRef.current) return;
    try {
      peerRef.current.close();
    } catch {
      // ignore
    }
    peerRef.current = null;
    queuedIceRef.current = [];
    setRemoteStream(null);
  };

  useEffect(() => {
    const handleOffer = async (event: Event) => {
      const payload = (event as CustomEvent<WebRtcOfferPayload>).detail;
      if (!payload?.sdp) return;

      closePeer();
      const peer = new RTCPeerConnection(RTC_CONFIG);
      peerRef.current = peer;

      peer.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        send("webrtc-ice-candidate", {
          candidate: iceEvent.candidate.toJSON(),
          studentId,
        });
      };
      peer.ontrack = (trackEvent) => {
        const [stream] = trackEvent.streams;
        if (stream) {
          setRemoteStream(stream);
          addDebugLog("WebRTC live video started", "success");
        }
      };
      peer.onconnectionstatechange = () => {
        addDebugLog(`WebRTC receiver ${peer.connectionState}`, "info");
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          closePeer();
        }
      };

      try {
        await peer.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        send("webrtc-answer", { sdp: answer, studentId });
        for (const candidate of queuedIceRef.current) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        queuedIceRef.current = [];
      } catch {
        addDebugLog("WebRTC offer handling failed", "error");
      }
    };

    const handleIce = async (event: Event) => {
      const payload = (event as CustomEvent<WebRtcIceCandidatePayload>).detail;
      if (!payload?.candidate) return;
      const peer = peerRef.current;
      if (!peer || !peer.remoteDescription) {
        queuedIceRef.current.push(payload.candidate);
        return;
      }
      try {
        await peer.addIceCandidate(new RTCIceCandidate(payload.candidate));
      } catch {
        addDebugLog("WebRTC ICE candidate failed", "warn");
      }
    };

    const handleReset = () => {
      addDebugLog("WebRTC session reset by instructor", "warn");
      closePeer();
    };

    window.addEventListener("wkai:webrtc-offer", handleOffer);
    window.addEventListener("wkai:webrtc-ice-candidate", handleIce);
    window.addEventListener("wkai:webrtc-session-reset", handleReset);
    return () => {
      window.removeEventListener("wkai:webrtc-offer", handleOffer);
      window.removeEventListener("wkai:webrtc-ice-candidate", handleIce);
      window.removeEventListener("wkai:webrtc-session-reset", handleReset);
      closePeer();
    };
  }, [addDebugLog, send, studentId]);

  return { remoteStream };
}
