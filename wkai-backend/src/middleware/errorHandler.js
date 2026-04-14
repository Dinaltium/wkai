import { ZodError } from "zod";
import { debugError, debugLog } from "../utils/debug.js";

/**
 * Central Express error handler.
 * Formats Zod validation errors, known API errors, and unexpected errors.
 */
export function errorHandler(err, _req, res, _next) {
  debugError("HTTP", "errorHandler caught error", err);
  // Zod validation errors
  if (err instanceof ZodError) {
    debugLog("HTTP", "zod validation error", {
      issues: err.errors.map((e) => ({ path: e.path, message: e.message })),
    });
    return res.status(400).json({
      error: "Validation error",
      details: err.errors.map((e) => ({
        field: e.path.join("."),
        message: e.message,
      })),
    });
  }

  // Postgres unique violation (e.g. duplicate room code)
  if (err.code === "23505") {
    debugLog("HTTP", "postgres unique violation", { code: err.code });
    return res.status(409).json({ error: "Resource already exists" });
  }

  // Default 500
  console.error("[Error]", err);
  res.status(500).json({
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
}
