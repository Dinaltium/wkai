import { WebSocketServer, WebSocket } from "ws";
import { parse } from "url";
import {
  setSessionData,
  getSessionData,
  incrementStudentCount,
  decrementStudentCount,
  clearStudentConnections,
  getStudentCount,
  setTranscript,
  getTranscript,
  addStudentToList,
  removeStudentFromList,
  getStudentList,
} from "../db/redis.js";
import { query } from "../db/client.js";
import { processScreenFrame } from "../ai/pipeline.js";
import { clearSessionMemory } from "../ai/memory.js";
import { detectShareIntent } from "../ai/graphs/intentAgent.js";

// Map of sessionId → Map(clientKey → WebSocket client)
const rooms = new Map();

export function initWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const { query: qs } = parse(req.url, true);
    const sessionParam = String(qs.session ?? "").trim();
    const role = qs.role === "instructor" ? "instructor" : "student";
    const studentId = typeof qs.studentId === "string" && qs.studentId.length > 0
      ? qs.studentId
      : `s_${Math.random().toString(36).slice(2, 8)}`;
    const studentName =
      typeof qs.studentName === "string" && qs.studentName.length > 0
        ? decodeURIComponent(qs.studentName).slice(0, 40)
        : "Student";

    const isInstructor = role === "instructor";
    const lookupQuery = isInstructor
      ? "SELECT id, room_code, status FROM sessions WHERE id = $1"
      : "SELECT id, room_code, status FROM sessions WHERE room_code = $1";
    const lookupValue = isInstructor ? sessionParam : sessionParam.toUpperCase();

    const { rows } = await query(lookupQuery, [lookupValue]);

    if (!rows.length || rows[0].status === "ended") {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Room not found or ended" } }));
      ws.close();
      return;
    }

    const sessionId = rows[0].id;
    const roomCode = rows[0].room_code;
    const clientKey = isInstructor ? "instructor" : `student:${studentId}`;

    if (!rooms.has(sessionId)) rooms.set(sessionId, new Map());
    const room = rooms.get(sessionId);
    const previousSocket = room.get(clientKey);
    room.set(clientKey, ws);

    if (previousSocket && previousSocket.readyState === WebSocket.OPEN && previousSocket !== ws) {
      previousSocket.close();
    }

    ws.sessionId = sessionId;
    ws.roomCode = roomCode;
    ws.clientKey = clientKey;
    ws.role      = role;
    ws.studentId = studentId;
    ws.studentName = studentName;

    console.log(`[WS] ${role} connected to room ${roomCode} (sessionId: ${sessionId})`);

    if (role === "student" && previousSocket !== ws) {
      const count = await incrementStudentCount(sessionId, studentId);
      console.log(`[WS] Student count for ${sessionId}: ${count}, room size: ${rooms.get(sessionId)?.size ?? 0}`);
      broadcast(sessionId, {
        type: "student-joined",
        payload: { count, studentId, studentName },
      }, ws);
      await addStudentToList(sessionId, { studentId, studentName });
    }

    const state = await getSessionData(sessionId);
    if (state) {
      const studentList = await getStudentList(sessionId);
      ws.send(JSON.stringify({
        type: "session-state",
        payload: { ...state, studentList },
      }));
    }

    if (role === "instructor") {
      const count = await getStudentCount(sessionId);
      ws.send(JSON.stringify({ type: "student-joined", payload: { count } }));
    }

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {
        case "screen-frame":
          if (ws.role !== "instructor") break;
          handleScreenFrame(ws, msg.payload);
          break;
        case "audio-transcript":
          if (ws.role !== "instructor") break;
          handleAudioTranscript(ws, msg.payload);
          break;
        case "file-shared":
          if (ws.role !== "instructor") break;
          handleFileShared(sessionId, msg.payload);
          break;
        case "student-error":
          handleStudentError(ws, msg.payload);
          break;
        case "comprehension-answer":
          handleComprehensionAnswer(ws, msg.payload);
          break;
      }
    });

    ws.on("close", async () => {
      const room = rooms.get(sessionId);
      if (!room) return;

      if (room.get(clientKey) === ws) {
        room.delete(clientKey);
        if (room.size === 0) rooms.delete(sessionId);

        if (role === "student") {
          const count = await decrementStudentCount(sessionId, studentId);
          broadcast(sessionId, {
            type: "student-left",
            payload: { count, studentId, studentName: ws.studentName ?? "Student" },
          });
          await removeStudentFromList(sessionId, studentId);
        }
      }
    });

    ws.on("error", (err) => console.error("[WS] Client error:", err.message));
  });

  console.log("[WS] WebSocket server initialized");
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

