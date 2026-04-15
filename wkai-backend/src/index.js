import "dotenv/config";
import http from "http";
import os from 'os';
import { app } from "./app.js";
import { initWebSocketServer } from "./ws/server.js";
import { connectDb } from "./db/client.js";
import { connectRedis } from "./db/redis.js";
import { debugLog, debugEnabled } from "./utils/debug.js";
import { startKeepAlive } from "./utils/keepAlive.js";

const PORT = process.env.PORT ?? 4000;

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return null;
}

async function main() {
  debugLog("BOOT", "starting backend process", {
    pid: process.pid,
    node: process.version,
    debugVerbose: debugEnabled(),
    port: PORT,
  });
  // Connect to Postgres and Redis before accepting traffic
  await connectDb();
  await connectRedis();

  const server = http.createServer(app);

  // Attach WebSocket server to the same HTTP server
  initWebSocketServer(server);

  server.listen(PORT, '0.0.0.0', () => {
    const networkIp = getLocalIp();
    console.log(`[WKAI] Server running on http://localhost:${PORT}`);
    if (networkIp) {
      console.log(`[WKAI] LAN access:  http://${networkIp}:${PORT}`);
      console.log(`[WKAI] Student URL: http://${networkIp}:3000`);
    }
    console.log(`[WKAI] WebSocket:   ws://localhost:${PORT}/ws`);
    debugLog("BOOT", "server listening", { port: PORT, networkIp });
    startKeepAlive();
  });
}

main().catch((err) => {
  console.error("[WKAI] Fatal startup error:", err);
  process.exit(1);
});
