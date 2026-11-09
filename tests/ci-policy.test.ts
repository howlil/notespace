import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { prepareNativePackageCache } from "../scripts/verify/prepare-native-package-cache.mjs";
import { CI_JOBS, assertCiGate, classifyDiff, parseNameStatus } from "../scripts/verify/ci-policy.mjs";

const sha = "a".repeat(40), baseSha = "b".repeat(40);
const evidence = (paths: string[]) => ({ sha, baseSha, mergeBase: baseSha, complete: true, changes: paths.map((path) => ({ status: "M", paths: [path] })) });
const selected = (paths: string[]) => Object.entries(classifyDiff(evidence(paths)).required).filter(([, required]) => required).map(([job]) => job).sort();
function verdicts(diff = evidence(["unknown/file"])) {
  const plan = classifyDiff(diff);
  return Object.fromEntries([
    ["classify", { result: "success", outputs: { plan: JSON.stringify(plan) } }],
    ...CI_JOBS.map((job) => [job, { result: plan.required[job] ? "success" : "skipped", outputs: { sha } }]),
  ]);
}

test("CI owner matrix selects only required PR lanes and preserves native persistence/security", () => {
  for (const [path, expected] of [
    ["apps/web/src/features/library/collection/WorkspaceLibrary.tsx", ["web", "browser"]],
    ["apps/web/src/styles.css", ["web", "browser"]],
    ["apps/web/src/shared/styles/globals.css", ["web", "browser"]],
    ["apps/web/src/features/workspace-authoring/workspace-authoring.css", ["web", "browser"]],
    ["apps/web/src/features/desktop/chrome/desktop-titlebar.css", ["web", "browser", "desktop"]],
    ["apps/web/src/adapters/desktop/desktop-lifecycle.test.ts", ["web"]],
    ["apps/web/src/features/workspace-authoring/session/granular-save.test.ts", ["web"]],
    ["apps/server/internal/sqlite/migrations_test.go", ["server"]],
    ["apps/server/cmd/notespace/desktop_boundary_test.go", ["server"]],
    ["apps/server/internal/planning/service.go", ["web", "server", "browser"]],
    ["apps/server/internal/sqlite/store.go", ["web", "server", "browser", "desktop"]],
    ["apps/server/migrations/099.sql", ["web", "server", "browser", "desktop"]],
    ["apps/server/cmd/notespace/desktop_boundary.go", ["web", "server", "browser", "desktop"]],
    ["apps/server/internal/httpapi/middleware.go", ["web", "server", "browser", "desktop"]],
    ["apps/web/src/features/workspace-authoring/canvas/code/use-canvas-code-runner.ts", ["web", "browser", "desktop"]],
    ["apps/web/src/features/workspace-authoring/session/WorkspaceAuthoring.tsx", ["web", "browser", "desktop"]],
    ["apps/web/src/features/workspace-authoring/canvas/code/execution/code-runner.ts", ["web", "browser", "desktop"]],
    ["apps/desktop/src-tauri/src/runtime/shutdown.rs", ["desktop", "release-policy"]],
    ["scripts/release/assert-desktop-release-ci.mjs", ["desktop", "release-policy"]],
    ["landing/src/pages/index.astro", ["landing"]],
    ["wrangler.jsonc", ["landing"]],
    ["docs/TESTING.md", []],
    [".agents/engineering.md", []],
  ] as [string, string[]][]) assert.deepEqual(selected([path]), [...expected].sort(), path);
  assert.deepEqual(selected(["apps/web/src/adapters/desktop/desktop-lifecycle.test.ts", "apps/web/src/adapters/desktop/desktop-lifecycle.ts"]), ["web", "browser", "desktop"].sort());
  for (const path of ["bun.lock", "package.json", ".github/workflows/ci.yml", "new-owner/file", "tests/e2e/support/resolve.mjs", "apps/web/dist/client/index.html"]) {
    assert.deepEqual(selected([path]), [...CI_JOBS].sort(), path);
  }
});

