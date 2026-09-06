import {
  startDatabases,
  startBackend,
  startStudentApp,
  stopStack,
} from "../../e2e/harness/stack.mjs";

/**
 * Brings the whole stack up before the browser tests, and takes it down after.
 *
 * `--keep-stack` leaves it running, which is what you want while writing tests:
 * boot once, then re-run specs against the live stack instead of paying the
 * container startup on every iteration.
 */
export default async function globalSetup() {
  const keepStack = process.env.WKAI_E2E_KEEP_STACK === "true";

  await startDatabases();
  await startBackend();
  await startStudentApp();

  return async () => {
    if (keepStack) {
      console.log("[e2e] WKAI_E2E_KEEP_STACK=true — leaving the stack running");
      return;
    }
    stopStack();
  };
}
