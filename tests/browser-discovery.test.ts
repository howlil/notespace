import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { browserProofInventory, selectBrowserRun, selectBrowserSuites } from "../scripts/verify/browser-discovery.mjs";
import { browserProofPolicy } from "../scripts/verify/browser-proof-policy.mjs";

test("browser discovery includes every nested capability suite exactly once", () => {
  const root = process.cwd();
  const directory = join(root, "tests", "e2e");
  const expected = readdirSync(directory, { recursive: true }).filter((name) => String(name).endsWith(".e2e.mjs"));
  const actual = selectBrowserSuites(root);
  assert.ok(expected.length > 0);
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual).size, actual.length);
  assert.deepEqual(actual.map((path) => relative(directory, path)).sort(), expected.sort());
  for (const owner of ["canvas", "library", "settings", "compatibility"]) {
    assert.ok(actual.some((path) => relative(directory, path).startsWith(owner)), `${owner} suites must be discovered`);
  }
});

test("critical and explicit-file browser selection survive capability grouping", () => {
  const root = process.cwd();
  const all = selectBrowserSuites(root);
  const critical = selectBrowserSuites(root, { critical: true });
  assert.ok(critical.length > 0 && critical.length < all.length);
  assert.ok(critical.every((path) => all.includes(path)));
  assert.deepEqual(selectBrowserSuites(root, { file: "tests/e2e/canvas/canvas-toolbar.e2e.mjs" }), [join(root, "tests", "e2e", "canvas", "canvas-toolbar.e2e.mjs")]);
});

test("operational scripts stay grouped and every configured script entry exists", () => {
  const root = process.cwd();
  assert.deepEqual(readdirSync(join(root, "scripts")).sort(), ["assets", "dev", "release", "verify"]);
  const configurations = ["package.json", "Taskfile.yml", "apps/desktop/src-tauri/tauri.conf.json"];
  configurations.push(...readdirSync(join(root, ".github", "workflows")).filter((name) => /\.ya?ml$/.test(name)).map((name) => `.github/workflows/${name}`));
  let references = 0;
  for (const file of configurations) {
    for (const match of readFileSync(join(root, file), "utf8").matchAll(/\bscripts\/[\w./-]+\.(?:mjs|ps1|py)\b/g)) {
      references++;
      assert.ok(existsSync(join(root, match[0])), `${file} references missing ${match[0]}`);
    }
  }
  assert.ok(references > 0);
});

