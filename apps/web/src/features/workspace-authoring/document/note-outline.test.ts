import assert from "node:assert/strict";
import test from "node:test";
import { visibleNoteOutline, type NoteOutlineItem } from "./note-outline.ts";

const headings: NoteOutlineItem[] = [
  { id: "root", level: 1, text: "Architecture" },
  { id: "one", level: 3, text: "Service boundaries" },
  { id: "two", level: 4, text: "Failure cases" },
  { id: "peer", level: 2, text: "Operations" },
  { id: "end", level: 1, text: "Summary" },
];

test("heading gaps still nest under the nearest shallower heading", () => {
  const visible = visibleNoteOutline(headings, new Set());
  assert.deepEqual(visible.map(({ id, hasChildren }) => [id, hasChildren]), [
    ["root", true], ["one", true], ["two", false], ["peer", false], ["end", false],
  ]);
  assert.deepEqual(visibleNoteOutline(headings, new Set(["root"])).map(x => x.id), ["root", "end"]);
});

test("collapse hides only descendants and re-expansion restores them", () => {
  assert.deepEqual(visibleNoteOutline(headings, new Set(["one"])).map(x => x.id), ["root", "one", "peer", "end"]);
  assert.deepEqual(visibleNoteOutline(headings, new Set(["one", "root"])).map(x => x.id), ["root", "end"]);
  assert.deepEqual(visibleNoteOutline(headings, new Set()).map(x => x.id), headings.map(x => x.id));
});

test("identity is blockId, not heading text, and an empty note has no phantom entries", () => {
  assert.deepEqual(visibleNoteOutline([], new Set()), []);
  const duplicates = headings.map(x => ({ ...x, text: "Repeated title" }));
  assert.deepEqual(visibleNoteOutline(duplicates, new Set()).map(x => x.id), headings.map(x => x.id));
});
