import assert from "node:assert/strict";
import test from "node:test";
import { detectMentionTrigger, formatNoteMentionLink } from "./mention-trigger.ts";

test("detectMentionTrigger matches [[wikilink triggers", () => {
  const doc = "See [[tcp hand";
  assert.deepEqual(detectMentionTrigger(doc, doc.length), {
    kind: "wikilink",
    query: "tcp hand",
    from: 4,
    to: doc.length,
  });

  assert.deepEqual(detectMentionTrigger("[[", 2), {
    kind: "wikilink",
    query: "",
    from: 0,
    to: 2,
  });
});

test("detectMentionTrigger ignores closed [[wikilink]]", () => {
  const doc = "See [[tcp]] and more";
  assert.equal(detectMentionTrigger(doc, doc.length), null);
});

test("detectMentionTrigger matches whitespace-preceded @mentions and rejects emails", () => {
  assert.deepEqual(detectMentionTrigger("@roadmap", 8), {
    kind: "at",
    query: "roadmap",
    from: 0,
    to: 8,
  });

  assert.deepEqual(detectMentionTrigger("Link to @", 9), {
    kind: "at",
    query: "",
    from: 8,
    to: 9,
  });

  assert.equal(detectMentionTrigger("Email foo@bar.com", 17), null);
  assert.equal(detectMentionTrigger("user@domain", 11), null);
});

test("detectMentionTrigger ignores triggers inside inline code or fenced code blocks", () => {
  assert.equal(detectMentionTrigger("Use `[[code` here", 11), null);
  assert.equal(detectMentionTrigger("Use `@user` and `@other", 23), null);
  assert.deepEqual(detectMentionTrigger("`done` and [[next", 17), {
    kind: "wikilink",
    query: "next",
    from: 11,
    to: 17,
  });

  const fenced = "```md\n[[inside\n```";
  assert.equal(detectMentionTrigger(fenced, 14), null);
  const afterFence = "```md\ncode\n```\n@ok";
  assert.deepEqual(detectMentionTrigger(afterFence, afterFence.length), {
    kind: "at",
    query: "ok",
    from: 15,
    to: afterFence.length,
  });
});

test("formatNoteMentionLink sanitizes label and encodes noteId", () => {
  assert.equal(
    formatNoteMentionLink("My [Note]\nTitle", "note 1/2"),
    "[My Note Title](/workspaces/_?noteId=note%201%2F2)",
  );
  assert.equal(
    formatNoteMentionLink("   ", "abc"),
    "[Untitled Note](/workspaces/_?noteId=abc)",
  );
});
