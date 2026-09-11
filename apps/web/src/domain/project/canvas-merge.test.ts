import test from "node:test";
import assert from "node:assert/strict";
import { mergeCanvasSnapshots, mergeProjectContent, rebaseLocalProjectContent } from "./canvas-merge.ts";
import type { ProjectContent, Snapshot } from "./project.ts";

function canvas(elements: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {}, ...extra },
  };
}

function document(text = ""): Snapshot {
  return {
    format: "tiptap",
    version: 1,
    data: {
      type: "doc",
      content: [{
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      }],
    },
  };
}

function content(overrides: Partial<ProjectContent> = {}): ProjectContent {
  const doc = document();
  return {
    title: "Workspace",
    document: doc,
    notes: [{
      id: "note-1",
      title: "Untitled",
      document: doc,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    }],
    canvas: canvas([]),
    references: [],
    splitRatio: 0.45,
    ...overrides,
  };
}

test("keeps independent elements created by two tabs", () => {
  const local = canvas([
    { id: "base", version: 1, versionNonce: 10, index: "a0" },
    { id: "local-stroke", version: 1, versionNonce: 20, index: "a1" },
  ]);
  const remote = canvas([
    { id: "base", version: 1, versionNonce: 10, index: "a0" },
    { id: "remote-stroke", version: 1, versionNonce: 30, index: "a2" },
  ]);

  const merged = mergeCanvasSnapshots(local, remote);
  assert.deepEqual(
    (merged.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["base", "local-stroke", "remote-stroke"],
  );
});

test("uses Excalidraw version and versionNonce ordering for the same element", () => {
  const newer = mergeCanvasSnapshots(
    canvas([{ id: "shape", version: 3, versionNonce: 99, index: "a0", x: 20 }]),
    canvas([{ id: "shape", version: 2, versionNonce: 1, index: "a0", x: 10 }]),
  );
  assert.equal((newer.data.elements as Array<{ x: number }>)[0].x, 20);

  const tie = mergeCanvasSnapshots(
    canvas([{ id: "shape", version: 3, versionNonce: 5, index: "a0", x: 30 }]),
    canvas([{ id: "shape", version: 3, versionNonce: 8, index: "a0", x: 40 }]),
  );
  assert.equal((tie.data.elements as Array<{ x: number }>)[0].x, 30);
});

test("a newer tombstone wins so deletes are not resurrected", () => {
  const merged = mergeCanvasSnapshots(
    canvas([{ id: "shape", version: 1, versionNonce: 3, index: "a0", isDeleted: false }]),
    canvas([{ id: "shape", version: 2, versionNonce: 4, index: "a0", isDeleted: true }]),
  );
  assert.equal((merged.data.elements as Array<{ isDeleted: boolean }>)[0].isDeleted, true);
});

test("identified canvas metadata arrays are unioned instead of overwritten", () => {
  const merged = mergeCanvasSnapshots(
    canvas([], { diagrams: [{ id: "local", name: "Local" }] }),
    canvas([], { diagrams: [{ id: "remote", name: "Remote" }] }),
  );
  assert.deepEqual(
    (merged.data.diagrams as Array<{ id: string }>).map((item) => item.id).sort(),
    ["local", "remote"],
  );
});

test("three-way merge adopts unrelated remote fields while keeping local canvas edits", () => {
  const base = content();
  const local = content({
    canvas: canvas([{ id: "local-icon", version: 1, versionNonce: 2, index: "a1" }]),
  });
  const remote = content({ title: "Renamed elsewhere" });

  const merged = mergeProjectContent(base, local, remote);
  assert.ok(merged);
  assert.equal(merged.title, "Renamed elsewhere");
  assert.deepEqual(
    (merged.canvas.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["local-icon"],
  );
});

test("three-way merge rejects concurrent edits to the same non-canvas field", () => {
  const base = content();
  const local = content({ title: "Local title" });
  const remote = content({ title: "Remote title" });

  assert.equal(mergeProjectContent(base, local, remote), null);
});

test("ack rebase keeps edits made during save and adopts acknowledged remote fields", () => {
  const sent = content();
  const live = content({
    canvas: canvas([{ id: "newer-local", version: 1, versionNonce: 2, index: "a2" }]),
  });
  const acknowledged = content({
    title: "Remote title",
    canvas: canvas([{ id: "saved-remote", version: 1, versionNonce: 3, index: "a1" }]),
  });

  const rebased = rebaseLocalProjectContent(sent, live, acknowledged);
  assert.equal(rebased.title, "Remote title");
  assert.deepEqual(
    (rebased.canvas.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["saved-remote", "newer-local"],
  );
});
