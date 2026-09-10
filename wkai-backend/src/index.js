import "dotenv/config";
import http from "http";
import { app } from "./app.js";
// Same picker the API uses. index.js had its own "first non-internal IPv4"
// version, which on a machine with Tailscale or a disconnected Ethernet port
// printed a 169.254 link-local address as the Student URL — an address no
// phone on the same wifi can ever reach.
import { getLocalIp } from "./utils/network.js";
import { initWebSocketServer } from "./ws/server.js";
import { connectDb } from "./db/client.js";
import { connectRedis } from "./db/redis.js";
import { debugLog, debugEnabled } from "./utils/debug.js";
import { startKeepAlive } from "./utils/keepAlive.js";
import { assertSecurityConfig } from "./auth/sessionAccess.js";

const PORT = process.env.PORT ?? 4000;

async function main() {
  debugLog("BOOT", "starting backend process", {
    pid: process.pid,
    node: process.version,
    debugVerbose: debugEnabled(),
    port: PORT,
  });
  // Refuse to boot with an insecure token-signing config in production.
  assertSecurityConfig();
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
