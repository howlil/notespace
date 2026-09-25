import assert from "node:assert/strict";
import test from "node:test";
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from "./local-storage.ts";

test("browser storage is inert when no window exists", () => {
  assert.equal(readLocalStorage("notespace:test"), null);
  assert.equal(writeLocalStorage("notespace:test", "value"), false);
  assert.doesNotThrow(() => removeLocalStorage("notespace:test"));
});


test("browser storage reads, writes, and removes values when localStorage is available", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      },
    },
  });

  try {
    assert.equal(writeLocalStorage("notespace:test", "value"), true);
    assert.equal(readLocalStorage("notespace:test"), "value");
    removeLocalStorage("notespace:test");
    assert.equal(readLocalStorage("notespace:test"), null);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});

test("browser storage failures degrade safely without throwing callers", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => { throw new DOMException("blocked", "SecurityError"); },
        setItem: () => { throw new DOMException("quota", "QuotaExceededError"); },
        removeItem: () => { throw new DOMException("blocked", "SecurityError"); },
      },
    },
  });

  try {
    assert.equal(readLocalStorage("notespace:test"), null);
    assert.equal(writeLocalStorage("notespace:test", "value"), false);
    assert.doesNotThrow(() => removeLocalStorage("notespace:test"));
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete (globalThis as { window?: unknown }).window;
  }
});
