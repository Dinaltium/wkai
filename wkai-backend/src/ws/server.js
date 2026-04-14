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
import { expandTranscriptForStudents } from "../ai/graphs/transcriptExplainerAgent.js";
import { generateTranscriptComprehension } from "../ai/graphs/comprehensionCoachAgent.js";
import { debugLog, debugError } from "../utils/debug.js";

// Map of sessionId → Map(clientKey → WebSocket client)
const rooms = new Map();
const pendingStudentMessages = new Map();
const lastTranscriptExplanationAt = new Map();
const lastTranscriptQuizAt = new Map();

function roomSnapshot(sessionId) {
  const room = rooms.get(sessionId);
  if (!room) return { exists: false, size: 0, keys: [] };
  return { exists: true, size: room.size, keys: [...room.keys()] };
}

export function initWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    debugLog("WS", "connection opened", { url: req.url });
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
    debugLog("WS", "session lookup", {
      role,
      sessionParam,
      lookupValue,
      matched: rows.length,
    });

    if (!rows.length || rows[0].status === "ended") {
      debugLog("WS", "connection rejected", {
        role,
        sessionParam,
        reason: !rows.length ? "not_found" : "ended",
      });
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
    debugLog("WS", "connection accepted", {
      role,
      sessionId,
      roomCode,
      clientKey,
      room: roomSnapshot(sessionId),
    });

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
      try { msg = JSON.parse(raw.toString()); } catch (err) {
        debugError("WS", "message parse failed", err);
        return;
      }
      const msgType = msg?.type ?? "unknown";
      const payloadKeys = msg?.payload && typeof msg.payload === "object"
        ? Object.keys(msg.payload).join(",")
        : "none";
      console.log(
        `[WS] inbound role=${ws.role} session=${ws.sessionId} type=${msgType} payload_keys=${payloadKeys}`
      );
      debugLog("WS", "inbound payload", {
        role: ws.role,
        sessionId: ws.sessionId,
        type: msgType,
        hasPayload: !!msg?.payload,
        frameLen: msg?.payload?.frameB64 ? String(msg.payload.frameB64).length : 0,
      });

      switch (msg.type) {
        case "screen-frame":
          if (ws.role !== "instructor") break;
          if (msg.payload?.frameB64) {
            console.log(`[WS] screen-frame received (b64_len=${String(msg.payload.frameB64).length}, stream=${!!msg.payload.streamToStudents})`);
          } else {
            console.log("[WS] screen-frame received (missing frameB64)");
          }
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
        case "student-message":
          await handleStudentMessage(ws, msg.payload);
          break;
        case "instructor-reply":
          if (ws.role !== "instructor") break;
          handleInstructorReply(ws, msg.payload);
          break;
        case "webrtc-offer":
          if (ws.role !== "instructor") break;
          handleWebRtcOffer(ws, msg.payload);
          break;
        case "webrtc-answer":
          handleWebRtcAnswer(ws, msg.payload);
          break;
        case "webrtc-ice-candidate":
          handleWebRtcIceCandidate(ws, msg.payload);
          break;
        case "webrtc-session-reset":
          if (ws.role !== "instructor") break;
          handleWebRtcSessionReset(ws, msg.payload);
          break;
        default:
          console.log(`[WS] unhandled message type: ${msgType}`);
          break;
      }
    });

    ws.on("close", async () => {
      debugLog("WS", "client closed", {
        role,
        sessionId,
        clientKey,
        roomBefore: roomSnapshot(sessionId),
      });
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
        debugLog("WS", "client removed from room", {
          role,
          sessionId,
          clientKey,
          roomAfter: roomSnapshot(sessionId),
        });
      }
    });

    ws.on("error", (err) => {
      console.error("[WS] Client error:", err.message);
      debugError("WS", "client socket error", err);
    });
  });

  console.log("[WS] WebSocket server initialized");
}

// ─── Message Handlers ─────────────────────────────────────────────────────────

