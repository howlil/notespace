import assert from "node:assert/strict";
import test from "node:test";
import { emptyNoteDocument, notePlacement, readCanvasNoteReference, withCanvasNoteReference } from "./note.ts";

test("Canvas Note starts with a valid empty document", () => {
    assert.deepEqual(emptyNoteDocument(), { type: "doc", content: [] });
  });

test("Canvas Note keeps references without replacing other metadata", () => {
    const customData = withCanvasNoteReference({ source: "canvas" }, { noteId: "note-1", instanceId: "instance-1" });
    assert.equal(customData.source, "canvas");
    assert.deepEqual(readCanvasNoteReference({ customData }), { noteId: "note-1", instanceId: "instance-1" });
    assert.equal(readCanvasNoteReference({ customData, isDeleted: true }), null);
  });

test("Canvas Note moves a new card to a free center slot", () => {
    const placement = notePlacement({
      viewportWidth: 800,
      viewportHeight: 600,
      zoom: 1,
      scrollX: 0,
      scrollY: 0,
      width: 320,
      height: 180,
      occupied: [{ x: 240, y: 210, width: 100, height: 60 }],
    });
    assert.notDeepEqual(placement, { x: 240, y: 210 });
  });
