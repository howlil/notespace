import assert from "node:assert/strict";
import test from "node:test";
import { combineStudyStats, rollStudyBaseline } from "./study-timer.ts";

test("study totals add the current session to persisted baseline", () => {
  assert.deepEqual(
    combineStudyStats({ todaySeconds: 3600, totalSeconds: 7200 }, 600),
    { todaySeconds: 4200, totalSeconds: 7800 },
  );
});

test("day rollover moves the completed session into total baseline and resets today", () => {
  const rolled = rollStudyBaseline({ todaySeconds: 3600, totalSeconds: 7200 }, 600);
  assert.deepEqual(rolled, { todaySeconds: 0, totalSeconds: 7800 });
  assert.deepEqual(combineStudyStats(rolled, 120), { todaySeconds: 120, totalSeconds: 7920 });
});

test("study totals clamp invalid negative inputs", () => {
  assert.deepEqual(
    combineStudyStats({ todaySeconds: -1, totalSeconds: -2 }, -3),
    { todaySeconds: 0, totalSeconds: 0 },
  );
});
