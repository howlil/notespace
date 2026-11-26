import assert from "node:assert/strict";
import test from "node:test";
import { extractMarkdownHeadings } from "./note-headings.ts";

test("extractMarkdownHeadings extracts H1-H3 headings and blockIds while ignoring H4+", () => {
  const headings = extractMarkdownHeadings({
    type: "markdown",
    text: "# Transport Layer ^h-top\n\nBody text\n\n## TCP Handshake\n\n### SYN-ACK\n\n#### Deep detail",
  });
  assert.deepEqual(headings, [
    { depth: 1, text: "Transport Layer", blockId: "h-top" },
    { depth: 2, text: "TCP Handshake" },
    { depth: 3, text: "SYN-ACK" },
  ]);
});

test("extractMarkdownHeadings returns empty array for empty documents", () => {
  assert.deepEqual(extractMarkdownHeadings({ type: "markdown", text: "   " }), []);
  assert.deepEqual(extractMarkdownHeadings(null), []);
});
