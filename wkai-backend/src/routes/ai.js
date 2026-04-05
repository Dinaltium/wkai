import { Router } from "express";
import { transcribeAudio } from "../ai/whisper.js";
import { diagnoseError } from "../ai/errorDiagnosis.js";
import { z } from "zod";

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
