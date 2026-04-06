import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const packageJsonPath = path.join(root, "package.json");
const tauriConfigPath = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlPath = path.join(root, "src-tauri", "Cargo.toml");

const cliArgs = process.argv.slice(2);
const bumpType = cliArgs.find((arg) => !arg.startsWith("-")) ?? "patch";
const dryRun = process.argv.includes("--dry-run");

if (!["patch", "minor", "major"].includes(bumpType)) {
  console.error(`Invalid bump type: ${bumpType}. Use patch, minor, or major.`);
  process.exit(1);
}

function parseSemver(version) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(version);
  if (!match) {
    throw new Error(`Invalid semver: ${version}`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpSemver(version, type) {
  const v = parseSemver(version);
  if (type === "major") {
    return `${v.major + 1}.0.0`;
  }
  if (type === "minor") {
    return `${v.major}.${v.minor + 1}.0`;
  }
  return `${v.major}.${v.minor}.${v.patch + 1}`;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function getCargoVersion(cargoToml) {
  const match = cargoToml.match(/\[package\][\s\S]*?\nversion = "([^"]+)"/);
  if (!match) {
    throw new Error("Could not find [package] version in Cargo.toml");
  }
  return match[1];
}

function setCargoVersion(cargoToml, nextVersion) {
  return cargoToml.replace(
    /(\[package\][\s\S]*?\nversion = ")([^"]+)(")/,
    `$1${nextVersion}$3`
  );
}

const packageJson = readJson(packageJsonPath);
const tauriConfig = readJson(tauriConfigPath);
const cargoTomlRaw = fs.readFileSync(cargoTomlPath, "utf8");

const packageVersion = packageJson.version;
const tauriVersion = tauriConfig.version;
const cargoVersion = getCargoVersion(cargoTomlRaw);

if (packageVersion !== tauriVersion || tauriVersion !== cargoVersion) {
  console.warn(
    `Version mismatch detected (package.json=${packageVersion}, tauri.conf.json=${tauriVersion}, Cargo.toml=${cargoVersion}). Syncing from tauri.conf.json before bump.`
  );
}

const baseVersion = tauriVersion;
const nextVersion = bumpSemver(baseVersion, bumpType);

packageJson.version = nextVersion;
tauriConfig.version = nextVersion;
const nextCargoToml = setCargoVersion(cargoTomlRaw, nextVersion);

if (!dryRun) {
  writeJson(packageJsonPath, packageJson);
  writeJson(tauriConfigPath, tauriConfig);
  fs.writeFileSync(cargoTomlPath, nextCargoToml, "utf8");
}

console.log(`Version bump (${bumpType}): ${baseVersion} -> ${nextVersion}`);
if (dryRun) {
  console.log("Dry run only: no files were written.");
}
