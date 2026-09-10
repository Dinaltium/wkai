import express from "express";
import { getLocalIp } from "./utils/network.js";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { sessionRouter } from "./routes/sessions.js";
import { aiRouter } from "./routes/ai.js";
import { filesRouter } from "./routes/files.js";
import { runnerRouter } from "./routes/runner.js";
import { workspaceRouter } from "./routes/workspaces.js";
import { webrtcRouter } from "./routes/webrtc.js";
import { assessmentRouter } from "./routes/assessments.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { debugLog, debugEnabled } from "./utils/debug.js";

export const app = express();
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    // Allow: no origin (curl/Postman), localhost, and any private LAN IP
    if (!origin) return callback(null, true);
    const isLocalhost = origin.includes('localhost') || origin.includes('127.0.0.1');
    const isLan = /^https?:\/\/(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(origin);
    const isAllowedProdOrigin = allowedOrigins.includes(origin);
    if (isLocalhost || isLan || isAllowedProdOrigin) return callback(null, true);
    callback(new Error('CORS: origin not allowed'));
  },
  credentials: true,
}));
app.use(morgan("dev"));
app.use(express.json({ limit: "20mb" })); // Allow large base64 frames
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const started = Date.now();
  if (debugEnabled()) {
    debugLog("HTTP", "incoming", {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      query: req.query,
      bodyKeys: req.body && typeof req.body === "object" ? Object.keys(req.body) : [],
    });
  }
  res.on("finish", () => {
    if (debugEnabled()) {
      debugLog("HTTP", "completed", {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        elapsedMs: Date.now() - started,
      });
    }
  });
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "wkai-backend", ts: new Date().toISOString() });
});

// Adapters that exist on a dev machine but cannot carry a student's traffic:
// VPNs, hypervisors and container bridges all hand out addresses that are
// either link-local or private to this host.
// Where the student site actually lives. It is a separately deployed SPA, so
// the backend cannot infer it from its own network interfaces: on a host like
// Render, getLocalIp() returns the private container address, which is how the
// invite dialog ended up handing instructors links like http://10.26.160.3:3000
// that no student could ever open. Only a LAN dev run can be inferred.
const DEFAULT_STUDENT_URL = "https://wkai.vercel.app";
const IS_HOSTED = Boolean(process.env.RENDER_EXTERNAL_URL);

function trimTrailingSlash(url) {
  return url ? url.replace(/\/$/, "") : null;
}

function getStudentUrl(ip) {
  const configured = trimTrailingSlash(process.env.STUDENT_URL);
  if (configured) return configured;
  if (IS_HOSTED) return DEFAULT_STUDENT_URL;
  return ip ? `http://${ip}:3000` : null;
}

app.get('/api/network-info', (_req, res) => {
  const ip = getLocalIp();
  res.json({
    localIp: ip,
    port: process.env.PORT ?? 4000,
    studentUrl: getStudentUrl(ip),
    backendUrl:
      trimTrailingSlash(process.env.RENDER_EXTERNAL_URL) ??
      (ip ? `http://${ip}:${process.env.PORT ?? 4000}` : null),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/sessions", sessionRouter);
app.use("/api/ai", aiRouter);
app.use("/api/files", filesRouter);
app.use("/api/run", runnerRouter);
app.use("/api/workspaces", workspaceRouter);
app.use("/api/webrtc", webrtcRouter);
// Mounted at the API root rather than under one prefix: assessments are
// addressed three ways (by session, by assessment, by attempt) and the router
// owns all three.
app.use("/api", assessmentRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);
