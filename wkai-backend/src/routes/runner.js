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

async function runCode(language: string, code: string): Promise<string> {
  const id  = randomUUID();
  const dir = tmpdir();

  // Write code to a temp file
  const { file, cmd, args } = getRunner(language, id, dir, code);

  try {
    writeFileSync(file, code, "utf8");
    return await exec(cmd, args, TIMEOUT_MS);
  } finally {
    try { unlinkSync(file); } catch { /* ignore */ }
  }
}

function getRunner(
  lang: string,
  id: string,
  dir: string,
  _code: string
): { file: string; cmd: string; args: string[] } {
  switch (lang) {
    case "python": {
      const file = join(dir, `wkai_${id}.py`);
      return { file, cmd: "python3", args: [file] };
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
      return { file, cmd: "bash", args: [file] };
    }
    default:
      throw new Error(`Unsupported language: ${lang}`);
  }
}

function exec(cmd: string, args: string[], timeoutMs: number): Promise<string> {
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
    child.on("error", reject);
  });
}
