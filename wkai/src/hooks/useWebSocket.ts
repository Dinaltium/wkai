import { useEffect, useRef, useCallback } from "react";
import type { WsEventType } from "../types";
import { useAppStore } from "../store";

type Handler<T = unknown> = (payload: T) => void;

interface UseWsOptions {
  sessionId: string | null;
  backendUrl: string;
}

export function useWebSocket({ sessionId, backendUrl }: UseWsOptions) {
  const ws = useRef<WebSocket | null>(null);
  const handlers = useRef<Map<WsEventType, Handler>>(new Map());
  const reconnectTimeout = useRef<number | null>(null);
  const shouldReconnect = useRef(true);
  const isConnectingRef = useRef(false);
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECT = 3;
  const {
    setStudentCount,
    addGuideBlock,
    addSharedFile,
    addDebugLog,
    setStudents,
    addStudent,
    removeStudent,
    addInboxMessage,
  } = useAppStore();

  const connect = useCallback(() => {
    if (!sessionId) return;
    if (isConnectingRef.current) return;
    if (ws.current?.readyState === WebSocket.OPEN || ws.current?.readyState === WebSocket.CONNECTING) {
      return;
    }
    if (reconnectTimeout.current) {
      window.clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    isConnectingRef.current = true;

    const wsUrl = backendUrl.replace(/^http/, "ws") + `/ws?session=${sessionId}&role=instructor`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      isConnectingRef.current = false;
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      reconnectCountRef.current = 0;
      addDebugLog("WebSocket connected to backend", "success");
      try {
        ws.current?.send(
          JSON.stringify({
            type: "instructor-hello",
            payload: { ts: new Date().toISOString(), sessionId },
          })
        );
        addDebugLog("WS hello sent", "info");
      } catch {
        addDebugLog("WS hello failed to send", "warn");
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = handlers.current.get(msg.type);
        if (handler) handler(msg.payload);
        switch (msg.type) {
          case "session-state": {
            const p = msg.payload as { studentList?: Array<{ studentId: string; studentName: string; joinedAt: string }> };
            if (p.studentList) setStudents(p.studentList);
            addDebugLog("WS received: session-state", "info");
            break;
          }
          case "guide-block":
            addGuideBlock(msg.payload as never);
            addDebugLog("WS received: guide-block", "info");
            break;
          case "file-shared":
            addSharedFile(msg.payload as never);
            addDebugLog("WS received: file-shared", "info");
            break;
          case "student-joined":
            {
              const p = msg.payload as { count: number; studentId?: string; studentName?: string };
              setStudentCount(p.count);
              if (p.studentId && p.studentName) {
                addStudent({ studentId: p.studentId, studentName: p.studentName, joinedAt: new Date().toISOString() });
                window.dispatchEvent(new CustomEvent("wkai:student-joined", { detail: p }));
                addDebugLog(`Student joined: ${p.studentName}`, "success");
              } else {
                addDebugLog("WS received: student-joined", "info");
              }
            }
            break;
          case "student-left":
            {
              const p = msg.payload as { count: number; studentId?: string; studentName?: string };
              setStudentCount(p.count);
              if (p.studentId) removeStudent(p.studentId);
              if (p.studentName) addDebugLog(`Student left: ${p.studentName}`, "warn");
              else addDebugLog("WS received: student-left", "info");
            }
            break;
          case "share-intent-detected":
            // LangGraph intent agent detected "share this file" in audio
            window.dispatchEvent(new CustomEvent("wkai:shareIntent", { detail: msg.payload }));
            addDebugLog("WS received: share-intent-detected", "success");
            break;
          case "student-message": {
            const p = msg.payload as {
              messageId: string;
              studentId: string;
              studentName: string;
              message: string;
              timestamp: string;
            };
            addInboxMessage({ ...p, replied: false });
            addDebugLog(`Message from ${p.studentName}: ${p.message.slice(0, 60)}`, "info");
            window.dispatchEvent(new CustomEvent("wkai:student-message", { detail: p }));
            break;
          }
        }
      } catch (err) {
        console.error("[WKAI WS] Parse error", err);
        addDebugLog("WebSocket message parse error", "warn");
      }
    };

    ws.current.onclose = () => {
      isConnectingRef.current = false;
      if (!shouldReconnect.current) return;
      reconnectCountRef.current += 1;
      addDebugLog("WebSocket disconnected", "warn");
      if (reconnectCountRef.current >= MAX_RECONNECT) {
        addDebugLog("Backend appears down — clearing session", "error");
        useAppStore.getState().setSession(null);
        useAppStore.getState().setCapture({
          isCapturing: false,
          framesSent: 0,
          lastFrameAt: null,
          aiProcessing: false,
        });
        window.location.hash = "/";
        return;
      }
      addDebugLog("Retrying backend connection in 3s", "warn");
      reconnectTimeout.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };
    ws.current.onerror = () => {
      isConnectingRef.current = false;
      addDebugLog("WebSocket error", "warn");
    };
  }, [sessionId, backendUrl]);

  useEffect(() => {
    shouldReconnect.current = true;
    connect();

    // Forward audio transcripts to WS server for:
    //   a) enriching the next screen-frame AI pipeline call (context)
    //   b) running the LangGraph intent detection agent
    const handleTranscript = (e: Event) => {
      const { transcript, sessionId: sid } = (e as CustomEvent).detail;
      // Include current watchedFiles so the intent agent can match file names
      const currentWatchedFiles = useAppStore.getState().watchedFiles;
      send("audio-transcript", {
        transcript,
        sessionId:   sid,
        recentFiles: currentWatchedFiles.map((f) => ({ name: f.name, path: f.path })),
      });
    };
    window.addEventListener("wkai:transcript", handleTranscript);

    const handleScreenFrame = (e: Event) => {
      const payload = (e as CustomEvent).detail as {
        frameB64?: string;
        frame_b64?: string;
        timestamp: string;
        streamToStudents?: boolean;
        stream_to_students?: boolean;
      };
      const { streamingToStudents } = useAppStore.getState();
      const frameB64 = payload.frameB64 ?? payload.frame_b64 ?? "";
      if (!frameB64) {
        addDebugLog("Skipping frame send: missing frameB64 payload", "warn");
        return;
      }
      const socketState = ws.current?.readyState;
      if (socketState !== WebSocket.OPEN) {
        addDebugLog(`Skipping frame send: WS not open (state=${String(socketState)})`, "warn");
        return;
      }
      send("screen-frame", {
        frameB64,
        timestamp: payload.timestamp,
        streamToStudents: streamingToStudents,
      });
      console.log(
        `[WKAI WS OUT] screen-frame sent session=${sessionId ?? "none"} b64_len=${frameB64.length} stream=${streamingToStudents}`
      );
      addDebugLog(
        `WS sent screen-frame (b64=${frameB64.length}, stream=${streamingToStudents ? "on" : "off"})`,
        "info"
      );
    };
    window.addEventListener("wkai:screen-frame", handleScreenFrame);

    return () => {
      shouldReconnect.current = false;
      isConnectingRef.current = false;
      if (reconnectTimeout.current) {
        window.clearTimeout(reconnectTimeout.current);
        reconnectTimeout.current = null;
      }
      try {
        ws.current?.close();
      } catch {
        // ignore
      }
      window.removeEventListener("wkai:transcript", handleTranscript);
      window.removeEventListener("wkai:screen-frame", handleScreenFrame);
    };
  }, [connect]);

  const send = useCallback(<T>(type: WsEventType | string, payload: T) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    } else {
      const state = ws.current?.readyState;
      addDebugLog(`WS blocked send(${String(type)}): socket state=${String(state)}`, "warn");
      console.warn(`[WKAI WS OUT] blocked type=${String(type)} state=${String(state)}`);
    }
  }, []);

  const on = useCallback(<T>(type: WsEventType, handler: Handler<T>) => {
    handlers.current.set(type, handler as Handler);
  }, []);

  const off = useCallback((type: WsEventType) => {
    handlers.current.delete(type);
  }, []);

  return { send, on, off };
}