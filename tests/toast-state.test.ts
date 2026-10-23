import test from "node:test";
import assert from "node:assert/strict";
import { enqueueToast, toastDuration, updateToastItem } from "../apps/web/src/shared/ui/toast-state.ts";

test("updating a stable toast ID preserves its queue position", () => {
  const a = enqueueToast([], { message: "Saving", kind: "loading" }, "a");
  const b = enqueueToast(a, { message: "Hello" }, "b");
  const next = enqueueToast(b, { message: "Save failed", kind: "error" }, "a");
  assert.deepEqual(next.map((x) => x.id), ["b", "a"]);
  assert.equal(next[1]?.version, 1);
});

test("error recovery transitions to nonpersistent success", () => {
  const first = enqueueToast([], { message: "Error", kind: "error", action: { label: "Retry", onClick() {} } }, "a");
  assert.equal(first[0]?.duration, Infinity);
  const next = updateToastItem(first, "a", { kind: "success", message: "Saved", action: undefined });
  assert.equal(next[0]?.duration, 4200);
  assert.equal(next[0]?.action, undefined);
  assert.equal(toastDuration("warning"), 7000);
});
