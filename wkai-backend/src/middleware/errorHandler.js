import { ZodError } from "zod";

/**
 * Central Express error handler.
 * Formats Zod validation errors, known API errors, and unexpected errors.
 */
export function errorHandler(err, _req, res, _next) {
  // Zod validation errors
  if (err instanceof ZodError) {
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
