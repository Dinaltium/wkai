// ─── errorDiagnosis.js ───────────────────────────────────────────────────────
// Public entrypoint for diagnosing student errors.
// Delegates to centralized Agents layer.

export { diagnoseStudentError as diagnoseError } from "./Agents/index.js";
