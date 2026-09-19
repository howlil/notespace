import assert from "node:assert/strict";
import test from "node:test";
import { reconcileCanvasConflict } from "./canvas-conflict-retry.ts";
import type { Snapshot } from "./project.ts";

function canvas(elements: Array<Record<string, unknown>>): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: { elements, appState: {}, files: {} },
  };
}

test("Canvas conflict reconciliation keeps local-newer elements, remote-only elements, and the latest durable version", () => {
  const local = canvas([{ id: "shared", type: "rectangle", version: 2, versionNonce: 10, x: 20 }]);
  const remote = canvas([
    { id: "shared", type: "rectangle", version: 1, versionNonce: 20, x: 5 },
    { id: "remote-only", type: "ellipse", version: 1, versionNonce: 30 },
  ]);

  const resolution = reconcileCanvasConflict(local, { canvas: remote, canvasVersion: 4 });
  const elements = resolution.canvas.data.elements as Array<Record<string, unknown>>;

  assert.equal(resolution.version, 4);
  assert.equal(resolution.converged, false);
  assert.equal(elements.length, 2);
  assert.equal(elements.find((element) => element.id === "shared")?.x, 20);
  assert.equal(elements.some((element) => element.id === "remote-only"), true);
});

test("Canvas conflict reconciliation detects when the latest durable scene already matches", () => {
  const latest = canvas([{ id: "same", type: "rectangle", version: 3, versionNonce: 7 }]);
  const resolution = reconcileCanvasConflict(latest, { canvas: latest, canvasVersion: 9 });

  assert.equal(resolution.converged, true);
  assert.equal(resolution.version, 9);
  assert.deepEqual(resolution.canvas, latest);
});
