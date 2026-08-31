import { useEffect, useRef, useCallback } from "react";
import type { WsEventType, InstructorMessage, GuideBlock, SharedFile } from "../types";
import { useAppStore } from "../store";

type Handler<T = unknown> = (payload: T) => void;

interface UseWsOptions {
  sessionId: string | null;
  backendUrl: string;
  token?: string;
}

export function useWebSocket({ sessionId, backendUrl, token }: UseWsOptions) {
  const ws = useRef<WebSocket | null>(null);
  const handlers = useRef<Map<WsEventType, Handler>>(new Map());
  const { setStudentCount, addGuideBlock, addSharedFile } = useAppStore();

  const connect = useCallback(() => {
    if (!sessionId || !token) return;
    const wsUrl = backendUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => console.log("[WKAI WS] Connected to", wsUrl);

    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handler = handlers.current.get(msg.type);
        if (handler) handler(msg.payload);
        switch (msg.type) {
          case "session-state": {
            // The instructor client ignored this snapshot entirely, so its
            // guide, shared files and Q&A inbox all survived only in memory —
            // every reload or dropped socket started the room from blank.
            const p = msg.payload as {
              guideBlocks?: GuideBlock[];
              sharedFiles?: SharedFile[];
              inboxMessages?: InstructorMessage[];
              studentCount?: number;
            };
            if (p.guideBlocks) useAppStore.getState().setGuideBlocks(p.guideBlocks);
            if (p.sharedFiles) useAppStore.getState().setSharedFiles(p.sharedFiles);
            if (p.inboxMessages) useAppStore.getState().setInboxMessages(p.inboxMessages);
            if (typeof p.studentCount === "number") setStudentCount(p.studentCount);
            break;
          }
          case "guide-block":
            addGuideBlock(msg.payload as never);
            break;
          case "file-shared":
            addSharedFile(msg.payload as never);
            break;
          case "student-joined": {
            const p = msg.payload as { count: number; studentId: string; studentName: string; joinedAt: string };
            setStudentCount(p.count);
            if (p.studentId && p.studentName) {
              useAppStore.getState().addStudent({ 
                studentId: p.studentId, 
                studentName: p.studentName,
                joinedAt: p.joinedAt || new Date().toISOString()
              });
            }
            break;
          }
          case "student-left":
            setStudentCount((msg.payload as { count: number }).count);
            break;
          case "student-list": {
            const p = msg.payload as { students: { studentId: string; studentName: string; joinedAt: string }[] };
            useAppStore.getState().setStudents(p.students);
            break;
          }
          case "student-message": {
            // Student Q&A landing in the instructor inbox. Nothing consumed
            // this before, so the inbox was permanently empty even though the
            // student's message reached the server.
            const p = msg.payload as InstructorMessage;
            useAppStore.getState().addInboxMessage(p);
            useAppStore.getState().addDebugLog(`Question from ${p.studentName}: ${p.message}`, "info");
            break;
          }
          case "ai-reply":
            // The 45s AI fallback answered before the instructor did — close
            // the inbox item so it stops asking for a reply that is now moot.
            useAppStore.getState().markInboxReplied((msg.payload as { messageId: string }).messageId);
            useAppStore.getState().addDebugLog("AI answered a student question (instructor did not reply in 45s)", "info");
            break;
          case "ai-frame-result": {
            const p = msg.payload as { isInstructional?: boolean; blockCount?: number; summary?: string; error?: string };
            if (p.error) {
              useAppStore.getState().addDebugLog(`AI frame analysis failed: ${p.error}`, "error");
            } else {
              useAppStore.getState().addDebugLog(
                `AI frame analyzed — ${p.blockCount ?? 0} guide block(s)${p.summary ? `: ${p.summary}` : ""}`,
                (p.blockCount ?? 0) > 0 ? "success" : "info"
              );
            }
            break;
          }
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
  }, [sessionId, backendUrl, token]);

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

  const off = useCallback((type: WsEventType) => {
    handlers.current.delete(type);
  }, []);

  return { send, on, off };
}