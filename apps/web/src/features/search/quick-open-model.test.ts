import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationFromSearchResult,
  searchResultHref,
} from "./quick-open-model.ts";
import type { SearchResult } from "../../adapters/http/workspace-api.ts";

const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  type: "note",
  categoryId: "category-1",
  categoryTitle: "Backend",
  workspaceId: "workspace/a",
  workspaceTitle: "Distributed Systems",
  noteId: "note with spaces",
  noteTitle: "Replication",
  blockId: "",
  excerpt: "Raft",
  ...overrides,
});

test("Quick Open maps category and workspace results to canonical routes", () => {
  assert.equal(
    searchResultHref(result({ type: "category", categoryId: "category/a" })),
    "/?category=category%2Fa",
  );
  assert.equal(
    searchResultHref(result({ type: "workspace", workspaceId: "workspace/a" })),
    "/workspaces/workspace%2Fa",
  );
});

test("Quick Open encodes note and block destinations", () => {
  assert.equal(
    searchResultHref(result()),
    "/workspaces/workspace%2Fa?note=note%20with%20spaces",
  );
  assert.equal(
    searchResultHref(result({ type: "block", blockId: "block/a" })),
    "/workspaces/workspace%2Fa?note=note%20with%20spaces&block=block%2Fa",
  );
});

test("Quick Open destination preserves display context", () => {
  const destination = destinationFromSearchResult(result({ type: "block", blockId: "block-1" }));
  assert.equal(destination.kind, "block");
  assert.equal(destination.title, "Replication");
  assert.equal(destination.context, "Distributed Systems · Raft");
});
