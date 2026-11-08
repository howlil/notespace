import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { selectBrowserSuites } from "../scripts/verify/browser-discovery.mjs";

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
