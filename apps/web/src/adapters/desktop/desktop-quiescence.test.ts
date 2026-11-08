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

test("settled network failures do not poison subsequent flushes", async () => {
  const reset = enableFakeDesktop();
  try {
    await assert.rejects(trackDesktopMutation(async () => {
      throw new Error("temporary transport failure");
    }), /temporary transport failure/);

    // The caller has handled that attempt. New successful work must not be
    // blocked forever by a global list of historical request errors.
    const release = beginDesktopQuiescence();
    try {
      await trackDesktopMutation(async () => {});
      await flushDesktopState();
      sealDesktopWrites();
    } finally {
      release();
    }
  } finally {
    reset();
  }
});

test("a mutation rejected during an active flush prevents the write seal", async () => {
  const reset = enableFakeDesktop();
  let rejectWrite!: (reason: Error) => void;
  try {
    const failed = trackDesktopMutation(() => new Promise<void>((_, reject) => {
      rejectWrite = reject;
    }));
    const flushResult = flushDesktopState().then(() => null, error => error);
    rejectWrite(new Error("write failed during flush"));
    await assert.rejects(failed, /write failed during flush/);
    const error = await flushResult;
    assert.match(String(error), /write failed during flush/);
    // The failed operation has settled; the editor/feature retains the draft
    // or recovery obligation and decides whether another flush is safe.
    await flushDesktopState();
  } finally {
    reset();
  }
});
