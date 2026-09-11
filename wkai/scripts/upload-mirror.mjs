/**
 * Mirrors release bundles to a Google Drive folder and prints a JSON map of
 * asset name -> public direct-download URL.
 *
 * GitHub's release CDN (objects.githubusercontent.com) is unreachable from
 * some networks while github.com and api.github.com are fine. The download
 * page reads the release through the API, so mirror links written into the
 * release notes reach users the CDN cannot.
 *
 * Usage:  node scripts/upload-mirror.mjs <dir-with-assets>
 * Env:    GDRIVE_FOLDER_ID              target folder id
 *
 *         Either (uploads as a real user — required for My Drive, since
 *         service accounts have no storage quota as of 2025):
 *         GDRIVE_OAUTH_CLIENT_ID / GDRIVE_OAUTH_CLIENT_SECRET / GDRIVE_OAUTH_REFRESH_TOKEN
 *           (mint the refresh token once with scripts/gdrive-auth.mjs)
 *
 *         Or (only works into a Shared Drive the account is a member of):
 *         GDRIVE_SERVICE_ACCOUNT_JSON
 */
import fs from "node:fs";
import path from "node:path";
import { JWT, OAuth2Client } from "google-auth-library";

const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) {
  console.error(`usage: upload-mirror.mjs <dir>  (got: ${dir})`);
  process.exit(2);
}
const folderId = process.env.GDRIVE_FOLDER_ID;
if (!folderId) {
  console.error("GDRIVE_FOLDER_ID is required.");
  process.exit(2);
}

async function accessToken() {
  const { GDRIVE_OAUTH_CLIENT_ID: id, GDRIVE_OAUTH_CLIENT_SECRET: secret, GDRIVE_OAUTH_REFRESH_TOKEN: refresh } = process.env;
  if (id && secret && refresh) {
    const client = new OAuth2Client({ clientId: id, clientSecret: secret });
    client.setCredentials({ refresh_token: refresh });
    const { token } = await client.getAccessToken();
    console.error("auth: OAuth user");
    return token;
  }
  const saJson = process.env.GDRIVE_SERVICE_ACCOUNT_JSON;
  if (saJson) {
    const sa = JSON.parse(saJson);
    const jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ["https://www.googleapis.com/auth/drive"] });
    const { token } = await jwt.getAccessToken();
    console.error("auth: service account");
    return token;
  }
  console.error("No Drive credentials: set the GDRIVE_OAUTH_* trio or GDRIVE_SERVICE_ACCOUNT_JSON.");
  process.exit(2);
}
const token = await accessToken();
const API = "https://www.googleapis.com/drive/v3";
const headers = { Authorization: `Bearer ${token}` };

async function api(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${url} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// Uploading the same name twice would leave two files; replace instead.
async function removeExisting(name) {
  const q = encodeURIComponent(`name = '${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed = false`);
  const { files = [] } = await api(`${API}/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  for (const f of files) await api(`${API}/files/${f.id}?supportsAllDrives=true`, { method: "DELETE" });
}

async function upload(file) {
  const name = path.basename(file);
  await removeExisting(name);

  const meta = JSON.stringify({ name, parents: [folderId] });
  const boundary = "wkai-" + Math.random().toString(36).slice(2);
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    fs.readFileSync(file),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const created = await api(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }
  );

  // Public read, so the uc?export=download link works without sign-in.
  await api(`${API}/files/${created.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return [name, `https://drive.google.com/uc?export=download&id=${created.id}`];
}

// Only the installers and updater artifacts; skip signatures and latest.json,
// which the updater fetches from GitHub directly.
const files = fs
  .readdirSync(dir)
  .filter((n) => /\.(msi|exe|deb|AppImage|dmg|tar\.gz)$/i.test(n))
  .map((n) => path.join(dir, n));

const mirrors = {};
for (const f of files) {
  const [name, url] = await upload(f);
  mirrors[name] = url;
  console.error(`mirrored ${name}`);
}
process.stdout.write(JSON.stringify(mirrors, null, 2) + "\n");
