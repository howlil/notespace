import test from "node:test";
import assert from "node:assert/strict";
import { mergeCanvasSnapshots } from "./canvas-merge.ts";
import type { Snapshot } from "./project.ts";

function canvas(elements: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {}, ...extra },
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
