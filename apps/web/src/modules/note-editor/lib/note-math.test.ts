import assert from "node:assert/strict";
import test from "node:test";
import { renderNoteLatex, upgradeLatexDelimitersInDocument } from "./note-math.ts";

test("valid LaTeX renders HTML while invalid or unsafe LaTeX returns a recoverable error", () => {
  const valid = renderNoteLatex("x^2 + y^2 = z^2", false);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.match(valid.html, /katex/);

  const validBlock = renderNoteLatex("\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}", true);
  assert.equal(validBlock.ok, true);
  if (validBlock.ok) assert.match(validBlock.html, /katex-display/);

  const empty = renderNoteLatex("   ", false);
  assert.equal(empty.ok, false);

  const invalid = renderNoteLatex("\\frac{1}{", false);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.error.length > 0);

  const untrusted = renderNoteLatex("\\href{javascript:alert(1)}{click}", false);
  assert.equal(untrusted.ok, false, "untrusted commands are rejected when trust is false");
});

test("upgradeLatexDelimitersInDocument converts \\[...\\], $$...$$, and \\(...\\) to native math nodes", () => {
  const doc = {
    type: "doc" as const,
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "\\[ \\text{Software} =" },
          { type: "hardBreak" },
          { type: "text", text: "\\underbrace{\\text{Intent}}_{\\text{Product}} +" },
          { type: "hardBreak" },
          { type: "text", text: "\\underbrace{\\text{Interface}}_{\\text{Frontend}} +" },
          { type: "hardBreak" },
          { type: "text", text: "\\underbrace{\\text{Implementation}}_{\\text{Backend}} \\]" },
        ],
      },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Inline formula \\(E = mc^2\\) works too." },
        ],
      },
      {
        type: "codeBlock",
        content: [{ type: "text", text: "\\[ x^2 \\]" }],
      },
    ],
  };

  const upgraded = upgradeLatexDelimitersInDocument(doc);
  assert.equal(upgraded.content[0]?.type, "blockMath");
  assert.match(String(upgraded.content[0]?.attrs?.latex ?? ""), /\\underbrace\{\\text\{Intent\}\}/);
  assert.equal(upgraded.content[1]?.type, "paragraph");
  assert.equal(upgraded.content[1]?.content?.[1]?.type, "inlineMath");
  assert.equal(upgraded.content[1]?.content?.[1]?.attrs?.latex, "E = mc^2");
  assert.equal(upgraded.content[2]?.type, "codeBlock");
});
