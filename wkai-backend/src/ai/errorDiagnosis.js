// ─── errorDiagnosis.js ───────────────────────────────────────────────────────
// Public re-export — callers import diagnoseError from here.
// Internally delegates to the LangGraph error diagnosis agent.

export { runErrorDiagnosis as diagnoseError } from "./graphs/errorAgent.js";
