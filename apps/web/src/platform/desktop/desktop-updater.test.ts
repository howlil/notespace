import assert from "node:assert/strict";
import test from "node:test";
import { isDesktopUpdaterEnabled } from "./desktop-updater.ts";

function restoreWindow() {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  return () => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  };
}

test("updater capability is unavailable in SSR and ordinary browsers without IPC", async (t) => {
  t.after(restoreWindow());
  Reflect.deleteProperty(globalThis, "window");
  assert.equal(await isDesktopUpdaterEnabled(), false);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  assert.equal(await isDesktopUpdaterEnabled(), false);
});

test("desktop capability uses the existing IPC command and preserves results/errors", async (t) => {
  t.after(restoreWindow());
  const calls: string[] = [];
  let enabled = true;
  let failure: Error | null = null;
  const invoke = async (command: string) => {
    calls.push(command);
    if (failure) throw failure;
    return enabled;
  };
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { __TAURI_INTERNALS__: { invoke } },
  });
  assert.equal(await isDesktopUpdaterEnabled(), true);
  enabled = false;
  assert.equal(await isDesktopUpdaterEnabled(), false);
  failure = new Error("native capability unavailable");
  await assert.rejects(isDesktopUpdaterEnabled(), failure);
  assert.deepEqual(calls, Array(3).fill("desktop_updater_enabled"));
});
