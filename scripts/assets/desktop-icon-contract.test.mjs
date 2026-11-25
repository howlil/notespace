import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

test("desktop icon source, Tauri bundle identity, and gitignore stay aligned", () => {
  const svg = read("apps/web/public/brand/notespace-fox-full.svg");
  const config = JSON.parse(read("apps/desktop/src-tauri/tauri.conf.json"));
  assert.match(svg, /#2858D8/i);
  assert.equal(config.identifier, "com.howlil.notespace");
  assert.deepEqual(config.bundle.icon, ["icons/fox-spirit/icon.ico", "icons/fox-spirit/icon.icns", "icons/fox-spirit/icon.png"]);
  assert.ok(
    read(".gitignore").split(/\r?\n/).includes("apps/desktop/src-tauri/icons/fox-spirit/"),
    "Generated native icons must be excluded by .gitignore",
  );
});
