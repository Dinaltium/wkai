import { Router } from "express";
import { execFile } from "child_process";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

export const runnerRouter = Router();

const TIMEOUT_MS = 10_000; // 10 second execution limit
const MAX_OUTPUT  = 8_000; // truncate output to 8KB

const SUPPORTED = ["python", "javascript", "typescript", "bash"];

// ─── POST /api/run ────────────────────────────────────────────────────────────

runnerRouter.post("/", async (req, res) => {
  const { language, code } = req.body;

  if (!SUPPORTED.includes(language)) {
    return res.status(400).json({ error: `Unsupported language: ${language}` });
  }
  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "No code provided" });
  }
  if (code.length > 50_000) {
    return res.status(400).json({ error: "Code too long" });
  }

  try {
    const output = await runCode(language, code);
    res.json({ output });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Execution logic ──────────────────────────────────────────────────────────

export async function runCode(language, code) {
  const id  = randomUUID();
  const dir = tmpdir();

  // Write code to a temp file
  const runner = getRunner(language, id, dir, code);
  const { file } = runner;

  let { cmd, args } = runner;
  if (runner.kind) {
    const interpreter = await resolveInterpreter(runner.kind);
    if (!interpreter) {
      return `${runner.kind === "python" ? "Python" : "Bash"} is not installed on the server, or is not on its PATH. Ask your instructor to install it and restart the backend.`;
    }
    cmd = interpreter.cmd;
    args = [...interpreter.prefixArgs, ...runner.args];
  }

  try {
    writeFileSync(file, code, "utf8");
    return await exec(cmd, args, TIMEOUT_MS);
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

// "python3" does not exist on a stock Windows install — the launcher is `py`
// and the interpreter is `python`, so every Run hit `spawn python3 ENOENT` and
// the student saw a raw Node error instead of their program's output. Probe the
// candidates for this platform once and reuse the answer.
const INTERPRETER_CANDIDATES = {
  python:
    process.platform === "win32"
      ? [["py", ["-3"]], ["python", []], ["python3", []]]
      : [["python3", []], ["python", []]],
  bash: process.platform === "win32" ? [["bash", []], ["sh", []]] : [["bash", []]],
};

const interpreterCache = new Map();

function probe(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, [...args, "--version"], { timeout: 5_000 }, (error) => resolve(!error));
  });
}

async function resolveInterpreter(kind) {
  if (interpreterCache.has(kind)) return interpreterCache.get(kind);
  const promise = (async () => {
    for (const [cmd, args] of INTERPRETER_CANDIDATES[kind] ?? []) {
      if (await probe(cmd, args)) return { cmd, prefixArgs: args };
    }
    return null;
  })();
  interpreterCache.set(kind, promise);
  return promise;
}

function getRunner(lang, id, dir, _code) {
  switch (lang) {
    case "python": {
      const file = join(dir, `wkai_${id}.py`);
      return { file, kind: "python", args: [file] };
    }
    case "javascript": {
      const file = join(dir, `wkai_${id}.js`);
      return { file, cmd: "node", args: [file] };
    }
    case "typescript": {
      // Requires ts-node installed globally: npm i -g ts-node typescript
      const file = join(dir, `wkai_${id}.ts`);
      return { file, cmd: "npx", args: ["ts-node", "--transpile-only", file] };
    }
    case "bash": {
      const file = join(dir, `wkai_${id}.sh`);
      return { file, kind: "bash", args: [file] };
    }
    default:
      throw new Error(`Unsupported language: ${lang}`);
  }
}

function exec(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: MAX_OUTPUT * 2 },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed) {
            resolve(`⏱ Execution timed out after ${timeoutMs / 1000}s`);
          } else {
            // Return stderr as output so the student sees the error
            resolve((stderr || error.message).slice(0, MAX_OUTPUT));
          }
          return;
        }
        const out = (stdout + (stderr ? `\nSTDERR:\n${stderr}` : "")).slice(0, MAX_OUTPUT);
        resolve(out || "(no output)");
      }
    );
    // A missing interpreter surfaces here as ENOENT. Reject-to-500 gave the
    // student a bare "spawn <cmd> ENOENT"; say what actually went wrong.
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        resolve(`Could not run: "${cmd}" was not found on the server's PATH.`);
        return;
      }
      reject(err);
    });
  });
}
