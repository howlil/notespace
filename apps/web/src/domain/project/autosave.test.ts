import { test } from "node:test";
import assert from "node:assert/strict";
import { Autosave, BlockingAutosaveError } from "./autosave.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

test("max wait checkpoints the latest snapshot during continuous edits", async () => {
  const calls: Array<[string, number]> = [];
  const saver = new Autosave(
    1,
    async (value: string, version) => {
      calls.push([value, version]);
      return { version: version + 1 };
    },
    50,
    120,
  );

  saver.schedule("first");
  await sleep(40);
  saver.schedule("second");
  await sleep(40);
  saver.schedule("latest");
  await sleep(70);

  assert.deepEqual(calls, [["latest", 1]]);
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

test("blocking save errors enter conflict state and prevent automatic retry", async () => {
  const statuses: string[] = [];
  let calls = 0;
  const saver = new Autosave(
    1,
    async (): Promise<{ version: number }> => {
      calls += 1;
      throw new BlockingAutosaveError("Workspace conflict");
    },
    60_000,
  );
  saver.subscribe((status) => statuses.push(status.state));
  saver.schedule("draft");
  await assert.rejects(saver.flush(), /Workspace conflict/);
  assert.equal(statuses.at(-1), "conflict");
  assert.equal(saver.dirty, true);

  saver.schedule("newer draft");
  await assert.rejects(saver.flush(), /Workspace conflict/);
  assert.equal(calls, 1);
  assert.equal(statuses.at(-1), "conflict");
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

test("can rebase a queued snapshot after an in-flight save is acknowledged", async () => {
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
  const saving = saver.flush();
  saver.schedule("stale queued");
  saver.replacePending("rebased queued");
  release();
  await saving;

  assert.deepEqual(calls, [
    ["first", 1],
    ["rebased queued", 2],
  ]);
});
