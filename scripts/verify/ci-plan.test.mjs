import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { CANDIDATE_TARGET_LANES, LANES, assertGate, browserMode, selectLanes } from "./ci-plan.mjs";

const cli = fileURLToPath(new URL("./ci-plan.mjs", import.meta.url));
const allOn = Object.fromEntries(LANES.map((lane) => [lane, true]));
const selected = (plan) => LANES.filter((lane) => plan[lane]);

test("schedule and manual regression runs select every lane; explicit candidate targets select only their required lanes", () => {
  for (const event of ["schedule", "workflow_dispatch"]) {
    assert.deepEqual(selectLanes(event, ["docs/TESTING.md"]), allOn, event);
  }
  assert.deepEqual(selectLanes("workflow_dispatch", ["docs/TESTING.md"], { candidateTarget: "regression" }), allOn);
  for (const [target, expectedLanes] of Object.entries(CANDIDATE_TARGET_LANES)) {
    const plan = selectLanes("workflow_dispatch", ["docs/TESTING.md"], { candidateTarget: target });
    assert.deepEqual(selected(plan), expectedLanes, target);
  }
  assert.throws(() => selectLanes("workflow_dispatch", null, { candidateTarget: "unknown" }), /Unknown CI candidate target/);
});

test("master push skips heavy lanes only for pure docs or landing diffs, and falls back to all lanes otherwise", () => {
  assert.deepEqual(selectLanes("push", null), allOn);
  assert.deepEqual(selectLanes("push", []), allOn);
  assert.deepEqual(selected(selectLanes("push", ["docs/TESTING.md", ".agents/engineering.md"])), []);
  assert.deepEqual(selected(selectLanes("push", ["README.md", "docs/TESTING.md"])), ["landing"]);
  assert.deepEqual(selected(selectLanes("push", ["landing/src/pages/index.astro", "docs/TESTING.md"])), ["landing"]);
  assert.deepEqual(selectLanes("push", ["apps/web/src/app/settings/AppSettings.tsx"]), allOn);
  assert.deepEqual(selectLanes("push", ["docs/DESKTOP_BETA_RELEASE_0.1.0.md"]), allOn);
  assert.deepEqual(selectLanes("push", ["unknown-root-file.txt"]), allOn);
});

test("unknown pull request diff selects every lane instead of skipping proof", () => {
  assert.deepEqual(selectLanes("pull_request", null), allOn);
  assert.deepEqual(selectLanes("pull_request", []), allOn);
});

test("docs-only pull requests select no lanes", () => {
  const plan = selectLanes("pull_request", ["docs/TESTING.md", ".agents/engineering.md"]);
  assert.deepEqual(selected(plan), []);
});

test("community health files are docs-only, but README runs landing contracts", () => {
  const community = ["CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md", "SUPPORT.md", ".github/PULL_REQUEST_TEMPLATE.md", ".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/config.yml"];
  for (const event of ["pull_request", "push"]) {
    assert.deepEqual(selected(selectLanes(event, community)), []);
    assert.deepEqual(selected(selectLanes(event, [...community, "README.md"])), ["landing"]);
    assert.deepEqual(selectLanes(event, [...community, ".github/workflows/ci.yml"]), allOn);
    assert.deepEqual(selectLanes(event, [...community, ".github/unknown.yml"]), allOn);
  }
  assert.deepEqual(selected(selectLanes("pull_request", [...community, "apps/web/src/features/workspace-authoring/canvas/CanvasEditor.tsx"])), ["web", "browser"]);
});

test("landing-only pull requests run only the landing lane", () => {
  const plan = selectLanes("pull_request", ["landing/src/pages/index.astro", "wrangler.jsonc"]);
  assert.deepEqual(selected(plan), ["landing"]);
});

