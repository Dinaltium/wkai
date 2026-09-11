/**
 * One-time, run locally: obtains a Google Drive refresh token for the account
 * that will own the mirrored installers.
 *
 * Google removed storage quota from service accounts in 2025, so uploads have
 * to be made as a real user. This walks the OAuth consent flow once and prints
 * the refresh token to store as the GDRIVE_OAUTH_REFRESH_TOKEN secret.
 *
 * Usage:
 *   GDRIVE_OAUTH_CLIENT_ID=... GDRIVE_OAUTH_CLIENT_SECRET=... node scripts/gdrive-auth.mjs
 *
 * The OAuth client must be of type "Desktop app" (loopback redirect).
 */
import http from "node:http";
import { OAuth2Client } from "google-auth-library";

const clientId = process.env.GDRIVE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GDRIVE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set GDRIVE_OAUTH_CLIENT_ID and GDRIVE_OAUTH_CLIENT_SECRET first.");
  process.exit(2);
}

const server = http.createServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const redirectUri = `http://127.0.0.1:${port}`;

const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",                        // forces a refresh token even if previously consented
  scope: ["https://www.googleapis.com/auth/drive.file"],
});

console.log("\nOpen this URL in the browser, signed in as the account that should own the mirror:\n");
console.log(url + "\n");

const code = await new Promise((resolve, reject) => {
  server.on("request", (req, res) => {
    const u = new URL(req.url, redirectUri);
    const c = u.searchParams.get("code");
    const err = u.searchParams.get("error");
    res.setHeader("Content-Type", "text/html");
    if (c) { res.end("<p>Done. You can close this tab.</p>"); resolve(c); }
    else { res.end(`<p>Failed: ${err ?? "no code"}</p>`); reject(new Error(err ?? "no code")); }
  });
});
server.close();

const { tokens } = await client.getToken(code);
if (!tokens.refresh_token) {
  console.error("No refresh token returned. Remove the app's access at myaccount.google.com/permissions and run again.");
  process.exit(1);
}
console.log("\nAdd these repository secrets:\n");
console.log(`  GDRIVE_OAUTH_CLIENT_ID      = ${clientId}`);
console.log(`  GDRIVE_OAUTH_CLIENT_SECRET  = ${clientSecret}`);
console.log(`  GDRIVE_OAUTH_REFRESH_TOKEN  = ${tokens.refresh_token}`);
console.log(`  GDRIVE_FOLDER_ID            = <the folder id>\n`);
