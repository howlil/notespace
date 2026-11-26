import assert from "node:assert/strict";
import { test } from "node:test";
import {
  destinationFromSearchResult,
  resolveQuickOpenAction,
  searchResultHref,
  UNPLACED_NOTE_TOAST_MESSAGE,
} from "./quick-open-model.ts";
import type { SearchResult } from "../../platform/api/workspace-api.ts";

const result = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  type: "workspace",
  parentId: "parent-1",
  parentTitle: "Backend",
  workspaceId: "workspace/a",
  workspaceTitle: "Distributed Systems",
  excerpt: "Raft",
  ...overrides,
});

test("Quick Open maps workspace results to canonical routes", () => {
  assert.equal(
    searchResultHref(result({ type: "workspace", workspaceId: "workspace/a" })),
    "/workspaces/workspace%2Fa",
  );
});

test("Quick Open destination preserves parent context", () => {
  const destination = destinationFromSearchResult(result());
  assert.equal(destination.kind, "workspace");
  assert.equal(destination.title, "Distributed Systems");
  assert.equal(destination.context, "Backend");
  assert.equal(destination.workspaceId, "workspace/a");

  const rootDest = destinationFromSearchResult(result({ parentId: null, parentTitle: "" }));
  assert.equal(rootDest.context, "Root workspace");
});

test("Quick Open keeps unplaced Note search results on a safe route", () => {
  const note = result({ type: "note", noteId: "note-1", workspaceId: "", workspaceTitle: "", excerpt: "  First line title\nSecond line" });
  const destination = destinationFromSearchResult(note);
  assert.equal(searchResultHref(note), "/");
  assert.equal(destination.context, "Unplaced Canvas Note");
  assert.equal(destination.title, "First line title");
});

test("Quick Open distinguishes multiple Note instances and defaults empty excerpt titles", () => {
  const first = destinationFromSearchResult(result({
    type: "note",
    noteId: "note-1",
    instanceId: "inst-1",
    workspaceId: "workspace-a",
    excerpt: "",
  }));
  const second = destinationFromSearchResult(result({
    type: "note",
    noteId: "note-2",
    instanceId: "inst-2",
    workspaceId: "workspace-a",
    excerpt: "\n  Second Note Headline  ",
  }));

  assert.equal(first.title, "Canvas Note");
  assert.equal(second.title, "Second Note Headline");
  assert.notEqual(first.key, second.key);
});

test("Quick Open places unplaced Notes when on Canvas and explains why when no Workspace is open", () => {
  const unplaced = destinationFromSearchResult(result({
    type: "note",
    noteId: "note-orphan",
    workspaceId: "",
    workspaceTitle: "",
    excerpt: "  Orphan   heading \nBody line",
  }));

  assert.equal(unplaced.workspaceId, undefined);
  assert.equal(unplaced.title, "Orphan heading");
  assert.deepEqual(
    resolveQuickOpenAction(unplaced, { canPlaceOnCanvas: true }),
    { type: "place-note", noteId: "note-orphan" },
  );
  assert.deepEqual(
    resolveQuickOpenAction(unplaced, { canPlaceOnCanvas: false }),
    { type: "toast-unplaced-note", message: UNPLACED_NOTE_TOAST_MESSAGE },
  );
});

test("Quick Open navigates placed Notes and Workspaces to their canonical routes", () => {
  const placedNote = destinationFromSearchResult(result({
    type: "note",
    noteId: "note-9",
    workspaceId: "ws-2",
    workspaceTitle: "Design",
    excerpt: "Placed card",
  }));
  assert.deepEqual(
    resolveQuickOpenAction(placedNote, { canPlaceOnCanvas: true }),
    { type: "navigate-workspace", workspaceId: "ws-2", noteId: "note-9" },
  );

  const workspace = destinationFromSearchResult(result({
    type: "workspace",
    workspaceId: "ws-7",
  }));
  assert.deepEqual(
    resolveQuickOpenAction(workspace, { canPlaceOnCanvas: false }),
    { type: "navigate-workspace", workspaceId: "ws-7", noteId: undefined },
  );
  assert.equal(resolveQuickOpenAction(undefined, { canPlaceOnCanvas: true }), null);
});
