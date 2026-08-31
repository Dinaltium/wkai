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
} from "../db/redis.js";
import { query } from "../db/client.js";
import { formatGuideBlock, formatSharedFile, formatStudentMessage } from "../utils/formatters.js";
import { clearSessionMemory, getSessionMemory } from "../ai/memory.js";
import { detectShareIntent } from "../ai/graphs/intentAgent.js";
import { replyToStudentMessage, expandInstructorTranscript, analyzeColabContent } from "../ai/Agents/index.js";
import { fetchNotebook } from "../ai/colabFetch.js";
import { processScreenFrame } from "../ai/pipeline.js";
import { runQueued } from "../ai/sessionQueue.js";
import { verifySessionToken } from "../auth/sessionAccess.js";

// Map of sessionId → Map(clientKey → WebSocket client)
const rooms = new Map();

// Map of sessionId → pending "instructor went offline" timer. A brief drop
// (dev-server restart, network blip, app reload) shouldn't alarm students —
// only a sustained absence does.
const instructorOfflineTimers = new Map();
const INSTRUCTOR_OFFLINE_GRACE_MS = 8000;

// Map of sessionId → Map(messageId → timer) for the "if the instructor is busy,
// the AI answers" promise the student UI makes. Kept per-session so ending a
// room can cancel every pending fallback in one go.
const aiFallbackTimers = new Map();
const AI_FALLBACK_DELAY_MS = 45_000;

// Map of sessionId → speech not yet turned into a guide card. Whisper hands us
// one transcript per 30s audio chunk, and a chunk is often half a sentence or
// pure filler ("okay, so — right"), which makes a poor card on its own. Buffer
// until there is enough substance to summarize, then flush.
const transcriptBuffers = new Map();
const TRANSCRIPT_FLUSH_CHARS = 180;

