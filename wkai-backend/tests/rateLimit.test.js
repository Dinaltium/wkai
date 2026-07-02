// Unit tests for the in-memory rate limiter (no external deps).
import { test } from "node:test";
import assert from "node:assert/strict";

const { rateLimit } = await import("../src/middleware/rateLimit.js");

function mockReq(ip) {
  return { headers: {}, ip, socket: { remoteAddress: ip } };
}
function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
function hit(mw, ip) {
  const res = mockRes();
  let nexted = false;
  mw(mockReq(ip), res, () => { nexted = true; });
  return { res, nexted };
}

test("allows requests under the limit, blocks over it", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 3, name: "test" });
  assert.equal(hit(mw, "1.1.1.1").nexted, true);
  assert.equal(hit(mw, "1.1.1.1").nexted, true);
  assert.equal(hit(mw, "1.1.1.1").nexted, true);
  const fourth = hit(mw, "1.1.1.1");
  assert.equal(fourth.nexted, false);
  assert.equal(fourth.res.statusCode, 429);
});

test("limits are per-key (per IP)", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 1, name: "perkey" });
  assert.equal(hit(mw, "2.2.2.2").nexted, true);
  assert.equal(hit(mw, "2.2.2.2").nexted, false); // same ip blocked
  assert.equal(hit(mw, "3.3.3.3").nexted, true);  // different ip allowed
});

test("window resets allow requests again", async () => {
  const mw = rateLimit({ windowMs: 50, max: 1, name: "reset" });
  assert.equal(hit(mw, "4.4.4.4").nexted, true);
  assert.equal(hit(mw, "4.4.4.4").nexted, false);
  await new Promise((r) => setTimeout(r, 70));
  assert.equal(hit(mw, "4.4.4.4").nexted, true, "should reset after window");
});

test("sets rate-limit headers", () => {
  const mw = rateLimit({ windowMs: 60_000, max: 5, name: "hdr" });
  const { res } = hit(mw, "5.5.5.5");
  assert.equal(res.headers["X-RateLimit-Limit"], "5");
  assert.equal(res.headers["X-RateLimit-Remaining"], "4");
});
