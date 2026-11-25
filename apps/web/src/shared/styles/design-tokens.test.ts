import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

const THEME_BLOCKS = [
  { name: "graphite light", selector: ":root {" },
  { name: "paper light", selector: ':root[data-palette="paper"] {' },
  { name: "stone light", selector: ':root[data-palette="stone"] {' },
  { name: "sage light", selector: ':root[data-palette="sage"] {' },
  { name: "amber light", selector: ':root[data-palette="amber"] {' },
] as const;

function blockFor(selector: string): string {
  const block = globals.split(selector)[1]?.split("}")[0];
  assert.ok(block, "Missing theme block " + selector);
  return block;
}

function color(block: string, token: string): string {
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

test("supporting and semantic text meet WCAG AA across all curated palettes", () => {
  for (const { name, selector } of THEME_BLOCKS) {
    const theme = blockFor(selector);
    for (const surface of ["--bg", "--surface", "--sidebar", "--canvas", "--tint"]) {
      for (const fg of ["--ink", "--muted", "--accent", "--success", "--danger", "--warning"]) {
        const ratio = contrast(color(theme, fg), color(theme, surface));
        assert.ok(ratio >= 4.5, `${name}: ${fg} over ${surface} contrast ${ratio.toFixed(2)}`);
      }
    }
  }
});

test("primary and filled destructive actions have readable foreground across all curated palettes", () => {
  for (const { name, selector } of THEME_BLOCKS) {
    const theme = blockFor(selector);
    const dangerRatio = contrast(color(theme, "--danger-foreground"), color(theme, "--danger"));
    assert.ok(dangerRatio >= 4.5, `${name}: danger button contrast ${dangerRatio.toFixed(2)}`);
    const buttonRatio = contrast(color(theme, "--button-text"), color(theme, "--button"));
    assert.ok(buttonRatio >= 4.5, `${name}: primary button contrast ${buttonRatio.toFixed(2)}`);
  }
});
