import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasPinchViewport,
  isCanvasPinchTarget,
  pinchBaseViewport,
} from "./canvas-pinch-zoom.ts";

const viewport = { zoom: 1, scrollX: 10, scrollY: -20 };
const bounds = { left: 40, top: 30, width: 500, height: 400 };
const pinch = {
  ctrlKey: true,
  metaKey: false,
  deltaY: -8,
  deltaMode: 0,
  clientX: 240,
  clientY: 180,
};

test("pinch zoom preserves the scene coordinates below the gesture point", () => {
  const next = canvasPinchViewport(viewport, pinch, bounds);
  assert.ok(next);
  assert.equal(next.zoom, 1.08);
  const x = pinch.clientX - bounds.left;
  const y = pinch.clientY - bounds.top;
  assert.ok(Math.abs(x / viewport.zoom - viewport.scrollX - (x / next.zoom - next.scrollX)) < 1e-9);
  assert.ok(Math.abs(y / viewport.zoom - viewport.scrollY - (y / next.zoom - next.scrollY)) < 1e-9);

  const back = canvasPinchViewport(next, { ...pinch, deltaY: 8 }, bounds);
  assert.ok(back);
  assert.equal(back.zoom, 1);
  assert.ok(Math.abs(back.scrollX - viewport.scrollX) < 1e-9);
  assert.ok(Math.abs(back.scrollY - viewport.scrollY) < 1e-9);
});

test("unmodified two-finger wheel remains Excalidraw pan, meta zoom is supported", () => {
  assert.equal(canvasPinchViewport(viewport, { ...pinch, ctrlKey: false }, bounds), null);
  assert.ok(canvasPinchViewport(viewport, { ...pinch, ctrlKey: false, metaKey: true }, bounds));
  assert.equal(canvasPinchViewport(viewport, { ...pinch, deltaY: 0 }, bounds), null);
});

test("pinch normalizes line wheel deltas, preserves fine touchpad deltas, clamps zoom, and ignores invalid input", () => {
  const linePinch = canvasPinchViewport(viewport, { ...pinch, deltaY: -1, deltaMode: 1 }, bounds);
  assert.equal(linePinch?.zoom, 1.1);
  const microPinch = canvasPinchViewport(viewport, { ...pinch, deltaY: -0.04, deltaMode: 0 }, bounds);
  assert.equal(microPinch?.zoom, 1.0004);
  assert.equal(canvasPinchViewport({ ...viewport, zoom: 0.1 }, { ...pinch, deltaY: 999 }, bounds)?.zoom, 0.1);
  assert.equal(canvasPinchViewport({ ...viewport, zoom: 30 }, { ...pinch, deltaY: -999 }, bounds)?.zoom, 30);
  assert.equal(canvasPinchViewport(viewport, { ...pinch, deltaY: Number.NaN }, bounds), null);
  assert.equal(canvasPinchViewport(viewport, { ...pinch, clientX: Infinity }, bounds), null);
});

test("pinchBaseViewport accumulates rapid batched trackpad events and resets once committed", () => {
  const first = canvasPinchViewport(viewport, { ...pinch, deltaY: -4 }, bounds);
  assert.ok(first);
  const pending = { committed: viewport, next: first, timeStamp: 100 };

  // Second touchpad tick arrives before React commits the first updateScene.
  const baseSameFrame = pinchBaseViewport(viewport, pending, 104);
  assert.deepEqual(baseSameFrame, first);
  const second = canvasPinchViewport(baseSameFrame, { ...pinch, deltaY: -4 }, bounds);
  assert.equal(second?.zoom, 1.08);

  // Once Excalidraw commits (or user pans/resets externally), use the committed viewport.
  assert.deepEqual(pinchBaseViewport(first, pending, 116), first);
  const external = { zoom: 1, scrollX: 50, scrollY: 0 };
  assert.deepEqual(pinchBaseViewport(external, pending, 108), external);

  // Stale pending state expires after 100ms even if zoom was clamped.
  assert.deepEqual(pinchBaseViewport(viewport, pending, 250), viewport);
});

test("isCanvasPinchTarget includes Canvas and editing cards while excluding chrome overlays and iframes", () => {
  const targetWith = (matches: readonly string[]) => ({
    closest: (selector: string) => {
      const parts = selector.split(",").map((part) => part.trim());
      return parts.some((part) => matches.includes(part)) ? {} : null;
    },
  });

  assert.equal(isCanvasPinchTarget(targetWith([".excalidraw__canvas"])), true);
  assert.equal(isCanvasPinchTarget(targetWith([])), true);
  assert.equal(isCanvasPinchTarget(targetWith(["[data-canvas-code-block]", "textarea"])), true);
  assert.equal(isCanvasPinchTarget(targetWith(["[data-note-element]", '[contenteditable="true"]'])), true);

  assert.equal(isCanvasPinchTarget(targetWith(['[role="toolbar"]'])), false);
  assert.equal(isCanvasPinchTarget(targetWith(['[role="dialog"]'])), false);
  assert.equal(isCanvasPinchTarget(targetWith(['[role="menu"]'])), false);
  assert.equal(isCanvasPinchTarget(targetWith([".sidebar"])), false);
  assert.equal(isCanvasPinchTarget(targetWith(["iframe"])), false);
  assert.equal(isCanvasPinchTarget(targetWith(["button"])), false);
  assert.equal(isCanvasPinchTarget(targetWith(["[data-note-element]", ".notespace-note-ui", "button"])), false);
});