export async function ingestScreenFrame(sessionId, payload, source = "ws") {
  const { frameB64 } = payload ?? {};
  debugLog("WS", "handleScreenFrame start", {
    sessionId,
    source,
    hasFrame: !!frameB64,
    frameLen: frameB64 ? String(frameB64).length : 0,
    stream: !!payload?.streamToStudents,
    room: roomSnapshot(sessionId),
  });

  // If instructor chose to stream screen to students, send a preview immediately.
  // This must not depend on the AI pipeline succeeding.
  if (payload.streamToStudents && payload.frameB64) {
    debugLog("WS", "broadcasting screen-preview", {
      sessionId,
      frameLen: String(payload.frameB64).length,
      room: roomSnapshot(sessionId),
    });
    broadcastToStudents(sessionId, {
      type: "screen-preview",
      payload: {
        frameB64: payload.frameB64,
        timestamp: new Date().toISOString(),
      },
    });
  }

  try {
    // Pull latest transcript from Redis (written by audio-transcript handler)
    const transcript = await getTranscript(sessionId);

    // Run the full LangGraph screen analysis pipeline
    const result = await processScreenFrame(sessionId, frameB64, transcript ?? "");
    debugLog("WS", "screen pipeline completed", {
      sessionId,
      guideBlocks: result?.guideBlocks?.length ?? 0,
      hasQuestion: !!result?.comprehensionQuestion,
    });

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
    debugError("WS", "handleScreenFrame failed", err);
  }
}

async function handleScreenFrame(ws, payload) {
  return ingestScreenFrame(ws.sessionId, payload, "ws");
}

