import assert from "node:assert/strict";
import test from "node:test";
import type { Snapshot } from "./workspace";
import {
  MAX_FRAME_PREVIEW_ELEMENTS,
  canvasFrameLinkFromClipboard,
  canvasFrameLinkFromSnapshot,
  listCanvasFrameLinks,
} from "./canvas-frame-link";

function canvas(): Snapshot {
  return {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [
        { id: "frame-1", type: "frame", name: "Architecture", x: 100, y: 80, width: 500, height: 300, isDeleted: false },
        { id: "rect-1", type: "rectangle", x: 140, y: 120, width: 160, height: 80, angle: 0, strokeColor: "#111111", backgroundColor: "#ffffff", strokeWidth: 1, frameId: "frame-1", isDeleted: false },
        { id: "text-1", type: "text", x: 170, y: 145, width: 90, height: 24, angle: 0, strokeColor: "#111111", backgroundColor: "transparent", strokeWidth: 1, fontSize: 20, text: "API", frameId: "frame-1", isDeleted: false },
        { id: "image-1", type: "image", x: 205, y: 205, width: 72, height: 72, angle: 0, strokeColor: "transparent", backgroundColor: "transparent", strokeWidth: 1, fileId: "asset-logo", scale: [-1, 1], frameId: "frame-1", isDeleted: false },
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
  assert.equal(link.elementCount, 5);
  assert.deepEqual(link.elements.map((element) => element.id), ["rect-1", "text-1", "image-1", "frame-nested", "nested-text"]);
  const image = link.elements.find((element) => element.id === "image-1");
  assert.equal(image?.fileId, "asset-logo");
  assert.deepEqual(image?.scale, [-1, 1]);
  assert.equal(link.elements[0]?.x, 40);
  assert.equal(link.elements[0]?.y, 40);
});

test("frame listing exposes top-level and nested named Canvas frames", () => {
  const frames = listCanvasFrameLinks(canvas());
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map((frame) => frame.label), ["Architecture", "Nested"]);
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
  assert.equal(link.elementCount, 5);
  assert.deepEqual(link.elements.map((element) => element.id), ["rect-1", "text-1", "image-1", "frame-nested", "nested-text"]);
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


test("large Canvas frames keep exact object counts while bounding serialized preview elements", () => {
  const childCount = MAX_FRAME_PREVIEW_ELEMENTS * 4;
  const snapshot: Snapshot = {
    format: "excalidraw",
    version: 1,
    data: {
      elements: [
        { id: "frame-large", type: "frame", name: "Large frame", x: 0, y: 0, width: 1200, height: 900, isDeleted: false },
        ...Array.from({ length: childCount }, (_, index) => ({
          id: `child-${index}`,
          type: "rectangle",
          x: index % 40 * 20,
          y: Math.floor(index / 40) * 20,
          width: 16,
          height: 16,
          angle: 0,
          strokeColor: "#111111",
          backgroundColor: "#ffffff",
          strokeWidth: 1,
          frameId: "frame-large",
          isDeleted: false,
        })),
      ],
      appState: {},
      files: {},
    },
  };

  const link = canvasFrameLinkFromSnapshot(snapshot, "frame-large");
  assert.ok(link);
  assert.equal(link.elementCount, childCount);
  assert.equal(link.elements.length, MAX_FRAME_PREVIEW_ELEMENTS);
  assert.equal(new Set(link.elements.map((element) => element.id)).size, MAX_FRAME_PREVIEW_ELEMENTS);
});

test("frame listing resolves many frames from one shared Canvas index", () => {
  const frameCount = 80;
  const childrenPerFrame = 12;
  const snapshot: Snapshot = {
    format: "excalidraw",
    version: 1,
    data: {
      elements: Array.from({ length: frameCount }, (_, frameIndex) => [
        {
          id: `frame-${frameIndex}`,
          type: "frame",
          name: `Frame ${frameIndex}`,
          x: frameIndex * 10,
          y: frameIndex * 10,
          width: 300,
          height: 200,
          isDeleted: false,
        },
        ...Array.from({ length: childrenPerFrame }, (_, childIndex) => ({
          id: `frame-${frameIndex}-child-${childIndex}`,
          type: "rectangle",
          x: frameIndex * 10 + childIndex,
          y: frameIndex * 10 + childIndex,
          width: 10,
          height: 10,
          frameId: `frame-${frameIndex}`,
          isDeleted: false,
        })),
      ]).flat(),
      appState: {},
      files: {},
    },
  };

  const frames = listCanvasFrameLinks(snapshot);
  assert.equal(frames.length, frameCount);
  assert.ok(frames.every((frame) => frame.elementCount === childrenPerFrame));
});
