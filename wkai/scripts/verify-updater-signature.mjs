/**
 * Proves the freshly built updater artifacts actually verify against the public
 * key compiled into the app (`plugins.updater.pubkey` in tauri.conf.json).
 *
 * The failure this exists to catch is silent: a build can sign every bundle
 * with a private key that no longer matches the shipped pubkey, upload a
 * perfectly well-formed latest.json, and leave every installed client rejecting
 * the update with a signature error nobody sees. Checking here turns that into
 * a red build.
 *
 * Minisign signatures as Tauri writes them:
 *   <bundle>.sig  = base64( minisign signature file text )
 *   sig file text = comment / base64(alg[2] || keyId[8] || sig[64]) /
 *                   trusted comment / base64(global sig[64])
 *   alg "ED"      = Ed25519 over blake2b-512(file), "Ed" = Ed25519 over file
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundleDir = path.join(root, "src-tauri", "target", "release", "bundle");

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** Raw 32-byte Ed25519 key -> a KeyObject, via a fixed SPKI DER prefix. */
function ed25519PublicKey(raw) {
  const der = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    raw,
  ]);
  return crypto.createPublicKey({ key: der, format: "der", type: "spki" });
}

function parseKeyBlob(blob, expectedLength, what) {
  const bytes = Buffer.from(blob, "base64");
  if (bytes.length !== expectedLength) {
    fail(`Malformed ${what}: expected ${expectedLength} bytes, got ${bytes.length}.`);
  }
  return {
    algorithm: bytes.subarray(0, 2).toString("latin1"),
    keyId: bytes.subarray(2, 10).toString("hex"),
    payload: bytes.subarray(10),
  };
}

function collectSignatureFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSignatureFiles(full);
    return entry.name.endsWith(".sig") ? [full] : [];
  });
}

const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8")
);
const configuredPubkey = tauriConfig.plugins?.updater?.pubkey;
if (!configuredPubkey) {
  fail("tauri.conf.json has no plugins.updater.pubkey - the app cannot verify any update.");
}

// The configured value is base64 of the whole minisign .pub file; the key blob
// is its last non-empty line.
const pubFileLines = Buffer.from(configuredPubkey, "base64")
  .toString("utf8")
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const pub = parseKeyBlob(pubFileLines[pubFileLines.length - 1], 42, "updater public key");
const publicKey = ed25519PublicKey(pub.payload);

const signatureFiles = collectSignatureFiles(bundleDir);
if (signatureFiles.length === 0) {
  fail(
    `No .sig files under ${bundleDir}. The build produced no updater artifacts - check that bundle.createUpdaterArtifacts is true and that TAURI_SIGNING_PRIVATE_KEY is set.`
  );
}

let verified = 0;
for (const sigPath of signatureFiles) {
  const artifactPath = sigPath.slice(0, -".sig".length);
  if (!fs.existsSync(artifactPath)) {
    fail(`${path.basename(sigPath)} has no matching artifact at ${artifactPath}.`);
  }

  const sigLines = Buffer.from(fs.readFileSync(sigPath, "utf8").trim(), "base64")
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const blobLine = sigLines.find((line) => !line.includes("comment:"));
  if (!blobLine) {
    fail(`${path.basename(sigPath)} does not contain a minisign signature blob.`);
  }
  const sig = parseKeyBlob(blobLine, 74, `signature in ${path.basename(sigPath)}`);

  if (sig.keyId !== pub.keyId) {
    fail(
      `${path.basename(artifactPath)} was signed with key ${sig.keyId}, but the app ships pubkey ${pub.keyId}. ` +
        "Every installed client would reject this update. Either build with the matching private key, or update plugins.updater.pubkey in tauri.conf.json (which strands existing installs)."
    );
  }

  const artifact = fs.readFileSync(artifactPath);
  const message =
    sig.algorithm === "ED"
      ? crypto.createHash("blake2b512").update(artifact).digest()
      : artifact;

  if (!crypto.verify(null, message, publicKey, sig.payload)) {
    fail(`Signature for ${path.basename(artifactPath)} does not verify against the shipped pubkey.`);
  }

  console.log(`ok  ${path.basename(artifactPath)}  (key ${sig.keyId})`);
  verified += 1;
}

console.log(`Verified ${verified} updater signature(s) against pubkey ${pub.keyId}.`);
