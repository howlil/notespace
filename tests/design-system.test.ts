import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const globals = read("apps/web/src/shared/styles/globals.css");
const light = globals.split(":root {")[1]?.split("}")[0];
const dark = globals.split(':root[data-theme="dark"] {')[1]?.split("}")[0];

function color(block: string | undefined, token: string): string {
  assert.ok(block, "Expected theme root for " + token);
  const line = block.split("\n").map((value) => value.trim()).find((value) => value.startsWith(token + ":"));
  assert.ok(line, "Missing " + token);
  const value = line.slice(token.length + 1).trim().replace(/;$/, "");
  assert.match(value, /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, token + " must be an opaque RGB color");
  return value.length === 4 ? "#" + [...value.slice(1)].map((digit) => digit + digit).join("") : value;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("supporting text meets WCAG AA on theme surfaces", () => {
  for (const theme of [light, dark]) {
    for (const surface of ["--bg", "--surface", "--sidebar", "--canvas", "--tint"]) {
      const ratio = contrast(color(theme, "--muted"), color(theme, surface));
      assert.ok(ratio >= 4.5, surface + " muted contrast: " + ratio.toFixed(2));
    }
  }
});

test("success status text is readable across theme surfaces", () => {
  for (const theme of [light, dark]) {
    for (const surface of ["--bg", "--surface", "--sidebar", "--canvas", "--tint"]) {
      const ratio = contrast(color(theme, "--success"), color(theme, surface));
      assert.ok(ratio >= 4.5, surface + " success contrast: " + ratio.toFixed(2));
    }
  }
});

test("filled destructive actions have readable foreground in both themes", () => {
  for (const theme of [light, dark]) {
    const ratio = contrast(color(theme, "--danger-foreground"), color(theme, "--danger"));
    assert.ok(ratio >= 4.5, "Danger button contrast: " + ratio.toFixed(2));
  }
  assert.match(read("apps/web/src/shared/ui/button.tsx"), /text-\[var\(--danger-foreground\)\]/);
});

test("shared transient surfaces keep tokenized elevation while Workspace chrome stays flat", () => {
  for (const path of [
    "apps/web/src/shared/ui/popup-surface.tsx",
    "apps/web/src/shared/ui/context-menu.tsx",
    "apps/web/src/features/activity/ActivityDock.tsx",
  ]) {
    assert.ok(read(path).includes("[box-shadow:var(--shadow-popup)]"), path);
  }
  for (const path of [
    "apps/web/src/features/workspace-authoring/ui/workspace-ui-classes.ts",
    "apps/web/src/features/workspace-authoring/document/DocumentEditor.tsx",
  ]) {
    const workspaceChrome = read(path);
    assert.ok(workspaceChrome.includes("shadow-none"), path);
    assert.ok(!workspaceChrome.includes("[box-shadow:var(--shadow-popup)]"), path);
  }
});

test("keyboard focus is visible even for borderless edit fields", () => {
  assert.match(globals, /input:focus-visible,[\s\S]*?outline: 2px solid var\(--accent\)/);
  const input = read("apps/web/src/shared/ui/input.tsx");
  assert.ok(input.includes("focus-visible:outline-2"));
  assert.ok(!read("apps/web/src/shared/ui/button.tsx").includes("disabled:cursor-wait"));
});
