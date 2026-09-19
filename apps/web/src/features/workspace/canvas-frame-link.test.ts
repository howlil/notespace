import assert from "node:assert/strict";
import test from "node:test";
import type { Snapshot } from "../../domain/project/project.ts";
import {
  canvasFrameLinkFromClipboard,
  canvasFrameLinkFromSnapshot,
  listCanvasFrameLinks,
} from "./canvas-frame-link.ts";

function canvas(): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [
        { id: "frame-1", type: "frame", name: "Architecture", x: 100, y: 80, width: 500, height: 300, isDeleted: false },
        { id: "rect-1", type: "rectangle", x: 140, y: 120, width: 160, height: 80, angle: 0, strokeColor: "#111111", backgroundColor: "#ffffff", strokeWidth: 1, frameId: "frame-1", isDeleted: false },
        { id: "text-1", type: "text", x: 170, y: 145, width: 90, height: 24, angle: 0, strokeColor: "#111111", backgroundColor: "transparent", strokeWidth: 1, fontSize: 20, text: "API", frameId: "frame-1", isDeleted: false },
        { id: "frame-nested", type: "frame", name: "Nested", x: 320, y: 200, width: 180, height: 100, angle: 0, strokeColor: "#111111", backgroundColor: "transparent", strokeWidth: 1, frameId: "frame-1", isDeleted: false },
        { id: "nested-text", type: "text", x: 350, y: 230, width: 100, height: 24, angle: 0, strokeColor: "#111111", backgroundColor: "transparent", strokeWidth: 1, fontSize: 18, text: "Nested content", frameId: "frame-nested", isDeleted: false },
        { id: "outside", type: "rectangle", x: 900, y: 900, width: 50, height: 50, frameId: null, isDeleted: false },
      ],
      appState: {},
      files: {},
    },
  };
}

test("frame links preserve frame identity and preview only authored frame children", () => {
  const link = canvasFrameLinkFromSnapshot(canvas(), "frame-1");
  assert.ok(link);
  assert.equal(link.frameId, "frame-1");
  assert.equal(link.label, "Architecture");
  assert.equal(link.elementCount, 4);
  assert.deepEqual(link.elements.map((element) => element.id), ["rect-1", "text-1", "frame-nested", "nested-text"]);
  assert.equal(link.elements[0]?.x, 40);
  assert.equal(link.elements[0]?.y, 40);
});

test("frame listing exposes named Canvas frames", () => {
  const frames = listCanvasFrameLinks(canvas());
  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.label, "Architecture");
});

test("native Excalidraw clipboard data resolves a single copied frame and prefers live Canvas content", () => {
  const clipboard = JSON.stringify({
    type: "excalidraw/clipboard",
    elements: [
      { id: "frame-1", type: "frame", name: "Architecture", x: 100, y: 80, width: 500, height: 300, isDeleted: false },
      { id: "rect-1", type: "rectangle", x: 140, y: 120, width: 160, height: 80, frameId: "frame-1", isDeleted: false },
    ],
  });
  const link = canvasFrameLinkFromClipboard(clipboard, canvas());
  assert.ok(link);
  assert.equal(link.frameId, "frame-1");
  assert.equal(link.elementCount, 4);
  assert.deepEqual(link.elements.map((element) => element.id), ["rect-1", "text-1", "frame-nested", "nested-text"]);
});

test("ordinary text and multi-frame clipboard payloads are not converted into frame links", () => {
  assert.equal(canvasFrameLinkFromClipboard("hello", canvas()), null);
  assert.equal(canvasFrameLinkFromClipboard(JSON.stringify({
    type: "excalidraw/clipboard",
    elements: [
      { id: "frame-1", type: "frame" },
      { id: "frame-2", type: "frame" },
    ],
  }), canvas()), null);
});
