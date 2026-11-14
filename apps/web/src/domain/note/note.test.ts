import assert from "node:assert/strict";
import test from "node:test";
import { duplicatedNoteInstanceIds, emptyNoteDocument, isSafeNoteLink, isValidNoteBlockId, noteBlockIdRepairs, noteFirstLine, notePlacement, readCanvasNoteReference, withCanvasNoteReference } from "./note.ts";

test("Canvas Note starts with a valid empty document", () => {
    assert.deepEqual(emptyNoteDocument(), { type: "doc", content: [] });
  });

test("Canvas Note keeps references without replacing other metadata", () => {
    const customData = withCanvasNoteReference({ source: "canvas" }, { noteId: "note-1", instanceId: "instance-1" });
    assert.equal(customData.source, "canvas");
    assert.deepEqual(readCanvasNoteReference({ customData }), { noteId: "note-1", instanceId: "instance-1" });
    const withModes = withCanvasNoteReference(customData, { noteId: "note-1", instanceId: "instance-1", compact: true, heightMode: "fixed" });
    assert.deepEqual(readCanvasNoteReference({ customData: withModes }), { noteId: "note-1", instanceId: "instance-1", compact: true, heightMode: "fixed" });
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

test("Canvas Note label is the first non-empty text block, trimmed and bounded", () => {
  const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
  assert.equal(noteFirstLine({ type: "doc", content: [] }), "");
  assert.equal(noteFirstLine({ type: "doc", content: [{ type: "paragraph" }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "  Plan " }, { type: "text", text: "A", marks: [{ type: "bold" }] }] }, paragraph("body")] }), "Plan A");
  assert.equal(noteFirstLine({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [paragraph("nested item")] }] }] }), "nested item");
  const long = noteFirstLine({ type: "doc", content: [paragraph("x".repeat(300))] });
  assert.equal(long.length, 120);
  assert.ok(long.endsWith("…"));
});

test("Canvas Note block identities are repaired when missing, invalid or duplicated", () => {
  const blocks = [
    { key: "a", type: "heading", blockId: null },
    { key: "b", type: "paragraph", blockId: "p-1" },
    { key: "c", type: "paragraph", blockId: "p-1" },
    { key: "d", type: "text", blockId: undefined },
    { key: "e", type: "listItem", blockId: null },
    { key: "f", type: "bulletList", blockId: "bad/id" },
    { key: "g", type: "taskList", blockId: " padded" },
    { key: "h", type: "codeBlock", blockId: "x".repeat(129) },
    { key: "i", type: "blockquote", blockId: "q-1" },
  ];
  assert.deepEqual(noteBlockIdRepairs(blocks), ["a", "c", "f", "g", "h"]);
  assert.equal(isValidNoteBlockId("2f1c-uuid"), true);
  assert.equal(isValidNoteBlockId(""), false);
});

test("Canvas Note placement never overlaps an occupied card, even when the center is crowded", () => {
  const card = (x: number, y: number) => ({ x, y, width: 320, height: 180 });
  const overlaps = (a: { x: number; y: number }, b: { x: number; y: number; width: number; height: number }) =>
    a.x < b.x + b.width && a.x + 320 > b.x && a.y < b.y + b.height && a.y + 180 > b.y;
  const base = { viewportWidth: 900, viewportHeight: 600, zoom: 1, scrollX: 0, scrollY: 0 };
  const center = notePlacement({ ...base, occupied: [] });
  const crowded = [card(center.x, center.y)];
  const placed = notePlacement({ ...base, occupied: crowded });
  assert.equal(crowded.some((item) => overlaps(placed, item)), false, "second Note must not stack on the first");
  // A dense cluster around the center must still yield a free spot.
  const cluster: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let dx = -2; dx <= 2; dx += 1) for (let dy = -2; dy <= 2; dy += 1) cluster.push(card(center.x + dx * 330, center.y + dy * 190));
  const inCluster = notePlacement({ ...base, occupied: cluster });
  assert.equal(cluster.some((item) => overlaps(inCluster, item)), false, "crowded placement still avoids overlap");
});

test("native duplicates of a Note instance are found; the first live instance keeps its identity", () => {
  const ref = (instanceId: string, noteId = "n1") => ({ notespaceNote: { noteId, instanceId } });
  assert.deepEqual(duplicatedNoteInstanceIds([
    { id: "a", customData: ref("i1") },
    { id: "plain", customData: { other: true } },
    { id: "copy", customData: ref("i1") },
    { id: "b", customData: ref("i2", "n2") },
  ]), ["copy"]);
  assert.deepEqual(duplicatedNoteInstanceIds([
    { id: "gone", isDeleted: true, customData: ref("i1") },
    { id: "live", customData: ref("i1") },
  ]), [], "a deleted instance does not make the live one a copy");
  assert.deepEqual(duplicatedNoteInstanceIds([
    { id: "x", customData: ref("i1") },
    { id: "y", customData: ref("i1") },
    { id: "z", customData: ref("i1") },
  ]), ["y", "z"]);
  assert.deepEqual(duplicatedNoteInstanceIds([]), []);
});

test("safe Note links allow internal workspace links, http/https, and mailto while rejecting unsafe schemes", () => {
  assert.equal(isSafeNoteLink("/workspaces/ws-1?noteId=note-2"), true);
  assert.equal(isSafeNoteLink("https://example.com/docs"), true);
  assert.equal(isSafeNoteLink("http://example.com"), true);
  assert.equal(isSafeNoteLink("mailto:team@example.com"), true);
  assert.equal(isSafeNoteLink("javascript:alert(1)"), false);
  assert.equal(isSafeNoteLink("data:text/html,<script>alert(1)</script>"), false);
  assert.equal(isSafeNoteLink("//evil.example.com"), false);
});