async function handleScreenFrame(ws, payload) {
  const { sessionId } = ws;
  const { frameB64 } = payload;

  try {
    // Pull latest transcript from Redis (written by audio-transcript handler)
    const transcript = await getTranscript(sessionId);

    // Run the full LangGraph screen analysis pipeline
    const result = await processScreenFrame(sessionId, frameB64, transcript ?? "");

    for (const block of result.guideBlocks ?? []) {
      const { rows } = await query(
        `INSERT INTO guide_blocks (session_id, type, title, content, code, language, locked)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [sessionId, block.type, block.title ?? null, block.content,
         block.code ?? null, block.language ?? null, block.locked ?? false]
      );
      broadcast(sessionId, {
        type: "guide-block",
        payload: formatGuideBlock(rows[0]),
        timestamp: new Date().toISOString(),
      });
    }

    if (payload.streamToStudents && payload.frameB64) {
      broadcastToStudents(sessionId, {
        type: "screen-preview",
        payload: {
          frameB64: payload.frameB64,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (result.comprehensionQuestion) {
      const q = result.comprehensionQuestion;
      const { rows } = await query(
        `INSERT INTO comprehension_questions (session_id, question, options, correct_index, explanation)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [sessionId, q.question, JSON.stringify(q.options), q.correctIndex, q.explanation]
      );
      broadcast(sessionId, { type: "comprehension-question", payload: rows[0] });
    }
  } catch (err) {
    console.error("[WS] Screen frame pipeline error:", err.message);
  }
}

async function handleAudioTranscript(ws, payload) {
  const { sessionId } = ws;
  const { transcript, recentFiles = [] } = payload;

  // Store latest transcript in Redis for next screen frame to pick up
  await setTranscript(sessionId, transcript);

  // Run the LangGraph intent detection agent
  try {
    const intent = await detectShareIntent(transcript, recentFiles);
    if (intent.shouldShare && intent.file) {
      console.log(`[IntentAgent] Share intent detected (${(intent.confidence * 100).toFixed(0)}%) → ${intent.file.name}`);
      // Emit back to instructor for confirmation before sharing
      ws.send(JSON.stringify({
        type: "share-intent-detected",
        payload: {
          file:       intent.file,
          confidence: intent.confidence,
        },
      }));
    }
  } catch (err) {
    console.error("[WS] Intent detection error:", err.message);
  }
}

async function handleFileShared(sessionId, payload) {
  const { name, url, sizeBytes } = payload;
  const { rows } = await query(
    `INSERT INTO shared_files (session_id, name, url, size_bytes)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [sessionId, name, url, sizeBytes ?? null]
  );
  broadcast(sessionId, {
    type: "file-shared",
    payload: {
      id:        rows[0].id,
      name:      rows[0].name,
      url:       rows[0].url,
      sharedAt:  rows[0].shared_at,
      sizeBytes: rows[0].size_bytes,
    },
  });
}

async function handleStudentError(ws, payload) {
  const { sessionId, studentId } = ws;
  const { errorMessage } = payload;
  try {
    const { diagnoseError } = await import("../ai/errorDiagnosis.js");
    const result = await diagnoseError(errorMessage);
    await query(
      `INSERT INTO error_resolutions (session_id, student_id, error_message, diagnosis, fix_command)
       VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, studentId, errorMessage, result.diagnosis, result.fixCommand ?? null]
    );
    ws.send(JSON.stringify({ type: "error-resolved", payload: result }));
  } catch (err) {
    console.error("[WS] Error diagnosis failed:", err.message);
  }
}

async function handleComprehensionAnswer(ws, payload) {
  const { questionId, answerIndex } = payload;
  const { rows } = await query(
    "SELECT correct_index, explanation FROM comprehension_questions WHERE id = $1",
    [questionId]
  );
  if (!rows.length) return;
  ws.send(JSON.stringify({
    type: "comprehension-result",
    payload: {
      questionId,
      correct:     rows[0].correct_index === answerIndex,
      explanation: rows[0].explanation,
    },
  }));
}

// ─── Session cleanup ──────────────────────────────────────────────────────────

export function cleanupSession(sessionId) {
  clearSessionMemory(sessionId);
  void clearStudentConnections(sessionId);
  rooms.delete(sessionId);
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcast(sessionId, msg, exclude = null) {
  const clients = rooms.get(sessionId);
  if (!clients) {
    console.log(`[WS] broadcast: No room found for sessionId ${sessionId}`);
    return;
  }
  console.log(`[WS] broadcast: Sending ${msg.type} to ${clients.size} clients in room ${sessionId}`);
  const data = JSON.stringify(msg);
  let sent = 0;
  for (const client of clients.values()) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) {
      client.send(data);
      sent++;
    }
  }
  console.log(`[WS] broadcast: Sent to ${sent} clients`);
}

export function broadcastToStudents(sessionId, msg) {
  const clients = rooms.get(sessionId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.role === "student" && client.readyState === WebSocket.OPEN) client.send(data);
  }
}

export function getRoomSize(sessionId) {
  return rooms.get(sessionId)?.size ?? 0;
}

function formatGuideBlock(row) {
  return {
    id: row.id, sessionId: row.session_id, type: row.type,
    title: row.title, content: row.content, code: row.code,
    language: row.language, locked: row.locked, timestamp: row.created_at,
  };
}
