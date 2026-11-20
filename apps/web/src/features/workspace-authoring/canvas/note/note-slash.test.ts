import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTE_SLASH_COMMANDS,
  filterNoteSlashCommands,
  noteMentionQuery,
  noteSlashQuery,
} from "./note-slash.ts";

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

test("noteMentionQuery detects [[ bracket mentions with spaces and ignores closed or multiline brackets", () => {
  assert.deepEqual(noteMentionQuery("[["), { trigger: "[[", query: "", matchLength: 2 });
  assert.deepEqual(noteMentionQuery("See [[Design doc"), { trigger: "[[", query: "Design doc", matchLength: 12 });
  assert.equal(noteMentionQuery("See [[Design doc]]"), null);
  assert.equal(noteMentionQuery("See [[line 1\nline 2"), null);
  assert.equal(noteMentionQuery("See [[nested["), null);
});

test("noteMentionQuery detects @ mentions at start or after whitespace and never mid-email", () => {
  assert.deepEqual(noteMentionQuery("@"), { trigger: "@", query: "", matchLength: 1 });
  assert.deepEqual(noteMentionQuery("@plan"), { trigger: "@", query: "plan", matchLength: 5 });
  assert.deepEqual(noteMentionQuery("link to @plan"), { trigger: "@", query: "plan", matchLength: 5 });
  assert.deepEqual(noteMentionQuery("line 1\n@plan"), { trigger: "@", query: "plan", matchLength: 5 });
  assert.deepEqual(noteMentionQuery("[[done]] @next"), { trigger: "@", query: "next", matchLength: 5 });
  assert.equal(noteMentionQuery("foo@bar"), null, "mid-email must not open mention menu");
  assert.equal(noteMentionQuery("user@example.com"), null);
  assert.equal(noteMentionQuery("@plan "), null, "whitespace closes @ mention");
  assert.equal(noteMentionQuery("@@"), null);
  assert.equal(noteMentionQuery(""), null);
});

test("NOTE_SLASH_COMMANDS exposes the complete catalog and filterNoteSlashCommands matches labels and aliases", () => {
  assert.deepEqual(
    NOTE_SLASH_COMMANDS.map((command) => command.label),
    [
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Bullet list",
      "Numbered list",
      "Checklist",
      "Toggle",
      "Code block",
      "Quote",
      "Callout",
      "Divider",
      "Table",
      "Image",
      "Math",
      "Embed note",
      "Block reference",
      "Extract to Note",
    ],
  );

  assert.equal(filterNoteSlashCommands("").length, NOTE_SLASH_COMMANDS.length);
  assert.equal(filterNoteSlashCommands("h1")[0]?.id, "heading1");
  assert.equal(filterNoteSlashCommands("h2")[0]?.id, "heading2");
  assert.equal(filterNoteSlashCommands("h3")[0]?.id, "heading3");
  assert.equal(filterNoteSlashCommands("ul")[0]?.id, "bulletList");
  assert.equal(filterNoteSlashCommands("ol")[0]?.id, "orderedList");
  assert.equal(filterNoteSlashCommands("todo")[0]?.id, "taskList");
  assert.equal(filterNoteSlashCommands("checklist")[0]?.id, "taskList");
  assert.equal(filterNoteSlashCommands("collapse")[0]?.id, "toggle");
  assert.equal(filterNoteSlashCommands("code")[0]?.id, "codeBlock");
  assert.equal(filterNoteSlashCommands("quote")[0]?.id, "blockquote");
  assert.equal(filterNoteSlashCommands("callout")[0]?.id, "callout");
  assert.equal(filterNoteSlashCommands("hr")[0]?.id, "divider");
  assert.equal(filterNoteSlashCommands("table")[0]?.id, "table");
  assert.equal(filterNoteSlashCommands("img")[0]?.id, "image");
  assert.equal(filterNoteSlashCommands("latex")[0]?.id, "math");
  assert.equal(filterNoteSlashCommands("embed")[0]?.id, "embedNote");
  assert.equal(filterNoteSlashCommands("block")[0]?.id, "blockReference");
  assert.equal(filterNoteSlashCommands("extract")[0]?.id, "extractToNote");
  assert.deepEqual(filterNoteSlashCommands("zzzz-no-match"), []);
});