async function handleAudioTranscript(ws, payload) {
  const { sessionId } = ws;
  const { transcript, recentFiles = [] } = payload;
  debugLog("WS", "handleAudioTranscript", {
    sessionId,
    transcriptLen: String(transcript ?? "").length,
    recentFileCount: Array.isArray(recentFiles) ? recentFiles.length : 0,
  });

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
    debugError("WS", "handleAudioTranscript failed", err);
  }

  // Generate student-facing explanation from transcript (5-10s cadence friendly).
  try {
    const now = Date.now();
    const lastAt = lastTranscriptExplanationAt.get(sessionId) ?? 0;
    if (now - lastAt >= 8_000 && transcript?.trim()) {
      lastTranscriptExplanationAt.set(sessionId, now);
      const explanation = await expandTranscriptForStudents(sessionId, transcript);
      if (explanation) {
        broadcastToStudents(sessionId, {
          type: "live-explanation",
          payload: {
            transcript: transcript.trim().slice(0, 180),
            explanation,
            timestamp: new Date().toISOString(),
          },
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    debugError("WS", "transcript explainer failed", err);
  }

  // Generate comprehension checks from transcript at slower cadence.
  try {
    const now = Date.now();
    const lastAt = lastTranscriptQuizAt.get(sessionId) ?? 0;
    if (now - lastAt >= 45_000 && transcript?.trim()) {
      const question = await generateTranscriptComprehension(sessionId, transcript);
      if (question) {
        lastTranscriptQuizAt.set(sessionId, now);
        const { rows } = await query(
          `INSERT INTO comprehension_questions (session_id, question, options, correct_index, explanation)
           VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [sessionId, question.question, JSON.stringify(question.options), question.correctIndex, question.explanation]
        );
        broadcast(sessionId, { type: "comprehension-question", payload: rows[0] });
      }
    }
  } catch (err) {
    debugError("WS", "transcript comprehension generation failed", err);
  }
}

async function handleFileShared(sessionId, payload) {
  const { name, url, sizeBytes } = payload;
  debugLog("WS", "handleFileShared", { sessionId, name, sizeBytes });
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
  debugLog("WS", "handleStudentError", {
    sessionId,
    studentId,
    messageLen: String(errorMessage ?? "").length,
  });
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
    debugError("WS", "handleStudentError failed", err);
  }
}

async function handleComprehensionAnswer(ws, payload) {
  const { questionId, answerIndex } = payload;
  debugLog("WS", "handleComprehensionAnswer", {
    sessionId: ws.sessionId,
    questionId,
    answerIndex,
  });
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

async function handleStudentMessage(ws, payload) {
  const { sessionId, studentId, studentName } = ws;
  const { message, messageId } = payload;
  debugLog("WS", "handleStudentMessage", {
    sessionId,
    studentId,
    messageId,
    messageLen: String(message ?? "").length,
  });

  if (!message?.trim() || !messageId) return;

  const instructorWs = rooms.get(sessionId)?.get("instructor");
  if (instructorWs?.readyState === WebSocket.OPEN) {
    instructorWs.send(
      JSON.stringify({
        type: "student-message",
        payload: {
          messageId,
          studentId,
          studentName,
          message,
          timestamp: new Date().toISOString(),
        },
      })
    );
  }

  const timer = setTimeout(async () => {
    if (!pendingStudentMessages.has(messageId)) return;
    pendingStudentMessages.delete(messageId);
    try {
      const { generateMessageResponse } = await import("../ai/graphs/messageAgent.js");
      const response = await generateMessageResponse(sessionId, studentName ?? "Student", message);
      ws.send(
        JSON.stringify({
          type: "ai-reply",
          payload: { messageId, response, timestamp: new Date().toISOString() },
        })
      );
    } catch (err) {
      console.error("[MessageAgent] Fallback failed:", err.message);
    }
  }, 45_000);

  pendingStudentMessages.set(messageId, { timer, studentClientKey: ws.clientKey });
}

function handleInstructorReply(ws, payload) {
  const { sessionId } = ws;
  const { messageId, reply, studentId } = payload;
  debugLog("WS", "handleInstructorReply", {
    sessionId,
    messageId,
    studentId,
    replyLen: String(reply ?? "").length,
  });

  const pending = pendingStudentMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingStudentMessages.delete(messageId);
  }

  const studentWs = rooms.get(sessionId)?.get(`student:${studentId}`);
  if (studentWs?.readyState === WebSocket.OPEN) {
    studentWs.send(
      JSON.stringify({
        type: "instructor-reply",
        payload: { messageId, reply, timestamp: new Date().toISOString() },
      })
    );
  }
}

function getInstructorSocket(sessionId) {
  return rooms.get(sessionId)?.get("instructor") ?? null;
}

function getStudentSocket(sessionId, studentId) {
  if (!studentId) return null;
  return rooms.get(sessionId)?.get(`student:${studentId}`) ?? null;
}

function handleWebRtcOffer(ws, payload) {
  const { sessionId } = ws;
  const targetStudentId = payload?.targetStudentId;
  if (!payload?.sdp || !targetStudentId) {
    debugLog("WS", "webrtc-offer dropped invalid payload", {
      sessionId,
      targetStudentId,
      hasSdp: !!payload?.sdp,
    });
    return;
  }

  const studentWs = getStudentSocket(sessionId, targetStudentId);
  if (studentWs?.readyState !== WebSocket.OPEN) {
    debugLog("WS", "webrtc-offer target unavailable", {
      sessionId,
      targetStudentId,
      room: roomSnapshot(sessionId),
    });
    return;
  }

  studentWs.send(
    JSON.stringify({
      type: "webrtc-offer",
      payload: {
        sdp: payload.sdp,
        studentId: targetStudentId,
      },
      timestamp: new Date().toISOString(),
    })
  );
  debugLog("WS", "webrtc-offer relayed", { sessionId, targetStudentId });
}

function handleWebRtcAnswer(ws, payload) {
  const { sessionId } = ws;
  const senderStudentId = ws.studentId;
  const sourceRole = ws.role;
  const targetStudentId = payload?.studentId ?? senderStudentId;

  if (!payload?.sdp || !targetStudentId) {
    debugLog("WS", "webrtc-answer dropped invalid payload", {
      sessionId,
      sourceRole,
      targetStudentId,
      hasSdp: !!payload?.sdp,
    });
    return;
  }

  const instructorWs = getInstructorSocket(sessionId);
  if (instructorWs?.readyState !== WebSocket.OPEN) {
    debugLog("WS", "webrtc-answer instructor unavailable", {
      sessionId,
      sourceRole,
      targetStudentId,
    });
    return;
  }

  instructorWs.send(
    JSON.stringify({
      type: "webrtc-answer",
      payload: {
        sdp: payload.sdp,
        studentId: targetStudentId,
      },
      timestamp: new Date().toISOString(),
    })
  );
  debugLog("WS", "webrtc-answer relayed", { sessionId, targetStudentId, sourceRole });
}

function handleWebRtcIceCandidate(ws, payload) {
  const { sessionId } = ws;
  if (!payload?.candidate) {
    debugLog("WS", "webrtc-ice dropped invalid payload", {
      sessionId,
      role: ws.role,
    });
    return;
  }

  if (ws.role === "student") {
    const instructorWs = getInstructorSocket(sessionId);
    if (instructorWs?.readyState !== WebSocket.OPEN) {
      debugLog("WS", "webrtc-ice student->instructor target unavailable", {
        sessionId,
        studentId: ws.studentId,
      });
      return;
    }
    instructorWs.send(
      JSON.stringify({
        type: "webrtc-ice-candidate",
        payload: {
          candidate: payload.candidate,
          studentId: ws.studentId,
        },
        timestamp: new Date().toISOString(),
      })
    );
    debugLog("WS", "webrtc-ice relayed student->instructor", {
      sessionId,
      studentId: ws.studentId,
    });
    return;
  }

  const targetStudentId = payload?.studentId;
  if (!targetStudentId) {
    debugLog("WS", "webrtc-ice instructor payload missing studentId", {
      sessionId,
    });
    return;
  }

  const studentWs = getStudentSocket(sessionId, targetStudentId);
  if (studentWs?.readyState !== WebSocket.OPEN) {
    debugLog("WS", "webrtc-ice instructor->student target unavailable", {
      sessionId,
      targetStudentId,
    });
    return;
  }

  studentWs.send(
    JSON.stringify({
      type: "webrtc-ice-candidate",
      payload: {
        candidate: payload.candidate,
        studentId: targetStudentId,
      },
      timestamp: new Date().toISOString(),
    })
  );
  debugLog("WS", "webrtc-ice relayed instructor->student", { sessionId, targetStudentId });
}

function handleWebRtcSessionReset(ws, payload) {
  const { sessionId } = ws;
  const reason = payload?.reason ?? "instructor-reset";
  broadcastToStudents(sessionId, {
    type: "webrtc-session-reset",
    payload: { reason },
    timestamp: new Date().toISOString(),
  });
  debugLog("WS", "webrtc-session-reset broadcast", { sessionId, reason });
}

// ─── Session cleanup ──────────────────────────────────────────────────────────

export function cleanupSession(sessionId) {
  clearSessionMemory(sessionId);
  void clearStudentConnections(sessionId);
  lastTranscriptExplanationAt.delete(sessionId);
  lastTranscriptQuizAt.delete(sessionId);
  rooms.delete(sessionId);
}

// ─── Broadcast helpers ────────────────────────────────────────────────────────

export function broadcast(sessionId, msg, exclude = null) {
  const clients = rooms.get(sessionId);
  if (!clients) {
    console.log(`[WS] broadcast: No room found for sessionId ${sessionId}`);
    debugLog("WS", "broadcast skipped missing room", { sessionId, type: msg?.type });
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
  debugLog("WS", "broadcast done", {
    sessionId,
    type: msg?.type,
    sent,
    roomSize: clients.size,
  });
}

export function broadcastToStudents(sessionId, msg) {
  const clients = rooms.get(sessionId);
  if (!clients) {
    debugLog("WS", "broadcastToStudents skipped missing room", {
      sessionId,
      type: msg?.type,
    });
    return;
  }
  const data = JSON.stringify(msg);
  let sent = 0;
  for (const client of clients.values()) {
    if (client.role === "student" && client.readyState === WebSocket.OPEN) {
      client.send(data);
      sent += 1;
    }
  }
  debugLog("WS", "broadcastToStudents done", {
    sessionId,
    type: msg?.type,
    sent,
    roomSize: clients.size,
  });
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
