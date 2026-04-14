import express from "express";
import os from 'os';
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { sessionRouter } from "./routes/sessions.js";
import { aiRouter } from "./routes/ai.js";
import { filesRouter } from "./routes/files.js";
import { runnerRouter } from "./routes/runner.js";
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

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

app.get('/api/network-info', (_req, res) => {
  const ip = getLocalIp();
  res.json({
    localIp: ip,
    port: process.env.PORT ?? 4000,
    studentUrl: ip ? `http://${ip}:3000` : null,
    backendUrl: ip ? `http://${ip}:${process.env.PORT ?? 4000}` : null,
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use("/api/sessions", sessionRouter);
app.use("/api/ai", aiRouter);
app.use("/api/files", filesRouter);
app.use("/api/run", runnerRouter);

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);
