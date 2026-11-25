import assert from "node:assert/strict";
import test from "node:test";
import type { NoteDocument, NoteNode } from "../../../entities/note";
import {
  extractBlocksFromDocument,
  findBlockById,
  listNoteBlocks,
  toggleNoteToggleInDocument,
  toggleTaskInDocument,
} from "./note-extract.ts";

const paragraph = (text: string, blockId?: string): NoteNode => ({
  type: "paragraph",
  ...(blockId ? { attrs: { blockId } } : {}),
  ...(text ? { content: [{ type: "text", text }] } : {}),
});

test("extractBlocksFromDocument extracts a middle range and preserves surrounding blocks", () => {
  const source: NoteDocument = {
    type: "doc",
    content: [
      paragraph("Intro", "b1"),
      { type: "heading", attrs: { level: 2, blockId: "b2" }, content: [{ type: "text", text: "Section" }] },
      paragraph("Detail", "b3"),
      paragraph("Outro", "b4"),
    ],
  };

  const result = extractBlocksFromDocument(source, { startIndex: 1, endIndex: 2 });
  assert.ok(result);
  assert.equal(result.extracted.content.length, 2);
  assert.equal(result.extracted.content[0]?.type, "heading");
  assert.equal(result.extracted.content[1]?.content?.[0]?.text, "Detail");
  assert.deepEqual(
    result.remaining.content.map((node) => node.content?.[0]?.text),
    ["Intro", "Outro"],
  );

  // Input document must not be mutated when mutating extracted output.
  result.extracted.content[1]!.content![0]!.text = "Changed";
  assert.equal(source.content[2]?.content?.[0]?.text, "Detail");
});

test("extractBlocksFromDocument leaves an empty paragraph when all blocks are extracted without leaveLink", () => {
  const source: NoteDocument = {
    type: "doc",
    content: [paragraph("Only block", "b1")],
  };

  const result = extractBlocksFromDocument(source, { startIndex: 0, endIndex: 0 });
  assert.ok(result);
  assert.equal(result.extracted.content[0]?.content?.[0]?.text, "Only block");
  assert.deepEqual(result.remaining, { type: "doc", content: [{ type: "paragraph" }] });
});

test("extractBlocksFromDocument inserts a link paragraph at startIndex when leaveLink is provided", () => {
  const source: NoteDocument = {
    type: "doc",
    content: [
      paragraph("Before", "b1"),
      paragraph("Moved body", "b2"),
      paragraph("After", "b3"),
    ],
  };

  const result = extractBlocksFromDocument(
    source,
    { startIndex: 1, endIndex: 1 },
    { leaveLink: { href: "/workspaces/ws-1?noteId=note-2", label: "Moved body" } },
  );
  assert.ok(result);
  assert.equal(result.remaining.content.length, 3);
  assert.deepEqual(result.remaining.content[1], {
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "Moved body",
        marks: [{ type: "link", attrs: { href: "/workspaces/ws-1?noteId=note-2" } }],
      },
    ],
  });
});

test("extractBlocksFromDocument rejects empty selections and invalid ranges, but accepts non-text blocks", () => {
  const emptyDoc: NoteDocument = { type: "doc", content: [paragraph(""), paragraph("   ")] };
  assert.equal(extractBlocksFromDocument(emptyDoc, { startIndex: 0, endIndex: 1 }), null);
  assert.equal(extractBlocksFromDocument({ type: "doc", content: [] }, { startIndex: 0, endIndex: 0 }), null);

  const richDoc: NoteDocument = {
    type: "doc",
    content: [
      paragraph("Real text", "b1"),
      { type: "noteImage", attrs: { src: "/api/workspaces/w/assets/a", alt: "Diagram", blockId: "b2" } },
    ],
  };
  assert.equal(extractBlocksFromDocument(richDoc, { startIndex: -1, endIndex: 0 }), null);
  assert.equal(extractBlocksFromDocument(richDoc, { startIndex: 1, endIndex: 0 }), null);
  assert.equal(extractBlocksFromDocument(richDoc, { startIndex: 0, endIndex: 5 }), null);
  assert.equal(extractBlocksFromDocument(richDoc, { startIndex: 0.5, endIndex: 1 }), null);

  const imageOnly = extractBlocksFromDocument(richDoc, { startIndex: 1, endIndex: 1 });
  assert.ok(imageOnly);
  assert.equal(imageOnly.extracted.content[0]?.type, "noteImage");
});

