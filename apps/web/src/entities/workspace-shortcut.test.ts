import assert from "node:assert/strict";
import test from "node:test";
import {
  WORKSPACE_SHORTCUT_DATA_KEY,
  readCanvasWorkspaceShortcut,
  withCanvasWorkspaceShortcut,
  withoutCanvasWorkspaceShortcut,
} from "./workspace-shortcut.ts";

test("readCanvasWorkspaceShortcut reads valid shortcut references and ignores deleted or invalid elements", () => {
  const customData = withCanvasWorkspaceShortcut({ source: "canvas" }, { targetWorkspaceId: "ws-child-1" });
  assert.equal(customData.source, "canvas");
  assert.deepEqual(customData[WORKSPACE_SHORTCUT_DATA_KEY], { targetWorkspaceId: "ws-child-1" });
  assert.deepEqual(readCanvasWorkspaceShortcut({ customData }), { targetWorkspaceId: "ws-child-1" });

  assert.equal(readCanvasWorkspaceShortcut({ customData, isDeleted: true }), null);
  assert.equal(readCanvasWorkspaceShortcut(null), null);
  assert.equal(readCanvasWorkspaceShortcut(undefined), null);
  assert.equal(readCanvasWorkspaceShortcut({ customData: null }), null);
  assert.equal(readCanvasWorkspaceShortcut({ customData: [] }), null);
  assert.equal(readCanvasWorkspaceShortcut({ customData: { [WORKSPACE_SHORTCUT_DATA_KEY]: { targetWorkspaceId: "" } } }), null);
  assert.equal(readCanvasWorkspaceShortcut({ customData: { [WORKSPACE_SHORTCUT_DATA_KEY]: { targetWorkspaceId: "   " } } }), null);
  assert.equal(readCanvasWorkspaceShortcut({ customData: { [WORKSPACE_SHORTCUT_DATA_KEY]: { targetWorkspaceId: 123 } } }), null);
});

test("withoutCanvasWorkspaceShortcut removes shortcut metadata without mutating input", () => {
  const original = { source: "canvas", [WORKSPACE_SHORTCUT_DATA_KEY]: { targetWorkspaceId: "ws-1" } };
  const stripped = withoutCanvasWorkspaceShortcut(original);

  assert.deepEqual(stripped, { source: "canvas" });
  assert.deepEqual(readCanvasWorkspaceShortcut({ customData: original }), { targetWorkspaceId: "ws-1" });
  assert.equal(readCanvasWorkspaceShortcut({ customData: stripped }), null);

  const onlyShortcut = withCanvasWorkspaceShortcut(undefined, { targetWorkspaceId: "ws-2" });
  assert.equal(withoutCanvasWorkspaceShortcut(onlyShortcut), undefined);
  assert.equal(withoutCanvasWorkspaceShortcut(undefined), undefined);
  assert.equal(withoutCanvasWorkspaceShortcut([]), undefined);
});
