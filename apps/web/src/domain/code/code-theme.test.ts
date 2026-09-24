import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeThemeSurface,
  codeThemeVariables,
  codeTokenColor,
  nextCodeTheme,
  resolveCodeTheme,
} from "./code-theme.ts";

test("code theme state cycles auto to dark to light", () => {
  assert.equal(nextCodeTheme("auto"), "dark");
  assert.equal(nextCodeTheme("dark"), "light");
  assert.equal(nextCodeTheme("light"), "auto");
});

test("resolveCodeTheme follows app theme only in auto mode", () => {
  assert.equal(resolveCodeTheme("auto", true), "dark");
  assert.equal(resolveCodeTheme("auto", false), "light");
  assert.equal(resolveCodeTheme("dark", false), "dark");
  assert.equal(resolveCodeTheme("light", true), "light");
});

test("code theme exposes stable semantic surfaces and token colors", () => {
  assert.equal(codeThemeSurface("light").background, "#ffffff");
  assert.equal(codeTokenColor(["hljs-comment"], "dark"), "#808080");
  assert.equal(codeTokenColor(["hljs-string"], "light"), "#008000");
  const variables = codeThemeVariables("dark");
  assert.equal(variables["--code-bg"], "#2b2b2b");
  assert.equal(variables["--code-keyword"], "#cc7832");
});
