/**
 * Runs the API/WebSocket end-to-end suite against a stack it owns.
 *
 * Brings up the throwaway datastores and a backend, runs node:test, then tears
 * everything down — pass --keep-databases when the caller (the combined run)
 * already owns the containers and only wants a fresh backend process.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  REPO_ROOT,
  BACKEND_URL,
  startDatabases,
  startBackend,
  stopStack,
} from "./harness/stack.mjs";

const keepDatabases = process.argv.includes("--keep-databases");

let exitCode = 1;
try {
  if (!keepDatabases) await startDatabases();
  await startBackend();

  console.log(`[e2e] running API + WebSocket suite against ${BACKEND_URL}`);
  // A bare directory is treated as a module path by Node's test runner, not as
  // "everything under here" — it has to be a glob.
  const result = spawnSync(process.execPath, ["--test", "tests/e2e/**/*.e2e.test.js"], {
    cwd: path.join(REPO_ROOT, "wkai-backend"),
    stdio: "inherit",
  });
  exitCode = result.status ?? 1;
} catch (err) {
  console.error(`[e2e] ${err.message}`);
  exitCode = 1;
} finally {
  stopStack({ keepDatabases });
}

process.exit(exitCode);
