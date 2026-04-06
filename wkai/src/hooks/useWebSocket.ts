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
  const { setStudentCount, addGuideBlock, addSharedFile } = useAppStore();

  const connect = useCallback(() => {
    if (!sessionId) return;
    const wsUrl = backendUrl.replace(/^http/, "ws") + `/ws?session=${sessionId}&role=instructor`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => console.log("[WKAI WS] Connected");

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = handlers.current.get(msg.type);
        if (handler) handler(msg.payload);
        switch (msg.type) {
          case "guide-block":
            addGuideBlock(msg.payload as never);
            break;
          case "file-shared":
            addSharedFile(msg.payload as never);
            break;
          case "student-joined":
            setStudentCount((msg.payload as { count: number }).count);
            break;
          case "student-left":
            setStudentCount((msg.payload as { count: number }).count);
            break;
          case "share-intent-detected":
            // LangGraph intent agent detected "share this file" in audio
            window.dispatchEvent(new CustomEvent("wkai:shareIntent", { detail: msg.payload }));
            break;
        }
      } catch (err) {
        console.error("[WKAI WS] Parse error", err);
      }
    };

    ws.current.onclose = () => setTimeout(connect, 3000);
    ws.current.onerror = (err) => console.error("[WKAI WS] Error", err);
  }, [sessionId, backendUrl]);

  useEffect(() => {
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

    return () => {
      ws.current?.close();
      window.removeEventListener("wkai:transcript", handleTranscript);
    };
  }, [connect]);

  const send = useCallback(<T>(type: WsEventType | string, payload: T) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const on = useCallback(<T>(type: WsEventType, handler: Handler<T>) => {
    handlers.current.set(type, handler as Handler);
  }, []);

  return { send, on };
}