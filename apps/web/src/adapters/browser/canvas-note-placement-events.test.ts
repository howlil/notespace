import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  canPlaceNoteOnCanvas,
  registerCanvasNotePlacer,
  requestPlaceNoteOnCanvas,
  subscribeCanvasNotePlacerAvailability,
} from "./canvas-note-placement-events.ts";

let cleanup: (() => void) | null = null;

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

test("tracks active canvas availability and dispatches note placement", () => {
  const notifications: boolean[] = [];
  const unsubscribe = subscribeCanvasNotePlacerAvailability(() => {
    notifications.push(canPlaceNoteOnCanvas());
  });

  assert.equal(canPlaceNoteOnCanvas(), false);
  assert.equal(requestPlaceNoteOnCanvas("note-1"), false);

  const placed: string[] = [];
  cleanup = registerCanvasNotePlacer((noteId) => {
    placed.push(noteId);
  });

  assert.equal(canPlaceNoteOnCanvas(), true);
  assert.equal(requestPlaceNoteOnCanvas(""), false);
  assert.equal(requestPlaceNoteOnCanvas("note-1"), true);
  assert.deepEqual(placed, ["note-1"]);

  cleanup();
  cleanup = null;
  unsubscribe();

  assert.equal(canPlaceNoteOnCanvas(), false);
  assert.equal(requestPlaceNoteOnCanvas("note-1"), false);
  assert.deepEqual(notifications, [true, false]);
});

test("stale unregister does not clear a newer canvas registration", () => {
  const firstPlaced: string[] = [];
  const secondPlaced: string[] = [];
  const unregisterFirst = registerCanvasNotePlacer((noteId) => {
    firstPlaced.push(noteId);
  });
  cleanup = registerCanvasNotePlacer((noteId) => {
    secondPlaced.push(noteId);
  });

  unregisterFirst();

  assert.equal(canPlaceNoteOnCanvas(), true);
  assert.equal(requestPlaceNoteOnCanvas("note-2"), true);
  assert.deepEqual(firstPlaced, []);
  assert.deepEqual(secondPlaced, ["note-2"]);
});
