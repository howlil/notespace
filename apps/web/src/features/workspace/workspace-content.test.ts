import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { ProjectContent } from "../../domain/project/project.ts";
import { blankDocument, normalizeProjectContent } from "./workspace-content.ts";

function content(document = blankDocument("existing-block")): ProjectContent {
  return {
    title: "Workspace",
    document,
    notes: [{ id: "note-1", title: "Note", document, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
    canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
    references: [],
    splitRatio: 0.5,
  };
}

test("normalization preserves already valid stable block identity", () => {
  const source = content();
  const normalized = normalizeProjectContent(source);
  assert.equal(normalized.changed, false);
  assert.equal(normalized.content.document, source.document);
  assert.equal(normalized.content.notes[0]?.document, source.notes[0]?.document);
});

test("normalization assigns missing block identity and removes legacy relationships", () => {
  const document = { format: "tiptap", version: 1, data: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] } };
  const source = content(document);
  source.references = [{ id: "legacy", blockId: "block", elementId: "element" }];

  const normalized = normalizeProjectContent(source);
  assert.equal(normalized.changed, true);
  assert.deepEqual(normalized.content.references, []);

  const root = normalized.content.document.data as { content?: Array<{ attrs?: { blockId?: unknown } }> };
  assert.equal(typeof root.content?.[0]?.attrs?.blockId, "string");
  const noteRoot = normalized.content.notes[0]?.document.data as { content?: Array<{ attrs?: { blockId?: unknown } }> };
  assert.equal(typeof noteRoot.content?.[0]?.attrs?.blockId, "string");
});

test("workspace note panes remount on note switch and expose non-destructive pane close", () => {
  const workspace = readFileSync(join(process.cwd(), "apps/web/src/features/workspace/Workspace.tsx"), "utf8");
  assert.match(workspace, /DocumentEditor key=\{`\$\{pane\.id\}:\$\{note\.id\}`\}/);
  assert.match(workspace, /function closePane\(paneId: string\)/);
  assert.match(workspace, /removeNode\(layout, paneId\)/);
  assert.match(workspace, /onClick=\{\(\) => closePane\(pane\.id\)\}>Close pane<\/Button>/);
});