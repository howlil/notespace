import assert from "node:assert/strict";
import { test } from "node:test";
import type { PlanningMilestone, WorkspacePlan } from "../../domain/planning/planning.ts";
import { matchesMilestonePatch, reconcileMilestonePatch } from "./milestone-mutation.ts";

const milestone = (version = 1): PlanningMilestone => ({
  id: "m1", workspaceId: "w1", title: "Ship MVP", position: 0, completedAt: null,
  createdAt: "2026-10-26T00:00:00Z", updatedAt: "2026-10-26T00:00:00Z", version,
});
const plan = (...milestones: PlanningMilestone[]): WorkspacePlan => ({
  workspaceId: "w1", milestones, tasks: [],
});

test("Milestone PATCH response succeeds without another read", async () => {
  const expected = { ...milestone(2), title: "Release" };
  const result = await reconcileMilestonePatch(
    milestone(), { title: "Release" }, async () => expected,
    async () => { throw Error("unexpected read"); },
  );
  assert.deepEqual(result, { status: "confirmed", milestone: expected, reconciled: false });
});

test("lost Milestone PATCH response confirms only next-version matching content", async () => {
  const committed = { ...milestone(2), title: "Release", completedAt: "2026-10-26T01:00:00Z" };
  const result = await reconcileMilestonePatch(
    milestone(), { title: "Release" }, async () => { throw Error("dropped response"); },
    async () => plan(committed),
  );
  assert.deepEqual(result, { status: "confirmed", milestone: committed, reconciled: true });
  assert.equal(matchesMilestonePatch(committed, { completed: true }), true);
  assert.equal(matchesMilestonePatch(committed, { completed: false }), false);
});

test("foreign edit or intervening version must not confirm an old Milestone edit", async () => {
  for (const updated of [
    { ...milestone(2), title: "Other edit" },
    { ...milestone(3), title: "Release" },
    { ...milestone(1), title: "Release" },
  ]) {
    const result = await reconcileMilestonePatch(
      milestone(), { title: "Release" }, async () => { throw Error("PATCH failed"); },
      async () => plan(updated),
    );
    assert.deepEqual(result, { status: "conflict", milestone: updated });
  }
});

test("failed Milestone PATCH with unchanged server revision is not mislabeled a conflict", async () => {
  const original = milestone();
  const result = await reconcileMilestonePatch(
    original, { title: "Release" }, async () => { throw Error("503 before commit"); },
    async () => plan(original),
  );
  assert.deepEqual(result, { status: "not-applied", milestone: original });
});

test("deleted Milestone, failed read, and unrelated Workspace remain unconfirmed", async () => {
  const failure = async () => { throw Error("failed response"); };
  const deleted = await reconcileMilestonePatch(milestone(), { completed: true }, failure, async () => plan());
  assert.deepEqual(deleted, { status: "missing" });
  const unavailable = await reconcileMilestonePatch(milestone(), { completed: true }, failure, failure);
  assert.deepEqual(unavailable, { status: "unknown" });
  const wrongPlan = await reconcileMilestonePatch(milestone(), { completed: true }, failure,
    async () => ({ ...plan(milestone(2)), workspaceId: "w2" }));
  assert.deepEqual(wrongPlan, { status: "unknown" });
});
