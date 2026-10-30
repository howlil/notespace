import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const source = read("scripts/prepare-desktop-icons.mjs");
const pe = read("scripts/assert-desktop-icon.ps1");

test("desktop icon source and bundle identity remain canonical", () => {
  const svg = read("apps/web/public/brand/notespace-fox-full.svg");
  const config = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
  assert.match(svg, /Notespace Fox Spirit/);
  assert.match(svg, /#2858D8/);
  assert.equal(config.identifier, "com.howlil.notespace");
  assert.deepEqual(config.bundle.icon, ["icons/fox-spirit/icon.ico", "icons/fox-spirit/icon.icns", "icons/fox-spirit/icon.png"]);
  assert.match(source, /icons", "fox-spirit"/);
  assert.ok(read(".gitignore").split(/\r?\n/).includes("apps/desktop/src-tauri/icons/fox-spirit/"), "Generated native icons must be excluded by an actual ignore line");
  assert.match(source, /legacyIcoBlob/);
  assert.match(source, /legacyPngBlob/);
  assert.match(source, /assertDesktopIcons/);
  assert.match(pe, /ExtractAssociatedIcon/);
});

test("every native workflow regenerates icons before Tauri builds", () => {
  for (const path of [
    ".github/workflows/verify-desktop.yml",
    ".github/workflows/publish-desktop-beta.yml",
    ".github/workflows/release-desktop.yml",
  ]) {
    const workflow = read(path);
    assert.match(workflow, /pnpm desktop:icons/);
    assert.ok(workflow.indexOf("pnpm desktop:icons") < workflow.indexOf("pnpm dlx @tauri-apps/cli@2.12.3 build"),
      `${path} must regenerate icons before packaging`);
  }
  assert.match(read("Taskfile.yml"), /pnpm desktop:icons/);
  assert.match(read("package.json"), /"desktop:icons"/);
});
