import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { LANES, assertGate, browserMode, selectLanes } from "./ci-plan.mjs";

const cli = fileURLToPath(new URL("./ci-plan.mjs", import.meta.url));
const allOn = Object.fromEntries(LANES.map((lane) => [lane, true]));
const selected = (plan) => LANES.filter((lane) => plan[lane]);

test("master, schedule and manual runs always select every lane", () => {
  for (const event of ["push", "schedule", "workflow_dispatch"]) {
    assert.deepEqual(selectLanes(event, ["docs/TESTING.md"]), allOn, event);
  }
});

test("unknown pull request diff selects every lane instead of skipping proof", () => {
  assert.deepEqual(selectLanes("pull_request", null), allOn);
  assert.deepEqual(selectLanes("pull_request", []), allOn);
});

test("docs-only pull requests select no lanes", () => {
  const plan = selectLanes("pull_request", ["docs/TESTING.md", "README.md", ".agents/engineering.md"]);
  assert.deepEqual(selected(plan), []);
});

test("landing-only pull requests run only the landing lane", () => {
  const plan = selectLanes("pull_request", ["landing/src/pages/index.astro", "wrangler.jsonc"]);
  assert.deepEqual(selected(plan), ["landing"]);
});

test("an app change runs core lanes and browser affected proof, not native or landing", () => {
  const plan = selectLanes("pull_request", ["apps/web/src/features/settings/AppSettings.tsx"]);
  assert.equal(plan.web && plan.server && plan.browser && plan.compose, true);
  assert.equal(plan.desktop, false);
  assert.equal(plan.landing, false);
  assert.equal(plan["release-policy"], false);
});

test("native, release and workflow changes select the desktop and release-policy lanes", () => {
  assert.equal(selectLanes("pull_request", ["apps/desktop/src-tauri/src/lib.rs"]).desktop, true);
  assert.equal(selectLanes("pull_request", ["scripts/release/resolve-desktop-release-version.mjs"]).desktop, true);
  assert.equal(selectLanes("pull_request", [".github/workflows/ci.yml"])["release-policy"], true);
});

test("a mixed docs and app change is not treated as docs-only", () => {
  const plan = selectLanes("pull_request", ["docs/TESTING.md", "apps/server/internal/httpapi/handler.go"]);
  assert.equal(plan.server, true);
});

test("browser mode is affected only for pull requests with a readable diff", () => {
  assert.equal(browserMode("pull_request", ["apps/web/src/a.ts"]), "affected");
  assert.equal(browserMode("pull_request", null), "full");
  assert.equal(browserMode("push", null), "master");
  assert.equal(browserMode("schedule", null), "full");
});

test("gate accepts selected lanes that succeeded and unselected lanes that were skipped", () => {
  const plan = selectLanes("pull_request", ["landing/index.html"]);
  const needs = { classify: { result: "success", outputs: { plan: JSON.stringify(plan) } } };
  for (const lane of LANES) needs[lane] = { result: plan[lane] ? "success" : "skipped" };
  assert.doesNotThrow(() => assertGate(plan, needs));
});

test("gate rejects a failed, canceled or missing selected lane", () => {
  const plan = { ...allOn };
  for (const result of ["failure", "cancelled", undefined]) {
    const needs = { classify: { result: "success" } };
    for (const lane of LANES) needs[lane] = { result: "success" };
    needs.web = { result };
    assert.throws(() => assertGate(plan, needs), /web: selected lane ended/, String(result));
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

test("CLI gate command exits non-zero when a selected lane failed", () => {
  const plan = { ...allOn };
  const needs = { classify: { result: "success", outputs: { plan: JSON.stringify(plan) } } };
  for (const lane of LANES) needs[lane] = { result: "success" };
  const ok = spawnSync(process.execPath, [cli, "gate"], { env: { ...process.env, NEEDS: JSON.stringify(needs) }, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  needs.server = { result: "failure" };
  const bad = spawnSync(process.execPath, [cli, "gate"], { env: { ...process.env, NEEDS: JSON.stringify(needs) }, encoding: "utf8" });
  assert.notEqual(bad.status, 0);
});
