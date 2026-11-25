import assert from "node:assert/strict";
import test from "node:test";
import { workspaceRenameTitle } from "./naming.ts";

test("workspace rename policy trims a title before mutation", () => {
  assert.equal(workspaceRenameTitle("  New title  ", "Old title"), "New title");
});

test("workspace rename policy rejects empty and unchanged titles", () => {
  assert.equal(workspaceRenameTitle("   ", "Old title"), null);
  assert.equal(workspaceRenameTitle(" Old title ", "Old title"), null);
});
