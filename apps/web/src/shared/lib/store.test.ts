import assert from "node:assert/strict";
import test from "node:test";
import { createStore } from "./store.ts";

test("createStore notifies listeners only when state changes by Object.is", () => {
  const store = createStore({ count: 0, label: "a" });
  let notifications = 0;
  const unsubscribe = store.subscribe(() => {
    notifications += 1;
  });

  assert.deepEqual(store.getSnapshot(), { count: 0, label: "a" });

  // Returning the same reference is a no-op
  store.setState((current) => current);
  assert.equal(notifications, 0);

  // Updating with a new object notifies
  store.setState((current) => ({ ...current, count: current.count + 1 }));
  assert.equal(notifications, 1);
  assert.deepEqual(store.getSnapshot(), { count: 1, label: "a" });

  // Direct replacement with same reference is a no-op
  const currentRef = store.getSnapshot();
  store.setState(currentRef);
  assert.equal(notifications, 1);

  // Unsubscribe is idempotent and stops notifications
  unsubscribe();
  unsubscribe();
  store.setState({ count: 2, label: "b" });
  assert.equal(notifications, 1);
  assert.deepEqual(store.getSnapshot(), { count: 2, label: "b" });
});

test("createStore supports multiple independent subscribers", () => {
  const store = createStore(1);
  const seenA: number[] = [];
  const seenB: number[] = [];

  const unsubA = store.subscribe(() => seenA.push(store.getSnapshot()));
  const unsubB = store.subscribe(() => seenB.push(store.getSnapshot()));

  store.setState(2);
  unsubA();
  store.setState(3);
  unsubB();
  store.setState(4);

  assert.deepEqual(seenA, [2]);
  assert.deepEqual(seenB, [2, 3]);
});
