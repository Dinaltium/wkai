import { groqRaw, WHISPER_MODEL } from "./groqClient.js";
import fs from "fs";
import path from "path";
import os from "os";

/**
 * Transcribes a base64-encoded audio chunk using Groq Whisper-large-v3.
 * Uses the raw Groq SDK — LangChain has no audio transcription support.
 *
 * @param {string} audioB64  Base64-encoded audio (wav or mp3)
 * @param {string} mimeType  e.g. "audio/wav"
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioB64, mimeType = "audio/wav") {
  const ext     = mimeType.includes("mp3") ? "mp3" : "wav";
  const tmpPath = path.join(os.tmpdir(), `wkai_audio_${Date.now()}.${ext}`);
  try {
    fs.writeFileSync(tmpPath, Buffer.from(audioB64, "base64"));
    const result = await groqRaw.audio.transcriptions.create({
      file:            fs.createReadStream(tmpPath),
      model:           WHISPER_MODEL,
      language:        "en",
      response_format: "text",
    });
    return result ?? "";
  } finally {
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
  }
}
