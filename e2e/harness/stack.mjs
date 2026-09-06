/**
 * Boots the pieces an end-to-end run needs, in dependency order, and tears
 * them down again.
 *
 * Both suites — the API/WebSocket one in wkai-backend and the Playwright one
 * in wkai-student — drive the same stack through this module, so there is a
 * single definition of "a running WKAI" rather than two that drift.
 *
 * Everything here is deliberately isolated from a developer's own stack:
 * different ports, a throwaway database, and a backend process this module
 * owns and kills. Running the suites must never disturb a live workshop.
 */
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, "..", "..");
const BACKEND_DIR = path.join(REPO_ROOT, "wkai-backend");
const STUDENT_DIR = path.join(REPO_ROOT, "wkai-student");
const COMPOSE_FILE = path.join(REPO_ROOT, "e2e", "docker-compose.e2e.yml");
const COMPOSE_PROJECT = "wkai-e2e";

const IS_WINDOWS = process.platform === "win32";

/**
 * npm is a .cmd shim on Windows and cannot be exec-ed directly; everything else
 * here is a real executable. Resolving the shim by name beats passing
 * shell:true, which makes Node concatenate the argument array into a command
 * line rather than passing it through untouched.
 */
function binary(name) {
  return IS_WINDOWS && name === "npm" ? "npm.cmd" : name;
}

/** Ports chosen well clear of the dev stack (4000/3000/5432/6379). */
export const PORTS = {
  postgres: 55432,
  redis: 56379,
  backend: 4100,
  student: 3100,
};

export const BACKEND_URL = `http://127.0.0.1:${PORTS.backend}`;
export const BACKEND_WS_URL = `ws://127.0.0.1:${PORTS.backend}/ws`;
export const STUDENT_URL = `http://127.0.0.1:${PORTS.student}`;

/**
 * Datastores the suites run against.
 *
 * By default the harness starts throwaway containers, which is the only way to
 * guarantee a clean schema and leave the developer's own data alone. Docker is
 * not universal though — this repo's own .env points at a hosted Neon
 * database — so setting both WKAI_E2E_DATABASE_URL and WKAI_E2E_REDIS_URL
 * skips Docker entirely and runs against whatever they name.
 *
 * Both are required together: half a stack from each source would be a
 * confusing way to fail.
 */
const externalDatabaseUrl = process.env.WKAI_E2E_DATABASE_URL?.trim();
const externalRedisUrl = process.env.WKAI_E2E_REDIS_URL?.trim();
export const USING_EXTERNAL_DATASTORES = Boolean(externalDatabaseUrl && externalRedisUrl);

if (Boolean(externalDatabaseUrl) !== Boolean(externalRedisUrl)) {
  throw new Error(
    "Set both WKAI_E2E_DATABASE_URL and WKAI_E2E_REDIS_URL, or neither. " +
      "With neither, the harness starts throwaway containers with Docker."
  );
}

/**
 * Environment the backend under test runs with.
 *
 * GROQ_API_KEY carries a placeholder because src/ai/groqClient.js constructs
 * its client at module load and throws without one — the backend cannot boot
 * at all with the variable unset. No suite calls an AI route, so the value is
 * never used to authenticate anything.
 */
export const BACKEND_ENV = {
  NODE_ENV: "test",
  PORT: String(PORTS.backend),
  DATABASE_URL:
    externalDatabaseUrl ?? `postgres://wkai:wkai_password@127.0.0.1:${PORTS.postgres}/wkai_e2e`,
  REDIS_URL: externalRedisUrl ?? `redis://127.0.0.1:${PORTS.redis}`,
  STUDENT_JOIN_TOKEN_SECRET: "e2e-only-signing-secret-not-used-anywhere-else",
  GROQ_API_KEY: "e2e-placeholder-no-ai-route-is-exercised",
  CORS_ALLOWED_ORIGINS: STUDENT_URL,
  WKAI_DEBUG: "false",
};

const children = new Set();

function log(msg) {
  console.log(`[e2e] ${msg}`);
}

// ─── Process helpers ──────────────────────────────────────────────────────────

/**
 * Kills a child and everything it spawned.
 *
 * `npm run dev` on Windows is a shim that launches Vite in a grandchild
 * process; killing only the shim leaves the port held, so the next run cannot
 * bind it. The whole tree goes.
 */
function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (IS_WINDOWS) {
    spawnSync(binary("taskkill"), ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
  }
}

function run(command, args, { cwd, env, label } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed (exit ${result.status ?? `signal ${result.signal}`})`);
  }
}

function start(command, args, { cwd, env, label }) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: !IS_WINDOWS,
  });
  children.add(child);
  child.stdout.on("data", (b) => process.stdout.write(`[${label}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${label}] ${b}`));
  child.on("exit", () => children.delete(child));
  return child;
}

/** Polls until `check()` resolves truthy, or gives up with a useful message. */
async function waitFor(what, check, { timeoutMs = 90_000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      if (await check()) return;
    } catch (err) {
      lastError = err.message;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${what} (last error: ${lastError})`);
}

