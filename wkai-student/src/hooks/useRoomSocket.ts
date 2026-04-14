import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import type { WsMessage, Session, GuideBlock, ComprehensionQuestion, SharedFile, ErrorResolution } from "../types";

function getWsUrl(): string {
  const stored = sessionStorage.getItem('wkai_backend_url');
  if (stored) return stored.replace(/^http/, 'ws');
  return import.meta.env.VITE_BACKEND_WS ?? 'ws://localhost:4000';
}
const BACKEND_WS = getWsUrl();

export function useRoomSocket(roomCode: string) {
  const ws = useRef<WebSocket | null>(null);
  const store = useStore.getState();
  const studentId = store.studentId;

  const connect = useCallback(() => {
    const studentName = encodeURIComponent(
      sessionStorage.getItem("wkai_student_name") ?? "Student"
    );
    const url = `${BACKEND_WS}/ws?session=${roomCode}&role=student&studentId=${studentId}&studentName=${studentName}`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      useStore.getState().setConnected(true);
      console.log("[WS] Connected to room", roomCode);
    };

    ws.current.onmessage = (event) => {
      let msg: WsMessage;
      try { msg = JSON.parse(event.data); } catch { return; }
      dispatch(msg);
    };

    ws.current.onclose = () => {
      useStore.getState().setConnected(false);
    };

    ws.current.onerror = (err) => {
      console.error("[WS] Socket error", err);
    };
  }, [roomCode, studentId]);

  function dispatch(msg: WsMessage) {
    switch (msg.type) {
      case "session-state": {
        const p = msg.payload as { session: Session; guideBlocks: GuideBlock[]; sharedFiles: SharedFile[] };
        useStore.getState().setSession(p.session);
        useStore.getState().setGuideBlocks(p.guideBlocks ?? []);
        useStore.getState().setSharedFiles(p.sharedFiles ?? []);
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
      case "session-ended":
        useStore.getState().setSessionEnded(true);
        useStore.getState().setConnected(false);
        ws.current?.close();
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
    connect();
    return () => {
      ws.current?.close();
    };
  }, [connect]);

  return { send };
}
