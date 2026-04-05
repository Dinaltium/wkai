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
  maxTokens:   1500,
});

// Text model — Llama3-70b, fast reasoning
export const textLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.1,
  maxTokens:   800,
});

// Same text model, higher temperature for comprehension question creativity
export const creativeLLM = new ChatGroq({
  apiKey:      process.env.GROQ_API_KEY,
  model:       "llama3-70b-8192",
  temperature: 0.6,
  maxTokens:   400,
});

export const WHISPER_MODEL = "whisper-large-v3";