export function initWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", async (ws, req) => {
    const { query: qs } = parse(req.url, true);

    // Everything below this line is async (token verify, session lookup, Redis
    // reads), and a client that sends the instant its socket opens would hit a
    // socket with no "message" listener yet — the frame is then gone with no
    // error anywhere. Buffer from frame zero and replay once the real handler
    // is installed.
    const bufferedMessages = [];
    const bufferMessage = (raw) => bufferedMessages.push(raw);
    ws.on("message", bufferMessage);

    // Auth: identity, role, and session all come from the signed token — never
    // from client-supplied query params. This closes instructor-role hijacking
    // (role was a spoofable param) and student impersonation (studentId/name were
    // spoofable), and enforces the session-password gate (a token is only issued
    // by the HTTP /join route after the password check).
    const token = typeof qs.token === "string" ? qs.token : "";
    const auth = verifySessionToken(token);
    if (!auth.valid) {
      ws.send(JSON.stringify({ type: "error", payload: { message: `Unauthorized: ${auth.reason}` } }));
      ws.close();
      return;
    }

    const role = auth.payload.role === "instructor" ? "instructor" : "student";
    const isInstructor = role === "instructor";
    const studentId = isInstructor ? null : auth.payload.studentId;
    const studentName = isInstructor ? null : String(auth.payload.studentName ?? "Student").trim();

    // Verify the session referenced by the token still exists and is live.
    const { rows } = await query(
      "SELECT id, room_code, status FROM sessions WHERE id = $1",
      [auth.payload.sessionId]
    );

    if (!rows.length || rows[0].status === "ended") {
      // Terminal, not transient: tell the client the session is over so it shows
      // the "ended" prompt AND stops its reconnect loop. Sending a generic error
      // made clients retry every few seconds forever (DB-query storm on ended rooms).
      ws.send(JSON.stringify({
        type: "session-ended",
        payload: { message: rows.length ? "The instructor has ended this session." : "This room no longer exists." },
      }));
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
    ws.joinedAt = new Date().toISOString();

    console.log(`[WS] ${role} connected to room ${roomCode} (sessionId: ${sessionId})`);

    // Attached before the join-time Redis/Postgres reads below, not after:
    // those take up to a second on a cold pool, and anything the client sent in
    // that window (a question typed straight after a reconnect) hit a socket
    // with no "message" listener and was dropped with no trace.
    const handleMessage = async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      switch (msg.type) {

        case "audio-transcript":
          if (ws.role !== "instructor") break;
          handleAudioTranscript(ws, msg.payload);
          break;
        case "screen-frame":
          if (ws.role !== "instructor") break;
          handleScreenFrame(ws, msg.payload);
          break;
        case "student-message":
          if (ws.role !== "student") break;
          handleStudentMessage(ws, msg.payload);
          break;
        case "instructor-reply":
          if (ws.role !== "instructor") break;
          handleInstructorReply(ws, msg.payload);
          break;
        case "file-shared":
          if (ws.role !== "instructor") break;
          handleFileShared(sessionId, msg.payload);
          break;
        case "colab-assist-request":
          if (ws.role !== "student") break;
          handleColabAssist(ws, msg.payload);
          break;
        case "student-error":
          handleStudentError(ws, msg.payload);
          break;
        case "comprehension-answer":
          handleComprehensionAnswer(ws, msg.payload);
          break;
        case "webrtc-offer":
        case "webrtc-answer":
        case "webrtc-ice-candidate":
        case "webrtc-request-offer":
        case "webrtc-session-reset":
          handleWebRtcSignaling(ws, msg);
          break;
      }
    };

    ws.off("message", bufferMessage);
    ws.on("message", handleMessage);
    for (const raw of bufferedMessages.splice(0)) void handleMessage(raw);


    if (isInstructor) {
      const pendingOffline = instructorOfflineTimers.get(sessionId);
      if (pendingOffline) {
        clearTimeout(pendingOffline);
        instructorOfflineTimers.delete(sessionId);
      }
      // Announce presence to any students already waiting (covers both a
      // returning instructor and one who joins after students).
      broadcast(sessionId, { type: "instructor-online", payload: {} }, ws);
    }

    if (role === "student" && previousSocket !== ws) {
      const count = await incrementStudentCount(sessionId, studentId);
      console.log(`[WS] Student count for ${sessionId}: ${count}, room size: ${rooms.get(sessionId)?.size ?? 0}`);
      
      // Broadcast to others (instructor and other students)
      broadcast(sessionId, { 
        type: "student-joined", 
        payload: { count, studentId, studentName, joinedAt: ws.joinedAt } 
      }, ws);

      // Also send full list to instructor if they are online
      broadcastToInstructor(sessionId, {
        type: "student-list",
        payload: { students: Array.from(room.values())
          .filter(s => s.role === "student")
          .map(s => ({ studentId: s.studentId, studentName: s.studentName, joinedAt: s.joinedAt }))
        }
      });
    }

    const state = await getSessionData(sessionId);
    if (state) {
      const count = await getStudentCount(sessionId);
      const instructorOnline = room.get("instructor")?.readyState === WebSocket.OPEN;
      // The guide and the shared-file list have to travel with session-state.
      // Clients treat this message as the authoritative snapshot and replace
      // their local copies from it, so omitting them blanked both on every
      // reconnect — which is why shared files kept vanishing.
      // Q&A travels with the snapshot for the same reason: the instructor's
      // inbox and the student's own thread live only in client memory, so a
      // reload or a dropped socket erased every question asked so far. The
      // instructor gets the whole room's questions; a student gets only their
      // own thread, flattened into the bubble list their UI renders.
      const [blocks, files, messages] = await Promise.all([
        query("SELECT * FROM guide_blocks WHERE session_id = $1 ORDER BY created_at ASC", [sessionId]),
        query("SELECT * FROM shared_files WHERE session_id = $1 ORDER BY shared_at DESC", [sessionId]),
        isInstructor
          ? query("SELECT * FROM messages WHERE session_id = $1 ORDER BY created_at ASC", [sessionId])
          : query(
              "SELECT * FROM messages WHERE session_id = $1 AND student_id = $2 ORDER BY created_at ASC",
              [sessionId, studentId]
            ),
      ]);
      ws.send(JSON.stringify({
        type: "session-state",
        payload: {
          session:     state,
          guideBlocks: blocks.rows.map(formatGuideBlock),
          sharedFiles: files.rows.map(formatSharedFile),
          studentCount: count,
          instructorOnline,
          ...(isInstructor
            ? { inboxMessages: messages.rows.map(formatStudentMessage) }
            : { chatMessages: messages.rows.flatMap(toChatBubbles) }),
        }
      }));
    }

    if (role === "instructor") {
      const count = await getStudentCount(sessionId);
      ws.send(JSON.stringify({ type: "student-joined", payload: { count } }));
    }

    ws.on("close", async () => {
      const room = rooms.get(sessionId);
      if (!room) return;

      if (room.get(clientKey) === ws) {
        room.delete(clientKey);
        if (room.size === 0) rooms.delete(sessionId);

        if (role === "student") {
          const count = await decrementStudentCount(sessionId, studentId);
          broadcast(sessionId, { type: "student-left", payload: { count } });
        }

        if (isInstructor) {
          const timer = setTimeout(() => {
            instructorOfflineTimers.delete(sessionId);
            broadcast(sessionId, { type: "instructor-offline", payload: {} });
          }, INSTRUCTOR_OFFLINE_GRACE_MS);
          instructorOfflineTimers.set(sessionId, timer);
        }
      }
    });

    ws.on("error", (err) => console.error("[WS] Client error:", err.message));
  });

  console.log("[WS] WebSocket server initialized");
}

