import assert from "node:assert/strict";
import test from "node:test";
import { captureTitle, markdownToSnapshot, snapshotToMarkdown } from "./markdown.ts";

test("markdown import preserves core long-note structure", () => {
  const snapshot = markdownToSnapshot(`# Architecture\n\nIntro with **bold** text.\n\n## Storage\n\n- SQLite\n- WAL\n\n> durable by default\n\n\`\`\`\nSELECT 1;\n\`\`\``);
  const root = snapshot.data as { type?: string; content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };

  assert.equal(snapshot.format, "tiptap");
  assert.equal(root.type, "doc");
  assert.deepEqual(root.content?.map((node) => node.type), ["heading", "paragraph", "heading", "bulletList", "blockquote", "codeBlock"]);
  assert.equal(root.content?.[0]?.attrs?.level, 1);
  assert.equal(typeof root.content?.[0]?.attrs?.blockId, "string");
});

test("markdown export produces portable readable text", () => {
  const source = `# Architecture\n\nIntro with **bold** text.\n\n## Storage\n\n- SQLite\n- WAL\n\n> durable by default`;
  const markdown = snapshotToMarkdown(markdownToSnapshot(source));

  assert.match(markdown, /^# Architecture/m);
  assert.match(markdown, /\*\*bold\*\*/);
  assert.match(markdown, /^## Storage/m);
  assert.match(markdown, /^- SQLite/m);
  assert.match(markdown, /^> durable by default/m);
});

test("quick capture derives a compact title from markdown", () => {
  assert.equal(captureTitle("## MVCC in PostgreSQL\nnotes"), "MVCC in PostgreSQL");
  assert.equal(captureTitle("- review WAL internals"), "review WAL internals");
});
