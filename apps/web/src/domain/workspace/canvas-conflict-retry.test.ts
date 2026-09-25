import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCanvasConflict } from "./canvas-conflict-retry.ts";
import type { Snapshot } from "./workspace.ts";

function canvas(elements: Array<Record<string, unknown>>): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {} },
  };
}

test("Canvas conflict retry treats an already-durable scene as converged", () => {
  const local = canvas([{ id: "shape", version: 2, versionNonce: 5, index: "a0", x: 20 }]);
  const resolution = reconcileCanvasConflict(local, { canvas: local, canvasVersion: 7 });

  assert.equal(resolution.converged, true);
  assert.equal(resolution.version, 7);
  assert.deepEqual(resolution.canvas, local);
});

test("Canvas conflict retry merges independent elements and hands off the latest version", () => {
  const resolution = reconcileCanvasConflict(
    canvas([{ id: "local", version: 1, versionNonce: 1, index: "a0" }]),
    {
      canvas: canvas([{ id: "remote", version: 1, versionNonce: 2, index: "a1" }]),
      canvasVersion: 9,
    },
  );

  assert.equal(resolution.converged, false);
  assert.equal(resolution.version, 9);
  assert.deepEqual(
    (resolution.canvas.data.elements as Array<{ id: string }>).map((element) => element.id),
    ["local", "remote"],
  );
});

test("Canvas conflict retry delegates same-element ordering to the Canvas merge contract", () => {
  const latestWins = reconcileCanvasConflict(
    canvas([{ id: "shape", version: 1, versionNonce: 1, index: "a0", x: 10 }]),
    {
      canvas: canvas([{ id: "shape", version: 2, versionNonce: 2, index: "a0", x: 20 }]),
      canvasVersion: 3,
    },
  );
  assert.equal((latestWins.canvas.data.elements as Array<{ x: number }>)[0]?.x, 20);
  assert.equal(latestWins.converged, true);

  const localWins = reconcileCanvasConflict(
    canvas([{ id: "shape", version: 3, versionNonce: 3, index: "a0", x: 30 }]),
    {
      canvas: canvas([{ id: "shape", version: 2, versionNonce: 2, index: "a0", x: 20 }]),
      canvasVersion: 4,
    },
  );
  assert.equal((localWins.canvas.data.elements as Array<{ x: number }>)[0]?.x, 30);
  assert.equal(localWins.converged, false);
});
