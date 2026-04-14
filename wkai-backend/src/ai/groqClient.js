import { ChatGroq } from "@langchain/groq";
import Groq from "groq-sdk";

// ─── Raw Groq SDK (Whisper audio only — LangChain has no audio transcription) ─
export const groqRaw = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── LangChain ChatGroq instances ─────────────────────────────────────────────
// Vision model — Llama-4 Scout, multimodal
export const visionLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "meta-llama/llama-4-scout-17b-16e-instruct",
  temperature: 0.2,
  maxTokens:   1024,
});

// Text model — Llama3-70b, fast reasoning
export const textLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.1,
  maxTokens:   600,
});

// Same text model, higher temperature for comprehension question creativity
export const creativeLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.6,
  maxTokens:   300,
});

export const WHISPER_MODEL = "whisper-large-v3";

export async function callWithRetry(fn, maxRetries = 3) {
  let delay = 1000;
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit =
        err?.status === 429 || String(err?.message ?? "").toLowerCase().includes("rate limit");
      if (!isRateLimit || i === maxRetries - 1) throw err;
      console.warn(`[Groq] Rate limit hit, retrying in ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  throw new Error("Retry failed");
}
