/* global console, process */

import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = process.argv[2] ?? process.env.NOTESPACE_DESKTOP_VERSION;

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Expected a SemVer desktop version, received: ${version ?? "<missing>"}`);
}

const configPath = resolve(root, "apps/desktop/src-tauri/tauri.conf.json");
const cargoPath = resolve(root, "apps/desktop/src-tauri/Cargo.toml");
const lockPath = resolve(root, "apps/desktop/src-tauri/Cargo.lock");

let config = await readFile(configPath, "utf8");
const configVersionPattern = /("version"\s*:\s*")[^"]+("\s*,?)/;
assert.match(config, configVersionPattern, "Tauri config must expose a version field");
config = config.replace(configVersionPattern, `$1${version}$2`);
await writeFile(configPath, config);

let cargo = await readFile(cargoPath, "utf8");
const cargoVersionPattern = /^(version\s*=\s*")[^"]+("\s*)$/m;
assert.match(cargo, cargoVersionPattern, "Cargo manifest must expose a package version");
cargo = cargo.replace(cargoVersionPattern, `$1${version}$2`);
await writeFile(cargoPath, cargo);

let lock = await readFile(lockPath, "utf8");
const packageStart = lock.indexOf('name = "notespace-desktop"');
assert.notEqual(packageStart, -1, "Cargo.lock must contain the desktop package");
const packageVersionStart = lock.indexOf("version = \"", packageStart);
assert.notEqual(packageVersionStart, -1, "Desktop package in Cargo.lock must expose a version");
const packageEnd = lock.indexOf("\n\n[[package]]", packageStart);
assert.ok(packageEnd === -1 || packageVersionStart < packageEnd, "Desktop package version must be local to its package entry");
const versionValueStart = packageVersionStart + 'version = "'.length;
const versionValueEnd = lock.indexOf('"', versionValueStart);
assert.notEqual(versionValueEnd, -1, "Cargo.lock desktop version must be quoted");
lock = `${lock.slice(0, versionValueStart)}${version}${lock.slice(versionValueEnd)}`;
await writeFile(lockPath, lock);

const syncedConfig = JSON.parse(await readFile(configPath, "utf8"));
const syncedCargo = await readFile(cargoPath, "utf8");
const syncedLock = await readFile(lockPath, "utf8");
assert.equal(syncedConfig.version, version);
assert.match(syncedCargo, new RegExp(`^version\\s*=\\s*"${escapeRegExp(version)}"`, "m"));
assert.match(syncedLock, new RegExp(`name = "notespace-desktop"[\\s\\S]*?version = "${escapeRegExp(version)}"`));

console.log(`desktop version synchronized to ${version}`);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
