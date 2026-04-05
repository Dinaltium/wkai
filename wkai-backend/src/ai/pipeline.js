// ─── pipeline.js ─────────────────────────────────────────────────────────────
// Public re-export — callers import processScreenFrame from here.
// Internally delegates to the LangGraph screen analysis pipeline.

export { runScreenAnalysis as processScreenFrame } from "./graphs/screenPipeline.js";
