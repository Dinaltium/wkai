import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { sessionRouter } from "./routes/sessions.js";
import { aiRouter } from "./routes/ai.js";
import { filesRouter } from "./routes/files.js";
import { runnerRouter } from "./routes/runner.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: "*" })); // Tighten in production
app.use(morgan("dev"));
app.use(express.json({ limit: "20mb" })); // Allow large base64 frames
app.use(express.urlencoded({ extended: true }));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "wkai-backend", ts: new Date().toISOString() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/sessions", sessionRouter);
app.use("/api/ai", aiRouter);
app.use("/api/files", filesRouter);
app.use("/api/run", runnerRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);