test("findBlockById and listNoteBlocks locate nested blocks and skip empty paragraphs", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1, blockId: "h1" }, content: [{ type: "text", text: "Architecture" }] },
      paragraph("", "empty-p"),
      {
        type: "noteToggle",
        attrs: { open: true, blockId: "t1" },
        content: [
          { type: "noteToggleSummary", content: [{ type: "text", text: "Details" }] },
          paragraph("Inside toggle", "inner-p"),
        ],
      },
      { type: "horizontalRule", attrs: { blockId: "hr1" } },
    ],
  };

  assert.equal(findBlockById(doc, "inner-p")?.content?.[0]?.text, "Inside toggle");
  assert.equal(findBlockById(doc, "missing"), null);

  assert.deepEqual(listNoteBlocks(doc), [
    { blockId: "h1", preview: "Architecture", type: "heading" },
    { blockId: "t1", preview: "Details", type: "noteToggle" },
    { blockId: "inner-p", preview: "Inside toggle", type: "paragraph" },
    { blockId: "hr1", preview: "Divider", type: "horizontalRule" },
  ]);
});

test("toggleTaskInDocument toggles tasks by index and by blockId immutably, including nested tasks", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      {
        type: "taskList",
        attrs: { blockId: "tl-1" },
        content: [
          {
            type: "taskItem",
            attrs: { checked: false },
            content: [
              paragraph("Parent task", "p-task-0"),
              {
                type: "taskList",
                attrs: { blockId: "tl-2" },
                content: [
                  {
                    type: "taskItem",
                    attrs: { checked: false },
                    content: [paragraph("Nested task", "p-task-1")],
                  },
                ],
              },
            ],
          },
          {
            type: "taskItem",
            attrs: { checked: true },
            content: [paragraph("Second task", "p-task-2")],
          },
        ],
      },
    ],
  };

  const toggledNested = toggleTaskInDocument(doc, { index: 1, checked: true });
  assert.notEqual(toggledNested, doc);
  const nestedItem = toggledNested.content[0]?.content?.[0]?.content?.[1]?.content?.[0];
  assert.equal(nestedItem?.attrs?.checked, true);
  assert.equal(doc.content[0]?.content?.[0]?.content?.[1]?.content?.[0]?.attrs?.checked, false, "original unchanged");

  const toggledByBlockId = toggleTaskInDocument(toggledNested, { blockId: "p-task-2", index: 0, checked: false });
  assert.equal(toggledByBlockId.content[0]?.content?.[1]?.attrs?.checked, false);

  // No-op returns exact same document reference.
  assert.equal(toggleTaskInDocument(toggledByBlockId, { blockId: "p-task-2", index: 2, checked: false }), toggledByBlockId);
  assert.equal(toggleTaskInDocument(doc, { index: 99, checked: true }), doc);
});

test("toggleNoteToggleInDocument updates nested noteToggle open state immutably", () => {
  const doc: NoteDocument = {
    type: "doc",
    content: [
      {
        type: "noteToggle",
        attrs: { open: true, blockId: "toggle-outer" },
        content: [
          { type: "noteToggleSummary", content: [{ type: "text", text: "Outer" }] },
          {
            type: "noteToggle",
            attrs: { open: false, blockId: "toggle-inner" },
            content: [
              { type: "noteToggleSummary", content: [{ type: "text", text: "Inner" }] },
              paragraph("Body", "body-1"),
            ],
          },
        ],
      },
    ],
  };

  const openedInner = toggleNoteToggleInDocument(doc, "toggle-inner", true);
  assert.notEqual(openedInner, doc);
  assert.equal(openedInner.content[0]?.content?.[1]?.attrs?.open, true);
  assert.equal(doc.content[0]?.content?.[1]?.attrs?.open, false);

  const closedOuter = toggleNoteToggleInDocument(openedInner, "toggle-outer", false);
  assert.equal(closedOuter.content[0]?.attrs?.open, false);

  assert.equal(toggleNoteToggleInDocument(closedOuter, "toggle-outer", false), closedOuter);
  assert.equal(toggleNoteToggleInDocument(closedOuter, "unknown-id", true), closedOuter);
});
