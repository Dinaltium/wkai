import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client.js";
import { setSessionData, deleteSessionData, clearStudentConnections } from "../db/redis.js";
import { broadcast, cleanupSession } from "../ws/server.js";
import { clearSessionMemory } from "../ai/memory.js";
import { debugLog, debugError } from "../utils/debug.js";

export const sessionRouter = Router();

// ─── POST /api/sessions — Create a new session ────────────────────────────────

const CreateSessionSchema = z.object({
  instructorName: z.string().min(1).max(100),
  workshopTitle:  z.string().min(1).max(200),
  roomCode:       z.string().length(6).toUpperCase(),
});

sessionRouter.post("/", async (req, res, next) => {
  try {
    debugLog("SESSION", "create request", {
      bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
      roomCode: req.body?.roomCode,
      instructorName: req.body?.instructorName,
    });
    const body = CreateSessionSchema.parse(req.body);

    const { rows } = await query(
      `INSERT INTO sessions (room_code, instructor_name, workshop_title)
       VALUES ($1, $2, $3) RETURNING *`,
      [body.roomCode, body.instructorName, body.workshopTitle]
    );

    const session = rows[0];

    await setSessionData(session.id, {
      id:             session.id,
      roomCode:       session.room_code,
      instructorName: session.instructor_name,
      workshopTitle:  session.workshop_title,
      status:         session.status,
      startedAt:      session.started_at,
    });
    debugLog("SESSION", "create success", {
      sessionId: session.id,
      roomCode: session.room_code,
      status: session.status,
    });

    res.status(201).json({ session: formatSession(session) });
  } catch (err) {
    debugError("SESSION", "create failed", err);
    next(err);
  }
});

// ─── GET /api/sessions/:roomCode — Join validation + full state ───────────────

sessionRouter.get("/:roomCode", async (req, res, next) => {
  try {
    const roomCode = req.params.roomCode.toUpperCase();
    debugLog("SESSION", "join lookup", { roomCode });
    const { rows } = await query(
      "SELECT * FROM sessions WHERE room_code = $1",
      [roomCode]
    );

    if (!rows.length) return res.status(404).json({ error: "Session not found" });

    const session = rows[0];
    const [blocks, files] = await Promise.all([
      query("SELECT * FROM guide_blocks WHERE session_id = $1 ORDER BY created_at ASC",  [session.id]),
      query("SELECT * FROM shared_files WHERE session_id = $1 ORDER BY shared_at DESC", [session.id]),
    ]);
    debugLog("SESSION", "join success", {
      roomCode,
      sessionId: session.id,
      blockCount: blocks.rows.length,
      fileCount: files.rows.length,
      status: session.status,
    });

    res.json({
      session:     formatSession(session),
      guideBlocks: blocks.rows.map(formatGuideBlock),
      sharedFiles: files.rows.map(formatSharedFile),
    });
  } catch (err) {
    debugError("SESSION", "join failed", err);
    next(err);
  }
});

// ─── PATCH /api/sessions/:id/end ─────────────────────────────────────────────

sessionRouter.patch("/:id/end", async (req, res, next) => {
  try {
    debugLog("SESSION", "end requested", { sessionId: req.params.id });
    const { rows } = await query(
      `UPDATE sessions SET status = 'ended', ended_at = NOW()
       WHERE id = $1 AND status != 'ended' RETURNING *`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Session not found or already ended" });
    }

    const session = rows[0];

    // Clean up: Redis cache + LangChain session memory + WS room
    await deleteSessionData(session.id);
    await clearStudentConnections(session.id);
    clearSessionMemory(session.id);
    cleanupSession(session.id);
    debugLog("SESSION", "end cleanup complete", {
      sessionId: session.id,
      roomCode: session.room_code,
    });

    broadcast(session.id, {
      type:    "session-ended",
      payload: { message: "The instructor has ended this session." },
    });

    res.json({ session: formatSession(session) });
  } catch (err) {
    debugError("SESSION", "end failed", err);
    next(err);
  }
});

// ─── GET /api/sessions/:id/guide ─────────────────────────────────────────────

sessionRouter.get("/:id/guide", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT * FROM guide_blocks WHERE session_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ guideBlocks: rows.map(formatGuideBlock) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sessions/:id/memory — Inspect LangChain session memory ─────────
// Useful for debugging what the AI "remembers" about a session

sessionRouter.get("/:id/memory", async (req, res, next) => {
  try {
    const { getSessionMemory } = await import("../ai/memory.js");
    const memory   = getSessionMemory(req.params.id);
    const messages = await memory.getMessages();
    const context  = await memory.getContextString();
    res.json({ messageCount: messages.length, context });
  } catch (err) {
    next(err);
  }
});

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatSession(row) {
  return {
    id:             row.id,
    roomCode:       row.room_code,
    instructorName: row.instructor_name,
    workshopTitle:  row.workshop_title,
    status:         row.status,
    startedAt:      row.started_at,
    endedAt:        row.ended_at ?? null,
  };
}

function formatGuideBlock(row) {
  return {
    id:        row.id,
    sessionId: row.session_id,
    type:      row.type,
    title:     row.title,
    content:   row.content,
    code:      row.code,
    language:  row.language,
    locked:    row.locked,
    timestamp: row.created_at,
  };
}

function formatSharedFile(row) {
  return {
    id:        row.id,
    name:      row.name,
    url:       row.url,
    sizeBytes: row.size_bytes,
    sharedAt:  row.shared_at,
  };
}
