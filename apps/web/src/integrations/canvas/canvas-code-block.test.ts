import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_BLOCK_DATA_KEY,
  codeThemeSurface,
  codeTokenColor,
  defaultCanvasCodeBlock,
  detectCodeLanguage,
  highlightCode,
  normalizeCodeLanguage,
  readCanvasCodeBlock,
  resolveCodeTheme,
  withCanvasCodeBlock,
} from "./canvas-code-block.ts";

test("code block metadata round-trips through Excalidraw customData", () => {
  const block = defaultCanvasCodeBlock();
  const customData = withCanvasCodeBlock({ existing: "kept" }, block);
  assert.equal((customData as Record<string, unknown>).existing, "kept");
  assert.deepEqual(readCanvasCodeBlock({ customData }), block);
  assert.deepEqual(customData[CODE_BLOCK_DATA_KEY], block);
});

test("language normalization handles common aliases and empty content safely", () => {
  assert.equal(normalizeCodeLanguage("TS"), "typescript");
  assert.equal(normalizeCodeLanguage("py"), "python");
  assert.equal(normalizeCodeLanguage("html"), "xml");
  assert.equal(detectCodeLanguage("   "), "plaintext");
});

test("auto detection identifies an obvious JavaScript snippet", () => {
  const detected = detectCodeLanguage("const answer = 42;\nconsole.log(answer);");
  assert.equal(detected, "javascript");
});

test("highlighting preserves code text and produces syntax classes", () => {
  const code = "const answer = 42;";
  const tokens = highlightCode(code, "javascript");
  assert.equal(tokens.map((token) => token.text).join(""), code);
  assert.equal(tokens.some((token) => token.classes.includes("hljs-keyword")), true);
});

test("JetBrains light and dark palettes remain distinct and auto follows app theme", () => {
  assert.equal(resolveCodeTheme("auto", true), "dark");
  assert.equal(resolveCodeTheme("auto", false), "light");
  assert.notEqual(codeThemeSurface("dark").background, codeThemeSurface("light").background);
  assert.notEqual(codeTokenColor(["hljs-keyword"], "dark"), codeTokenColor(["hljs-keyword"], "light"));
});