// ─── Stack pieces ─────────────────────────────────────────────────────────────

function composeArgs(...rest) {
  return ["compose", "-p", COMPOSE_PROJECT, "-f", COMPOSE_FILE, ...rest];
}

export function assertDockerAvailable() {
  const probe = spawnSync(binary("docker"), ["compose", "version"], { stdio: "ignore" });
  if (probe.status !== 0) {
    throw new Error(
      "The backend needs Postgres and Redis, and Docker (with the compose plugin) " +
        "is how this harness supplies them. Either start Docker Desktop, or point " +
        "the suites at datastores you already have by setting both " +
        "WKAI_E2E_DATABASE_URL and WKAI_E2E_REDIS_URL. See e2e/README.md."
    );
  }
}

/** Brings up the Postgres/Redis the suites will use, and applies the schema. */
export async function startDatabases() {
  if (USING_EXTERNAL_DATASTORES) {
    // The schema still has to exist; every migration is CREATE ... IF NOT
    // EXISTS, so this is safe to run against a database that already has it.
    log("using the datastores named by WKAI_E2E_DATABASE_URL / WKAI_E2E_REDIS_URL");
    log("NOTE: tests create and end real sessions in that database — point it at a scratch one");
    run(process.execPath, ["src/db/migrate.js"], {
      cwd: BACKEND_DIR,
      env: BACKEND_ENV,
      label: "schema migration",
    });
    return;
  }

  assertDockerAvailable();
  log("starting throwaway postgres + redis");
  // --wait blocks on the healthchecks; older compose builds lack it, so fall
  // back to a plain up and let the migrate retry loop do the waiting.
  const waited = spawnSync(binary("docker"), composeArgs("up", "-d", "--wait"), {
    stdio: "inherit",
  });
  if (waited.status !== 0) {
    run(binary("docker"), composeArgs("up", "-d"), { label: "docker compose up" });
  }

  log("applying schema");
  await waitFor(
    "postgres to accept the migration",
    () => {
      const result = spawnSync(process.execPath, ["src/db/migrate.js"], {
        cwd: BACKEND_DIR,
        env: { ...process.env, ...BACKEND_ENV },
        stdio: "ignore",
      });
      return result.status === 0;
    },
    { timeoutMs: 120_000, intervalMs: 1000 }
  );
}

/**
 * Starts a backend process and waits for /health.
 *
 * Each suite gets its own: the rate limiter keeps its counters in module
 * memory, so a shared process would carry one suite's join attempts into the
 * next and eventually answer 429 to a test that did nothing wrong.
 */
export async function startBackend() {
  log(`starting backend on ${BACKEND_URL}`);
  const child = start(process.execPath, ["src/index.js"], {
    cwd: BACKEND_DIR,
    env: BACKEND_ENV,
    label: "backend",
  });
  await waitFor("the backend /health endpoint", async () => {
    const res = await fetch(`${BACKEND_URL}/health`);
    return res.ok;
  });
  log("backend ready");
  return child;
}

/** Starts the student Vite dev server pointed at the test backend. */
export async function startStudentApp() {
  log(`starting student app on ${STUDENT_URL}`);
  const child = start(binary("npm"), ["run", "dev", "--", "--port", String(PORTS.student), "--strictPort"], {
    cwd: STUDENT_DIR,
    env: {
      VITE_BACKEND_URL: BACKEND_URL,
      VITE_BACKEND_WS: BACKEND_WS_URL,
      BROWSER: "none",
    },
    label: "student",
  });
  await waitFor("the student dev server", async () => {
    const res = await fetch(STUDENT_URL);
    return res.ok;
  });
  log("student app ready");
  return child;
}

/** Stops every process this module started. Safe to call twice. */
export function stopProcesses() {
  for (const child of children) killTree(child);
  children.clear();
}

/** Stops processes and, unless the datastores are external, removes them too. */
export function stopStack({ keepDatabases = false } = {}) {
  stopProcesses();
  if (keepDatabases || USING_EXTERNAL_DATASTORES) return;
  log("removing throwaway containers");
  spawnSync(binary("docker"), composeArgs("down", "-v"), { stdio: "inherit" });
}

// Never leave a port-holding process behind, however we exit.
let cleanedUp = false;
function cleanupOnce() {
  if (cleanedUp) return;
  cleanedUp = true;
  stopProcesses();
}
process.on("exit", cleanupOnce);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    cleanupOnce();
    process.exit(1);
  });
}

// ─── CLI: node e2e/harness/stack.mjs up|down ──────────────────────────────────

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const command = process.argv[2];
  if (command === "up") {
    await startDatabases();
    log("databases up — run a suite, then `node e2e/harness/stack.mjs down`");
  } else if (command === "down") {
    stopStack();
  } else {
    console.error("usage: node e2e/harness/stack.mjs up|down");
    process.exit(1);
  }
}
