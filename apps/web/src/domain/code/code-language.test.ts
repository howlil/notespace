import assert from "node:assert/strict";
import { test } from "node:test";
import {
  codeLanguageLabel,
  detectCodeLanguage,
  normalizeCodeLanguage,
} from "./code-language.ts";

test("normalizeCodeLanguage maps supported aliases and blank values", () => {
  const aliases = {
    js: "javascript",
    ts: "typescript",
    py: "python",
    golang: "go",
    sh: "bash",
    html: "xml",
    yml: "yaml",
    md: "markdown",
  } as const;
  for (const [input, expected] of Object.entries(aliases)) {
    assert.equal(normalizeCodeLanguage(input), expected);
  }
  assert.equal(normalizeCodeLanguage("  "), "plaintext");
  assert.equal(normalizeCodeLanguage("CustomLang"), "customlang");
});

test("codeLanguageLabel uses friendly labels and preserves unknown languages", () => {
  assert.equal(codeLanguageLabel("js"), "JavaScript");
  assert.equal(codeLanguageLabel("unknownlang"), "unknownlang");
});

test("detectCodeLanguage returns plaintext for empty input", () => {
  assert.equal(detectCodeLanguage("   "), "plaintext");
});
