import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import type { WsMessage, Session, GuideBlock, ComprehensionQuestion, SharedFile, ErrorResolution } from "../types";

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS ?? "ws://localhost:4000";

export function useRoomSocket(roomCode: string) {
  const ws = useRef<WebSocket | null>(null);
  const shouldReconnect = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinToken = useStore((s) => s.joinToken);

  const connect = useCallback(() => {
    // Identity + role are carried by the signed join token; the server derives
    // everything from it, so we send nothing else.
    if (!joinToken) {
      console.error("[WS] No join token — cannot connect. Rejoin the room.");
      return;
    }
    const url = `${BACKEND_WS}/ws?token=${encodeURIComponent(joinToken)}`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      useStore.getState().setConnected(true);
      window.dispatchEvent(new CustomEvent("wkai:socket-open"));
      console.log("[WS] Connected to room", roomCode);
    };

    ws.current.onmessage = (event) => {
      let msg: WsMessage;
      try { msg = JSON.parse(event.data); } catch { return; }
      dispatch(msg);
    };

    ws.current.onclose = () => {
      useStore.getState().setConnected(false);
      // Auto-reconnect (e.g. after a backend restart/redeploy) unless the session
      // ended or the component unmounted.
      if (shouldReconnect.current && !useStore.getState().sessionEnded) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.current.onerror = (err) => {
      console.error("[WS] Socket error", err);
    };
  }, [roomCode, joinToken]);

  function dispatch(msg: WsMessage) {
    switch (msg.type) {
      case "session-state": {
        const p = msg.payload as { session: Session; guideBlocks: GuideBlock[]; sharedFiles: SharedFile[]; studentCount?: number; instructorOnline?: boolean };
        useStore.getState().setSession(p.session);
        // Only replace from fields the server actually sent. Defaulting to []
        // meant an older server (or any payload missing these) silently wiped
        // the guide and the shared-file list on every reconnect.
        if (p.guideBlocks) useStore.getState().setGuideBlocks(p.guideBlocks);
        if (p.sharedFiles) useStore.getState().setSharedFiles(p.sharedFiles);
        if (typeof p.studentCount === "number") {
          useStore.getState().setStudentCount(p.studentCount);
        }
        if (typeof p.instructorOnline === "boolean" && !useStore.getState().sessionEnded) {
          useStore.getState().setInstructorOffline(!p.instructorOnline);
        }
        break;
      }
      case "guide-block":
        useStore.getState().addGuideBlock(msg.payload as GuideBlock);
        break;
      case "comprehension-question":
        useStore.getState().setPendingQuestion(msg.payload as ComprehensionQuestion);
        break;
      case "file-shared":
        useStore.getState().addSharedFile(msg.payload as SharedFile);
        break;
      case "student-joined":
      case "student-left":
        useStore.getState().setStudentCount((msg.payload as { count: number }).count);
        break;
      case "error-resolved":
        useStore.getState().setResolution(msg.payload as ErrorResolution);
        break;
      case "webrtc-offer":
      case "webrtc-ice-candidate":
      case "webrtc-session-reset":
      case "live-explanation":
        window.dispatchEvent(new CustomEvent(`wkai:${msg.type}`, { detail: msg.payload }));
        if (msg.type === "live-explanation") {
          useStore.getState().setLatestLiveExplanation(msg.payload as any);
        }
        break;
      case "session-ended":
        shouldReconnect.current = false;
        useStore.getState().setSessionEnded(true);
        useStore.getState().setConnected(false);
        ws.current?.close();
        break;
      case "instructor-offline":
        if (!useStore.getState().sessionEnded) {
          useStore.getState().setInstructorOffline(true);
        }
        break;
      case "instructor-online":
        useStore.getState().setInstructorOffline(false);
        break;
      case "error":
        console.error("[WS] Server error:", (msg.payload as { message: string }).message);
        break;
    }
  }

  const send = useCallback(<T>(type: string, payload: T) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();
    return () => {
      shouldReconnect.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  return { send };
}
