import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flushDesktopState,
  registerDesktopFlush,
} from "./durability-barrier.ts";

test("desktop flush registration supports multiple concurrent authoring flushers", async () => {
  const order: string[] = [];
  const unregisterA = registerDesktopFlush(async () => { order.push("a"); });
  const unregisterB = registerDesktopFlush(async () => { order.push("b"); });

  await flushDesktopState();
  assert.deepEqual(order, ["a", "b"]);

  unregisterA();
  unregisterA(); // idempotent
  order.length = 0;

  await flushDesktopState();
  assert.deepEqual(order, ["b"]);

  unregisterB();
  order.length = 0;

  await flushDesktopState();
  assert.deepEqual(order, []);
});
