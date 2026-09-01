import { test } from "node:test";
import assert from "node:assert/strict";
import { Autosave } from "./autosave.ts";

test("serializes writes and saves latest edits made during a slow request", async () => {
  const calls: Array<[string, number]> = [];
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const saver = new Autosave(
    1,
    async (value: string, version) => {
      calls.push([value, version]);
      if (calls.length === 1) await wait;
      return { version: version + 1 };
    },
    60_000,
  );
  saver.schedule("first");
  const navigation = saver.flush();
  saver.schedule("intermediate");
  saver.schedule("latest");
  assert.equal(saver.flush(), navigation);
  release();
  await navigation;
  assert.deepEqual(calls, [
    ["first", 1],
    ["latest", 2],
  ]);
  assert.equal(saver.dirty, false);
});

test("failed writes retain newest edits and retry using the unacknowledged version", async () => {
  const calls: Array<[string, number]> = [];
  const statuses: string[] = [];
  const saver = new Autosave(
    4,
    async (value: string, version) => {
      calls.push([value, version]);
      if (calls.length === 1) throw new Error("Storage unavailable");
      return { version: version + 1 };
    },
    60_000,
  );
  saver.subscribe((status) => statuses.push(status.state));
  saver.schedule("keep me");
  await assert.rejects(saver.flush(), /Storage unavailable/);
  assert.equal(saver.dirty, true);
  assert.equal(statuses.at(-1), "error");
  saver.schedule("newest edit");
  await saver.flush();
  assert.deepEqual(calls, [
    ["keep me", 4],
    ["newest edit", 4],
  ]);
  assert.equal(statuses.at(-1), "saved");
});

test("independent project queues cannot write each other’s content", async () => {
  const written: string[] = [];
  const one = new Autosave(
    1,
    async (v: string) => {
      written.push("one:" + v);
      return { version: 2 };
    },
    60_000,
  );
  const two = new Autosave(
    1,
    async (v: string) => {
      written.push("two:" + v);
      return { version: 2 };
    },
    60_000,
  );
  one.schedule("Raft");
  two.schedule("TCP");
  await Promise.all([one.flush(), two.flush()]);
  assert.deepEqual(written.sort(), ["one:Raft", "two:TCP"]);
});