test("web-only pull requests run web and affected browser proof, skipping server, compose, and desktop", () => {
  const canvas = selectLanes("pull_request", ["apps/web/src/modules/canvas/core/CanvasEditor.tsx"]);
  assert.deepEqual(selected(canvas), ["web", "browser"]);
  // Settings changes also check landing hero label contracts.
  const settings = selectLanes("pull_request", ["apps/web/src/app/settings/AppSettings.tsx"]);
  assert.deepEqual(selected(settings), ["web", "browser", "landing"]);
  // Colocated web unit test-only files run only the web lane.
  const unitOnly = selectLanes("pull_request", [
    "apps/web/src/shared/ui/theme/theme-model.test.ts",
    "apps/web/src/shared/styles/design-tokens.test.ts",
    "apps/web/src/modules/canvas/objects/code-block/preview/html-preview-frame.test.ts",
  ]);
  assert.deepEqual(selected(unitOnly), ["web"]);
  // Native-impacting web UI (HTML preview, code context menu, workspace session flush) selects desktop too.
  for (const nativeWeb of [
    "apps/web/src/modules/canvas/objects/code-block/CodeBlockContextMenu.tsx",
    "apps/web/src/modules/canvas/objects/code-block/preview/HtmlPreviewFrame.tsx",
    "apps/web/src/modules/workspace/session/useWorkspaceSession.ts",
  ]) {
    assert.deepEqual(selected(selectLanes("pull_request", [nativeWeb])), ["web", "browser", "desktop"], nativeWeb);
  }
});

test("server-only pull requests run server lanes without web; Go test-only files run only server", () => {
  const api = selectLanes("pull_request", ["apps/server/internal/httpapi/router.go"]);
  assert.deepEqual(selected(api), ["server", "browser", "compose"]);
  const storeFile = selectLanes("pull_request", ["apps/server/internal/infra/store/store.go"]);
  assert.deepEqual(selected(storeFile), ["server", "browser", "desktop", "compose"]);
  const domainFile = selectLanes("pull_request", ["apps/server/internal/domain/workspace.go"]);
  assert.deepEqual(selected(domainFile), ["server", "browser", "desktop", "compose"]);
  const sqliteFile = selectLanes("pull_request", ["apps/server/internal/infra/sqlite/open.go"]);
  assert.deepEqual(selected(sqliteFile), ["server", "browser", "desktop", "compose"]);
  const goTestOnly = selectLanes("pull_request", ["apps/server/internal/domain/document_test.go", "apps/server/tests/httpapi/workspace_test.go"]);
  assert.deepEqual(selected(goTestOnly), ["server"]);
});

test("desktop, release, compose, and workflow changes select only their owning lanes with fail-closed fallback", () => {
  assert.deepEqual(selected(selectLanes("pull_request", ["apps/desktop/src-tauri/src/lib.rs"])), ["desktop", "release-policy"]);
  assert.deepEqual(selected(selectLanes("pull_request", ["scripts/verify/desktop-webdriver-smoke.mjs"])), ["desktop", "release-policy"]);
  // Pure SemVer/admission/test-only scripts run release-policy without triggering the Windows job.
  for (const policyOnly of [
    "scripts/release/resolve-desktop-release-version.mjs",
    "scripts/release/assert-desktop-release-ci.mjs",
    "scripts/release/release-request.mjs",
    "scripts/release/desktop-release-automation.test.mjs",
    "scripts/verify/native-smoke-report.test.mjs",
  ]) {
    assert.deepEqual(selected(selectLanes("pull_request", [policyOnly])), ["release-policy"], policyOnly);
  }
  // Packaging, MSI upgrade, and unknown release scripts conservatively select desktop + release-policy.
  for (const nativeRelease of [
    "scripts/release/sync-desktop-version.mjs",
    "scripts/release/verify-desktop-msi-upgrade.ps1",
    "scripts/release/unknown-new-script.mjs",
  ]) {
    assert.deepEqual(selected(selectLanes("pull_request", [nativeRelease])), ["desktop", "release-policy"], nativeRelease);
  }
  assert.deepEqual(selected(selectLanes("pull_request", ["Dockerfile", "compose.ci.yaml"])), ["compose"]);
  assert.deepEqual(selected(selectLanes("pull_request", [".github/workflows/release-desktop.yml"])), ["desktop", "release-policy"]);
  assert.deepEqual(selectLanes("pull_request", [".github/workflows/ci.yml"]), allOn);
  assert.deepEqual(selectLanes("pull_request", ["package.json"]), allOn);
  assert.deepEqual(selectLanes("pull_request", ["unclassified-root-file.txt"]), allOn);
});

test("a mixed docs and app change is not treated as docs-only", () => {
  const plan = selectLanes("pull_request", ["docs/TESTING.md", "apps/server/internal/httpapi/router.go"]);
  assert.deepEqual(selected(plan), ["server", "browser", "compose"]);
});

