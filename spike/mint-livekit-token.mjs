// Mint a LiveKit access token (JWT, HS256) with a publish grant, using only Node
// builtins - no livekit-server-sdk needed. For the Phase 0 WHIP smoke test.
//
// Usage:
//   node mint-livekit-token.mjs --key <API_KEY> --secret <API_SECRET> \
//        --room wkai-test --identity instructor --ttl 7200
//
// Prints the token to stdout. LiveKit verifies it with the same API secret.

import crypto from "node:crypto";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const apiKey = arg("key");
const apiSecret = arg("secret");
const room = arg("room", "wkai-test");
const identity = arg("identity", "instructor");
const ttl = Number(arg("ttl", "7200"));

if (!apiKey || !apiSecret) {
  console.error("Missing --key or --secret. See --help usage in the file header.");
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  iss: apiKey,
  sub: identity,
  nbf: now,
  exp: now + ttl,
  // LiveKit video grant: allow joining the room and publishing tracks (WHIP).
  video: {
    room,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  },
};

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
const sig = b64url(crypto.createHmac("sha256", apiSecret).update(signingInput).digest());
process.stdout.write(`${signingInput}.${sig}\n`);
