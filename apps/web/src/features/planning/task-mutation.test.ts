import assert from "node:assert/strict";
import { test } from "node:test";
import { APIError } from "../../adapters/http/client.ts";
import type { PlanningTask } from "../../domain/planning/planning.ts";
import { matchesRequestedPatch, mergeCreatedTask, reconcileTaskDelete, reconcileTaskPatch } from "./task-mutation.ts";

const task = (version = 1): PlanningTask => ({
  id: "t1", workspaceId: "w1", title: "Review", description: "", position: 0,
  plannedFor: "2026-10-25", completedAt: null, version,
  createdAt: "2026-10-25T01:00:00Z", updatedAt: "2026-10-25T01:00:00Z",
});
test("confirmation uses the successful authoritative update result", async () => {
  const outcome = await reconcileTaskPatch(task(), { completed: true },
    async () => ({ ...task(2), completedAt: "2026-10-25T02:00:00Z" }),
    async () => { throw Error("should not refetch"); });
  assert.equal(outcome.status, "confirmed");
  assert.equal(outcome.status === "confirmed" && outcome.reconciled, false);
});
test("lost response reconciles version+1 and exact requested completion", async () => {
  const outcome = await reconcileTaskPatch(task(), { completed: true },
    async () => { throw Error("network response lost"); },
    async () => ({ ...task(2), completedAt: "2026-10-25T02:00:00Z" }));
  assert.equal(outcome.status, "confirmed");
  assert.equal(outcome.status === "confirmed" && outcome.reconciled, true);
});
test("foreign edit, stale version, and other planned date must not claim success", async () => {
  for (const current of [
    { ...task(2), title: "Someone else's update" },
    { ...task(3), completedAt: "2026-10-25T02:00:00Z" },
    { ...task(1), completedAt: "2026-10-25T02:00:00Z" },
  ]) {
    const value = await reconcileTaskPatch(task(), { completed: true },
      async () => { throw new APIError(409, "Conflict"); },
      async () => current);
    assert.equal(value.status, "conflict");
  }
  assert.equal(matchesRequestedPatch({ ...task(2), plannedFor: undefined }, { plannedFor: "" }), true);
  assert.equal(matchesRequestedPatch(task(2), { plannedFor: "" }), false);
});
test("missing Task and unknown read failure stay distinct", async () => {
  const missing = await reconcileTaskPatch(task(), { title: "Edit" },
    async () => { throw Error("response lost"); },
    async () => { throw new APIError(404, "Not found"); });
  const unknown = await reconcileTaskPatch(task(), { title: "Edit" },
    async () => { throw Error("offline"); },
    async () => { throw Error("offline"); });
  assert.equal(missing.status, "missing");
  assert.equal(unknown.status, "unknown");
});

test("delete reconciliation confirms an acknowledged delete without reading", async () => {
  let reads = 0;
  const result = await reconcileTaskDelete("t1", async () => {}, async () => {
    reads++;
    return task();
  });
  assert.equal(result.status, "confirmed");
  assert.equal(reads, 0);
});

test("delete reconciliation verifies a committed delete after the response is lost", async () => {
  const result = await reconcileTaskDelete("t1", async () => {
    throw Error("lost response");
  }, async () => {
    throw new APIError(404, "Not found");
  });
  assert.equal(result.status, "confirmed");
});

test("delete reconciliation never claims success while Task exists or verification fails", async () => {
  const exists = await reconcileTaskDelete("t1", async () => {
    throw new APIError(409, "Conflict");
  }, async () => task(2));
  assert.equal(exists.status, "exists");
  assert.equal(exists.status === "exists" && exists.task.version, 2);

  const unknown = await reconcileTaskDelete("t1", async () => {
    throw Error("network failure");
  }, async () => {
    throw Error("offline");
  });
  assert.equal(unknown.status, "unknown");
});

test("successful keyed Task replay upserts by ID and never reverts a newer state", () => {
  const current = { ...task(3), title: "Edited elsewhere" };
  const replayed = task(1);
  assert.deepEqual(mergeCreatedTask([current], replayed), [current]);
  assert.deepEqual(mergeCreatedTask([task(1)], task(2)), [task(2)]);
  assert.deepEqual(mergeCreatedTask([], task(1)), [task(1)]);
  assert.equal(mergeCreatedTask([current], replayed).length, 1);
});
