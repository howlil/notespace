import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createDesktopBetaManifest } from "./create-desktop-beta-manifest.mjs";

const signature = Buffer.from(
  "untrusted comment: signature from tauri secret key\nRUTESTONLYEXAMPLE==\ntrusted comment: test\nRUTESTONLYEXAMPLE==\n"
).toString("base64");

function fixture(callback) {
  const dir = mkdtempSync(join(tmpdir(), "notespace-beta-manifest-"));
  try {
    const installer = join(dir, "Notespace_0.1.0-beta.3_x64_en-US.msi");
    writeFileSync(installer, Buffer.alloc(2048));
    writeFileSync(installer + ".sig", signature);
    return callback({ installer, signaturePath: installer + ".sig", dir });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test("manifest pins immutable MSI release URL and embeds complete Tauri signature", () => fixture(({ installer, signaturePath }) => {
  const result = createDesktopBetaManifest({ tag: "v0.1.0-beta.3", msiPath: installer, signaturePath });
  assert.equal(result.version, "0.1.0-beta.3");
  assert.equal(result.platforms["windows-x86_64"].signature, signature);
  assert.equal(result.platforms["windows-x86_64"].url, "https://github.com/howlil/notespace/releases/download/v0.1.0-beta.3/Notespace_0.1.0-beta.3_x64_en-US.msi");
}));

test("manifest refuses missing signing data or mismatched installer version", () => fixture(({ installer, signaturePath }) => {
  assert.throws(() => createDesktopBetaManifest({ tag: "v0.1.0-beta.4", msiPath: installer, signaturePath }));
  assert.throws(() => createDesktopBetaManifest({ tag: "v0.1.0-beta.3", msiPath: installer, signaturePath: "other.sig" }));
}));

test("manifest CLI writes latest.json for windows-x86_64", () => fixture(({ installer, signaturePath, dir }) => {
  const output = join(dir, "latest.json");
  const cli = fileURLToPath(new URL("./create-desktop-beta-manifest.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "v0.1.0-beta.3", installer, signaturePath, output], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(output, "utf8")).platforms), ["windows-x86_64"]);
}));
