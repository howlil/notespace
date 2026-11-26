import assert from "node:assert/strict";
import test from "node:test";
import { joinCardDocument, splitCardDocument } from "./card-document-sections.ts";

test("splitCardDocument handles empty documents", () => {
  assert.deepEqual(splitCardDocument(""), {
    headline: "",
    body: "",
    prefix: "# ",
    editableHeadline: true,
  });
});

test("splitCardDocument splits level-1 Markdown headings cleanly", () => {
  assert.deepEqual(splitCardDocument("# Atomic Note\n\nBody paragraph\nSecond line"), {
    headline: "Atomic Note",
    body: "Body paragraph\nSecond line",
    prefix: "# ",
    editableHeadline: true,
  });
});

test("splitCardDocument splits plain lead lines and keeps blocks unsplit", () => {
  assert.deepEqual(splitCardDocument("Plain Title\n\nBody copy"), {
    headline: "Plain Title",
    body: "Body copy",
    prefix: "",
    editableHeadline: true,
  });
  assert.deepEqual(splitCardDocument("## Subheading\nDetails"), {
    headline: "",
    body: "## Subheading\nDetails",
    prefix: "# ",
    editableHeadline: false,
  });
  assert.deepEqual(splitCardDocument("- checklist item"), {
    headline: "",
    body: "- checklist item",
    prefix: "# ",
    editableHeadline: false,
  });
});

test("joinCardDocument reconstructs canonical Markdown without synthetic empty headings", () => {
  assert.equal(joinCardDocument("", "", "# "), "");
  assert.equal(joinCardDocument("My Card", "", "# "), "# My Card");
  assert.equal(joinCardDocument("My Card", "Hello world", "# "), "# My Card\n\nHello world");
  assert.equal(joinCardDocument("", "Hello world", "# "), "Hello world");
  assert.equal(joinCardDocument("Plain", "Rest", ""), "Plain\n\nRest");
});