test("browser mode is affected only for pull requests with a readable diff; candidate targets use master mode", () => {
  assert.equal(browserMode("pull_request", ["apps/web/src/a.ts"]), "affected");
  assert.equal(browserMode("pull_request", null), "full");
  assert.equal(browserMode("push", null), "master");
  assert.equal(browserMode("schedule", null), "full");
  assert.equal(browserMode("workflow_dispatch", null), "full");
  assert.equal(browserMode("workflow_dispatch", null, { candidateTarget: "regression" }), "full");
  assert.equal(browserMode("workflow_dispatch", null, { candidateTarget: "desktop" }), "master");
  assert.equal(browserMode("workflow_dispatch", null, { candidateTarget: "image" }), "master");
});

test("gate accepts selected lanes that succeeded and unselected lanes that were skipped", () => {
  const plan = selectLanes("pull_request", ["landing/index.html"]);
  const needs = { classify: { result: "success", outputs: { plan: JSON.stringify(plan) } } };
  for (const lane of LANES) needs[lane] = { result: plan[lane] ? "success" : "skipped" };
  assert.doesNotThrow(() => assertGate(plan, needs));
});

test("gate rejects a failed, canceled, skipped or missing selected lane", () => {
  const plan = { ...allOn };
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const needs = { classify: { result: "success" } };
    for (const lane of LANES) needs[lane] = { result: "success" };
    needs.web = { result };
    assert.throws(() => assertGate(plan, needs), /web: selected lane ended/, String(result));
  }
});

test("gate rejects malformed, incomplete, unknown-key or non-boolean plans and invalid needs", () => {
  const okNeeds = { classify: { result: "success" } };
  for (const lane of LANES) okNeeds[lane] = { result: "success" };

  for (const badPlan of [
    null,
    undefined,
    "all",
    [],
    {},
    Object.fromEntries(LANES.slice(1).map((lane) => [lane, true])),
    { ...allOn, bogus: true },
    { ...allOn, web: "true" },
    { ...allOn, web: "false" },
    { ...allOn, web: 1 },
    { ...allOn, web: null },
  ]) {
    assert.throws(() => assertGate(badPlan, okNeeds), JSON.stringify(badPlan));
  }

  for (const badNeeds of [null, undefined, [], { classify: { result: "cancelled" } }, { classify: { result: "skipped" } }]) {
    assert.throws(() => assertGate(allOn, badNeeds), JSON.stringify(badNeeds));
  }
});

test("gate rejects an unselected lane that ran and failed", () => {
  const plan = selectLanes("pull_request", ["docs/TESTING.md"]);
  const needs = { classify: { result: "success" } };
  for (const lane of LANES) needs[lane] = { result: "skipped" };
  needs.desktop = { result: "failure" };
  assert.throws(() => assertGate(plan, needs), /desktop: unselected lane ended failure/);
});

test("gate fails when the classifier itself did not succeed", () => {
  const needs = { classify: { result: "failure" } };
  assert.throws(() => assertGate(allOn, needs), /classifier did not succeed/);
});

test("CLI gate command exits non-zero when a selected lane failed or plan is malformed", () => {
  const plan = { ...allOn };
  const needs = { classify: { result: "success", outputs: { plan: JSON.stringify(plan) } } };
  for (const lane of LANES) needs[lane] = { result: "success" };
  const ok = spawnSync(process.execPath, [cli, "gate"], { env: { ...process.env, NEEDS: JSON.stringify(needs) }, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  needs.server = { result: "failure" };
  const bad = spawnSync(process.execPath, [cli, "gate"], { env: { ...process.env, NEEDS: JSON.stringify(needs) }, encoding: "utf8" });
  assert.notEqual(bad.status, 0);

  for (const badPlan of ["{}", JSON.stringify({ ...allOn, web: "true" }), JSON.stringify({ ...allOn, unknown: false })]) {
    const malformed = { classify: { result: "success", outputs: { plan: badPlan } } };
    for (const lane of LANES) malformed[lane] = { result: "success" };
    const res = spawnSync(process.execPath, [cli, "gate"], { env: { ...process.env, NEEDS: JSON.stringify(malformed) }, encoding: "utf8" });
    assert.notEqual(res.status, 0, badPlan);
  }
});
