import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import type { WsMessage, Session, GuideBlock, ComprehensionQuestion, SharedFile, ErrorResolution } from "../types";

const BACKEND_WS = import.meta.env.VITE_BACKEND_WS ?? "ws://localhost:4000";

export function useRoomSocket(roomCode: string) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    studentId,
    setConnected,
    setSession,
    setSessionEnded,
    setStudentCount,
    addGuideBlock,
    setGuideBlocks,
    setPendingQuestion,
    addSharedFile,
    setSharedFiles,
    setResolution,
  } = useStore();

  const connect = useCallback(() => {
    const url = `${BACKEND_WS}/ws?session=${roomCode}&role=student&studentId=${studentId}`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      setConnected(true);
      console.log("[WS] Connected to room", roomCode);
    };

    ws.current.onmessage = (event) => {
      let msg: WsMessage;
      try { msg = JSON.parse(event.data); } catch { return; }
      dispatch(msg);
    };

    ws.current.onclose = () => {
      setConnected(false);
      // Auto-reconnect after 3s unless session ended
      if (!useStore.getState().sessionEnded) {
        reconnectTimer.current = setTimeout(connect, 3000);
      }
    };

    ws.current.onerror = () => ws.current?.close();
  }, [roomCode, studentId]);

  function dispatch(msg: WsMessage) {
    switch (msg.type) {
      case "session-state": {
        const p = msg.payload as { session: Session; guideBlocks: GuideBlock[]; sharedFiles: SharedFile[] };
        setSession(p.session);
        setGuideBlocks(p.guideBlocks ?? []);
        setSharedFiles(p.sharedFiles ?? []);
        break;
      }
      case "guide-block":
        addGuideBlock(msg.payload as GuideBlock);
        break;
      case "comprehension-question":
        setPendingQuestion(msg.payload as ComprehensionQuestion);
        break;
      case "file-shared":
        addSharedFile(msg.payload as SharedFile);
        break;
      case "student-joined":
      case "student-left":
        setStudentCount((msg.payload as { count: number }).count);
        break;
      case "error-resolved":
        setResolution(msg.payload as ErrorResolution);
        break;
      case "session-ended":
        setSessionEnded(true);
        setConnected(false);
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
      clearTimeout(reconnectTimer.current!);
      ws.current?.close();
    };
  }, [connect]);

  return { send };
}
