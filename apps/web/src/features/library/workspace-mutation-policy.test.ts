import assert from "node:assert/strict";
import test from "node:test";
import { workspaceMutationError, workspaceRenameTitle } from "./workspace-mutation-policy.ts";

test("workspace rename policy trims a title before mutation", () => {
  assert.equal(workspaceRenameTitle("  New title  ", "Old title"), "New title");
});

test("workspace rename policy rejects empty and unchanged titles", () => {
  assert.equal(workspaceRenameTitle("   ", "Old title"), null);
  assert.equal(workspaceRenameTitle(" Old title ", "Old title"), null);
});

test("workspace mutation policy preserves server errors and supplies a fallback", () => {
  assert.equal(workspaceMutationError(new Error("Conflict"), "Could not rename workspace."), "Conflict");
  assert.equal(workspaceMutationError("unknown", "Could not rename workspace."), "Could not rename workspace.");
});
