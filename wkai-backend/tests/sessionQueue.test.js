// Unit tests for the per-session AI queue (no external deps).
import { test } from "node:test";
import assert from "node:assert/strict";

const { runQueued } = await import("../src/ai/sessionQueue.js");

// A task factory whose completion we control, so we can observe concurrency.
function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test("per-session concurrency never exceeds the cap (default 2)", async () => {
  let active = 0;
  let maxActive = 0;
  const gates = [];

  const tasks = Array.from({ length: 8 }, () => {
    const d = deferred();
    gates.push(d);
    return runQueued("sessA", async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await d.promise;
      active -= 1;
      return "ok";
    });
  });

  // Let the queue pump, then release everything in stages.
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(maxActive <= 2, `maxActive was ${maxActive}, expected <= 2`);
  gates.forEach((g) => g.resolve());
  const results = await Promise.all(tasks);
  assert.deepEqual(results, Array(8).fill("ok"));
});

test("different sessions run independently (not blocked by each other)", async () => {
  const order = [];
  const dA = deferred();
  // Session A holds a slot open; session B should still run to completion.
  const a = runQueued("isoA", async () => { order.push("a-start"); await dA.promise; order.push("a-end"); });
  const b = runQueued("isoB", async () => { order.push("b-run"); });
  await b;
  assert.ok(order.includes("b-run"), "session B ran while A was blocked");
  dA.resolve();
  await a;
});

test("queue-full rejects gracefully instead of growing unbounded", async () => {
  const gates = [];
  // Enqueue past the cap. Accepted tasks block on their gate; over-cap enqueues
  // reject synchronously. Build all promises first (attach a catch so rejections
  // don't go unhandled), then release gates so the accepted ones can drain.
  const promises = Array.from({ length: 60 }, () => {
    const d = deferred();
    gates.push(d);
    return runQueued("floodS", async () => { await d.promise; }).then(
      () => ({ status: "fulfilled" }),
      (err) => ({ status: "rejected", reason: err })
    );
  });
  gates.forEach((g) => g.resolve());
  const results = await Promise.all(promises);

  const rejected = results.filter((r) => r.status === "rejected");
  assert.ok(rejected.length > 0, "flooding beyond cap should reject some tasks");
  assert.ok(
    rejected.every((r) => /queue is full/i.test(String(r.reason?.message ?? r.reason))),
    "rejections should be the queue-full error"
  );
});
