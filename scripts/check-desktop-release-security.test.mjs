import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
const file = new URL("../.github/workflows/release-desktop.yml", import.meta.url);
const workflow = readFileSync(file, "utf8");

test("exactly one installer and one cross-platform build job", () => {
  assert.equal((workflow.match(/^  windows-installer:/gm) ?? []).length, 1);
  assert.equal((workflow.match(/^  cross-platform-native:/gm) ?? []).length, 1);
});
test("production release is immutable, stable and based on master", () => {
  assert.match(workflow, /Require stable release at current master HEAD/);
  assert.match(workflow, /Release already exists; immutable release policy/);
  assert.doesNotMatch(workflow, /gh release upload.*--clobber/);
});
test("publisher signature and updater signatures are distinct hard gates", () => {
  assert.match(workflow, /Require Windows publisher signing and Azure credentials/);
  assert.match(workflow, /Get-AuthenticodeSignature/);
  assert.match(workflow, /NOTESPACE_WINDOWS_SIGNER_SUBJECT/);
  assert.match(workflow, /TAURI_SIGNING_PRIVATE_KEY/);
  assert.match(workflow, /\.msi\.sig/);
});
test("real previous-version MSI data proof precedes publication", () => {
  const upgrade = workflow.indexOf("Gate release on real MSI upgrade and user-data preservation");
  const publish = workflow.indexOf("Publish GitHub Release");
  assert.ok(upgrade >= 0 && publish > upgrade);
});
test("attestation generated and verified before publishing", () => {
  assert.match(workflow, /actions\/attest@v4/);
  assert.match(workflow, /gh attestation verify/);
  assert.match(workflow, /id-token: write/);
  assert.ok(workflow.indexOf("gh attestation verify") < workflow.indexOf("Publish GitHub Release"));
});

test("first-release signing prerequisite fails before expensive builds", () => {
  assert.match(workflow, /^  release-credentials-preflight:/m);
  assert.match(workflow, /cross-platform-native:\s+needs: release-credentials-preflight/);
  for (const name of [
    "TAURI_SIGNING_PRIVATE_KEY", "NOTESPACE_UPDATER_PUBLIC_KEY",
    "NOTESPACE_AZURE_SIGNING_ENDPOINT", "NOTESPACE_AZURE_SIGNING_ACCOUNT",
    "NOTESPACE_AZURE_SIGNING_PROFILE", "NOTESPACE_WINDOWS_SIGNER_SUBJECT",
    "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID",
  ]) {
    const job = workflow.split(/^  windows-installer:/m)[0];
    assert.ok(job.includes(name), `Missing release signing preflight for ${name}`);
  }
});

test("GitHub CLI publisher receives GH_TOKEN and keeps immutable signed releases", () => {
  const publish = workflow.slice(workflow.indexOf("      - name: Publish GitHub Release"));
  assert.match(publish, /GH_TOKEN:\s*\$\{\{ github\.token \}\}/);
  assert.match(publish, /gh release create .*--verify-tag/);
  assert.doesNotMatch(publish, /--clobber/);
});
