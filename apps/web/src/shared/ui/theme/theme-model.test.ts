import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_THEME_MODE,
  DEFAULT_THEME_PALETTE,
  THEME_INIT_SCRIPT,
  THEME_PALETTE_IDS,
  THEME_PALETTES,
  paletteCanvasColor,
  parseThemeMode,
  parseThemePalette,
  resolveTheme,
  themeModeLabel,
} from "./theme-model.ts";

test("parseThemeMode always resolves to light mode", () => {
  assert.equal(parseThemeMode("light"), "light");
  assert.equal(parseThemeMode("dark"), "light");
  assert.equal(parseThemeMode("system"), "light");
  assert.equal(parseThemeMode(null), DEFAULT_THEME_MODE);
  assert.equal(parseThemeMode(undefined), DEFAULT_THEME_MODE);
  assert.equal(parseThemeMode("invalid"), DEFAULT_THEME_MODE);
});

test("parseThemePalette accepts every curated palette and falls back to graphite", () => {
  for (const id of THEME_PALETTE_IDS) {
    assert.equal(parseThemePalette(id), id);
  }
  assert.equal(DEFAULT_THEME_PALETTE, "graphite");
  assert.equal(parseThemePalette(null), DEFAULT_THEME_PALETTE);
  assert.equal(parseThemePalette("unknown"), DEFAULT_THEME_PALETTE);
});

test("resolveTheme always resolves to light", () => {
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("light", true), "light");
});

test("palette catalog covers every palette id with valid light canvas colors", () => {
  assert.deepEqual(
    THEME_PALETTES.map((entry) => entry.id),
    [...THEME_PALETTE_IDS],
  );
  for (const id of THEME_PALETTE_IDS) {
    const light = paletteCanvasColor(id, false);
    assert.match(light, /^#[0-9a-f]{6}$/i);
  }
});

test("themeModeLabel returns Light", () => {
  assert.equal(themeModeLabel("light", "light"), "Light");
});

test("bootstrap script initializes data-theme to light and data-palette cleanly", () => {
  assert.match(THEME_INIT_SCRIPT, /dataset\.theme="light"/);
  assert.match(THEME_INIT_SCRIPT, /dataset\.palette/);
  assert.doesNotMatch(THEME_INIT_SCRIPT, /prefers-color-scheme: dark/);
});