function withSuites(suites: Record<string, string>, run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), "notespace-browser-policy-"));
  try {
    for (const [path, contents] of Object.entries(suites)) {
      const file = join(root, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, contents);
    }
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const root = process.cwd();

test("risk inventory maps every current browser case to a property without dropping full discovery", () => {
  const full = selectBrowserRun(root);
  const inventory = browserProofInventory(root);
  assert.deepEqual(full.proofs, inventory);
  assert.equal(full.pattern, null);
  assert.deepEqual(Object.keys(browserProofPolicy).sort(), full.files.map((file) => relative(join(root, "tests/e2e"), file).replaceAll("\\", "/")).sort());
  for (const proof of inventory) {
    assert.ok(proof.name && proof.property.length > 15, JSON.stringify(proof));
    assert.ok(["P0", "P1", "P2", "P3"].includes(proof.risk), JSON.stringify(proof));
  }
});

test("smoke includes every P0 protection plus real creation/navigation/search, not cosmetic-only cases", () => {
  const full = browserProofInventory(root);
  const smoke = selectBrowserRun(root, { mode: "smoke" });
  const names = new Set(smoke.proofs.map(({ name }) => name));
  assert.ok(smoke.proofs.length > 0 && smoke.proofs.length < full.length);
  for (const proof of full.filter(({ risk }) => risk === "P0")) assert.ok(names.has(proof.name), proof.name);
  for (const boundary of [/Welcome creates/, /direct navigation/, /global search/, /CSP blocks/, /conflict recovery/, /ZIP backup/]) {
    assert.ok(smoke.proofs.some(({ name }) => boundary.test(name)), String(boundary));
  }
  assert.ok(smoke.proofs.every(({ risk }) => risk !== "P2" && risk !== "P3"));
  const matcher = new RegExp(smoke.pattern);
  for (const proof of full) assert.equal(matcher.test(proof.name), names.has(proof.name), proof.name);
});

test("affected proof unions changed owners and retains the minimum durability/security smoke", () => {
  const changedFiles = ["apps/web/src/features/library/explorer/LibrarySidebar.tsx", "apps/web/src/features/workspace-authoring/canvas/code/CanvasCodeBlockActions.tsx"];
  const plan = selectBrowserRun(root, { mode: "affected", changedFiles });
  const names = new Set(plan.proofs.map(({ name }) => name));
  for (const proof of browserProofInventory(root)) {
    const path = relative(root, proof.file).replaceAll("\\", "/");
    if (proof.smoke || /tests\/e2e\/(library|canvas|settings)\//.test(path)) assert.ok(names.has(proof.name), proof.name);
    if (path.includes("/compatibility/")) assert.equal(names.has(proof.name), false, proof.name);
  }
  const canvasOnly = selectBrowserRun(root, { mode: "affected", changedFiles: [changedFiles[1]] });
  assert.ok(canvasOnly.proofs.length < plan.proofs.length);
  assert.ok(!canvasOnly.proofs.some(({ name }) => name.startsWith("design contract:")));
});

test("unknown/shared/deleted suite paths conservatively retain the full run", () => {
  for (const path of ["new-owner/file.ts", "apps/web/src/pages/shell/LibraryPageShell.tsx", "bun.lock", "tests/e2e/library/old-name.e2e.mjs"]) {
    const plan = selectBrowserRun(root, { mode: "affected", changedFiles: [path] });
    assert.equal(plan.pattern, null, path);
    assert.deepEqual(plan.files, selectBrowserSuites(root), path);
    assert.match(plan.reason, /conservative full/);
  }
});

test("new or unsupported browser registrations cannot become an empty green smoke selection", () => {
  for (const [file, source] of [
    ["new/feature.e2e.mjs", 'test("new capability", () => {});'],
    ["canvas/workspace-persistence.e2e.mjs", 'test(`dynamic title`, () => {});'],
    ["canvas/workspace-persistence.e2e.mjs", "test('single quoted title', () => {});"],
  ]) {
    withSuites({ [`tests/e2e/${file}`]: source }, (directory) => {
      const plan = selectBrowserRun(directory, { mode: "smoke" });
      assert.equal(plan.pattern, null);
      assert.equal(plan.files.length, 1);
      assert.match(plan.reason, /conservative full/);
    });
  }
});

test("case matching escapes punctuation and anchors the entire Node test name", () => {
  const name = "save (v1) + [draft].?";
  withSuites({ "tests/e2e/canvas/workspace-persistence.e2e.mjs": `test(${JSON.stringify(name)}, () => {});` }, (directory) => {
    const matcher = new RegExp(selectBrowserRun(directory, { mode: "smoke" }).pattern);
    assert.equal(matcher.test(name), true);
    assert.equal(matcher.test(`${name} extra`), false);
    assert.equal(matcher.test("save v1 + draft"), false);
  });
});

test("invalid paths, modes, empty suites and invalid changed-file input fail closed", () => {
  for (const changedFiles of [null, [], "file.ts", [null], [""], ["../outside.ts"], ["/absolute.ts"], ["C:\\outside.ts"]]) {
    assert.throws(() => selectBrowserRun(root, { mode: "affected", changedFiles }));
  }
  assert.throws(() => selectBrowserRun(root, { mode: "typo" }), /Unknown/);
  assert.throws(() => selectBrowserRun(root, { changedFiles: ["README.md"] }), /only to affected/);
  assert.throws(() => selectBrowserRun(root, { file: "package.json" }), /--file/);
  assert.throws(() => selectBrowserRun(root, { file: "tests/e2e/missing.e2e.mjs" }));
  assert.throws(() => selectBrowserRun(root, { file: "tests/e2e/library/search.e2e.mjs", mode: "smoke" }), /cannot be combined/);
  withSuites({ "tests/e2e/library/design-contract.e2e.mjs": 'test("layout", () => {});' }, (directory) => {
    assert.throws(() => selectBrowserRun(directory, { mode: "smoke" }), /No browser cases match/);
  });
  withSuites({ "tests/e2e/library/search.e2e.mjs": "// no cases" }, (directory) => {
    assert.throws(() => selectBrowserRun(directory), /No browser cases/);
  });
  withSuites({ "tests/e2e/library/search.e2e.mjs": 'test("search", () => {});', "outside.e2e.mjs": 'test("outside", () => {});' }, (directory) => {
    assert.throws(() => selectBrowserRun(directory, { file: "outside.e2e.mjs" }), /inside tests\/e2e/);
  });
});

test("runner validates CLI ingress and can list full/smoke/legacy/explicit plans without launching fixtures", () => {
  const runner = join(root, "scripts/verify/browser-e2e.mjs");
  const invoke = (args: string[]) => spawnSync(process.execPath, [runner, ...args, "--list"], { cwd: root, encoding: "utf8", timeout: 15_000 });
  for (const args of [[], ["--mode=smoke"], ["--critical"], ["--file", "tests/e2e/library/search.e2e.mjs"]]) {
    const result = invoke(args);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout).files.length > 0);
  }
  withSuites({ "changes.json": JSON.stringify(["apps/web/src/features/settings/AppSettings.tsx"]) }, (directory) => {
    const result = invoke(["--mode=affected", "--changed-files", join(directory, "changes.json")]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).reason, "affected + risk smoke");
  });
  withSuites({ "changes.json": "{broken" }, (directory) => {
    assert.notEqual(invoke(["--mode=affected", "--changed-files", join(directory, "changes.json")]).status, 0);
  });
  for (const args of [["--mode"], ["--typo"], ["--file="], ["--changed-files="], ["--concurrency=0"], ["--test-timeout=oops"], ["--critical=false"], ["--critical", "--mode=full"], ["--mode=smoke", "--mode=full"], ["--mode=affected"]]) {
    const result = invoke(args);
    assert.notEqual(result.status, 0, JSON.stringify(args));
  }
});
