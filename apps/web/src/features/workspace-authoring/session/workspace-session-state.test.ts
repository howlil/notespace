import assert from "node:assert/strict";
import test from "node:test";
import type { WorkspaceContent, Snapshot } from "../../../domain/workspace/workspace";
import { acknowledgeCanvasSnapshot, applyCanvasSnapshot, isStaleWorkspaceCanvasVersion } from "./workspace-session-state.ts";
import { Autosave } from "../../../domain/workspace/autosave.ts";
import { APIError } from "../../../adapters/http/client.ts";
import { saveWorkspaceCanvasWith } from "./granular-save-core.ts";

const canvasA: Snapshot = { format: "excalidraw", version: 1, data: { elements: [], appState: {}, files: {} } };
const canvasB: Snapshot = { format: "excalidraw", version: 1, data: { elements: [{ id: "shape-1" }], appState: {}, files: {} } };

function content(): WorkspaceContent {
  return {
    title: "Workspace",
    document: { format: "tiptap", version: 1, data: {} },
    notes: [],
    canvas: canvasA,
    references: [],
    splitRatio: 0.5,
  };
}

test("canvas transition changes only the authored canvas", () => {
  const before = content();
  const after = applyCanvasSnapshot(before, canvasB);
  assert.deepEqual(after.canvas, canvasB);
  assert.equal(after.notes, before.notes);
});

test("stale Workspace payloads cannot replace a newer Canvas acknowledgement", () => {
  assert.equal(isStaleWorkspaceCanvasVersion(3, 2), true);
  assert.equal(isStaleWorkspaceCanvasVersion(3, 3), false);
  assert.equal(isStaleWorkspaceCanvasVersion(3, 4), false);
});

test("acknowledgement preserves newer local edits and adopts remote elements", () => {
  const before = content();
  before.canvas = { ...canvasA, data: { elements: [{ id: "local", version: 3, versionNonce: 1, x: 30 }] } };
  const saved = { ...canvasA, data: { elements: [{ id: "local", version: 2, x: 20 }, { id: "remote", version: 1 }] } };
  const after = acknowledgeCanvasSnapshot(before, saved);
  assert.deepEqual(after.canvas.data.elements, [(before.canvas.data.elements as unknown[])[0], saved.data.elements[1]]);
  assert.equal(after.title, before.title);
});

test("conflict acknowledgement rebases queued edits so the next save keeps remote objects", async () => {
  let current = content();
  current.canvas = canvasB;
  let stored: { canvas: Snapshot; version: number; updatedAt: string } = {
    canvas: { ...canvasA, data: { elements: [{ id: "remote", version: 1 }] } }, version: 2, updatedAt: "",
  };
  let first = true;
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const saver = new Autosave<Snapshot>(1, async (snapshot, version) => {
    const saved = await saveWorkspaceCanvasWith({
      getCanvas: async () => stored,
      updateCanvas: async (_id, canvas, expectedVersion) => {
        if (expectedVersion !== stored.version) throw new APIError(409, "conflict");
        if (first) { first = false; await wait; }
        stored = { canvas, version: expectedVersion + 1, updatedAt: "" };
        return stored;
      },
      publishConflict: () => assert.fail("independent edits must merge"),
    }, "workspace", snapshot, version);
    current = acknowledgeCanvasSnapshot(current, saved.canvas);
    saver.replacePending(current.canvas);
    return saved;
  });
  saver.schedule(current.canvas);
  const saving = saver.flush();
  current = applyCanvasSnapshot(current, { ...canvasA, data: { elements: [{ id: "shape-1", version: 2, x: 50 }] } });
  saver.schedule(current.canvas);
  release();
  await saving;
  const elements = stored.canvas.data.elements as Array<{ id: string; x?: number }>;
  assert.deepEqual(elements.map((element) => element.id).sort(), ["remote", "shape-1"]);
  assert.equal(elements.find((element) => element.id === "shape-1")?.x, 50);
  assert.equal(saver.dirty, false);
});
