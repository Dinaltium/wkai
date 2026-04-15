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
  const reconnectAttemptsRef = useRef(0);
  const MAX_RECONNECT = 3;
  const reconnectTimerRef = useRef<number | null>(null);
  const shouldReconnectRef = useRef(true);
  const isConnectingRef = useRef(false);

  const connect = useCallback(() => {
    if (!shouldReconnectRef.current) return;
    if (isConnectingRef.current) return;
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    isConnectingRef.current = true;
    const studentName = encodeURIComponent(
      sessionStorage.getItem("wkai_student_name") ?? "Student"
    );
    const joinToken = encodeURIComponent(sessionStorage.getItem("wkai_join_token") ?? "");
    const url = `${BACKEND_WS}/ws?session=${roomCode}&role=student&studentId=${studentId}&studentName=${studentName}&joinToken=${joinToken}`;
    ws.current = new WebSocket(url);

    ws.current.onopen = () => {
      isConnectingRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      useStore.getState().setConnected(true);
      useStore.getState().addDebugLog("Connected to room", "success");
      console.log("[WS] Connected to room", roomCode);
    };

    ws.current.onmessage = (event) => {
      let msg: WsMessage;
      try { msg = JSON.parse(event.data); } catch { return; }
      dispatch(msg);
    };

    ws.current.onclose = () => {
      isConnectingRef.current = false;
      useStore.getState().setConnected(false);
      useStore.getState().addDebugLog("Disconnected from room", "warn");
      reconnectAttemptsRef.current += 1;
      if (reconnectAttemptsRef.current >= MAX_RECONNECT) {
        useStore.getState().setSessionEnded(true);
        return;
      }
      if (!useStore.getState().sessionEnded) {
        reconnectTimerRef.current = window.setTimeout(connect, 3000);
      }
    };

    ws.current.onerror = (err) => {
      isConnectingRef.current = false;
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
        useStore.getState().addDebugLog(
          `Guide block received: ${(msg.payload as GuideBlock).type}`,
          "success"
        );
        useStore.getState().addGuideBlock(msg.payload as GuideBlock);
        break;
      case "comprehension-question":
        useStore.getState().setPendingQuestion(msg.payload as ComprehensionQuestion);
        break;
      case "file-shared":
        useStore.getState().addSharedFile(msg.payload as SharedFile);
        break;
      case "live-explanation": {
        const p = msg.payload as { transcript: string; explanation: string; timestamp: string };
        useStore.getState().setLatestLiveExplanation(p);
        useStore.getState().addDebugLog("Live transcript explanation received", "success");
        break;
      }
      case "student-joined":
      case "student-left":
        useStore.getState().setStudentCount((msg.payload as { count: number }).count);
        break;
      case "error-resolved":
        useStore.getState().addDebugLog("Error diagnosis received", "success");
        useStore.getState().setResolution(msg.payload as ErrorResolution);
        break;
      case "instructor-reply":
      case "ai-reply": {
        const p = msg.payload as { messageId: string; reply?: string; response?: string; timestamp: string };
        const text = p.reply ?? p.response ?? "";
        useStore.getState().updateChatMessage(p.messageId, { pending: false });
        useStore.getState().addChatMessage({
          id: `${p.messageId}-reply`,
          role: msg.type === "ai-reply" ? "ai" : "instructor",
          text,
          timestamp: p.timestamp,
        });
        break;
      }
      case "session-ended":
        useStore.getState().addDebugLog("Session ended by instructor", "warn");
        useStore.getState().setSessionEnded(true);
        useStore.getState().setConnected(false);
        ws.current?.close();
        break;
      case "colab-assist-response": {
        const p = msg.payload as { advice: string; followUpQuestions?: string[] };
        useStore.getState().setColabAdvice(p.advice);
        useStore.getState().setColabFollowUps(p.followUpQuestions ?? []);
        useStore.getState().addDebugLog("Colab assistant response received", "success");
        break;
      }
      case "webrtc-offer":
      case "webrtc-ice-candidate":
      case "webrtc-session-reset":
        window.dispatchEvent(
          new CustomEvent(`wkai:${msg.type}`, {
            detail: msg.payload,
          })
        );
        useStore.getState().addDebugLog(`WS received: ${msg.type}`, "info");
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
    shouldReconnectRef.current = true;
    connect();
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      isConnectingRef.current = false;
      ws.current?.close();
    };
  }, [connect]);

  return { send };
}
