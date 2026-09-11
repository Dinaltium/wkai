import test, { describe } from "node:test";
import assert from "node:assert/strict";

import { isQuotaExhausted, isRequestTooLarge, quotaRetryMinutes } from "../src/ai/groqErrors.js";

/** Shaped like what groq-sdk actually throws. */
const rateLimit = ({ message, retryAfter }) => ({
  status: 429,
  headers: { "retry-after": String(retryAfter) },
  message,
  error: { error: { message, type: "tokens", code: "rate_limit_exceeded" } },
});

describe("telling a spent quota from a busy minute", () => {
  test("the daily token limit is not worth retrying", () => {
    const err = rateLimit({
      message:
        "Rate limit reached for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199821, Requested 3036.",
      retryAfter: 1235,
    });
    assert.equal(isQuotaExhausted(err), true);
    assert.equal(quotaRetryMinutes(err), 21);
  });

  test("a per-minute limit is retryable — it clears on its own", () => {
    const err = rateLimit({
      message: "Rate limit reached on tokens per minute (TPM): Limit 8000, Used 7900.",
      retryAfter: 6,
    });
    assert.equal(isQuotaExhausted(err), false);
  });

  test("a long retry-after counts as exhausted even without the wording", () => {
    assert.equal(isQuotaExhausted(rateLimit({ message: "slow down", retryAfter: 900 })), true);
  });

  test("anything that is not a 429 is not a quota problem", () => {
    assert.equal(isQuotaExhausted({ status: 500, message: "internal error" }), false);
    assert.equal(isQuotaExhausted({ code: "ECONNRESET" }), false);
    assert.equal(isQuotaExhausted(undefined), false);
  });

  test("a missing retry-after leaves the wait unknown rather than guessed", () => {
    assert.equal(quotaRetryMinutes({ status: 429, headers: {} }), null);
  });
});

describe("telling a too-big request from a busy one", () => {
  test("an over-limit max_tokens is not retryable — waiting cannot shrink it", () => {
    assert.equal(
      isRequestTooLarge({
        status: 429,
        error: {
          error: {
            message:
              "Request too large for model `qwen/qwen3.8-27b` on output tokens per minute (OTPM): Limit 1000, Requested 1001. The request's expected output tokens exceed the enforced limit; reduce max_tokens and try again.",
          },
        },
      }),
      true
    );
  });

  test("an ordinary rate limit is not a too-large request", () => {
    assert.equal(isRequestTooLarge({ status: 429, message: "Rate limit reached on tokens per minute (TPM)." }), false);
    assert.equal(isRequestTooLarge(undefined), false);
  });
});
