/**
 * Runs the WKAI MCP server's tests against a stack it owns.
 *
 * Same shape as run-api.mjs: bring up datastores and a backend, run node:test,
 * tear down. `--keep-databases` when the caller already owns the containers.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { REPO_ROOT, BACKEND_URL, startDatabases, startBackend, stopStack } from "./harness/stack.mjs";

const keepDatabases = process.argv.includes("--keep-databases");

let exitCode = 1;
try {
  if (!keepDatabases) await startDatabases();
  await startBackend();

  console.log(`[e2e] running MCP server tests against ${BACKEND_URL}`);
  const result = spawnSync(process.execPath, ["--test", "tests/*.test.js"], {
    cwd: path.join(REPO_ROOT, "wkai-mcp"),
    stdio: "inherit",
    env: { ...process.env, WKAI_BACKEND_URL: BACKEND_URL },
  });
  exitCode = result.status ?? 1;
} catch (err) {
  console.error(`[e2e] ${err.message}`);
  exitCode = 1;
} finally {
  stopStack({ keepDatabases });
}

process.exit(exitCode);
