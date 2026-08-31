// Unit tests for the sandboxed exercise runner. These execute real interpreters,
// so they are skipped on a machine that does not have the interpreter installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const { runCode } = await import("../src/routes/runner.js");

function available(command, args) {
  try {
    execFileSync(command, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const HAS_PYTHON =
  process.platform === "win32"
    ? available("py", ["-3", "--version"]) || available("python", ["--version"])
    : available("python3", ["--version"]);

test("JavaScript source runs and returns its stdout", async () => {
  const output = await runCode("javascript", 'console.log("hello from node")');
  assert.match(output, /hello from node/);
});

test("Python resolves an interpreter for this platform, not a hardcoded python3", { skip: !HAS_PYTHON }, async () => {
  const output = await runCode("python", 'print("hello from python")');
  assert.match(output, /hello from python/);
  assert.ok(!/ENOENT/.test(output), "a missing interpreter must never surface as a raw spawn error");
});

test("a failing program returns its error text instead of throwing", async () => {
  const output = await runCode("javascript", 'throw new Error("boom")');
  assert.match(output, /boom/);
});

test("an unsupported language is rejected", async () => {
  await assert.rejects(() => runCode("cobol", "DISPLAY 'HI'."), /Unsupported language/);
});

test("execution is bounded by the timeout", async () => {
  const output = await runCode("javascript", "while (true) {}");
  assert.match(output, /timed out/i);
});
