import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./prepare-desktop-updater-config.mjs", import.meta.url));
function invoke(pubkey, privateKey, options = {}) {
  const root = mkdtempSync(join(tmpdir(), "notespace-updater-test-"));
  try {
    const target = join(root, "config.json");
    const result = spawnSync(process.execPath, [script, target], {
      encoding: "utf8",
      env: {
        ...process.env,
        NOTESPACE_UPDATER_PUBLIC_KEY: pubkey,
        TAURI_SIGNING_PRIVATE_KEY: privateKey,
        NOTESPACE_UPDATER_CHANNEL: options.channel ?? "",
        NOTESPACE_BETA_WIX_VERSION: options.wixVersion ?? "",
      },
    });
    return { ...result, config: result.status === 0 ? JSON.parse(readFileSync(target, "utf8")) : null };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
const validPublicKey = Buffer.from("untrusted comment: minisign public key: 0123456789\nRWQAAAAAAAAAAAAAAAAAAAAAAAB=\n").toString("base64");

test("release updater demands actual signing credentials", () => {
  assert.notEqual(invoke(validPublicKey, "").status, 0);
  assert.notEqual(invoke("", "fake signing key").status, 0);
});

test("updater rejects unencoded public-key string and placeholders", () => {
  assert.notEqual(invoke("RWQfake", "fake signing key").status, 0);
  assert.notEqual(invoke("path/to/key.pub", "fake signing key").status, 0);
});

test("updater config embeds only public key and an HTTPS endpoint", () => {
  const run = invoke(validPublicKey, "fake private key for configuration test");
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.config.plugins.updater.pubkey, validPublicKey);
  assert.equal(run.config.bundle.createUpdaterArtifacts, true);
  assert.deepEqual(run.config.plugins.updater.endpoints, [
    "https://github.com/howlil/notespace/releases/latest/download/latest.json",
  ]);
  assert.ok(!JSON.stringify(run.config).includes("fake private key"));
});

test("signed beta uses a separate public channel feed and increasing WiX version", () => {
  const run = invoke(validPublicKey, "test private key", { channel: "beta", wixVersion: "0.1.3" });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(run.config.plugins.updater.endpoints, [
    "https://raw.githubusercontent.com/howlil/notespace/desktop-beta-feed/latest.json",
  ]);
  assert.equal(run.config.bundle.createUpdaterArtifacts, true);
  assert.equal(run.config.bundle.windows.wix.version, "0.1.3");
  assert.equal(run.config.plugins.updater.windows.installMode, "passive");
});

test("signed beta refuses invalid WiX versions and unknown update channel", () => {
  assert.notEqual(invoke(validPublicKey, "test key", { channel: "beta", wixVersion: "0.1.0" }).status, 0);
  assert.notEqual(invoke(validPublicKey, "test key", { channel: "beta", wixVersion: "0.1.3; echo hacked" }).status, 0);
  assert.notEqual(invoke(validPublicKey, "test key", { channel: "test", wixVersion: "0.1.3" }).status, 0);
});
