// Create a LiveKit WHIP ingress and print its URL + stream key.
// LiveKit Cloud has no dashboard button for this - ingresses are created via the
// API. Zero deps: mints an ingressAdmin JWT (HS256) and calls the Ingress twirp
// endpoint with the global fetch (Node 18+).
//
// Reads creds from spike/livekit.local.ps1 (the same file whip-smoketest uses),
// or from --url/--key/--secret args, or LK_URL/LK_KEY/LK_SECRET env vars.
//
//   node create-ingress.mjs [--room wkai-test] [--name wkai-whip]

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// ── Resolve creds ────────────────────────────────────────────────────────────
function fromLocalPs1(key) {
  try {
    const txt = fs.readFileSync(path.join(__dirname, "livekit.local.ps1"), "utf8");
    const m = txt.match(new RegExp(`\\$${key}\\s*=\\s*["']([^"']+)["']`));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}
const url = arg("url", process.env.LK_URL || fromLocalPs1("LK_URL"));
const apiKey = arg("key", process.env.LK_KEY || fromLocalPs1("LK_KEY"));
const apiSecret = arg("secret", process.env.LK_SECRET || fromLocalPs1("LK_SECRET"));
const room = arg("room", "wkai-test");
const kind = arg("type", "whip").toLowerCase(); // "whip" | "rtmp"
const name = arg("name", `wkai-${kind}`);

if (!url || !apiKey || !apiSecret) {
  console.error("Missing LiveKit URL/key/secret. Set them in spike/livekit.local.ps1 or pass --url/--key/--secret.");
  process.exit(1);
}

const httpBase = url.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://").replace(/\/$/, "");

// ── Mint an ingressAdmin token ───────────────────────────────────────────────
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = { iss: apiKey, sub: apiKey, nbf: now, exp: now + 600, video: { ingressAdmin: true, roomCreate: true } };
const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const token = `${signingInput}.${b64url(crypto.createHmac("sha256", apiSecret).update(signingInput).digest())}`;

// ── Create the ingress ───────────────────────────────────────────────────────
// WHIP = sub-second, but ffmpeg's WHIP muxer can't handle LiveKit's TCP ICE
// candidates. RTMP = rock-solid ffmpeg output (transcoded by LiveKit).
const body = {
  input_type: kind === "rtmp" ? "RTMP_INPUT" : "WHIP_INPUT",
  name,
  room_name: room,
  participant_identity: "instructor",
  participant_name: "Instructor",
};
if (kind === "whip") {
  // Pass encoded media straight through (we send H.264/Opus already).
  body.bypass_transcoding = true;
}

const endpoint = `${httpBase}/twirp/livekit.Ingress/CreateIngress`;
const res = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

const text = await res.text();
if (!res.ok) {
  console.error(`CreateIngress failed (${res.status}):\n${text}`);
  console.error(`\nEndpoint: ${endpoint}`);
  process.exit(1);
}

let info;
try { info = JSON.parse(text); } catch { console.log(text); process.exit(0); }

const whipUrl = info.url ?? info.Url;
const streamKey = info.stream_key ?? info.streamKey;

console.log(`\n${kind.toUpperCase()} ingress created:`);
console.log("  ingressId:", info.ingress_id ?? info.ingressId ?? "(see raw below)");
console.log("  room:     ", room);
console.log("  URL:      ", whipUrl);
console.log("  streamKey:", streamKey);
console.log("\nRun the smoke test with:");
if (kind === "rtmp") {
  console.log(`  ./rtmp-smoketest.ps1 -Url "${whipUrl}" -StreamKey "${streamKey}"`);
} else {
  console.log(`  ./whip-smoketest.ps1 -WhipUrl "${whipUrl}" -StreamKey "${streamKey}"`);
}
console.log("\n(raw response for reference)");
console.log(JSON.stringify(info, null, 1));
