import { toFile } from "groq-sdk";
import { groqRaw, WHISPER_MODEL } from "./groqClient.js";
import { filterWhisperSegments, isStockHallucination } from "./transcriptQuality.js";

/**
 * Transcribes a base64-encoded audio chunk using Groq Whisper-large-v3.
 * Uses the raw Groq SDK — LangChain has no audio transcription support.
 *
 * @param {string} audioB64  Base64-encoded audio (wav or mp3)
 * @param {string} mimeType  e.g. "audio/wav"
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioB64, mimeType = "audio/wav") {
  const ext = mimeType.includes("mp3") ? "mp3" : "wav";
  const buffer = Buffer.from(audioB64, "base64");

  // Uploaded straight from memory rather than through a temp file. The old
  // path named the file `wkai_audio_${Date.now()}.wav`, so two chunks arriving
  // in the same millisecond shared one path — and whichever finished first
  // unlinked it in its `finally` while the other was still streaming it into
  // the multipart body. Groq saw a truncated upload and answered
  // "multipart: NextPart: bufio: buffer full", which is why transcription
  // failed intermittently under a steady stream of chunks.
  const file = await toFile(buffer, `audio.${ext}`, { type: mimeType });

  // verbose_json rather than text: it carries the per-segment confidence that
  // tells silence apart from speech. With "text" there was no way to know
  // whether a fluent sentence came from the instructor or from the decoder
  // guessing at room noise. temperature 0 also stops the fallback sampling
  // that produces the most confident-sounding invented lines.
  const result = await groqRaw.audio.transcriptions.create({
    file,
    model: WHISPER_MODEL,
    language: "en",
    temperature: 0,
    response_format: "verbose_json",
  });

  const text = filterWhisperSegments(result);

  // Only the stock phrases Whisper emits for silence are dropped here. Judging
  // whether a transcript carries enough substance is the caller's business —
  // blanking short-but-real speech at this level took the instructor's words
  // out of the vision context and the UI as well as the guide.
  if (!text || isStockHallucination(text)) return "";
  return text;
}
