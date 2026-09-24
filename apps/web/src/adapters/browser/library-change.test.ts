import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getLibraryRevision,
  notifyLibraryChanged,
  subscribeLibraryChanges,
} from "./library-change.ts";

test("library change subscription observes revisions until unsubscribed", () => {
  const start = getLibraryRevision();
  let calls = 0;
  const unsubscribe = subscribeLibraryChanges(() => { calls += 1; });

  notifyLibraryChanged();
  assert.equal(getLibraryRevision(), start + 1);
  assert.equal(calls, 1);

  unsubscribe();
  notifyLibraryChanged();
  assert.equal(getLibraryRevision(), start + 2);
  assert.equal(calls, 1);
});
