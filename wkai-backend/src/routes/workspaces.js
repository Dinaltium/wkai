import { Router } from "express";
import { z } from "zod";
import { query } from "../db/client.js";

export const workspaceRouter = Router();

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(120),
  ownerName: z.string().max(120).optional(),
});

function formatWorkspace(row) {
  return {
    id:          row.id,
    name:        row.name,
    ownerName:   row.owner_name,
    createdAt:   row.created_at,
    sessionCount: row.session_count != null ? Number(row.session_count) : undefined,
    lastSessionAt: row.last_session_at ?? undefined,
  };
}

// ─── GET /api/workspaces ──────────────────────────────────────────────────────

workspaceRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT w.*, COUNT(s.id) AS session_count, MAX(s.started_at) AS last_session_at
       FROM workspaces w
       LEFT JOIN sessions s ON s.workspace_id = w.id
       GROUP BY w.id
       ORDER BY COALESCE(MAX(s.started_at), w.created_at) DESC`
    );
    res.json({ workspaces: rows.map(formatWorkspace) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/workspaces ─────────────────────────────────────────────────────
// Idempotent on name: an instructor typing the same folder name next week means
// "the one I used last week", not "a second folder that looks identical".

workspaceRouter.post("/", async (req, res, next) => {
  try {
    const { name, ownerName } = CreateWorkspaceSchema.parse(req.body);
    const existing = await query("SELECT * FROM workspaces WHERE lower(name) = lower($1)", [name]);
    if (existing.rows.length) {
      return res.json({ workspace: formatWorkspace(existing.rows[0]), created: false });
    }
    const { rows } = await query(
      "INSERT INTO workspaces (name, owner_name) VALUES ($1,$2) RETURNING *",
      [name.trim(), ownerName ?? null]
    );
    res.status(201).json({ workspace: formatWorkspace(rows[0]), created: true });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/workspaces/:id/sessions ─────────────────────────────────────────

workspaceRouter.get("/:id/sessions", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.id, s.room_code, s.workshop_title, s.status, s.started_at, s.ended_at,
              COUNT(g.id) AS guide_block_count
       FROM sessions s
       LEFT JOIN guide_blocks g ON g.session_id = s.id
       WHERE s.workspace_id = $1
       GROUP BY s.id
       ORDER BY s.started_at DESC`,
      [req.params.id]
    );
    res.json({
      sessions: rows.map((r) => ({
        id:              r.id,
        roomCode:        r.room_code,
        workshopTitle:   r.workshop_title,
        status:          r.status,
        startedAt:       r.started_at,
        endedAt:         r.ended_at,
        guideBlockCount: Number(r.guide_block_count),
      })),
    });
  } catch (err) {
    next(err);
  }
});
