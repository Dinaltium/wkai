import { ChatGroq } from "@langchain/groq";
import Groq from "groq-sdk";
import { isQuotaExhausted, isRequestTooLarge } from "./groqErrors.js";

export { isQuotaExhausted, isRequestTooLarge, quotaRetryMinutes } from "./groqErrors.js";

// ─── Raw Groq SDK (Whisper audio only — LangChain has no audio transcription) ─
export const groqRaw = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── LangChain ChatGroq instances ─────────────────────────────────────────────
// Vision model — Qwen3.8-27B (llama-4-scout was decommissioned by Groq).
// Not 3.6: that revision emits a <think> block ahead of its answer and spends
// the whole token budget on it, so every frame truncated mid-JSON and only got
// through by paying for an OutputFixingParser repair call (~5s vs ~0.7s here).
// 900, not 1024: Groq enforces an output-tokens-per-minute ceiling of 1000 on
// this tier and checks max_tokens against it *before* running anything, so a
// 1024 request is rejected outright — "Request too large … reduce max_tokens",
// with x-should-retry: false. Every frame failed the same way, which is what an
// empty guide looks like from the outside. The JSON this returns fits well
// inside 900; the earlier 1024 was headroom for a model revision we no longer
// use.
export const visionLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "qwen/qwen3.8-27b",
  temperature: 0.2,
  maxTokens:   900,
});

// Text model — GPT-OSS-120B: stronger reasoning + native tool-calling than
// llama-3.3-70b-versatile, better fit for the structured/Zod-validated JSON
// output this pipeline requires (diagnosis, quiz questions, intent detection).
export const textLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "openai/gpt-oss-120b",
  temperature: 0.1,
  maxTokens:   600,
});

// Same text model, higher temperature for comprehension question creativity.
// maxTokens has to cover reasoning as well as the answer — gpt-oss-120b spends
// 100-200 tokens thinking before it writes, and at 300 every comprehension MCQ
// was cut off mid-JSON and dropped by the parser.
export const creativeLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "openai/gpt-oss-120b",
  temperature: 0.6,
  maxTokens:   1200,
});

export const WHISPER_MODEL = "whisper-large-v3";

// Errors worth retrying: rate limits (429), transient server errors (5xx), and
// network/timeout failures. Client errors (4xx other than 429) are not retried —
// retrying a malformed request just wastes the backoff budget.
function isRetryableGroqError(err) {
  const status = err?.status ?? err?.response?.status;
  if (isQuotaExhausted(err) || isRequestTooLarge(err)) return false;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500 && status <= 599) return true;

  const code = String(err?.code ?? "").toUpperCase();
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"].includes(code)) return true;

  const msg = String(err?.message ?? "").toLowerCase();
  return (
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("fetch failed") ||
    msg.includes("network") ||
    msg.includes("socket hang up")
  );
}

export async function callWithRetry(fn, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableGroqError(err) || i === maxRetries - 1) throw err;
      const reason = err?.status ?? err?.code ?? "transient error";
      console.warn(`[Groq] Retryable failure (${reason}), retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Retry failed");
}
