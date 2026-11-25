import assert from "node:assert/strict";
import test from "node:test";
import {
  getLibraryRevision,
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from "./library-invalidation.ts";

test("library invalidation increments revision monotonically and manages subscriptions", () => {
  const start = getLibraryRevision();
  let calls = 0;
  const unsubscribe = subscribeLibraryChanges(() => {
    calls += 1;
  });

  notifyLibraryChanged();
  notifyLibraryChanged();
  assert.equal(getLibraryRevision(), start + 2);
  assert.equal(calls, 2);

  unsubscribe();
  notifyLibraryChanged();
  assert.equal(getLibraryRevision(), start + 3);
  assert.equal(calls, 2);
});
