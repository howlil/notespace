import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationFromSearchResult,
  searchResultHref,
} from "./quick-open-model.ts";
import type { SearchResult } from "../../adapters/http/workspace-api.ts";

const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  type: "workspace",
  categoryId: "category-1",
  categoryTitle: "Backend",
  workspaceId: "workspace/a",
  workspaceTitle: "Distributed Systems",
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

test("Quick Open routes search results to the owning workspace", () => {
  assert.equal(
    searchResultHref(result()),
    "/workspaces/workspace%2Fa",
  );
});

test("Quick Open destination preserves display context", () => {
  const destination = destinationFromSearchResult(result());
  assert.equal(destination.kind, "workspace");
  assert.equal(destination.title, "Distributed Systems");
  assert.equal(destination.context, "Backend");
  assert.equal(destination.workspaceId, "workspace/a");
});

test("Quick Open category destinations carry the category route identity", () => {
  const destination = destinationFromSearchResult(result({
    type: "category",
    categoryId: "category/a",
  }));
  assert.equal(destination.kind, "category");
  assert.equal(destination.categoryId, "category/a");
  assert.equal(destination.workspaceId, "workspace/a");
});
