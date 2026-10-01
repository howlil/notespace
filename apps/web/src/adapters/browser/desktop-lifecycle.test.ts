import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flushDesktopState,
  registerDesktopFlush,
} from "./desktop-lifecycle.ts";

test("desktop flush registration owns the current authoring session", async () => {
  let calls = 0;
  const unregister = registerDesktopFlush(async () => { calls += 1; });

  await flushDesktopState();
  assert.equal(calls, 1);

  unregister();
  await flushDesktopState();
  assert.equal(calls, 1);
});
