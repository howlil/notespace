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