test("native package snapshot strips internal/external/broken aliases without touching targets", () => {
  const directory = mkdtempSync(join(tmpdir(), "notespace-native-cache-"));
  try {
    const cache = join(directory, "packages"), source = join(directory, "source");
    mkdirSync(join(cache, "vendor"), { recursive: true });
    symlinkSync(join(cache, "vendor"), join(cache, "alias"), "junction");
    mkdirSync(source);
    writeFileSync(join(source, "profile.txt"), "must remain untouched");
    writeFileSync(join(cache, "vendor", "package.json"), "{}");
    symlinkSync(source, join(cache, "workspace"), "junction");
    symlinkSync(join(directory, "absent"), join(cache, "broken"), "junction");
    prepareNativePackageCache(cache);
    for (const alias of ["alias", "workspace", "broken"]) assert.throws(() => lstatSync(join(cache, alias)), { code: "ENOENT" });
    assert.equal(readFileSync(join(source, "profile.txt"), "utf8"), "must remain untouched");
    assert.equal(readFileSync(join(cache, "vendor", "package.json"), "utf8"), "{}");
    symlinkSync(source, join(directory, "linked-cache"), "junction");
    assert.throws(() => prepareNativePackageCache(join(directory, "linked-cache")), /root cannot be a junction/);
    assert.throws(() => prepareNativePackageCache(undefined), /cache root is required/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("NUL git diff retains both rename/copy owners and deletion paths including whitespace", () => {
  const changes = parseNameStatus("R100\0apps/desktop/native.rs\0docs/retired native.md\0D\0apps/server/migrations/old.sql\0C075\0landing/a.astro\0apps/web/src/copied.ts\0");
  const plan = classifyDiff({ ...evidence([]), changes });
  assert.equal(plan.required.desktop, true);
  assert.equal(plan.required.server, true);
  assert.equal(plan.required.landing, true);
  assert.equal(plan.required.browser, true);
  assert.ok(plan.paths.includes("apps/desktop/native.rs"));
  assert.ok(plan.paths.includes("docs/retired native.md"));
  assert.ok(plan.paths.includes("apps/server/migrations/old.sql"));
  for (const malformed of ["", "M\0file", "R100\0old\0", "R101\0docs/old.md\0docs/new.md\0", "U\0file\0", "M\0../escape\0", "M\0/absolute\0"]) assert.throws(() => parseNameStatus(malformed));
});

test("invalid/incomplete diff cannot silently turn into docs-only selection", () => {
  for (const patch of [
    { complete: false }, { baseSha: null }, { mergeBase: "unknown" }, { changes: [] },
    { changes: null }, { changes: [null] }, { changes: [{ status: "R100", paths: ["docs/x.md"] }] },
    { changes: [{ status: "M", paths: ["C:/outside"] }] },
    { changes: [{ status: "R999", paths: ["docs/old.md", "docs/new.md"] }] },
  ]) {
    const plan = classifyDiff({ ...evidence(["docs/x.md"]), ...patch });
    assert.ok(plan.conservative);
    assert.ok(Object.values(plan.required).every(Boolean));
  }
  assert.throws(() => classifyDiff({ ...evidence(["docs/x.md"]), sha: "short" }), /exact SHA/);
});

test("gate admits full required success and explicit docs-only skips, never wrong or absent proof", () => {
  const diff = evidence(["unknown/file"]);
  assertCiGate(verdicts(diff), diff);
  const docs = evidence(["README.md"]);
  assertCiGate(verdicts(docs), docs);
  for (const job of CI_JOBS) {
    for (const result of ["failure", "cancelled", "skipped", "timed_out", undefined]) {
      const needs = verdicts(diff);
      needs[job].result = result;
      assert.throws(() => assertCiGate(needs, diff), undefined, `${job}: ${result}`);
    }
    const missing = verdicts(diff);
    delete missing[job];
    assert.throws(() => assertCiGate(missing, diff));
    for (const wrongSha of [baseSha, undefined]) {
      const needs = verdicts(diff);
      needs[job].outputs.sha = wrongSha;
      assert.throws(() => assertCiGate(needs, diff), /SHA/);
    }
  }
});

test("gate independently rejects failed/missing classifier, forged map and omitted/stale diff", () => {
  const diff = evidence(["apps/web/src/styles.css"]);
  for (const result of ["failure", "cancelled", "skipped", undefined]) {
    const needs = verdicts(diff);
    needs.classify.result = result;
    assert.throws(() => assertCiGate(needs, diff), /Classifier/);
  }
  for (const payload of ["{bad", "null", "{}", JSON.stringify({ ...classifyDiff(diff), sha: baseSha }), JSON.stringify({ ...classifyDiff(diff), required: {} })]) {
    const needs = verdicts(diff);
    needs.classify.outputs.plan = payload;
    assert.throws(() => assertCiGate(needs, diff));
  }
  const omitted = verdicts(evidence(["README.md"]));
  assert.throws(() => assertCiGate(omitted, evidence(["README.md", "apps/server/migrations/099.sql"])), /diff\/SHA/);
  assert.throws(() => assertCiGate(verdicts(diff), { ...diff, baseSha: sha }), /diff\/SHA/);
});

test("CI CLI collects real complete merge-base changes and propagates failed gate/identity", () => {
  const directory = mkdtempSync(join(tmpdir(), "notespace-ci-proof-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (path: string, value: string) => { mkdirSync(dirname(join(directory, path)), { recursive: true }); writeFileSync(join(directory, path), value); };
  try {
    for (const name of ["ci.mjs", "ci-policy.mjs"]) write(`scripts/verify/${name}`, readFileSync(join(process.cwd(), "scripts/verify", name), "utf8"));
    git("init"); git("config", "user.name", "CI proof"); git("config", "user.email", "ci-proof@example.invalid");
    git("config", "commit.gpgsign", "false"); git("config", "core.hooksPath", ".git/no-hooks");
    write("README.md", "base");
    write("apps/desktop/native.rs", "retained native content");
    write("apps/server/migrations/old.sql", "old migration content");
    git("add", "."); git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");
    // A separate base-side commit after divergence must not disappear into a
    // two-dot comparison. The feature proof is the complete merge-base diff.
    git("checkout", "-b", "feature");
    write("apps/web/src/styles.css", "body {}");
    mkdirSync(join(directory, "docs"));
    git("mv", "apps/desktop/native.rs", "docs/retired-native.md");
    git("rm", "apps/server/migrations/old.sql");
    git("add", "."); git("commit", "-qm", "web plus rename and delete");
    const head = git("rev-parse", "HEAD");
    git("checkout", "-b", "base-side", base);
    write("landing/base.astro", "base-only"); git("add", "."); git("commit", "-qm", "base diverges");
    const divergedBase = git("rev-parse", "HEAD"); git("checkout", "feature");
    const invoke = (command: string, env = {}) => spawnSync(process.execPath, [join(directory, "scripts/verify/ci.mjs"), command], {
      cwd: directory, encoding: "utf8", env: { ...process.env, EXPECTED_SHA: head, BASE_SHA: divergedBase, GITHUB_OUTPUT: join(directory, "outputs"), ...env },
    });
    const result = invoke("classify");
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.deepEqual([...plan.paths].sort(), ["apps/desktop/native.rs", "apps/server/migrations/old.sql", "apps/web/src/styles.css", "docs/retired-native.md"]);
    assert.equal(plan.required.desktop, true);
    assert.equal(plan.required.server, true);
    assert.equal(plan.required.landing, false);
    const needs = Object.fromEntries([["classify", { result: "success", outputs: { plan: JSON.stringify(plan) } }], ...CI_JOBS.map((job) => [job, { result: plan.required[job] ? "success" : "skipped", outputs: { sha: head } }])]);
    assert.equal(invoke("gate", { CI_NEEDS: JSON.stringify(needs) }).status, 0);
    needs.web.result = "skipped";
    assert.notEqual(invoke("gate", { CI_NEEDS: JSON.stringify(needs) }).status, 0);
    assert.notEqual(invoke("identity", { EXPECTED_SHA: base }).status, 0);
    const unavailable = invoke("classify", { BASE_SHA: "f".repeat(40) });
    assert.equal(unavailable.status, 0);
    assert.ok(Object.values(JSON.parse(unavailable.stdout).required).every(Boolean));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("workflow wiring retains always-running gate, unfiltered PR and isolated reusable native owner", () => {
  const ci = readFileSync(".github/workflows/ci.yml", "utf8");
  const desktop = readFileSync(".github/workflows/verify-desktop.yml", "utf8");
  assert.match(ci, /on:\s+pull_request:/);
  assert.doesNotMatch(ci, /pull_request_target|secrets: inherit|contents: write|actions: write/);
  assert.match(ci, /gate:\s+name: ci \/ gate\s+if: always\(\)\s+needs: \[classify, web, server, landing, browser, desktop, release-policy\]/);
  assert.ok(ci.indexOf("run: node --experimental-strip-types --test tests/ci-policy.test.ts") < ci.indexOf("- id: plan"));
  assert.match(ci, /run: node --experimental-strip-types --test tests\/ci-policy.test\.ts/);
  assert.match(ci, /CI_NEEDS: \$\{\{ toJSON\(needs\) \}\}/);
  assert.match(ci, /uses: \.\/\.github\/workflows\/verify-desktop.yml/);
  assert.match(desktop, /workflow_call:\s+outputs:\s+sha:/);
  assert.match(desktop, /group: desktop-\$\{\{ github.workflow \}\}/);
  assert.match(ci, /path: apps\/web\/dist\/client/);
  assert.match(ci, /if-no-files-found: error/);
  // Landing is a standalone Bun project, not a root workspace.
  assert.match(ci, /bun install --cwd landing --frozen-lockfile/);
  assert.match(ci, /bun run --cwd landing build/);
  assert.doesNotMatch(ci, /--filter @notespace\/landing/);
  assert.equal((ci.match(/run: bun run --filter @notespace\/web build/g) ?? []).length, 1);
});
