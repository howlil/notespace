import assert from "node:assert/strict";
import test from "node:test";
import { renderNoteLatex } from "./note-math.ts";

test("valid LaTeX renders HTML while invalid or unsafe LaTeX returns a recoverable error", () => {
  const valid = renderNoteLatex("x^2 + y^2 = z^2", false);
  assert.equal(valid.ok, true);
  if (valid.ok) assert.match(valid.html, /katex/);

  const empty = renderNoteLatex("   ", false);
  assert.equal(empty.ok, false);

  const invalid = renderNoteLatex("\\frac{1}{", false);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.ok(invalid.error.length > 0);

  const untrusted = renderNoteLatex("\\href{javascript:alert(1)}{click}", false);
  assert.equal(untrusted.ok, false, "untrusted commands are rejected when trust is false");
});
