import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceActivitySession,
  combineActivityStats,
  currentSegmentSeconds,
  currentSessionSeconds,
  localDate,
  materializeActivitySession,
  resumeActivitySession,
  activitySegmentId,
} from "./activity-timer.ts";
import type { ManualActivitySession } from "./activity-timer.ts";

function runningSession(now: number): ManualActivitySession {
  const activityDate = localDate(new Date(now));
  return {
    logicalSessionId: "session-1",
    segmentId: activitySegmentId("session-1", activityDate),
    activityDate,
    status: "running",
    sessionAccumulatedSeconds: 0,
    segmentAccumulatedSeconds: 0,
    runningSince: now,
    baselineTodaySeconds: 3600,
    baselineTotalSeconds: 7200,
  };
}

test("manual session only accumulates while running and preserves pause/resume", () => {
  const start = new Date(2026, 8, 6, 8, 0, 0).getTime();
  const running = runningSession(start);
  assert.equal(currentSessionSeconds(running, start + 10 * 60_000), 600);

  const paused = materializeActivitySession(running, start + 10 * 60_000);
  assert.equal(paused.status, "paused");
  assert.equal(currentSessionSeconds(paused, start + 30 * 60_000), 600);

  const resumed = resumeActivitySession(paused, start + 30 * 60_000);
  assert.equal(currentSessionSeconds(resumed, start + 40 * 60_000), 1200);
});

test("midnight splits persistence segments while retaining one logical session", () => {
  const start = new Date(2026, 8, 6, 23, 59, 30).getTime();
  const now = new Date(2026, 8, 7, 0, 0, 30).getTime();
  const result = advanceActivitySession(runningSession(start), now);
  const startDate = localDate(new Date(start));
  const nextDate = localDate(new Date(now));

  assert.deepEqual(result.completed, [{ id: activitySegmentId("session-1", startDate), date: startDate, activeSeconds: 30 }]);
  assert.equal(result.session.logicalSessionId, "session-1");
  assert.equal(result.session.segmentId, activitySegmentId("session-1", nextDate));
  assert.equal(result.session.activityDate, nextDate);
  assert.equal(result.session.sessionAccumulatedSeconds, 30);
  assert.equal(currentSegmentSeconds(result.session, now), 30);
  assert.equal(currentSessionSeconds(result.session, now), 60);
});

test("today and total can aggregate different portions of a cross-day session", () => {
  assert.deepEqual(
    combineActivityStats({ todaySeconds: 3600, totalSeconds: 7200 }, 600, 900),
    { todaySeconds: 4200, totalSeconds: 8100 },
  );
});

test("study totals clamp invalid negative inputs", () => {
  assert.deepEqual(
    combineActivityStats({ todaySeconds: -1, totalSeconds: -2 }, -3, -4),
    { todaySeconds: 0, totalSeconds: 0 },
  );
});
