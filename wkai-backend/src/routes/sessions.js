import { Router } from "express";
import { z } from "zod";
import { scryptSync, timingSafeEqual, randomBytes, randomUUID } from "node:crypto";
import { query } from "../db/client.js";
import { formatGuideBlock, formatSharedFile } from "../utils/formatters.js";
import {
  setSessionData,
  deleteSessionData,
  clearStudentConnections,
  setSessionIngress,
  getSessionIngress,
  clearSessionIngress,
} from "../db/redis.js";
import { broadcast, cleanupSession } from "../ws/server.js";
import { clearSessionMemory } from "../ai/memory.js";
import { rateLimit } from "../middleware/rateLimit.js";
import {
  issueInstructorToken,
  issueStudentJoinToken,
  requireSessionToken,
} from "../auth/sessionAccess.js";
import {
  isLiveKitConfigured,
  roomNameForSession,
  mintAccessToken,
  createRtmpIngress,
  deleteIngress,
  getLiveKitUrl,
} from "../livekit/client.js";

export const sessionRouter = Router();

// Throttle room-code guessing: join is the brute-force surface (6-char code).
const joinLimiter = rateLimit({ windowMs: 60_000, max: 10, name: "join attempts" });
// Session creation is cheaper to abuse but still worth a looser cap.
const createLimiter = rateLimit({ windowMs: 60_000, max: 20, name: "session creations" });

// ─── POST /api/sessions — Create a new session ────────────────────────────────

const CreateSessionSchema = z.object({
  instructorName:  z.string().min(1).max(100),
  workshopTitle:   z.string().min(1).max(200),
  roomCode:        z.string().length(6).toUpperCase(),
  sessionPassword: z.string().max(128).nullish(),
});

