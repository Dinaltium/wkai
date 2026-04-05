import "dotenv/config";
import http from "http";
import { app } from "./app.js";
import { initWebSocketServer } from "./ws/server.js";
import { connectDb } from "./db/client.js";
import { connectRedis } from "./db/redis.js";

const PORT = process.env.PORT ?? 4000;

async function main() {
  // Connect to Postgres and Redis before accepting traffic
  await connectDb();
  await connectRedis();

  const server = http.createServer(app);

  // Attach WebSocket server to the same HTTP server
  initWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`[WKAI] Server running on http://localhost:${PORT}`);
    console.log(`[WKAI] WebSocket ready on ws://localhost:${PORT}/ws`);
  });
}

main().catch((err) => {
  console.error("[WKAI] Fatal startup error:", err);
  process.exit(1);
});
