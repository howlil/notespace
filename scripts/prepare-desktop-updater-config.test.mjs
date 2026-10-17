import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("./prepare-desktop-updater-config.mjs", import.meta.url).pathname;
function invoke(pubkey, privateKey) {
  const root = mkdtempSync(join(tmpdir(), "notespace-updater-test-"));
  try {
    const target = join(root, "config.json");
    const result = spawnSync(process.execPath, [script, target], {
      encoding: "utf8",
      env: {
        ...process.env,
        NOTESPACE_UPDATER_PUBLIC_KEY: pubkey,
        TAURI_SIGNING_PRIVATE_KEY: privateKey,
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
