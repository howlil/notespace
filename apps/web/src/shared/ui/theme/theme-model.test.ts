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

test("parseThemeMode preserves legacy light/dark values and defaults unknown input to system", () => {
  assert.equal(parseThemeMode("light"), "light");
  assert.equal(parseThemeMode("dark"), "dark");
  assert.equal(parseThemeMode("system"), "system");
  assert.equal(parseThemeMode(null), DEFAULT_THEME_MODE);
  assert.equal(parseThemeMode(undefined), DEFAULT_THEME_MODE);
  assert.equal(parseThemeMode("invalid"), DEFAULT_THEME_MODE);
});

test("parseThemePalette accepts every curated palette and falls back to paper", () => {
  for (const id of THEME_PALETTE_IDS) {
    assert.equal(parseThemePalette(id), id);
  }
  assert.equal(parseThemePalette(null), DEFAULT_THEME_PALETTE);
  assert.equal(parseThemePalette("unknown"), DEFAULT_THEME_PALETTE);
});

test("resolveTheme follows OS preference only when mode is system", () => {
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("palette catalog covers every palette id with distinct light and dark canvas colors", () => {
  assert.deepEqual(
    THEME_PALETTES.map((entry) => entry.id),
    [...THEME_PALETTE_IDS],
  );
  for (const id of THEME_PALETTE_IDS) {
    const light = paletteCanvasColor(id, false);
    const dark = paletteCanvasColor(id, true);
    assert.match(light, /^#[0-9a-f]{6}$/i);
    assert.match(dark, /^#[0-9a-f]{6}$/i);
    assert.notEqual(light, dark);
  }
});

test("themeModeLabel explains active resolved theme in system mode", () => {
  assert.equal(themeModeLabel("system", "dark"), "System (Dark)");
  assert.equal(themeModeLabel("system", "light"), "System (Light)");
  assert.equal(themeModeLabel("light", "light"), "Light");
  assert.equal(themeModeLabel("dark", "dark"), "Dark");
});

test("bootstrap script initializes data-theme and data-palette cleanly", () => {
  assert.match(THEME_INIT_SCRIPT, /dataset\.theme/);
  assert.match(THEME_INIT_SCRIPT, /dataset\.palette/);
  assert.match(THEME_INIT_SCRIPT, /prefers-color-scheme: dark/);
});
