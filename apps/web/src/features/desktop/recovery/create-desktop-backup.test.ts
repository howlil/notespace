import assert from "node:assert/strict";
import test from "node:test";
import { createDesktopBackupWith } from "./create-desktop-backup.ts";

test("a manual recovery copy starts only after pending writes flush", async () => {
  const calls: string[] = [];
  const result = await createDesktopBackupWith({
    flush: async () => { calls.push("flush"); },
    snapshot: async () => { calls.push("snapshot"); return "saved"; },
  });
  assert.equal(result, "saved");
  assert.deepEqual(calls, ["flush", "snapshot"]);
});

test("failed writes never create a misleading backup", async () => {
  let invoked = false;
  await assert.rejects(createDesktopBackupWith({
    flush: async () => { throw new Error("autosave failed"); },
    snapshot: async () => { invoked = true; },
  }), /autosave failed/);
  assert.equal(invoked, false);
});

test("snapshot failure cannot be mistaken for successful backup", async () => {
  await assert.rejects(createDesktopBackupWith({
    flush: async () => {},
    snapshot: async () => { throw new Error("disk full"); },
  }), /disk full/);
});
