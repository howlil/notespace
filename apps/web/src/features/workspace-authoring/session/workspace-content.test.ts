import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceContent } from "../../../domain/workspace/workspace";
import { normalizeWorkspaceContent } from "./workspace-content.ts";

function content(): WorkspaceContent {
  return {
    title: "Workspace",
    canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
  };
}

test("Canvas-only normalization preserves the Canvas snapshot without mutation", () => {
  const source = content();
  const normalized = normalizeWorkspaceContent(source);
  assert.equal(normalized.changed, false);
  assert.equal(normalized.content.title, source.title);
  assert.equal(normalized.content.canvas, source.canvas);
});
