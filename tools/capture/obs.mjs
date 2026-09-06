/**
 * Minimal OBS WebSocket client.
 *
 * Usage: node .obs.mjs <RequestType> [jsonData]
 * The obs MCP server failed to connect at session start (before the WebSocket
 * was enabled) and MCP servers do not reconnect mid-session, so recording is
 * driven straight over the protocol instead.
 */
import { WebSocket } from "ws";

const [requestType, dataJson] = process.argv.slice(2);
if (!requestType) {
  console.error("usage: node .obs.mjs <RequestType> [jsonData]");
  process.exit(1);
}

// "@path" reads the payload from a file, so values containing characters the
// shell would mangle (the em-dash in the window title) survive intact.
const { readFileSync } = await import("node:fs");
const raw = dataJson?.startsWith("@") ? readFileSync(dataJson.slice(1), "utf8") : dataJson;
const requestData = raw ? JSON.parse(raw) : undefined;
const ws = new WebSocket(process.env.OBS_URL ?? "ws://127.0.0.1:4455");

const bail = (msg, code = 1) => {
  console.error(msg);
  try { ws.close(); } catch { /* already gone */ }
  process.exit(code);
};

const timer = setTimeout(() => bail("TIMEOUT talking to OBS"), 15000);

ws.on("error", (e) => bail(`ERROR: ${e.message}`));

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());

  if (msg.op === 0) {
    if (msg.d.authentication) bail("OBS wants a password; auth is still enabled.");
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: msg.d.rpcVersion, eventSubscriptions: 0 } }));
    return;
  }

  if (msg.op === 2) {
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: "req", requestData } }));
    return;
  }

  if (msg.op === 7) {
    clearTimeout(timer);
    const { requestStatus, responseData } = msg.d;
    if (!requestStatus.result) {
      bail(`FAILED ${requestType}: ${requestStatus.code} ${requestStatus.comment ?? ""}`);
    }
    console.log(JSON.stringify(responseData ?? { ok: true }, null, 2));
    ws.close();
    process.exit(0);
  }
});
