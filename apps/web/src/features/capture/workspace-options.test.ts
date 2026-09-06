import assert from "node:assert/strict";
import test from "node:test";
import { workspaceOptions } from "./workspace-options.ts";

test("workspace options attach category labels without changing server order", () => {
  const options = workspaceOptions([
    { id: "ws-2", categoryId: "cat-2", title: "Second", createdAt: "", updatedAt: "", version: 1 },
    { id: "ws-1", categoryId: "cat-1", title: "First", createdAt: "", updatedAt: "", version: 1 },
  ], [
    { id: "cat-1", title: "One", createdAt: "", updatedAt: "", workspaceCount: 1 },
    { id: "cat-2", title: "Two", createdAt: "", updatedAt: "", workspaceCount: 1 },
  ]);

  assert.deepEqual(options.map((option) => `${option.categoryTitle}/${option.title}`), ["Two/Second", "One/First"]);
});

test("workspace options remain usable when a category label is unavailable", () => {
  const options = workspaceOptions([
    { id: "ws-1", categoryId: "missing", title: "Standalone", createdAt: "", updatedAt: "", version: 1 },
  ], []);

  assert.deepEqual(options, [{ id: "ws-1", categoryId: "missing", title: "Standalone", categoryTitle: undefined }]);
});
