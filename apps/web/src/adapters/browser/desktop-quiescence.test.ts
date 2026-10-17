import assert from "node:assert/strict";
import test from "node:test";
import {
  beginDesktopQuiescence,
  flushDesktopState,
  sealDesktopWrites,
  trackDesktopMutation,
} from "./desktop-lifecycle.ts";

function enableFakeDesktop() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const fake = new EventTarget();
  Object.assign(fake, { __TAURI_INTERNALS__: {} });
  Object.defineProperty(globalThis, "window", { configurable: true, value: fake });
  return () => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

test("desktop flush waits for all mutation HTTP operations before write seal", async () => {
  const reset = enableFakeDesktop();
  let resolveWrite!: () => void;
  const pending = new Promise<void>((resolve) => { resolveWrite = resolve; });
  const release = beginDesktopQuiescence();
  try {
    const mutation = trackDesktopMutation(() => pending);
    let completed = false;
    const flush = flushDesktopState().then(() => { completed = true; });
    await Promise.resolve();
    assert.equal(completed, false);
    assert.throws(() => sealDesktopWrites(), /pending/);
    resolveWrite();
    await mutation;
    await flush;
    sealDesktopWrites();
    await assert.rejects(trackDesktopMutation(async () => {}), /writes are paused/);
  } finally {
    release();
    reset();
  }
});

test("quiescence is single-owner and releases the input barrier after failure", async () => {
  const reset = enableFakeDesktop();
  try {
    const release = beginDesktopQuiescence();
    assert.throws(() => beginDesktopQuiescence(), /already in progress/);
    release();
    const retry = beginDesktopQuiescence();
    retry();
  } finally { reset(); }
});
