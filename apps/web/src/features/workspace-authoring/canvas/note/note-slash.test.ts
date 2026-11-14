import assert from "node:assert/strict";
import test from "node:test";
import { noteSlashQuery } from "./note-slash.ts";

test("a slash opens a command at the start of text or after whitespace", () => {
  assert.equal(noteSlashQuery("/"), "");
  assert.equal(noteSlashQuery("/head"), "head");
  assert.equal(noteSlashQuery("intro line\n/ta"), "ta");
  assert.equal(noteSlashQuery("text /ta"), "ta");
});

test("a slash inside a word, a URL, or after a finished command stays plain text", () => {
  assert.equal(noteSlashQuery("a/b"), null);
  assert.equal(noteSlashQuery("https://example.com/path"), null);
  assert.equal(noteSlashQuery("/heading "), null, "a space closes the command");
  assert.equal(noteSlashQuery(""), null);
});
