import { test } from "node:test";
import assert from "node:assert/strict";
const { isLowSignalTranscript, isStockHallucination, filterWhisperSegments, contentWords } =
  await import("../src/ai/transcriptQuality.js");

test("stock ASR hallucinations are rejected", () => {
  for (const t of ["Thank you.", "Thanks for watching!", "you", "Okay", " ", "[Music]"]) {
    assert.equal(isLowSignalTranscript(t), true, t);
  }
});

test("pure filler is rejected", () => {
  assert.equal(isLowSignalTranscript("okay so um right yeah let's just, you know, so"), true);
});

test("a decoder loop is rejected", () => {
  assert.equal(isLowSignalTranscript("the the the the the the the the the the"), true);
});

test("real teaching speech is kept", () => {
  assert.equal(
    isLowSignalTranscript(
      "So the sha256 hash goes over the JSON dump of the payload, and the genesis block uses sixty-four zeroes instead of a previous hash."
    ),
    false
  );
});

test("an instructor saying thank you mid-sentence is kept", () => {
  assert.equal(
    isLowSignalTranscript("Thank you for waiting, now install ecdsa version 0.19 before running the wallet script."),
    false
  );
});

test("low-confidence whisper segments are dropped", () => {
  const text = filterWhisperSegments({
    segments: [
      { text: "Install the ecdsa package now.", no_speech_prob: 0.01, avg_logprob: -0.2 },
      { text: "Thanks for watching!", no_speech_prob: 0.9, avg_logprob: -0.7 },
      { text: "garbled", no_speech_prob: 0.1, avg_logprob: -1.4 },
    ],
  });
  assert.equal(text, "Install the ecdsa package now.");
});

test("segmentless results fall back to the plain text", () => {
  assert.equal(filterWhisperSegments({ text: "hello there" }), "hello there");
  assert.equal(filterWhisperSegments(null), "");
});

test("short but real speech survives the raw-transcript gate", () => {
  // This is the regression that blanked transcription: the strict substance
  // test was applied to the raw transcript, so ordinary short sentences came
  // back as empty strings and the instructor saw no transcription at all.
  for (const t of [
    "Install the ecdsa package.",
    "Open main.py and run it.",
    "Testing one two three.",
  ]) {
    assert.equal(isStockHallucination(t), false, t);
  }
});

test("stock phrases are still caught by the raw gate", () => {
  for (const t of ["Thank you.", "Thanks for watching!", "you", "", "[Music]"]) {
    assert.equal(isStockHallucination(t), true, JSON.stringify(t));
  }
});

test("contentWords strips filler", () => {
  assert.deepEqual(contentWords("so um the hash function"), ["hash", "function"]);
  // "install" and "now" carry meaning; only true filler is removed.
  assert.deepEqual(contentWords("okay so now install ecdsa"), ["now", "install", "ecdsa"]);
});
