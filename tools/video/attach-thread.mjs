/**
 * Re-attach the seeded Q&A thread to whichever student the camera is right now.
 *
 * The server sends a student only their own thread, and every navigation
 * re-joins the room and is issued a fresh student id. So a thread seeded
 * against yesterday's id renders as "No questions yet" the moment the take
 * starts — which is exactly the empty-room look these clips exist to replace.
 *
 *   node attach-thread.mjs <studentId>
 */
import pg from "../../wkai-backend/node_modules/pg/lib/index.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const HERE = dirname(fileURLToPath(import.meta.url));

const studentId = process.argv[2];
if (!studentId) {
  console.error("usage: node attach-thread.mjs <studentId>");
  process.exit(1);
}

// The backend's .env holds the connection string; read it rather than
// duplicating credentials here.
const env = readFileSync(join(HERE, "../../wkai-backend/.env"), "utf8");
const match = env.match(/^DATABASE_URL\s*=\s*(.+)$/m);
if (!match) throw new Error("DATABASE_URL not found in wkai-backend/.env");

const client = new pg.Client({
  connectionString: match[1].trim().replace(/^["']|["']$/g, ""),
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query("SELECT id FROM sessions WHERE room_code = 'DEMO01'");
if (!rows.length) throw new Error("DEMO01 session not found — run the seeder first");

const res = await client.query("UPDATE messages SET student_id = $2 WHERE session_id = $1", [
  rows[0].id,
  studentId,
]);
console.log(`attached ${res.rowCount} messages to ${studentId}`);
await client.end();
