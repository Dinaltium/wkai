/**
 * Minimal obs-websocket v5 client.
 *
 * The agentic-obs MCP server is configured with an empty password while OBS
 * has auth disabled, so this talks to the socket directly rather than through
 * a server that failed to connect at session start.
 */
// Resolved relative to this file so the toolchain works from a clone at any
// path — `ws` comes from the backend, which already depends on it.
import WebSocket from "../../wkai-backend/node_modules/ws/index.js";
import { createHash } from "crypto";

const URL = process.env.OBS_URL ?? "ws://127.0.0.1:4455";
const PASSWORD = process.env.OBS_PASSWORD ?? "";

export function connect() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    const pending = new Map();
    let nextId = 1;

    const timeout = setTimeout(() => reject(new Error("OBS connect timeout")), 10_000);

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());

      // Hello → Identify. Auth block only appears when OBS requires it.
      if (msg.op === 0) {
        const identify = { op: 1, d: { rpcVersion: 1 } };
        if (msg.d.authentication) {
          const { challenge, salt } = msg.d.authentication;
          const secret = createHash("sha256").update(PASSWORD + salt).digest("base64");
          identify.d.authentication = createHash("sha256")
            .update(secret + challenge)
            .digest("base64");
        }
        ws.send(JSON.stringify(identify));
        return;
      }

      if (msg.op === 2) {
        clearTimeout(timeout);
        resolve(api);
        return;
      }

      if (msg.op === 7) {
        const entry = pending.get(msg.d.requestId);
        if (!entry) return;
        pending.delete(msg.d.requestId);
        if (msg.d.requestStatus?.result) entry.resolve(msg.d.responseData ?? {});
        else
          entry.reject(
            new Error(
              `${msg.d.requestType}: ${msg.d.requestStatus?.comment ?? msg.d.requestStatus?.code}`
            )
          );
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const api = {
      ws,
      call(requestType, requestData = {}) {
        const requestId = String(nextId++);
        return new Promise((res, rej) => {
          pending.set(requestId, { resolve: res, reject: rej });
          ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
          setTimeout(() => {
            if (pending.has(requestId)) {
              pending.delete(requestId);
              rej(new Error(`${requestType} timed out`));
            }
          }, 15_000);
        });
      },
      close() {
        ws.close();
      },
    };
  });
}

// CLI: node obs.mjs <RequestType> '<json>'
if (process.argv[1]?.endsWith("obs.mjs")) {
  const [, , requestType, json] = process.argv;
  const obs = await connect();
  if (!requestType) {
    const v = await obs.call("GetVersion");
    const scenes = await obs.call("GetSceneList");
    const rec = await obs.call("GetRecordStatus");
    console.log(JSON.stringify({ version: v.obsVersion, platform: v.platformDescription, currentScene: scenes.currentProgramSceneName, scenes: scenes.scenes.map((s) => s.sceneName), recording: rec.outputActive }, null, 2));
  } else {
    const out = await obs.call(requestType, json ? JSON.parse(json) : {});
    console.log(JSON.stringify(out, null, 2));
  }
  obs.close();
}
