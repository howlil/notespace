import assert from "node:assert/strict";
import test from "node:test";
import { recentWorkspaceOptions, searchWorkspaceOptions } from "./workspace-options.ts";

test("search results collapse note and block hits to one workspace option", () => {
  const options = searchWorkspaceOptions([
    { type: "note", categoryId: "cat-1", categoryTitle: "Systems", workspaceId: "ws-1", workspaceTitle: "Distributed Systems", noteId: "n1", noteTitle: "Raft", blockId: "", excerpt: "Raft" },
    { type: "block", categoryId: "cat-1", categoryTitle: "Systems", workspaceId: "ws-1", workspaceTitle: "Distributed Systems", noteId: "n1", noteTitle: "Raft", blockId: "b1", excerpt: "consensus" },
    { type: "workspace", categoryId: "cat-2", categoryTitle: "Database", workspaceId: "ws-2", workspaceTitle: "Postgres", noteId: "", noteTitle: "", blockId: "", excerpt: "Postgres" },
  ]);

  assert.deepEqual(options, [
    { id: "ws-1", title: "Distributed Systems", categoryId: "cat-1", categoryTitle: "Systems" },
    { id: "ws-2", title: "Postgres", categoryId: "cat-2", categoryTitle: "Database" },
  ]);
});

test("recent options attach category labels without changing workspace order", () => {
  const options = recentWorkspaceOptions([
    { id: "ws-2", categoryId: "cat-2", title: "Second", createdAt: "", updatedAt: "", version: 1 },
    { id: "ws-1", categoryId: "cat-1", title: "First", createdAt: "", updatedAt: "", version: 1 },
  ], [
    { id: "cat-1", title: "One", createdAt: "", updatedAt: "", workspaceCount: 1 },
    { id: "cat-2", title: "Two", createdAt: "", updatedAt: "", workspaceCount: 1 },
  ]);

  assert.deepEqual(options.map((option) => `${option.categoryTitle}/${option.title}`), ["Two/Second", "One/First"]);
});
