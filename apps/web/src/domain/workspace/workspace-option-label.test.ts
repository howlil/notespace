import assert from "node:assert/strict";
import test from "node:test";
import { workspaceOptionLabel } from "./workspace-option-label.ts";
import type { WorkspaceSummary } from "./workspace.ts";

const workspace = (id: string, title: string): WorkspaceSummary => ({
  id, title, categoryId: "c", createdAt: "", updatedAt: "", version: 1,
});

test("Workspace destinations disambiguate same-name choices while retaining identity", () => {
  const items = [workspace("ab12ef90-0000", "Research"), workspace("ab12ef91-0000", "research"), workspace("another", "Writing")];
  assert.equal(workspaceOptionLabel(items[0], items), "Research · ab12ef90");
  assert.equal(workspaceOptionLabel(items[1], items), "research · ab12ef91");
  assert.equal(workspaceOptionLabel(items[2], items), "Writing");
  const samePrefix = [workspace("sameprefix-1", "Plan"), workspace("sameprefix-2", "Plan")];
  assert.notEqual(workspaceOptionLabel(samePrefix[0], samePrefix), workspaceOptionLabel(samePrefix[1], samePrefix));
});
