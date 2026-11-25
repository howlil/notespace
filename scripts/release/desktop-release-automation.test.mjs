import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolveDesktopVersion } from "./resolve-desktop-release-version.mjs";
import { assertDesktopReleaseChecks } from "./assert-desktop-release-ci.mjs";
import { selectLanes } from "../verify/ci-plan.mjs";
import { releaseRequest } from "./release-request.mjs";

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

function resolveWorkingBash() {
  const candidates = process.platform === "win32"
    ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe"]
    : ["bash"];
  for (const candidate of candidates) {
    if (process.platform === "win32" && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-c", "echo ok"], { encoding: "utf8" });
    if (probe.status === 0 && probe.stdout.trim() === "ok") return candidate;
  }
  return null;
}

const BASH = resolveWorkingBash();

test("release mode admission defaults read-only and rejects ambiguous or malformed destinations", () => {
  const source = { ref: "refs/heads/master", sha };
  assert.equal(releaseRequest(source), "preflight");
  for (const mode of ["preflight", "desktop-beta", "desktop-stable", "image", "cloudflare"]) assert.equal(releaseRequest({ ...source, mode }), mode);
  assert.equal(releaseRequest({ ...source, mode: "desktop-stable", version: "1.2.3", bump: "minor" }), "desktop-stable");
  assert.equal(releaseRequest({ ...source, mode: "image", version: "v1.2.3" }), "image");
  for (const invalid of [
    { mode: "unknown" }, { mode: "desktop-beta\nimage" }, { mode: "" },
    { ref: "refs/tags/v1.2.3" }, { ref: "refs/heads/feature" }, { sha: "short" },
    { mode: "desktop-beta", version: "v1.2.3" }, { version: "v1.2.3" },
    { mode: "cloudflare", bump: "minor" }, { mode: "desktop-stable", bump: "skip" },
    { mode: "desktop-stable", version: "1.2.3; echo unsafe" },
    ...["v1.2.3-beta.1", "v01.2.3", "1.2.3", "v1.2.3\n"].map((version) => ({ mode: "image", version })),
  ]) assert.throws(() => releaseRequest({ ...source, ...invalid }), JSON.stringify(invalid));
});

test("real request CLI emits only a validated mode and fails before routing bad input", () => {
  const root = mkdtempSync(join(tmpdir(), "release request "));
  const output = join(root, "output");
  const script = fileURLToPath(new URL("./release-request.mjs", import.meta.url));
  const invoke = (mode) => spawnSync(process.execPath, [script], { env: { ...process.env, GITHUB_REF: "refs/heads/master", GITHUB_SHA: sha, GITHUB_OUTPUT: output, MODE: mode, RELEASE_BUMP: "patch", RELEASE_VERSION: "" }, encoding: "utf8" });
  try {
    assert.equal(invoke("preflight").status, 0);
    assert.equal(readFileSync(output, "utf8"), "mode=preflight\n");
    assert.notEqual(invoke("unknown").status, 0);
    assert.equal(readFileSync(output, "utf8"), "mode=preflight\n", "No failed request output may select a publisher");
  } finally { rmSync(root, { recursive: true, force: true }); }
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

test("failed release tags are reserved and automatic bumps advance past them", () => {
  const releases = [{ tagName: "v1.0.3", isDraft: false, isPrerelease: false }];
  const existingTags = ["v1.0.4", "v1.0.0-beta.14", "unrelated", "v1.0.9-rc.1"];
  assert.equal(resolveDesktopVersion(releases, { existingTags }), "v1.0.5");
  assert.equal(resolveDesktopVersion(releases, { existingTags, bump: "minor" }), "v1.1.0");
  assert.equal(resolveDesktopVersion(releases, { existingTags, bump: "major" }), "v2.0.0");
  assert.equal(resolveDesktopVersion([], { existingTags: ["v1.0.0"] }), "v1.0.1");
  assert.equal(resolveDesktopVersion(releases, { existingTags, requestedVersion: "v1.0.5" }), "v1.0.5");
  assert.throws(() => resolveDesktopVersion(releases, { existingTags, requestedVersion: "v1.0.4" }));
  assert.throws(() => resolveDesktopVersion(releases, { existingTags: null }));
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

test("target-specific release preflight blocks docs/landing-only master runs from desktop or image releases", () => {
  const job = (name, overrides = {}) => ({
    name, run_id: 8, run_attempt: 1, head_sha: sha, status: "completed", conclusion: "success", ...overrides,
  });
  const withJobs = (list) => ({
    master_sha: sha,
    workflow_runs: [run()],
    jobs: { total_count: list.length, jobs: list },
  });
  const docsOnly = withJobs([job("ci / gate")]);
  const landingOnly = withJobs([job("ci / gate"), job("landing")]);
  const full = withJobs([
    job("ci / gate"),
    job("web"),
    job("server"),
    job("browser"),
    job("landing"),
    job("compose"),
    job("desktop / check-desktop"),
    job("desktop / check-desktop-windows"),
  ]);

  assert.doesNotThrow(() => assertDesktopReleaseChecks(docsOnly, sha, repository, { target: "gate" }));
  for (const target of ["desktop", "image", "cloudflare"]) {
    assert.throws(() => assertDesktopReleaseChecks(docsOnly, sha, repository, { target }), `docs-only must block ${target}`);
  }
  assert.doesNotThrow(() => assertDesktopReleaseChecks(landingOnly, sha, repository, { target: "cloudflare" }));
  assert.throws(() => assertDesktopReleaseChecks(landingOnly, sha, repository, { target: "desktop" }));
  assert.throws(() => assertDesktopReleaseChecks(landingOnly, sha, repository, { target: "image" }));
  for (const target of ["gate", "desktop", "image", "cloudflare"]) {
    assert.doesNotThrow(() => assertDesktopReleaseChecks(full, sha, repository, { target }), `full must pass ${target}`);
  }
  const skippedDesktop = withJobs([
    job("ci / gate"), job("web"), job("server"), job("browser"),
    job("desktop / check-desktop"), job("desktop / check-desktop-windows", { conclusion: "skipped" }),
  ]);
  assert.throws(() => assertDesktopReleaseChecks(skippedDesktop, sha, repository, { target: "desktop" }));
  assert.throws(() => assertDesktopReleaseChecks(full, sha, repository, { target: "unknown" }));
});

test("real cross-platform CLI executes the gate and propagates refusal, not a silent no-op", () => {
  const root = mkdtempSync(join(tmpdir(), "release preflight "));
  const file = join(root, "evidence.json");
  const script = fileURLToPath(new URL("./assert-desktop-release-ci.mjs", import.meta.url));
  try {
    writeFileSync(file, JSON.stringify(proof()));
    const invoke = (expected, extra = []) => spawnSync(process.execPath, [script, file, expected, ...extra], { env: { ...process.env, GITHUB_REPOSITORY: repository }, encoding: "utf8" });
    const good = invoke(sha);
    assert.equal(good.status, 0, good.stderr);
    assert.match(good.stdout, /exact-attempt ci \/ gate \(gate\) passed/);
    assert.notEqual(invoke(sha, ["--target", "desktop"]).status, 0, "Gate-only evidence must fail --target desktop");
    assert.notEqual(invoke("b".repeat(40)).status, 0);
    assert.notEqual(invoke("invalid").status, 0);
    writeFileSync(file, JSON.stringify(proof([])));
    assert.notEqual(invoke(sha).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function stepScript(filename, step) {
  const workflow = readFileSync(new URL(`../../.github/workflows/${filename}`, import.meta.url), "utf8");
  const section = workflow.split(`- name: ${step}`)[1].split(/\r?\n(?: {6}- | {2}[a-z0-9_-]+:)/i)[0];
  return section.split(/run: \|\r?\n/)[1].split(/\r?\n/).map((line) => line.slice(10)).join("\n");
}

function admissionScript(filename, step, expectedTarget) {
  const script = stepScript(filename, step);
  const command = `node scripts/release/assert-desktop-release-ci.mjs --collect "$GITHUB_SHA" --target ${expectedTarget}`;
  assert.equal(script.split(command).length, 2, `Admission must call exactly one real preflight (${command})`);
  return script.replace(command, "echo GATE_REACHED");
}

test("stable signing preflight requires updater keys and treats Azure Authenticode as fail-closed all-or-nothing", { skip: !BASH && "No working bash available on host" }, () => {
  const updater = { TAURI_SIGNING_PRIVATE_KEY: "priv", NOTESPACE_UPDATER_PUBLIC_KEY: "pub" };
  const azure = {
    NOTESPACE_AZURE_SIGNING_ENDPOINT: "https://wus2.codesigning.azure.net",
    NOTESPACE_AZURE_SIGNING_ACCOUNT: "NotespacePublisher",
    NOTESPACE_AZURE_SIGNING_PROFILE: "Production",
    NOTESPACE_WINDOWS_SIGNER_SUBJECT: "CN=Notespace",
    AZURE_CLIENT_ID: "id",
    AZURE_CLIENT_SECRET: "secret",
    AZURE_TENANT_ID: "tenant",
  };
  const emptyAzure = Object.fromEntries(Object.keys(azure).map((key) => [key, ""]));
  const root = mkdtempSync(join(tmpdir(), "stable signing proof "));
  try {
    for (const [filename, step, checksOutput] of [
      ["publish-desktop.yml", "Require production updater and optional Windows publisher signing configuration", false],
      ["release-desktop.yml", "Require production signing configuration", true],
    ]) {
      const script = stepScript(filename, step);
      const output = join(root, `${filename}.out`);
      const invoke = (env) => {
        writeFileSync(output, "");
        return spawnSync(BASH, ["-c", script], {
          env: { ...process.env, ...emptyAzure, TAURI_SIGNING_PRIVATE_KEY: "", NOTESPACE_UPDATER_PUBLIC_KEY: "", GITHUB_OUTPUT: output, ...env },
          encoding: "utf8",
        });
      };
      assert.notEqual(invoke({}).status, 0, `${filename}: missing updater signing must fail`);
      assert.notEqual(invoke({ TAURI_SIGNING_PRIVATE_KEY: "priv" }).status, 0, `${filename}: missing updater pubkey must fail`);
      const unsignedStable = invoke(updater);
      assert.equal(unsignedStable.status, 0, `${filename}: updater-only stable must pass: ${unsignedStable.stderr}`);
      if (checksOutput) assert.equal(readFileSync(output, "utf8").trim(), "authenticode_enabled=false");
      assert.notEqual(invoke({ ...updater, AZURE_CLIENT_ID: "id" }).status, 0, `${filename}: partial Azure config (1/7) must fail closed`);
      const sixOfSeven = { ...updater, ...azure, NOTESPACE_WINDOWS_SIGNER_SUBJECT: "" };
      assert.notEqual(invoke(sixOfSeven).status, 0, `${filename}: partial Azure config (6/7) must fail closed`);
      const signedStable = invoke({ ...updater, ...azure });
      assert.equal(signedStable.status, 0, `${filename}: full updater + Azure config must pass: ${signedStable.stderr}`);
      if (checksOutput) assert.equal(readFileSync(output, "utf8").trim(), "authenticode_enabled=true");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("actual Bash admission rejects beta/malformed tags and non-master before the CI gate", { skip: !BASH && "No working bash available on host" }, () => {
  for (const [filename, step, key, acceptsBlank, target] of [
    ["release.yml", "Require verified master and explicit stable image version", "IMAGE_VERSION", true, "image"],
    ["release-desktop.yml", "Require verified master and explicit stable tag", "RELEASE_TAG_INPUT", false, "desktop"],
  ]) {
    const script = admissionScript(filename, step, target);
    const invoke = (value, ref = "refs/heads/master") => spawnSync(BASH, ["-c", script], { env: { ...process.env, GITHUB_REF: ref, [key]: value }, encoding: "utf8" });
    assert.match(invoke("v1.2.3").stdout, /GATE_REACHED/);
    assert.equal(invoke("").status === 0, acceptsBlank);
    for (const value of ["v1.2.3-beta.1", "v01.2.3", "1.2.3", "v1.2.3; echo unsafe", "v1.2.3\nv2.3.4"]) {
      const denied = invoke(value);
      assert.notEqual(denied.status, 0, value);
      assert.doesNotMatch(denied.stdout, /GATE_REACHED/);
    }
    for (const ref of ["refs/tags/v1.2.3", "refs/heads/feature"]) assert.notEqual(invoke("v1.2.3", ref).status, 0);
  }
});

test("actual image tag binding rejects missing tags and reusing a version for different source", { skip: !BASH && "No working bash available on host" }, () => {
  const root = mkdtempSync(join(tmpdir(), "image tag proof "));
  const script = stepScript("release.yml", "Bind image version to immutable source tag");
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  try {
    git("init");
    git("-c", "user.name=CI", "-c", "user.email=ci@example.test", "commit", "--allow-empty", "-m", "source");
    const source = git("rev-parse", "HEAD");
    git("tag", "v1.2.3");
    git("clone", "--bare", ".", join(root, "origin.git"));
    git("remote", "add", "origin", join(root, "origin.git"));
    const invoke = (version, shaValue) => spawnSync(BASH, ["-c", script], { cwd: root, env: { ...process.env, IMAGE_VERSION: version, GITHUB_SHA: shaValue }, encoding: "utf8" });
    assert.equal(invoke("v1.2.3", source).status, 0);
    assert.notEqual(invoke("v9.9.9", source).status, 0);
    assert.notEqual(invoke("v1.2.3", "b".repeat(40)).status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("explicit desktop-beta release notes select native proof on PR and on every master push", () => {
  const releaseNote = ["docs/DESKTOP_BETA_RELEASE_0.1.0.md"];
  assert.equal(selectLanes("pull_request", releaseNote).desktop, true);
  assert.equal(selectLanes("push", releaseNote).desktop, true);
  assert.equal(selectLanes("push", releaseNote)["release-policy"], true);
});