// ─── Message Handlers ─────────────────────────────────────────────────────────



async function handleAudioTranscript(ws, payload) {
  const { sessionId } = ws;
  const { transcript, recentFiles = [] } = payload;

  // Store latest transcript in Redis for next screen frame to pick up
  await setTranscript(sessionId, transcript);

  // Turn what the instructor says into student-facing guide cards. The agent
  // (expandInstructorTranscript → transcriptExplainerAgent) and the
  // "live-explanation" message the student client already handles both existed;
  // nothing called the agent and nothing emitted the message, so speech only
  // ever fed the screen pipeline as hidden context and never reached the guide.
  void summarizeSpeech(ws, transcript);

  // Run the LangGraph intent detection agent (queued per-session to avoid
  // stampeding Groq when the room is busy).
  try {
    const intent = await runQueued(sessionId, () => detectShareIntent(transcript, recentFiles));
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


async function summarizeSpeech(ws, transcript) {
  const { sessionId } = ws;
  const text = String(transcript ?? "").trim();
  if (!text) return;

  const buffered = `${transcriptBuffers.get(sessionId) ?? ""} ${text}`.trim();
  if (buffered.length < TRANSCRIPT_FLUSH_CHARS) {
    transcriptBuffers.set(sessionId, buffered);
    return;
  }
  transcriptBuffers.delete(sessionId);

  try {
    const explanation = await runQueued(sessionId, () =>
      expandInstructorTranscript(sessionId, buffered)
    );
    if (!explanation) return;

    const { rows } = await query(
      `INSERT INTO guide_blocks (session_id, type, title, content)
       VALUES ($1, 'explanation', $2, $3) RETURNING *`,
      [sessionId, "From the instructor", explanation]
    );
    broadcast(sessionId, { type: "guide-block", payload: formatGuideBlock(rows[0]) });

    // Also feed the student's Live tab, which renders the spoken line next to
    // its expansion rather than as a guide card.
    broadcastToStudents(sessionId, {
      type: "live-explanation",
      payload: { transcript: buffered, explanation, timestamp: rows[0].created_at },
    });

    // Same memory the screen pipeline reads, so a point made out loud is not
    // repeated as a card when the next frame shows the same thing on screen.
    await getSessionMemory(sessionId).addTeachingContext(explanation);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "ai-frame-result",
        payload: { blockCount: 1, summary: `Speech summarized: ${explanation.slice(0, 120)}` },
      }));
    }
  } catch (err) {
    console.error("[WS] Transcript summarization error:", err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ai-frame-result", payload: { error: `Speech summary failed: ${err.message}` } }));
    }
  }
}

