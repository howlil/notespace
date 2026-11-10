import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveDesktopVersion } from "./resolve-desktop-release-version.mjs";
import { assertDesktopReleaseChecks } from "./assert-desktop-release-ci.mjs";

const sha = "a".repeat(40);
const repository = "howlil/notespace";
const run = (name = "ci", conclusion = "success", overrides = {}) => ({
  name, head_sha: sha, head_branch: "master", id: 8, run_attempt: 1, event: "push",
  path: ".github/workflows/ci.yml", repository: { full_name: repository },
  head_repository: { full_name: repository }, status: "completed", conclusion, ...overrides,
});
const proof = (runs = [run()]) => ({
  master_sha: sha, workflow_runs: runs,
  jobs: { total_count: 1, jobs: [{ name: "ci / gate", run_id: 8, run_attempt: 1, head_sha: sha, status: "completed", conclusion: "success" }] },
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

test("publication requires the latest exact-master push ci, never legacy or full regression", () => {
  assert.doesNotThrow(() => assertDesktopReleaseChecks(proof(), sha, repository));
  assert.doesNotThrow(() => assertDesktopReleaseChecks(proof([run(), run("ci", "failure", { id: 14, event: "workflow_dispatch" })]), sha, repository));
  const rerun = proof([run("ci", "success", { run_attempt: 2 })]);
  rerun.jobs.jobs[0].run_attempt = 2;
  assert.doesNotThrow(() => assertDesktopReleaseChecks(rerun, sha, repository));
  for (const runs of [
    [], [run("Verify"), run("Verify Desktop")],
    [run("ci", "failure")], [run("ci", "cancelled")], [run("ci", "skipped")],
    [run("ci", null, { status: "in_progress" })],
    [run("ci", "success", { event: "pull_request" })],
    [run("ci", "success", { event: "workflow_dispatch" })],
    [run("ci", "success", { event: "schedule" })],
    [run("ci", "success", { head_sha: "b".repeat(40) })],
    [run("ci", "success", { head_branch: "other" })],
    [run("ci", "success", { path: ".github/workflows/other.yml" })],
    [run("ci", "success", { repository: { full_name: "other/repo" } })],
    [run("ci", "success", { head_repository: { full_name: "other/repo" } })],
    [run(), run()], [run("ci", "success", { id: 0 })],
    [run(), run("ci", "failure", { id: 14 })],
    [run(), run("ci", null, { id: 14, status: "queued" })],
  ]) assert.throws(() => assertDesktopReleaseChecks(proof(runs), sha, repository), JSON.stringify(runs));
});

test("successful run cannot hide a missing, skipped, duplicate or stale-attempt gate", () => {
  for (const change of [
    (p) => { delete p.master_sha; },
    (p) => { p.master_sha = "b".repeat(40); },
    (p) => { p.jobs.jobs = []; p.jobs.total_count = 0; },
    (p) => { p.jobs.total_count = 2; },
    (p) => { p.jobs.jobs.push({ ...p.jobs.jobs[0] }); p.jobs.total_count = 2; },
    ...["failure", "cancelled", "skipped", null].map((conclusion) => (p) => { p.jobs.jobs[0].conclusion = conclusion; }),
    (p) => { p.jobs.jobs[0].status = "in_progress"; },
    (p) => { p.jobs.jobs[0].name = "regression / gate"; },
    (p) => { p.jobs.jobs[0].run_id = 7; },
    (p) => { p.jobs.jobs[0].head_sha = "b".repeat(40); },
    (p) => { p.workflow_runs[0].run_attempt = 2; },
    (p) => { p.workflow_runs = [run("ci", "success", { id: 9 })]; },
  ]) {
    const payload = proof(); change(payload);
    assert.throws(() => assertDesktopReleaseChecks(payload, sha, repository), change.toString());
  }
});

test("real cross-platform CLI executes the gate and propagates refusal, not a silent no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "release preflight "));
  const file = join(root, "evidence.json");
  const script = fileURLToPath(new URL("./assert-desktop-release-ci.mjs", import.meta.url));
  try {
    writeFileSync(file, JSON.stringify(proof()));
    const invoke = (expected) => spawnSync(process.execPath, [script, file, expected], { env: { ...process.env, GITHUB_REPOSITORY: repository }, encoding: "utf8" });
    const good = invoke(sha);
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /exact-attempt ci \/ gate passed/);
    assert.notEqual(invoke("b".repeat(40)).status, 0);
    assert.notEqual(invoke("invalid").status, 0);
    writeFileSync(file, JSON.stringify(proof([])));
    assert.notEqual(invoke(sha).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("release automation cannot silently publish on every push or skip signing/CI", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/publish-desktop.yml", import.meta.url), "utf8");
  const release = readFileSync(new URL("../../.github/workflows/release-desktop.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\bpush:\s*\n\s*branches:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /Require successful master push ci and exact-attempt ci \/ gate/);
  assert.match(workflow, /assert-desktop-release-ci\.mjs --collect "\$GITHUB_SHA"/);
  assert.match(workflow, /scripts\/release\/assert-desktop-release-ci\.mjs/);
  assert.match(workflow, /Require production updater and Windows publisher signing configuration/);
  assert.match(workflow, /git tag -a/);
  assert.match(workflow, /gh workflow run release-desktop\.yml --ref master --field/);
  assert.ok(workflow.indexOf("Require successful master push ci") < workflow.indexOf("git tag -a"));
  assert.ok(workflow.indexOf("Require production updater") < workflow.indexOf("git tag -a"));
  assert.match(release, /Gate release on real MSI upgrade and user-data preservation/);
  assert.match(release, /Verify Windows publisher signature on installer/);
  assert.match(release, /Attest signed MSI build provenance/);
  assert.match(release, /Publish GitHub Release/);
});

test("auto desktop beta is first-release only unless master explicitly opts in after green CI", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/auto-desktop-beta.yml", import.meta.url), "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /workflows:\s*\n\s*- ci\s*\n/);
  assert.doesNotMatch(workflow, /- Verify/);
  assert.match(workflow, /assert-desktop-release-ci\.mjs --collect "\$master_sha"/);
  assert.match(workflow, /types:\s*\[completed\]/);
  assert.match(workflow, /workflow_run\.event == 'push'/);
  assert.match(workflow, /workflow_run\.head_branch == 'master'/);
  assert.match(workflow, /workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /scripts\/release\/assert-desktop-release-ci\.mjs/);
  assert.match(workflow, /master_sha.*TRIGGER_SHA/);
  assert.match(workflow, /gh release list.*tagName,isDraft/);
  assert.match(workflow, /gh run list --workflow publish-desktop-beta\.yml/);
  assert.match(workflow, /gh workflow run publish-desktop-beta\.yml --ref master/);
  assert.match(workflow, /\[desktop-beta\]/);
  assert.match(workflow, /git\/commits\/\$master_sha/);
  assert.match(workflow, /headSha,status,conclusion/);
  assert.match(workflow, /x\.headSha === sha && x\.status === "completed"/);
  assert.match(workflow, /\$explicit.*!= "true"/);
  assert.doesNotMatch(workflow, /git tag -a|gh release create/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("release and native CI reuse caches and never compile the Tauri CLI from source", () => {
  const desktop = readFileSync(new URL("../../.github/workflows/verify-desktop.yml", import.meta.url), "utf8");
  const beta = readFileSync(new URL("../../.github/workflows/publish-desktop-beta.yml", import.meta.url), "utf8");
  const stable = readFileSync(new URL("../../.github/workflows/release-desktop.yml", import.meta.url), "utf8");
  for (const [name, workflow] of [["verify-desktop", desktop], ["beta", beta], ["stable", stable]]) {
    assert.doesNotMatch(workflow, /cargo install tauri-cli/);
    assert.match(workflow, /bunx @tauri-apps\/cli@2\.12\.3 build/);
    assert.match(workflow, /Swatinem\/rust-cache@v2/);
    assert.match(workflow, /oven-sh\/setup-bun@v2/);
    assert.match(workflow, /bun install --frozen-lockfile/);
    assert.doesNotMatch(workflow, /- run: bun run build\s*$/m, `${name} should not rebuild the landing app`);
    assert.match(workflow, /bun run --filter @notespace\/web build/);
  }
  assert.doesNotMatch(desktop, /name: Run native WebDriver parity smoke/);
  assert.match(beta, /bun run test:desktop:critical/);
  assert.match(stable, /Gate release on real MSI upgrade and user-data preservation/);
  assert.equal((stable.match(/Swatinem\/rust-cache@v2/g) ?? []).length, 2);
  assert.equal((stable.match(/oven-sh\/setup-bun@v2/g) ?? []).length, 2);
});

test("only obsolete PR checks are canceled, never master CI or a release", () => {
  const basic = readFileSync(new URL("../../.github/workflows/verify.yml", import.meta.url), "utf8");
  const desktop = readFileSync(new URL("../../.github/workflows/verify-desktop.yml", import.meta.url), "utf8");
  const beta = readFileSync(new URL("../../.github/workflows/publish-desktop-beta.yml", import.meta.url), "utf8");
  assert.match(basic, /group: \$\{\{ github\.workflow \}\}-\$\{\{ github\.ref \}\}/);
  // Reusable native CI must not cancel its caller (github.workflow is inherited).
  assert.match(desktop, /group: desktop-\$\{\{ github\.workflow \}\}-\$\{\{ github\.event_name \}\}-\$\{\{ github\.ref \}\}/);
  for (const workflow of [basic, desktop]) {
    assert.match(workflow, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  }
  assert.match(beta, /cancel-in-progress: false/);
  // Browser proof remains required on both PR and master without an extra Chromium download.
  assert.match(basic, /name: Run critical browser suite on PR[\s\S]*?if: github\.event_name == 'pull_request'\s+run: bun run test:e2e:critical/);
  assert.match(basic, /name: Run critical WebdriverIO suite on master[\s\S]*?if: github\.event_name == 'push'\s+run: bun run test:e2e:critical/);
  assert.doesNotMatch(basic, /playwright install --with-deps/);
  assert.match(basic, /docker compose -f compose\.yaml -f compose\.ci\.yaml up --build -d --wait\s+if: github\.event_name == 'push'/);
  assert.match(desktop, /check-desktop-windows-latest:[\s\S]*?if: inputs\.profile == 'regression' \|\| \(github\.event_name == 'push' && inputs\.profile != 'native'\)\s+runs-on: windows-latest/);
});

test("free beta produces signed Tauri updater artifacts without Azure publisher certificates", () => {
  const beta = readFileSync(new URL("../../.github/workflows/publish-desktop-beta.yml", import.meta.url), "utf8");
  const config = readFileSync(new URL("./prepare-desktop-updater-config.mjs", import.meta.url), "utf8");
  const manifest = readFileSync(new URL("./create-desktop-beta-manifest.mjs", import.meta.url), "utf8");
  assert.match(beta, /TAURI_SIGNING_PRIVATE_KEY: \$\{\{ secrets\.TAURI_SIGNING_PRIVATE_KEY \}\}/);
  assert.match(beta, /NOTESPACE_UPDATER_ENABLED: "1"/);
  assert.match(beta, /NOTESPACE_UPDATER_CHANNEL: beta/);
  assert.match(beta, /prepare-desktop-updater-config\.mjs/);
  assert.match(beta, /create-desktop-beta-manifest\.mjs/);
  assert.match(beta, /Tauri updater detached MSI signature is missing/);
  assert.match(beta, /gh release create.*\$env:MSI_SIG_PATH.*\$manifest/);
  assert.match(beta, /Publish verified beta feed only after immutable GitHub Release exists/);
  assert.match(beta, /contents\/latest\.json/);
  assert.doesNotMatch(beta, /AZURE_CLIENT_SECRET|NOTESPACE_AZURE_SIGNING_ENDPOINT|signCommand/);
  assert.match(config, /desktop-beta-feed\/latest\.json/);
  assert.match(manifest, /windows-x86_64/);
});

test("explicit desktop-beta release notes trigger both PR and master desktop verification", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/verify-desktop.yml", import.meta.url), "utf8");
  const releaseNotePath = '"docs/DESKTOP_BETA_RELEASE_*.md"';
  const workflowPath = '".github/workflows/verify-desktop.yml"';
  const [prTrigger, pushTrigger] = workflow.split(/^  push:\s*$/m);
  assert.ok(prTrigger && pushTrigger, "Desktop CI must include separate PR and master push triggers");
  for (const [trigger, fragment] of [["pull_request", prTrigger], ["push", pushTrigger]]) {
    assert.ok(fragment.includes("paths:"), `${trigger} must declare path filters`);
    assert.ok(fragment.includes(releaseNotePath), `${trigger} must check explicit release-note commits`);
    assert.ok(fragment.includes(workflowPath), `${trigger} must verify its own workflow changes`);
  }
});
