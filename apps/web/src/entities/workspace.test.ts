import assert from "node:assert/strict";
import test from "node:test";
import { workspaceContentOf, type Workspace } from "./workspace.ts";

function workspace(): Workspace {
  return {
    id: "workspace-1",
    parentId: null,
    title: "Workspace",
    createdAt: "2026-09-25T00:00:00Z",
    updatedAt: "2026-09-25T01:00:00Z",
    version: 4,
    childCount: 0,
    canvas: { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } },
    canvasVersion: 2,
  };
}

test("workspaceContentOf preserves Canvas content without mutation", () => {
  const source = workspace();
  const before = structuredClone(source);
  const content = workspaceContentOf(source);

  assert.equal(content.title, source.title);
  assert.equal(content.canvas, source.canvas);
  assert.deepEqual(source, before);
});
