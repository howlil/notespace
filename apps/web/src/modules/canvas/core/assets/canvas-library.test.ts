import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { readStoredLibraryItems, writeStoredLibraryItems } from "./canvas-library.ts";

function installStorage(t: TestContext, storage?: Pick<Storage, "getItem" | "setItem">) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  });
  if (storage) Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  else Reflect.deleteProperty(globalThis, "window");
}

test("Canvas library remains optional during SSR", (t) => {
  installStorage(t);
  assert.deepEqual(readStoredLibraryItems(), []);
  assert.equal(writeStoredLibraryItems([]), false);
});

test("Canvas library uses its existing key/JSON shape and falls back for corrupt non-array values", (t) => {
  let raw: string | null = null;
  installStorage(t, {
    getItem(key) { assert.equal(key, "notespace.excalidraw.library.v1"); return raw; },
    setItem(key, value) { assert.equal(key, "notespace.excalidraw.library.v1"); raw = value; },
  });
  const items: LibraryItems = [{ id: "saved-symbol", status: "unpublished", created: 1, elements: [] }];
  assert.equal(writeStoredLibraryItems(items), true);
  assert.equal(raw, JSON.stringify(items));
  assert.deepEqual(readStoredLibraryItems(), items);
  for (const invalid of [null, "{broken", "null", "{}", "123"]) {
    raw = invalid;
    assert.deepEqual(readStoredLibraryItems(), []);
  }
});

test("denied/quota-limited library storage retains read fallback and write failure signal", (t) => {
  installStorage(t, {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
  });
  assert.deepEqual(readStoredLibraryItems(), []);
  assert.equal(writeStoredLibraryItems([]), false);
});
