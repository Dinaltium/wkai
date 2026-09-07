/**
 * Thin CDP client for the demo Chrome window.
 *
 * Used for two things only: resetting page state between takes, and reading
 * element positions out of the live DOM. The clicking itself is done with the
 * real OS cursor, so the recording shows genuine pointer motion rather than
 * synthetic events the page can see but the camera cannot.
 */
// Resolved relative to this file so the toolchain works from a clone at any
// path — `ws` comes from the backend, which already depends on it.
import WebSocket from "../../wkai-backend/node_modules/ws/index.js";

const HOST = "http://127.0.0.1:9222";

async function targetUrl() {
  const res = await fetch(`${HOST}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page" && t.url.includes("localhost:3000"));
  if (!page) throw new Error("no localhost:3000 page target in Chrome");
  return page.webSocketDebuggerUrl;
}

export async function cdp() {
  const ws = new WebSocket(await targetUrl(), { origin: "http://127.0.0.1:9222" });
  const pending = new Map();
  let id = 1;

  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(JSON.stringify(msg.error)));
    else entry.resolve(msg.result);
  });

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
      setTimeout(() => {
        if (pending.has(msgId)) {
          pending.delete(msgId);
          reject(new Error(`${method} timed out`));
        }
      }, 15_000);
    });

  return {
    send,
    /** Evaluate an expression in the page and return its JSON value. */
    async eval(expression) {
      const res = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description ?? "eval failed");
      }
      return res.result.value;
    },
    async navigate(url) {
      await send("Page.enable");
      await send("Page.navigate", { url });
      // Settle: the room re-joins over HTTP then opens a socket.
      await new Promise((r) => setTimeout(r, 3500));
    },
    close() {
      ws.close();
    },
  };
}

// CLI: node cdp.mjs "<js expression>"
if (process.argv[1]?.endsWith("cdp.mjs")) {
  const client = await cdp();
  const expr = process.argv[2];
  if (expr) console.log(JSON.stringify(await client.eval(expr), null, 2));
  client.close();
}
