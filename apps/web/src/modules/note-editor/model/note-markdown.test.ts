import assert from "node:assert/strict";
import test from "node:test";
import {
  findBlockPreview,
  inlineText,
  lexNote,
  noteBlocks,
  parseInlineTag,
  parseNoteRoute,
  toggleNoteDetails,
  toggleNoteTask,
  type NoteToken,
} from "./note-markdown.ts";

const doc = (text: string) => ({ type: "markdown" as const, text });
const blocks = (text: string) => noteBlocks(lexNote(doc(text)));

test("callouts, toggles and block ids are assembled from plain Markdown", () => {
  const result = blocks([
    "# Title ^h1",
    "",
    "> [!warning]",
    "> careful **now**",
    "",
    "<details open>",
    "<summary>More &amp; more</summary>",
    "",
    "hidden ^p9",
    "",
    "</details>",
    "",
    "> plain quote",
  ].join("\n"));
  assert.deepEqual(result.map((token) => token.type), ["heading", "callout", "details", "blockquote"]);
  assert.equal(result[0].blockId, "h1");
  assert.equal(inlineText(result[0].tokens), "Title");
  assert.equal(result[1].tone, "warning");
  assert.equal(inlineText((result[1].tokens as NoteToken[])[0].tokens), "careful now");
  assert.deepEqual([result[2].summary, result[2].open, result[2].index], ["More & more", true, 0]);
  assert.equal((result[2].tokens as NoteToken[])[0].blockId, "p9");
});

test("a lone ^id line labels the previous block and an escaped marker stays text", () => {
  const result = blocks(["- one", "- two", "", "^list1", "", "tail \\^notmarker"].join("\n"));
  assert.equal(result[0].blockId, "list1");
  assert.equal(result.length, 2);
  assert.equal(result[1].blockId, undefined);
  assert.equal(inlineText(result[1].tokens), "tail ^notmarker");
});

test("unknown tones fall back and a toggle written on one block still works", () => {
  const result = blocks("> [!bogus]\n> x\n\n<details>\n<summary>S</summary>\nbody\n</details>");
  assert.equal(result[0].tone, "note");
  assert.deepEqual([result[1].type, result[1].summary, result[1].open], ["details", "S", false]);
  assert.equal(inlineText((result[1].tokens as NoteToken[])[0].tokens), "body");
});

test("math lexes as its own tokens and money stays text", () => {
  const result = blocks("cost $5 and $x^2$ ok\n\n$$\nE=mc^2\n$$");
  assert.equal(inlineText(result[0].tokens), "cost $5 and x^2 ok");
  assert.deepEqual([result[1].type, result[1].text], ["blockMath", "E=mc^2"]);
});

test("only the Note HTML allowlist is recognised", () => {
  assert.deepEqual(parseInlineTag('<mark data-tone="blue">'), { name: "mark", closing: false, value: "blue" });
  assert.deepEqual(parseInlineTag("</span>"), { name: "span", closing: true });
  assert.deepEqual(parseInlineTag("<br />"), { name: "br", closing: false });
  for (const hostile of ['<script>', '<img src=x onerror=alert(1)>', '<u onclick="x">', '<mark style="x:y">', '<a href="javascript:1">', '<u data-tone="x">']) {
    assert.equal(parseInlineTag(hostile), null, hostile);
  }
});

test("block previews come from the marked block and vanish with it", () => {
  const document = doc("# Plan ^h\n\n- a\n- b ^li\n\nbody");
  assert.equal(findBlockPreview(document, "h"), "Plan");
  assert.equal(findBlockPreview(document, "li"), "b");
  assert.equal(findBlockPreview(document, "gone"), null);
  assert.equal(findBlockPreview(null, "h"), null);
});

test("Note routes carry workspace, note and optional block", () => {
  assert.deepEqual(parseNoteRoute("/workspaces/w1?noteId=n1&blockId=b1"), { workspaceId: "w1", noteId: "n1", blockId: "b1" });
  assert.deepEqual(parseNoteRoute("/workspaces/_?noteId=n1"), { workspaceId: "", noteId: "n1", blockId: "" });
  assert.equal(parseNoteRoute("/workspaces/w1"), null);
  assert.equal(parseNoteRoute("https://x/workspaces/w1?noteId=n"), null);
});

test("task and toggle clicks rewrite exactly one source marker and skip code", () => {
  const text = ["- [ ] a", "```", "- [ ] code", "```", "> - [x] b", "1. [ ] c", "<details>", "<summary>S</summary>", "", "</details>"].join("\n");
  assert.equal(toggleNoteTask(text, 0, true).split("\n")[0], "- [x] a");
  assert.equal(toggleNoteTask(text, 1, false).split("\n")[4], "> - [ ] b");
  assert.equal(toggleNoteTask(text, 2, true).split("\n")[5], "1. [x] c");
  assert.equal(toggleNoteTask(text, 3, true), text);
  assert.equal(toggleNoteDetails(text, 0, true).split("\n")[6], "<details open>");
  assert.equal(toggleNoteDetails(toggleNoteDetails(text, 0, true), 0, false), text);
  assert.equal(toggleNoteDetails(text, 1, true), text);
});
