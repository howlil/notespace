import assert from "node:assert/strict";
import test from "node:test";
import type { Note } from "../../../../adapters/http/note-api";
import type { NoteDocument } from "../../../../domain/note/note";
import { aggregateSaveStatus, createCanvasNoteStore, type CanvasNoteStoreDeps } from "./canvas-note-store.ts";

const doc = (text: string): NoteDocument => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const note = (id: string, revision: number, document = doc(`r${revision}`)): Note => ({ id, schemaVersion: 1, revision, document, createdAt: "", updatedAt: "" });
const httpError = (status: number, message = `HTTP ${status}`) => Object.assign(new Error(message), { status });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function manualTimers() {
  const callbacks = new Map<number, () => void>();
  let next = 0;
  return {
    setTimer: (callback: () => void) => { next += 1; callbacks.set(next, callback); return next; },
    clearTimer: (handle: unknown) => { callbacks.delete(handle as number); },
    runAll: () => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach((callback) => callback()); },
    get size() { return callbacks.size; },
  };
}

function setup(overrides: Partial<CanvasNoteStoreDeps> = {}) {
  const timers = manualTimers();
  const errors: string[] = [];
  const store = createCanvasNoteStore({
    getNote: async (id) => note(id, 1),
    updateNote: async (id, document, expectedRevision) => note(id, expectedRevision + 1, document),
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...overrides,
  });
  return { store, timers, errors };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("ensure loads each referenced Note once and exposes loading, ready, missing and failed entries", async () => {
  const calls: string[] = [];
  const { store } = setup({
    getNote: async (id) => {
      calls.push(id);
      if (id === "gone") throw httpError(404);
      if (id === "broken") throw httpError(500, "Server unavailable");
      return note(id, 3);
    },
  });
  store.ensure(["a", "a", "gone", "broken"]);
  store.ensure(["a"]);
  assert.deepEqual(store.getSnapshot().entries.a, { status: "loading" });
  await settle();
  const { entries } = store.getSnapshot();
  assert.deepEqual(calls, ["a", "gone", "broken"]);
  assert.equal(entries.a?.status === "ready" && entries.a.note.revision, 3);
  assert.deepEqual(entries.gone, { status: "missing" });
  assert.deepEqual(entries.broken, { status: "failed", message: "Server unavailable" });
  store.ensure(["gone", "broken"]);
  assert.equal(calls.length, 3, "missing and failed entries wait for an explicit retry");
  store.retry("broken");
  await settle();
  assert.equal(calls.length, 4);
});

test("queued edits debounce into one save and report pending, saving, then saved", async () => {
  const saves: Array<{ text: string; revision: number }> = [];
  const { store, timers } = setup({
    updateNote: async (id, document, expectedRevision) => {
      saves.push({ text: document.content[0]?.content?.[0]?.text ?? "", revision: expectedRevision });
      return note(id, expectedRevision + 1, document);
    },
  });
  const states: string[] = [];
  store.subscribe(() => states.push(store.getSnapshot().save.state));
  store.ensure(["a"]);
  await settle();
  store.queue("a", doc("one"));
  store.queue("a", doc("two"));
  assert.equal(timers.size, 1);
  assert.equal(store.getSnapshot().save.state, "pending");
  assert.deepEqual(store.getSnapshot().saves, { a: "pending" });
  timers.runAll();
  await settle();
  assert.deepEqual(saves, [{ text: "two", revision: 1 }]);
  const entry = store.getSnapshot().entries.a;
  assert.equal(entry?.status === "ready" && entry.note.revision, 2);
  assert.equal(store.getSnapshot().save.state, "saved");
  assert.deepEqual(store.getSnapshot().saves, {}, "saved Notes carry no per-card indicator");
  assert.ok(states.includes("saving"));
});

test("an acknowledgement never rewinds a newer local draft typed during the save", async () => {
  const first = deferred<Note>();
  const second = deferred<Note>();
  const saved: string[] = [];
  const { store } = setup({
    updateNote: (_id, document) => {
      saved.push(document.content[0]?.content?.[0]?.text ?? "");
      return saved.length === 1 ? first.promise : second.promise;
    },
  });
  const text = () => {
    const entry = store.getSnapshot().entries.a;
    return entry?.status === "ready" ? entry.note.document.content[0]?.content?.[0]?.text : undefined;
  };
  store.ensure(["a"]);
  await settle();
  store.queue("a", doc("older"));
  const flushing = store.flush("a");
  store.queue("a", doc("newer"));
  first.resolve(note("a", 2, doc("older")));
  await settle();
  assert.equal(text(), "newer", "the first acknowledgement must not show the older document");
  second.resolve(note("a", 3, doc("newer")));
  await flushing;
  const entry = store.getSnapshot().entries.a;
  assert.deepEqual(saved, ["older", "newer"]);
  assert.equal(entry?.status === "ready" && entry.note.document.content[0]?.content?.[0]?.text, "newer");
  assert.equal(entry?.status === "ready" && entry.note.revision, 3);
});

test("a failed save keeps the newest draft and a later flush persists it", async () => {
  let fail = true;
  const first = deferred<Note>();
  const persisted: string[] = [];
  const { store } = setup({
    updateNote: (id, document, expectedRevision) => {
      if (fail) { fail = false; return first.promise; }
      persisted.push(document.content[0]?.content?.[0]?.text ?? "");
      return Promise.resolve(note(id, expectedRevision + 1, document));
    },
  });
  store.ensure(["a"]);
  await settle();
  store.queue("a", doc("older"));
  const flushing = store.flush("a");
  store.queue("a", doc("newest"));
  first.reject(httpError(429, "Too many requests"));
  await assert.rejects(flushing, /Too many requests/);
  assert.deepEqual({ state: store.getSnapshot().save.state, message: store.getSnapshot().save.message }, { state: "error", message: "Too many requests" });
  await store.flushAll();
  assert.deepEqual(persisted, ["newest"]);
  assert.equal(store.getSnapshot().save.state, "saved");
});

test("a 409 conflict exposes recover, which rebases the draft on the latest revision", async () => {
  const writes: number[] = [];
  let latestRevision = 1;
  const { store } = setup({
    getNote: async (id) => note(id, latestRevision),
    updateNote: async (id, document, expectedRevision) => {
      writes.push(expectedRevision);
      if (expectedRevision !== latestRevision) throw httpError(409, "Stale revision");
      latestRevision += 1;
      return note(id, latestRevision, document);
    },
  });
  store.ensure(["a"]);
  await settle();
  latestRevision = 5;
  store.queue("a", doc("mine"));
  await assert.rejects(store.flush("a"), /Stale revision/);
  const conflict = store.getSnapshot().save;
  assert.equal(conflict.state, "conflict");
  assert.ok(conflict.recover);
  await conflict.recover();
  assert.deepEqual(writes, [1, 5]);
  const entry = store.getSnapshot().entries.a;
  assert.equal(entry?.status === "ready" && entry.note.revision, 6);
  assert.equal(store.getSnapshot().save.state, "saved");
});

test("debounced save failures surface only as the Note's save state, never as a second message", async () => {
  const { store, timers, errors } = setup({ updateNote: async () => { throw httpError(500, "Disk full"); } });
  store.ensure(["a"]);
  await settle();
  store.queue("a", doc("x"));
  timers.runAll();
  await settle();
  assert.equal(store.getSnapshot().save.state, "error");
  assert.equal(store.getSnapshot().save.message, "Disk full");
  assert.deepEqual(errors, [], "no toast-level message for a background save failure");
});

test("queue ignores Notes that are not loaded and the save summary prefers the most urgent state", () => {
  const { store, timers } = setup();
  store.queue("unknown", doc("x"));
  assert.equal(timers.size, 0);
  assert.equal(store.getSnapshot().save.state, "saved");
  assert.equal(aggregateSaveStatus([{ state: "pending" }, { state: "conflict" }, { state: "error" }]).state, "conflict");
  assert.equal(aggregateSaveStatus([]).state, "saved");
});

test("a failed non-conflict save exposes retry that resends the retained draft", async () => {
  let fail = true;
  const persisted: string[] = [];
  const { store } = setup({
    updateNote: async (id, document, expectedRevision) => {
      if (fail) { fail = false; throw httpError(500, "Server unavailable"); }
      persisted.push(document.content[0]?.content?.[0]?.text ?? "");
      return note(id, expectedRevision + 1, document);
    },
  });
  store.ensure(["a"]);
  await settle();
  store.queue("a", doc("draft"));
  await assert.rejects(store.flush("a"), /Server unavailable/);
  const failed = store.getSnapshot().save;
  assert.equal(failed.state, "error");
  assert.ok(failed.recover, "error states must offer a retry");
  await failed.recover?.();
  assert.deepEqual(persisted, ["draft"]);
  assert.equal(store.getSnapshot().save.state, "saved");
});
