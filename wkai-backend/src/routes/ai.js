import { Router } from "express";
import {
  transcribeInstructorAudio,
  diagnoseStudentError,
  detectShareIntentForFiles,
  analyzeColabContent,
  getAgentHealthReport,
  getAgentMetricsReport,
} from "../ai/Agents/index.js";
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
    const transcript = await transcribeInstructorAudio(audioB64, mimeType);
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
    const result = await diagnoseStudentError(errorMessage);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

const IntentSchema = z.object({
  transcript:  z.string().min(1),
  recentFiles: z.array(z.object({ name: z.string(), path: z.string() })).optional().default([]),
});

aiRouter.post("/intent", async (req, res, next) => {
  try {
    const { transcript, recentFiles } = IntentSchema.parse(req.body);
    const result = await detectShareIntentForFiles(transcript, recentFiles);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

aiRouter.get("/agents", async (_req, res, next) => {
  try {
    const health = await getAgentHealthReport();
    const metrics = getAgentMetricsReport();
    res.json({ health, metrics });
  } catch (err) {
    next(err);
  }
});

const ColabAssistSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  colabContent: z.string().min(1).max(20_000),
  contentType: z.enum(["url", "log", "code", "error"]),
});

aiRouter.post("/colab-assist", async (req, res, next) => {
  try {
    const { sessionId, studentId, colabContent, contentType } = ColabAssistSchema.parse(req.body);
    const result = await analyzeColabContent(sessionId, studentId, colabContent, contentType);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
