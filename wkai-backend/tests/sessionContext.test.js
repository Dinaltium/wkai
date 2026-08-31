// Unit tests for the retrieval that grounds agent answers in the session record.
import { test } from "node:test";
import assert from "node:assert/strict";

const { tokenize, rankBlocks } = await import("../src/ai/sessionContext.js");

const BLOCKS = [
  { type: "step", title: "Unrelated detour", content: "We briefly looked at matplotlib to chart block times." },
  { type: "code", title: "Block hashing", content: "Each block hashes its payload with sha256 over a JSON dump.", code: "hashlib.sha256(payload).hexdigest()" },
  { type: "tip", title: "Genesis block", content: "The first block has previous_hash set to '0' * 64, not None." },
  { type: "explanation", title: "Wallets", content: "Transactions are signed with the ecdsa package, pinned to ecdsa==0.19.0." },
];

test("stop words and short tokens are discarded", () => {
  const tokens = tokenize("How do I run the code for this error?");
  assert.ok(!tokens.includes("the"));
  assert.ok(!tokens.includes("how"));
  assert.ok(!tokens.includes("error"), "workshop-generic words carry no signal");
  assert.deepEqual(tokens, []);
});

test("the highest-ranked block is the one the question is about", () => {
  const ranked = rankBlocks(BLOCKS, tokenize("how do I hash a block with sha256?"));
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].block.title, "Block hashing");
});

test("a rare term outranks a term common to every block", () => {
  const ranked = rankBlocks(BLOCKS, tokenize("which ecdsa version do we sign with?"));
  assert.equal(ranked[0].block.title, "Wallets");
  // "block" appears in most blocks, so it must not decide the ranking.
  const blockQuery = rankBlocks(BLOCKS, tokenize("ecdsa block"));
  assert.equal(blockQuery[0].block.title, "Wallets");
});

test("code text is searchable, not just prose", () => {
  const ranked = rankBlocks(BLOCKS, tokenize("hexdigest"));
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].block.title, "Block hashing");
});

test("an unrelated question retrieves nothing rather than the nearest block", () => {
  assert.deepEqual(rankBlocks(BLOCKS, tokenize("kubernetes ingress certificate")), []);
  assert.deepEqual(rankBlocks(BLOCKS, tokenize("")), []);
});
