import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolveDesktopVersion } from "./resolve-desktop-release-version.mjs";
import { assertDesktopReleaseChecks } from "./assert-desktop-release-ci.mjs";

const sha = "a".repeat(40);
const run = (name, conclusion = "success", overrides = {}) => ({
  name, head_sha: sha, id: name === "Verify" ? 8 : 9, event: "push",
  status: "completed", conclusion, ...overrides,
});

test("first stable release is deterministic, not an arbitrary build number", () => {
  assert.equal(resolveDesktopVersion([], { bump: "patch" }), "v1.0.0");
  assert.equal(resolveDesktopVersion([], { bump: "major" }), "v1.0.0");
});

test("sort all published versions numerically and ignore drafts, prereleases, and unrelated tags", () => {
  const releases = [
    { tagName: "v1.9.9", isDraft: false, isPrerelease: false },
    { tagName: "v1.10.2", isDraft: false, isPrerelease: false },
    { tagName: "v99.0.0", isDraft: true, isPrerelease: false },
    { tagName: "v3.0.0-rc.1", isDraft: false, isPrerelease: true },
    { tagName: "other-v4.0.0", isDraft: false, isPrerelease: false },
  ];
  assert.equal(resolveDesktopVersion(releases, { bump: "patch" }), "v1.10.3");
  assert.equal(resolveDesktopVersion(releases, { bump: "minor" }), "v1.11.0");
  assert.equal(resolveDesktopVersion(releases, { bump: "major" }), "v2.0.0");
});

test("explicit version must advance stable SemVer and cannot inject shell syntax", () => {
  const releases = [{ tagName: "v1.2.3", isDraft: false, isPrerelease: false }];
  assert.equal(resolveDesktopVersion(releases, { requestedVersion: "v2.0.0" }), "v2.0.0");
  for (const version of ["1.2.3", "1.2.2", "0.0.1", "1.2.3-rc.1", "01.2.4", "1.2.4; echo hacked", "1.2.4\nfoo"]) {
    assert.throws(() => resolveDesktopVersion(releases, { requestedVersion: version }));
  }
  assert.throws(() => resolveDesktopVersion(releases, { bump: "skip" }));
});

test("only successful push CI on the exact master SHA permits release", () => {
  assert.doesNotThrow(() => assertDesktopReleaseChecks({ workflow_runs: [run("Verify"), run("Verify Desktop")] }, sha));
  for (const payload of [
    { workflow_runs: [run("Verify")] },
    { workflow_runs: [run("Verify"), run("Verify Desktop", "failure")] },
    { workflow_runs: [run("Verify"), run("Verify Desktop", null, { status: "in_progress" })] },
    { workflow_runs: [run("Verify"), run("Verify Desktop", "success", { event: "pull_request" })] },
    { workflow_runs: [run("Verify"), run("Verify Desktop", "success", { head_sha: "b".repeat(40) })] },
    { workflow_runs: [run("Verify"), run("Verify Desktop"), run("Verify Desktop", "failure", { id: 14 })] },
  ]) {
    assert.throws(() => assertDesktopReleaseChecks(payload, sha));
  }
});

test("release automation cannot silently publish on every push or skip signing/CI", () => {
  const workflow = readFileSync(new URL("../.github/workflows/publish-desktop.yml", import.meta.url), "utf8");
  const release = readFileSync(new URL("../.github/workflows/release-desktop.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*\n\s*branches:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /Require successful Verify and Verify Desktop on this master commit/);
  assert.match(workflow, /scripts\/assert-desktop-release-ci\.mjs/);
  assert.match(workflow, /Require production updater and Windows publisher signing configuration/);
  assert.match(workflow, /git tag -a/);
  assert.match(workflow, /gh workflow run release-desktop\.yml --ref master --field/);
  assert.ok(workflow.indexOf("Require successful Verify") < workflow.indexOf("git tag -a"));
  assert.ok(workflow.indexOf("Require production updater") < workflow.indexOf("git tag -a"));
  assert.match(release, /Gate release on real MSI upgrade and user-data preservation/);
  assert.match(release, /Verify Windows publisher signature on installer/);
  assert.match(release, /Attest signed MSI build provenance/);
  assert.match(release, /Publish GitHub Release/);
});

test("auto desktop beta releases only once after both master verification workflows succeed", () => {
  const workflow = readFileSync(new URL("../.github/workflows/auto-desktop-beta.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- Verify\s*\n\s*- Verify Desktop/);
  assert.match(workflow, /types:\s*\[completed\]/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'master'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /scripts\/assert-desktop-release-ci\.mjs/);
  assert.match(workflow, /master_sha.*TRIGGER_SHA/);
  assert.match(workflow, /gh release list.*tagName,isDraft/);
  assert.match(workflow, /gh run list --workflow publish-desktop-beta\.yml/);
  assert.match(workflow, /gh workflow run publish-desktop-beta\.yml --ref master/);
  assert.doesNotMatch(workflow, /git tag -a|gh release create/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
