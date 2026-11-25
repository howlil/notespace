import assert from "node:assert/strict";
import test from "node:test";
import { notePreviewDocument } from "./note-markdown.ts";

test("Markdown preview keeps readable labels without turning unsafe destinations or HTML into active content", () => {
  const document = notePreviewDocument({
    type: "markdown",
    text: "# Heading\n\n[Unsafe](javascript:alert(1)) and [Safe](https://example.com)\n\n<script>example</script>",
  });
  assert.deepEqual(document.content, [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
    { type: "paragraph", content: [
      { type: "text", text: "Unsafe" },
      { type: "text", text: " and " },
      { type: "text", text: "Safe", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
    ] },
    { type: "paragraph", content: [{ type: "text", text: "<script>example</script>" }] },
  ]);
});
