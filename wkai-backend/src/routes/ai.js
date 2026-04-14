import { Router } from "express";
import { transcribeAudio } from "../ai/whisper.js";
import { diagnoseError } from "../ai/errorDiagnosis.js";
import { z } from "zod";
import { ingestScreenFrame } from "../ws/server.js";
import { debugLog, debugError } from "../utils/debug.js";

export const aiRouter = Router();

// ─── POST /api/ai/transcribe — Transcribe audio chunk ────────────────────────

const TranscribeSchema = z.object({
  audioB64: z.string().min(1),
  mimeType: z.string().optional().default("audio/wav"),
});

aiRouter.post("/transcribe", async (req, res, next) => {
  try {
    const { audioB64, mimeType } = TranscribeSchema.parse(req.body);
    const transcript = await transcribeAudio(audioB64, mimeType);
    res.json({ transcript });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/ai/diagnose — Diagnose a student error ────────────────────────

const DiagnoseSchema = z.object({
  errorMessage: z.string().min(1).max(5000),
});

aiRouter.post("/diagnose", async (req, res, next) => {
  try {
    const { errorMessage } = DiagnoseSchema.parse(req.body);
    const result = await diagnoseError(errorMessage);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/ai/intent — Detect file share intent in a transcript ───────────
import { detectShareIntent } from "../ai/graphs/intentAgent.js";

const IntentSchema = z.object({
  transcript:  z.string().min(1),
  recentFiles: z.array(z.object({ name: z.string(), path: z.string() })).optional().default([]),
});

aiRouter.post("/intent", async (req, res, next) => {
  try {
    const { transcript, recentFiles } = IntentSchema.parse(req.body);
    const result = await detectShareIntent(transcript, recentFiles);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const ScreenFrameSchema = z.object({
  sessionId: z.string().uuid(),
  frameB64: z.string().min(1),
  streamToStudents: z.boolean().optional().default(true),
  timestamp: z.string().optional(),
});

aiRouter.post("/screen-frame", async (req, res, next) => {
  try {
    const payload = ScreenFrameSchema.parse(req.body);
    debugLog("AI", "screen-frame ingest via HTTP", {
      sessionId: payload.sessionId,
      frameLen: payload.frameB64.length,
      stream: payload.streamToStudents,
    });
    await ingestScreenFrame(payload.sessionId, payload, "http");
    res.json({ ok: true });
  } catch (err) {
    debugError("AI", "screen-frame ingest failed", err);
    next(err);
  }
});