// Turns a periodic instructor screen frame into guide blocks. This is the
// actual trigger for guide-block generation — processScreenFrame() existed
// in ai/pipeline.js already but nothing ever called it and nothing ever
// wrote to guide_blocks, so the "AI summarizes what's being taught" feature
// was fully wired on the frontend (GuidePanel, addGuideBlock) but had no
// source feeding it.
async function handleScreenFrame(ws, payload) {
  const { sessionId } = ws;
  const { frameB64 } = payload;
  console.log(`[ScreenFrame] received, ${frameB64?.length ?? 0} b64 chars, session=${sessionId}`);
  if (!frameB64) return;

  const transcript = await getTranscript(sessionId);

  try {
    // Queued per-session, same as intent detection — a frame lands roughly
    // every 20-30s per instructor, but this keeps behavior consistent if
    // that cadence ever tightens.
    const result = await runQueued(sessionId, () => processScreenFrame(sessionId, frameB64, transcript));
    console.log(
      `[ScreenFrame] isInstructional=${result.isInstructional} blocks=${result.guideBlocks.length} summary="${(result.summary ?? "").slice(0, 80)}"`
    );

    // Mirror the outcome into the instructor's Debug Console. Without this the
    // only signal that a frame was even analyzed lives in backend stdout, so a
    // pipeline that returns zero blocks is indistinguishable from one that is
    // not running at all — which is exactly how this looked while broken.
    ws.send(JSON.stringify({
      type: "ai-frame-result",
      payload: {
        isInstructional: result.isInstructional,
        blockCount:      result.guideBlocks.length,
        summary:         result.summary ?? "",
      },
    }));

    for (const block of result.guideBlocks) {
      const { rows } = await query(
        `INSERT INTO guide_blocks (session_id, type, title, content, code, language, locked)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [sessionId, block.type, block.title ?? null, block.content, block.code ?? null, block.language ?? null, block.locked ?? false]
      );
      console.log(`[ScreenFrame] guide_block inserted: ${block.type} — "${block.content.slice(0, 60)}"`);
      broadcast(sessionId, { type: "guide-block", payload: formatGuideBlock(rows[0]) });
    }
  } catch (err) {
    console.error("[WS] Screen frame processing error:", err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ai-frame-result", payload: { error: err.message } }));
    }
  }
}

// ─── Student Q&A ──────────────────────────────────────────────────────────────
// The student client sends "student-message" and optimistically renders the
// bubble as pending; the instructor client sends "instructor-reply". Both were
// declared in the shared WsEventType union and implemented on the sending side
// only — nothing on the server consumed either, so every question fell through
// the switch and the student's bubble stayed on "Sending…" forever.

async function handleStudentMessage(ws, payload) {
  const { sessionId, studentId, studentName } = ws;
  const messageId = String(payload?.messageId ?? "").trim();
  const message = String(payload?.message ?? "").trim();
  if (!messageId || !message) return;

  try {
    const { rows } = await query(
      `INSERT INTO messages (session_id, message_id, student_id, student_name, message)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (session_id, message_id) DO NOTHING
       RETURNING *`,
      [sessionId, messageId, studentId, studentName, message]
    );
    // A duplicate messageId means a resend of something already stored (e.g. the
    // student's socket reconnected mid-send) — ack it again so their UI settles,
    // but do not re-notify the instructor or re-arm the AI fallback.
    if (!rows.length) {
      ackStudentMessage(ws, messageId);
      return;
    }

    ackStudentMessage(ws, messageId);
    broadcastToInstructor(sessionId, {
      type: "student-message",
      payload: formatStudentMessage(rows[0]),
    });
    scheduleAiFallback(sessionId, messageId, studentId, studentName, message);
  } catch (err) {
    console.error("[WS] Student message error:", err.message);
  }
}

// One stored row is up to two bubbles in the student's thread: their question,
// and the answer if one has landed. Mirrors the ids the live path assigns so a
// reconnect mid-conversation cannot duplicate a bubble already on screen.
function toChatBubbles(row) {
  const bubbles = [{
    id:        row.message_id,
    role:      "student",
    text:      row.message,
    timestamp: row.created_at,
  }];
  if (row.reply) {
    bubbles.push({
      id:        `${row.message_id}_reply`,
      role:      row.reply_role === "ai" ? "ai" : "instructor",
      text:      row.reply,
      timestamp: row.replied_at ?? row.created_at,
    });
  }
  return bubbles;
}

// Echoing the message back to its sender is what clears the optimistic
// `pending` flag — the student client keys off messageId, not content.
function ackStudentMessage(ws, messageId) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "student-message", payload: { messageId, delivered: true } }));
}

async function handleInstructorReply(ws, payload) {
  const { sessionId } = ws;
  const messageId = String(payload?.messageId ?? "").trim();
  const studentId = String(payload?.studentId ?? "").trim();
  const reply = String(payload?.reply ?? "").trim();
  if (!messageId || !reply) return;

  cancelAiFallback(sessionId, messageId);

  try {
    // Only the first reply wins: the AI fallback and the instructor can race if
    // the instructor sends at ~45s, and a student should never get two answers.
    const { rows } = await query(
      `UPDATE messages SET reply = $1, reply_role = 'instructor', replied_at = NOW()
       WHERE session_id = $2 AND message_id = $3 AND reply IS NULL
       RETURNING *`,
      [reply, sessionId, messageId]
    );
    if (!rows.length) return;

    sendToStudent(sessionId, studentId, {
      type: "instructor-reply",
      payload: { messageId, reply, timestamp: rows[0].replied_at },
    });
  } catch (err) {
    console.error("[WS] Instructor reply error:", err.message);
  }
}

function scheduleAiFallback(sessionId, messageId, studentId, studentName, message) {
  if (!aiFallbackTimers.has(sessionId)) aiFallbackTimers.set(sessionId, new Map());
  const timers = aiFallbackTimers.get(sessionId);

  const timer = setTimeout(async () => {
    timers.delete(messageId);
    if (!timers.size) aiFallbackTimers.delete(sessionId);
    try {
      const reply = await runQueued(sessionId, () =>
        replyToStudentMessage(sessionId, studentName, message)
      );
      const { rows } = await query(
        `UPDATE messages SET reply = $1, reply_role = 'ai', replied_at = NOW()
         WHERE session_id = $2 AND message_id = $3 AND reply IS NULL
         RETURNING *`,
        [reply, sessionId, messageId]
      );
      // The instructor answered while the agent was still thinking.
      if (!rows.length) return;

      sendToStudent(sessionId, studentId, {
        type: "ai-reply",
        payload: { messageId, reply, timestamp: rows[0].replied_at },
      });
      // Keep the instructor's inbox honest — the question is answered, even
      // though they were not the one who answered it.
      broadcastToInstructor(sessionId, { type: "ai-reply", payload: { messageId, reply } });
    } catch (err) {
      console.error("[WS] AI message fallback failed:", err.message);
    }
  }, AI_FALLBACK_DELAY_MS);

  timers.set(messageId, timer);
}

function cancelAiFallback(sessionId, messageId) {
  const timers = aiFallbackTimers.get(sessionId);
  const timer = timers?.get(messageId);
  if (!timer) return;
  clearTimeout(timer);
  timers.delete(messageId);
  if (!timers.size) aiFallbackTimers.delete(sessionId);
}

function sendToStudent(sessionId, studentId, msg) {
  const socket = rooms.get(sessionId)?.get(`student:${studentId}`);
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
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

// The Colab Assistant panel sends this over the socket and waits for
// "colab-assist-response". Both the agent and an HTTP route (/api/ai/colab-assist)
// existed, but no socket handler did — so the panel spun for its 20s timeout and
// gave up, every time.
async function handleColabAssist(ws, payload) {
  const { sessionId, studentId } = ws;
  const rawContent = String(payload?.colabContent ?? "").trim();
  const requestedType = payload?.contentType ?? "log";
  if (!rawContent) return;

  // URL mode used to hand the model a bare link, which it could only answer by
  // asking the student to paste what they had just linked to. Fetch it instead.
  let colabContent = rawContent;
  let contentType = requestedType;
  if (requestedType === "url") {
    const fetched = await fetchNotebook(rawContent);
    if (fetched.error) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "colab-assist-response",
          payload: {
            advice: fetched.error,
            followUpQuestions: [
              "Can you paste the cell that fails and its full traceback?",
              "Which cell is the first one to error when you run from the top?",
            ],
          },
        }));
      }
      return;
    }
    colabContent = `Notebook: ${rawContent}

${fetched.content}`;
    contentType = "notebook";
  }

  try {
    const result = await runQueued(sessionId, () =>
      analyzeColabContent(sessionId, studentId, colabContent, contentType)
    );
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "colab-assist-response", payload: result }));
  } catch (err) {
    console.error("[WS] Colab assist error:", err.message);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "colab-assist-response",
        payload: {
          advice: "The AI assistant is busy right now. Try again in a moment, or paste the exact traceback and the cell it came from.",
          followUpQuestions: [],
        },
      }));
    }
  }
}

async function handleStudentError(ws, payload) {
  const { sessionId, studentId } = ws;
  const { errorMessage } = payload;
  try {
    const { diagnoseError } = await import("../ai/errorDiagnosis.js");
    // Queue per-session so a room full of students pasting errors at once does
    // not stampede Groq's rate limit.
    const result = await runQueued(sessionId, () => diagnoseError(errorMessage, sessionId));
    await query(
      `INSERT INTO error_resolutions (session_id, student_id, error_message, diagnosis, fix_command)
       VALUES ($1,$2,$3,$4,$5)`,
      [sessionId, studentId, errorMessage, result.diagnosis, result.fixCommand ?? null]
    );
    ws.send(JSON.stringify({ type: "error-resolved", payload: result }));
  } catch (err) {
    console.error("[WS] Error diagnosis failed:", err.message);
    // Never leave the student hanging with no reply — send a graceful fallback
    // that matches the ErrorResolution shape the client expects.
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "error-resolved",
        payload: {
          diagnosis: "The AI assistant is busy or temporarily unavailable. Please try again in a moment.",
          fixCommand: null,
          fixSteps: ["Wait a few seconds and resubmit the error."],
          isSetupError: false,
          severity: "warning",
        },
      }));
    }
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

async function handleWebRtcSignaling(ws, msg) {
  const { sessionId } = ws;
  const room = rooms.get(sessionId);
  if (!room) {
    console.warn(`[WebRTC] ${msg.type} dropped: no room for session ${sessionId}`);
    return;
  }

  const payload = msg.payload;
  const type = msg.type;

  if (ws.role === "instructor") {
    // Instructor sends to specific student
    const targetStudentId = payload.targetStudentId || payload.studentId;
    if (!targetStudentId) {
      console.warn(`[WebRTC] ${type} from instructor dropped: no target student id`);
      return;
    }

    const studentSocket = room.get(`student:${targetStudentId}`);
    if (studentSocket && studentSocket.readyState === WebSocket.OPEN) {
      studentSocket.send(JSON.stringify(msg));
      console.log(`[WebRTC] ${type} instructor -> student:${targetStudentId}`);
    } else {
      // Silence here used to look identical to a healthy session: the offer
      // left the instructor and simply evaporated. Say so, and say who was
      // actually in the room instead.
      console.warn(
        `[WebRTC] ${type} instructor -> student:${targetStudentId} DROPPED (socket ${studentSocket ? "not open" : "not in room"}); room has [${[...room.keys()].join(", ")}]`
      );
    }
  } else {
    // Student sends to instructor
    const instructorSocket = room.get("instructor");
    if (instructorSocket && instructorSocket.readyState === WebSocket.OPEN) {
      // Add studentId to payload so instructor knows who it's from
      msg.payload = { ...payload, studentId: ws.studentId };
      instructorSocket.send(JSON.stringify(msg));
      console.log(`[WebRTC] ${type} student:${ws.studentId} -> instructor`);
    } else {
      console.warn(
        `[WebRTC] ${type} student:${ws.studentId} -> instructor DROPPED (instructor ${instructorSocket ? "socket not open" : "not connected"})`
      );
    }
  }
}

// ─── Session cleanup ──────────────────────────────────────────────────────────

export function cleanupSession(sessionId) {
  clearSessionMemory(sessionId);
  transcriptBuffers.delete(sessionId);
  const timers = aiFallbackTimers.get(sessionId);
  if (timers) {
    for (const timer of timers.values()) clearTimeout(timer);
    aiFallbackTimers.delete(sessionId);
  }
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

export function broadcastToInstructor(sessionId, msg) {
  const clients = rooms.get(sessionId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const client of clients.values()) {
    if (client.role === "instructor" && client.readyState === WebSocket.OPEN) client.send(data);
  }
}

export function getRoomSize(sessionId) {
  return rooms.get(sessionId)?.size ?? 0;
}