sessionRouter.post("/", createLimiter, async (req, res, next) => {
  try {
    const body = CreateSessionSchema.parse(req.body);
    const passwordHash = body.sessionPassword ? hashPassword(body.sessionPassword) : null;

    const { rows } = await query(
      `INSERT INTO sessions (room_code, instructor_name, workshop_title, session_password_hash)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [body.roomCode, body.instructorName, body.workshopTitle, passwordHash]
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

    // Token proving ownership of this session — required for the instructor's WS
    // connection and privileged routes (end/memory).
    const instructorToken = issueInstructorToken({
      sessionId: session.id,
      roomCode:  session.room_code,
    });

    res.status(201).json({ session: formatSession(session), instructorToken });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/sessions/:roomCode/join ────────────────────────────────────────

sessionRouter.post("/:roomCode/join", joinLimiter, async (req, res, next) => {
  try {
    const roomCode = req.params.roomCode.toUpperCase();
    const { studentName, sessionPassword } = req.body;

    const { rows } = await query(
      "SELECT * FROM sessions WHERE room_code = $1",
      [roomCode]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Room not found. Check the code and try again." });
    }

    const session = rows[0];

    if (session.status === 'ended') {
      return res.status(403).json({ error: "This session has already ended." });
    }

    // Verify password if set
    if (session.session_password_hash) {
      if (!sessionPassword || !verifyPassword(sessionPassword, session.session_password_hash)) {
        return res.status(401).json({ error: "Incorrect password for this room." });
      }
    }

    const [blocks, files] = await Promise.all([
      query("SELECT * FROM guide_blocks WHERE session_id = $1 ORDER BY created_at ASC",  [session.id]),
      query("SELECT * FROM shared_files WHERE session_id = $1 ORDER BY shared_at DESC", [session.id]),
    ]);

    // Server-assigned identity (not client-supplied) baked into a signed token.
    // The student presents this token on the WS connection; the server derives
    // studentId/studentName from it, so neither can be spoofed.
    const assignedStudentId = randomUUID();
    const safeName = String(studentName ?? "Student").trim().slice(0, 60) || "Student";
    const joinToken = issueStudentJoinToken({
      sessionId:   session.id,
      roomCode:    session.room_code,
      studentId:   assignedStudentId,
      studentName: safeName,
    });

    res.json({
      session:     formatSession(session),
      guideBlocks: blocks.rows.map(formatGuideBlock),
      sharedFiles: files.rows.map(formatSharedFile),
      joinToken,
      studentId:   assignedStudentId,
      studentName: safeName,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sessions/:roomCode — Validation only ────────────────────────────

sessionRouter.get("/:roomCode", async (req, res, next) => {
  try {
    const roomCode = req.params.roomCode.toUpperCase();
    const { rows } = await query(
      "SELECT id, room_code, status, session_password_hash IS NOT NULL as password_required FROM sessions WHERE room_code = $1",
      [roomCode]
    );

    if (!rows.length) return res.status(404).json({ error: "Session not found" });

    const session = rows[0];
    res.json({
      id:               session.id,
      roomCode:         session.room_code,
      status:           session.status,
      passwordRequired: session.password_required,
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/sessions/:id/end ─────────────────────────────────────────────

sessionRouter.patch("/:id/end", requireSessionToken({ requiredRole: "instructor" }), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE sessions SET status = 'ended', ended_at = NOW()
       WHERE id = $1 AND status != 'ended' RETURNING *`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Session not found or already ended" });
    }

    const session = rows[0];

    // Tell connected students FIRST — cleanupSession() deletes the WS room, so
    // broadcasting after it would reach nobody (this was the "students never told
    // the session ended" bug).
    broadcast(session.id, {
      type:    "session-ended",
      payload: { message: "The instructor has ended this session." },
    });

    // Clean up: LiveKit ingress + Redis cache + LangChain session memory + WS room
    const ingressId = await getSessionIngress(session.id).catch(() => null);
    if (ingressId) {
      await deleteIngress(ingressId);
      await clearSessionIngress(session.id);
    }
    await deleteSessionData(session.id);
    await clearStudentConnections(session.id);
    clearSessionMemory(session.id);
    cleanupSession(session.id);

    res.json({ session: formatSession(session) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sessions/:id/guide ─────────────────────────────────────────────

sessionRouter.get("/:id/guide", requireSessionToken(), async (req, res, next) => {
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

sessionRouter.get("/:id/memory", requireSessionToken({ requiredRole: "instructor" }), async (req, res, next) => {
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

// ─── POST /api/sessions/:id/livestream — instructor starts a LiveKit RTMP ingress
// Returns the RTMP publish URL + stream key for the instructor's native encoder.

sessionRouter.post("/:id/livestream", requireSessionToken({ requiredRole: "instructor" }), async (req, res, next) => {
  try {
    if (!isLiveKitConfigured()) {
      return res.status(503).json({ error: "Live streaming is not configured on this server." });
    }
    const sessionId = req.params.id;
    const roomName = roomNameForSession(sessionId);
    const ingress = await createRtmpIngress({ sessionId, roomName });
    await setSessionIngress(sessionId, ingress.ingressId);
    res.json({
      roomName,
      rtmpUrl: ingress.url,
      streamKey: ingress.streamKey,
      ingressId: ingress.ingressId,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/sessions/:id/livekit-token — subscribe token for the caller ──────
// Students call this to join the LiveKit room and receive the instructor's video.

sessionRouter.get("/:id/livekit-token", requireSessionToken(), async (req, res, next) => {
  try {
    if (!isLiveKitConfigured()) {
      return res.status(503).json({ error: "Live streaming is not configured on this server." });
    }
    const sessionId = req.params.id;
    const roomName = roomNameForSession(sessionId);
    const payload = req.sessionToken;
    // Students subscribe only; identity comes from the signed session token.
    const identity = payload.role === "instructor" ? `instructor-view-${sessionId}` : payload.studentId;
    const token = mintAccessToken({
      identity,
      name: payload.studentName ?? "Student",
      roomName,
      canPublish: false,
    });
    res.json({ url: getLiveKitUrl(), token, roomName });
  } catch (err) {
    next(err);
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const hashedInput = scryptSync(password, salt, 64).toString("hex");
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(hashedInput, "hex"));
}

function formatSession(row) {
  return {
    id:             row.id,
    roomCode:       row.room_code,
    instructorName: row.instructor_name,
    workshopTitle:  row.workshop_title,
    status:         row.status,
    startedAt:      row.started_at,
    endedAt:        row.ended_at ?? null,
    passwordRequired: row.session_password_hash != null,
  };
}

