import assert from "node:assert/strict";
import test from "node:test";
import { captureTitle, looksLikeMarkdown, markdownToSnapshot, snapshotAssetIds, snapshotToMarkdown } from "./markdown.ts";

test("markdown import preserves core long-note structure", () => {
  const snapshot = markdownToSnapshot(`# Architecture\n\nIntro with **bold** text.\n\n## Storage\n\n- SQLite\n- WAL\n\n> durable by default\n\n\`\`\`\nSELECT 1;\n\`\`\``);
  const root = snapshot.data as { type?: string; content?: Array<{ type?: string; attrs?: Record<string, unknown> }> };

  assert.equal(snapshot.format, "tiptap");
  assert.equal(root.type, "doc");
  assert.deepEqual(root.content?.map((node) => node.type), ["heading", "paragraph", "heading", "bulletList", "blockquote", "codeBlock"]);
  assert.equal(root.content?.[0]?.attrs?.level, 1);
  assert.equal(typeof root.content?.[0]?.attrs?.blockId, "string");
});

test("markdown paste detection distinguishes authored markdown from ordinary prose", () => {
  assert.equal(looksLikeMarkdown("ordinary sentence without formatting"), false);
  assert.equal(looksLikeMarkdown("# Heading\n\nBody"), true);
  assert.equal(looksLikeMarkdown("Use **connection pooling** in production."), true);
  assert.equal(looksLikeMarkdown("```go\nfunc main() {}\n```"), true);
  assert.equal(looksLikeMarkdown("> quoted answer"), true);
});

test("markdown import keeps AI-response heading levels and inline emphasis", () => {
  const snapshot = markdownToSnapshot("#### Details\n\n***Important*** and __stable__.\n\n3. third\n4. fourth");
  const root = snapshot.data as { content?: Array<{ type?: string; attrs?: Record<string, unknown>; content?: Array<{ marks?: Array<{ type: string }> }> }> };

  assert.equal(root.content?.[0]?.attrs?.level, 4);
  assert.deepEqual(root.content?.[1]?.content?.[0]?.marks?.map((mark) => mark.type), ["bold", "italic"]);
  assert.equal(root.content?.[2]?.attrs?.start, 3);
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

test("markdown image export replaces Notespace asset URLs with supplied portable sources", () => {
  const snapshot = {
    format: "tiptap",
    version: 1,
    data: {
      type: "doc",
      content: [
        { type: "image", attrs: { assetId: "asset-1", src: "notespace-asset://asset-1", alt: "diagram" } },
        { type: "image", attrs: { assetId: "asset-1", src: "notespace-asset://asset-1", alt: "diagram duplicate" } },
      ],
    },
  };

  assert.deepEqual(snapshotAssetIds(snapshot), ["asset-1"]);
  assert.equal(snapshotToMarkdown(snapshot, { "asset-1": "data:image/png;base64,AA==" }), "![diagram](data:image/png;base64,AA==)\n\n![diagram duplicate](data:image/png;base64,AA==)\n");
  assert.equal(snapshotToMarkdown(snapshot), "[Image: diagram]\n\n[Image: diagram duplicate]\n");
});

test("quick capture derives a compact title from markdown", () => {
  assert.equal(captureTitle("## MVCC in PostgreSQL\nnotes"), "MVCC in PostgreSQL");
  assert.equal(captureTitle("- review WAL internals"), "review WAL internals");
});
