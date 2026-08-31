import { useEffect, useRef, useState } from "react";
import type { WebRtcIceCandidatePayload, WebRtcOfferPayload } from "../types";
import { useStore } from "../store";
import { getRtcConfig } from "../lib/ice";

export function useWebRtcReceiver(send: <T>(type: string, payload: T) => void) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const queuedIceRef = useRef<RTCIceCandidateInit[]>([]);
  const addDebugLog = useStore((s) => s.addDebugLog);
  const studentId = useStore((s) => s.studentId);
  const backgroundLiveEnabled = useStore((s) => s.backgroundLiveEnabled);

  const requestOffer = (reason: string) => {
    send("webrtc-request-offer", { reason, studentId });
    addDebugLog(`Requested WebRTC offer (${reason})`, "info");
  };

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
      const peer = new RTCPeerConnection(await getRtcConfig());
      peerRef.current = peer;

      peer.onicecandidate = (iceEvent) => {
        if (!iceEvent.candidate) return;
        // TEMP DIAGNOSTIC — see whether this side is gathering usable
        // candidates (host/srflx/relay) before guessing at the failure mode.
        // console.log too: StudentDebugPanel isn't mounted anywhere in the
        // app, so addDebugLog alone is invisible with no other UI for it.
        console.log(
          `[WebRTC recv] ICE candidate: type=${iceEvent.candidate.type} proto=${iceEvent.candidate.protocol} addr=${iceEvent.candidate.address ?? "?"}`
        );
        addDebugLog(
          `ICE candidate: type=${iceEvent.candidate.type} proto=${iceEvent.candidate.protocol} addr=${iceEvent.candidate.address ?? "?"}`,
          "info"
        );
        send("webrtc-ice-candidate", {
          candidate: iceEvent.candidate.toJSON(),
          studentId,
        });
      };
      peer.onicegatheringstatechange = () => {
        console.log(`[WebRTC recv] ICE gathering: ${peer.iceGatheringState}`);
        addDebugLog(`ICE gathering: ${peer.iceGatheringState}`, "info");
      };
      peer.oniceconnectionstatechange = () => {
        console.log(`[WebRTC recv] ICE connection: ${peer.iceConnectionState}`);
        addDebugLog(`ICE connection: ${peer.iceConnectionState}`, "info");
      };
      peer.ontrack = (trackEvent) => {
        console.log("[WebRTC recv] ontrack fired");
        const [stream] = trackEvent.streams;
        if (stream) {
          setRemoteStream(stream);
          addDebugLog("WebRTC live video started", "success");
        }
      };
      peer.onconnectionstatechange = () => {
        console.log(`[WebRTC recv] connectionState: ${peer.connectionState}`);
        addDebugLog(`WebRTC receiver ${peer.connectionState}`, "info");
        // "disconnected" is often transient (brief ICE hiccup) and browsers
        // frequently recover from it on their own — tearing the peer down
        // immediately on it would fight that self-recovery. Only terminal
        // states get an explicit rebuild.
        if (peer.connectionState === "failed" || peer.connectionState === "closed") {
          // closePeer() alone left the student stuck with no video and no
          // way to recover short of remounting (rejoining/restarting the
          // session) — the instructor side retries its own dead peers, but
          // that only helps if the INSTRUCTOR's connection died, not the
          // student's. Ask for a fresh offer ourselves too.
          closePeer();
          window.setTimeout(() => requestOffer("connection-lost"), 750);
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
    requestOffer("receiver-mounted");
    return () => {
      window.removeEventListener("wkai:webrtc-offer", handleOffer);
      window.removeEventListener("wkai:webrtc-ice-candidate", handleIce);
      window.removeEventListener("wkai:webrtc-session-reset", handleReset);
      closePeer();
    };
  }, [addDebugLog, send, studentId]);

  useEffect(() => {
    const hasLiveTrack = () => {
      if (!remoteStream) return false;
      const [videoTrack] = remoteStream.getVideoTracks();
      if (!videoTrack) return false;
      return videoTrack.readyState === "live";
    };

    const applyVisibilityPolicy = () => {
      const hidden = document.visibilityState === "hidden";
      if (!remoteStream) return;
      for (const track of remoteStream.getVideoTracks()) {
        track.enabled = backgroundLiveEnabled || !hidden;
      }
      if (hidden && !backgroundLiveEnabled) {
        addDebugLog("Live video paused while tab hidden", "info");
      }
      if (!hidden) {
        addDebugLog("Live video resumed", "info");
        if (!hasLiveTrack()) {
          requestOffer("tab-visible");
        }
      }
    };

    const handleSocketOpen = () => {
      if (!hasLiveTrack()) {
        requestOffer("socket-open");
      }
    };

    document.addEventListener("visibilitychange", applyVisibilityPolicy);
    window.addEventListener("wkai:socket-open", handleSocketOpen);
    applyVisibilityPolicy();
    return () => {
      document.removeEventListener("visibilitychange", applyVisibilityPolicy);
      window.removeEventListener("wkai:socket-open", handleSocketOpen);
    };
  }, [remoteStream, backgroundLiveEnabled, addDebugLog, send, studentId]);

  return { remoteStream };
}
