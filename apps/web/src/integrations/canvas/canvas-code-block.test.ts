import assert from "node:assert/strict";
import test from "node:test";
import {
  CODE_BLOCK_DATA_KEY,
  codeThemeSurface,
  codeTokenColor,
  defaultCanvasCodeBlock,
  detectCodeLanguage,
  highlightCode,
  highlightCodeLines,
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

test("legacy code blocks without heightMode normalize to auto height", () => {
  const block = defaultCanvasCodeBlock();
  const legacy = { ...block } as Record<string, unknown>;
  delete legacy.heightMode;
  const customData = { [CODE_BLOCK_DATA_KEY]: legacy };
  assert.equal(readCanvasCodeBlock({ customData })?.heightMode, "auto");
  assert.equal(defaultCanvasCodeBlock().heightMode, "auto");
  assert.equal(defaultCanvasCodeBlock().code.split("\n").length, 1);
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

test("highlighted logical lines stay separate so wrapped rows keep line-number alignment", () => {
  const lines = highlightCodeLines("const first = 1;\nconst second = 2;", "javascript");
  assert.equal(lines.length, 2);
  assert.equal(lines[0].map((token) => token.text).join(""), "const first = 1;");
  assert.equal(lines[1].map((token) => token.text).join(""), "const second = 2;");
});

test("JetBrains light and dark palettes remain distinct and auto follows app theme", () => {
  assert.equal(resolveCodeTheme("auto", true), "dark");
  assert.equal(resolveCodeTheme("auto", false), "light");
  assert.notEqual(codeThemeSurface("dark").background, codeThemeSurface("light").background);
  assert.notEqual(codeTokenColor(["hljs-keyword"], "dark"), codeTokenColor(["hljs-keyword"], "light"));
});
