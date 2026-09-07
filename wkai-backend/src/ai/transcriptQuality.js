/**
 * Deciding whether a transcript is worth acting on.
 *
 * Whisper does not return "I heard nothing". Handed silence, room noise, a
 * cough or a passing car, it returns fluent, confident English — most often a
 * stock phrase learned from subtitle training data ("Thank you.", "Thanks for
 * watching!", "Subtitles by …"). Downstream, the narrator agent was then asked
 * to *expand* that into guidance, so a moment of quiet became a paragraph of
 * invented instructions in the students' guide.
 *
 * Nothing here can tell a genuine sentence from a fluent hallucination in
 * general. What it can do is refuse the cases that are recognisably not
 * teaching: known stock phrases, segments the model itself scored as probable
 * silence, and text that is nothing but filler.
 */

// Phrases Whisper emits on silence or noise. Matched against the whole
// (normalised) transcript, never as a substring of a longer sentence — an
// instructor really can say "thank you" in the middle of a real explanation.
const HALLUCINATION_PHRASES = new Set([
  "thank you",
  "thanks",
  "thank you.",
  "thank you very much",
  "thanks for watching",
  "thanks for watching!",
  "thank you for watching",
  "please subscribe",
  "like and subscribe",
  "subtitles by the amara.org community",
  "subtitles by the amaraorg community",
  "transcription by castingwords",
  "you",
  "bye",
  "bye.",
  "okay",
  "ok",
  "so",
  "yeah",
  "right",
  "mm",
  "mhm",
  "uh",
  "um",
  "hmm",
  "[music]",
  "[silence]",
  "[applause]",
  "[blank_audio]",
  "(music)",
  "(silence)",
]);

// Words that carry no teaching content on their own. A transcript made only of
// these is the instructor thinking out loud, not saying something.
const FILLER_WORDS = new Set([
  "uh", "um", "er", "ah", "eh", "hmm", "mm", "mhm", "yeah", "yep", "yes", "no",
  "ok", "okay", "so", "right", "well", "like", "just", "you", "i",
  "and", "the", "a", "an", "is", "it", "that", "this", "we", "our",
  "to", "of", "in", "on", "at", "for", "but", "or", "then",
  "gonna", "alright", "actually", "basically", "kind", "sort",
]);

/** Below this many content words, there is nothing worth building a card on. */
const MIN_CONTENT_WORDS = 4;
/** A single word repeated by a stuck decoder is a classic Whisper loop. */
const MAX_REPEAT_RATIO = 0.5;

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function words(text) {
  return normalize(text)
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Content words: what is left once filler is removed. */
export function contentWords(text) {
  return words(text).filter((w) => w.length > 1 && !FILLER_WORDS.has(w));
}

/**
 * True only for what Whisper produces when it heard nothing at all: a stock
 * subtitle phrase, an empty string, or a stuck decoder repeating itself.
 *
 * Deliberately separate from `isLowSignalTranscript`. This one is safe to
 * apply to the raw transcript, because everything it rejects is known noise.
 * The substance test below is not: it also throws away short but genuine
 * speech, which still belongs in the vision context and the instructor's UI
 * even when it is too thin to build a guide card from.
 */
export function isStockHallucination(text) {
  const normalised = normalize(text);
  if (!normalised) return true;

  // Whole-transcript stock phrase, with trailing punctuation ignored.
  const stripped = normalised.replace(/[.!?,]+$/g, "").trim();
  if (HALLUCINATION_PHRASES.has(stripped)) return true;

  const all = words(text);
  if (all.length === 0) return true;

  // Decoder loop: "the the the the" or one phrase repeated to fill the window.
  const counts = new Map();
  for (const w of all) counts.set(w, (counts.get(w) ?? 0) + 1);
  const topCount = Math.max(...counts.values());
  return all.length >= 8 && topCount / all.length > MAX_REPEAT_RATIO;
}

/**
 * True when the transcript is too thin to build a guide card from.
 *
 * Applied before the narrator agent only. Rejecting here costs the students a
 * card the next chunk would have produced anyway; letting filler through costs
 * them a fabricated one they cannot tell apart from real guidance.
 */
export function isLowSignalTranscript(text) {
  if (isStockHallucination(text)) return true;
  return contentWords(text).length < MIN_CONTENT_WORDS;
}

/**
 * Drop the segments Whisper itself flagged as probably-not-speech.
 *
 * `verbose_json` returns per-segment `no_speech_prob` and `avg_logprob`. The
 * combination is OpenAI's own silence heuristic: high no-speech probability
 * together with a low average token probability means the decoder was
 * guessing. A very low avg_logprob alone is a garbled segment worth dropping
 * whatever the no-speech score says.
 *
 * @param {{segments?: {text: string, no_speech_prob?: number, avg_logprob?: number}[], text?: string}} result
 * @returns {string} the text worth keeping, possibly empty
 */
export function filterWhisperSegments(result) {
  if (!result) return "";
  const segments = Array.isArray(result.segments) ? result.segments : null;
  if (!segments || segments.length === 0) return String(result.text ?? "").trim();

  const kept = segments.filter((segment) => {
    const noSpeech = Number(segment.no_speech_prob ?? 0);
    const avgLogprob = Number(segment.avg_logprob ?? 0);
    if (avgLogprob < -1.0) return false;
    if (noSpeech > 0.6 && avgLogprob < -0.4) return false;
    return true;
  });

  return kept
    .map((s) => String(s.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}
