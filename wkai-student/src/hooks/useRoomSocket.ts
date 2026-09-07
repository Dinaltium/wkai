import { useEffect, useRef, useCallback } from "react";
import { useStore } from "../store";
import { getBackendWsUrl } from "../lib/api";
import type { WsMessage, Session, GuideBlock, ComprehensionQuestion, SharedFile, ErrorResolution, ChatMessage } from "../types";


export function useRoomSocket(roomCode: string) {
  const ws = useRef<WebSocket | null>(null);
  const shouldReconnect = useRef(true);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One clean-join retry per mount, so a genuinely ended room still settles on
  // the ended state instead of looping join → ended → join.
  const rejoinAttempted = useRef(false);
  const joinToken = useStore((s) => s.joinToken);

  const connect = useCallback(() => {
    // Identity + role are carried by the signed join token; the server derives
    // everything from it, so we send nothing else.
    if (!joinToken) {
      console.error("[WS] No join token — cannot connect. Rejoin the room.");
      return;
    }
    const url = `${getBackendWsUrl()}/ws?token=${encodeURIComponent(joinToken)}`;
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
        const p = msg.payload as { session: Session; guideBlocks: GuideBlock[]; sharedFiles: SharedFile[]; chatMessages?: ChatMessage[]; studentCount?: number; instructorOnline?: boolean };
        useStore.getState().setSession(p.session);
        // Only replace from fields the server actually sent. Defaulting to []
        // meant an older server (or any payload missing these) silently wiped
        // the guide and the shared-file list on every reconnect.
        if (p.guideBlocks) useStore.getState().setGuideBlocks(p.guideBlocks);
        if (p.sharedFiles) useStore.getState().setSharedFiles(p.sharedFiles);
        if (typeof p.studentCount === "number") {
          useStore.getState().setStudentCount(p.studentCount);
        }
        // Same reasoning as the guide and shared files above: the Q&A thread
        // only lived in client memory, so a reload lost every question asked.
        if (p.chatMessages) useStore.getState().setChatMessages(p.chatMessages);
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
      case "student-message": {
        // Server ack for our own question — clears the optimistic "Sending…"
        // state on the bubble we already rendered locally.
        const p = msg.payload as { messageId: string };
        useStore.getState().updateChatMessage(p.messageId, { pending: false });
        break;
      }
      case "instructor-reply":
      case "ai-reply": {
        const p = msg.payload as { messageId: string; reply: string; timestamp?: string };
        useStore.getState().updateChatMessage(p.messageId, { pending: false });
        useStore.getState().addChatMessage({
          id: `${p.messageId}_reply`,
          role: msg.type === "ai-reply" ? "ai" : "instructor",
          text: p.reply,
          timestamp: p.timestamp ?? new Date().toISOString(),
        });
        break;
      }
      case "colab-assist-response": {
        const p = msg.payload as { advice: string; followUpQuestions?: string[] };
        useStore.getState().setColabAdvice(p.advice);
        useStore.getState().setColabFollowUps(p.followUpQuestions ?? []);
        break;
      }
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
      case "session-ended": {
        shouldReconnect.current = false;
        useStore.getState().setConnected(false);
        ws.current?.close();

        // "Session over" is the right answer for a room that genuinely ended —
        // but the server sends this for an unknown session id too, and a
        // cached token outlives the session it was issued for. So the first
        // time this arrives on a resumed identity, throw the identity away and
        // let RoomPage join this room code fresh; only believe it if the room
        // is still gone after a clean join.
        if (!rejoinAttempted.current && useStore.getState().joinToken) {
          rejoinAttempted.current = true;
          useStore.getState().clearAuth();
          break;
        }

        useStore.getState().setSessionEnded(true);
        break;
      }
      case "removed-from-session": {
        // Not a dropped connection — a decision. Stop reconnecting, or the
        // client would spend the rest of the lesson being refused every 3s.
        shouldReconnect.current = false;
        const p = msg.payload as { message?: string };
        useStore.getState().setRemovedFromSession(
          p?.message || "The instructor removed you from this session."
        );
        useStore.getState().setConnected(false);
        ws.current?.close();
        break;
      }
      case "assessment-launched":
      case "assessment-closed": {
        // The panel owns the list; it refetches rather than trusting a payload
        // that may have arrived out of order with the HTTP view.
        window.dispatchEvent(new CustomEvent("wkai:assessment-changed", { detail: msg.payload }));
        if (msg.type === "assessment-launched") {
          const p = msg.payload as { title?: string; kind?: string };
          useStore.getState().setPendingAssessment({
            title: p.title ?? "Assessment",
            kind: p.kind === "test" ? "test" : "quiz",
          });
        }
        break;
      }
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
