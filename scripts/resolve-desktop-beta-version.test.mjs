import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { nextFreeDesktopBetaTag } from "./resolve-desktop-beta-version.mjs";

test("unsigned desktop beta starts at v0.1.0-beta.1 at zero cost", () => {
  assert.equal(nextFreeDesktopBetaTag([]), "v0.1.0-beta.1");
});

test("increments from released betas, not stable, draft or unrelated versions", () => {
  const items = [
    { tagName: "v0.1.0-beta.10", isDraft: false },
    { tagName: "v0.1.0-beta.2", isDraft: false },
    { tagName: "v1.0.0", isDraft: false },
    { tagName: "v0.1.0-beta.25", isDraft: true },
    { tagName: "v0.1.0-beta.01", isDraft: false },
    { tagName: "v0.2.0-beta.1", isDraft: false },
  ];
  assert.equal(nextFreeDesktopBetaTag(items), "v0.1.0-beta.11");
});

test("fail closed on invalid release metadata or unsafe beta sequence", () => {
  assert.throws(() => nextFreeDesktopBetaTag(null));
  assert.throws(() => nextFreeDesktopBetaTag([
    { tagName: "v0.1.0-beta.9007199254740992", isDraft: false },
  ]));
});

test("numeric MSI beta version does not exceed 65535", () => {
  assert.equal(nextFreeDesktopBetaTag([{ tagName: "v0.1.0-beta.65534", isDraft: false }]), "v0.1.0-beta.65535");
  assert.throws(() => nextFreeDesktopBetaTag([{ tagName: "v0.1.0-beta.65535", isDraft: false }]));
});

test("free beta only runs on explicit dispatch and preserves native/data safety gates", () => {
  const wf = readFileSync(new URL("../.github/workflows/publish-desktop-beta.yml", import.meta.url), "utf8");
  assert.match(wf, /workflow_dispatch:/);
  assert.doesNotMatch(wf, /\bpush:\s*\n\s*branches:/);
  assert.match(wf, /assert-desktop-release-ci\.mjs/);
  assert.match(wf, /cargo tauri build --config \$overlay -- --locked/);
  assert.match(wf, /wix = @\{ version = "0\.1\.\$sequence" \}/);
  assert.match(wf, /MSI numeric patch version exceeds WiX limit/);
  assert.doesNotMatch(wf, /pnpm test:desktop:native/);
  assert.equal((wf.match(/pnpm test:desktop:critical/g) ?? []).length, 1);
  assert.match(wf, /pnpm test:desktop:critical/);
  assert.match(wf, /Get-AuthenticodeSignature/);
  assert.match(wf, /actions\/attest@v4/);
  assert.match(wf, /gh attestation verify/);
  assert.match(wf, /gh release create .*--verify-tag --prerelease/);
  assert.match(wf, /Unknown Publisher|SmartScreen/);
  assert.doesNotMatch(wf, /Require Windows publisher signing and Azure credentials/);
  assert.doesNotMatch(wf, /NOTESPACE_AZURE_SIGNING_(ENDPOINT|ACCOUNT|PROFILE)/);
  assert.doesNotMatch(wf, /secrets\.TAURI_SIGNING_PRIVATE_KEY/);
  assert.doesNotMatch(wf, /createUpdaterArtifacts:\s*true/);
  assert.doesNotMatch(wf, /continue-on-error:\s*true/);
});
