import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceStudySession,
  combineStudyStats,
  currentSegmentSeconds,
  currentSessionSeconds,
  localDate,
  materializeStudySession,
  resumeStudySession,
} from "./study-timer.ts";
import type { ManualStudySession } from "./study-timer.ts";

function runningSession(now: number): ManualStudySession {
  return {
    segmentId: "segment-1",
    activityDate: localDate(new Date(now)),
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

  const paused = materializeStudySession(running, start + 10 * 60_000);
  assert.equal(paused.status, "paused");
  assert.equal(currentSessionSeconds(paused, start + 30 * 60_000), 600);

  const resumed = resumeStudySession(paused, start + 30 * 60_000);
  assert.equal(currentSessionSeconds(resumed, start + 40 * 60_000), 1200);
});

test("midnight splits one logical manual session into daily persistence segments", () => {
  const start = new Date(2026, 8, 6, 23, 59, 30).getTime();
  const now = new Date(2026, 8, 7, 0, 0, 30).getTime();
  const result = advanceStudySession(runningSession(start), now, () => "segment-2");

  assert.deepEqual(result.completed, [{ id: "segment-1", date: localDate(new Date(start)), activeSeconds: 30 }]);
  assert.equal(result.session.activityDate, localDate(new Date(now)));
  assert.equal(result.session.sessionAccumulatedSeconds, 30);
  assert.equal(currentSegmentSeconds(result.session, now), 30);
  assert.equal(currentSessionSeconds(result.session, now), 60);
});

test("today and total can aggregate different portions of a cross-day session", () => {
  assert.deepEqual(
    combineStudyStats({ todaySeconds: 3600, totalSeconds: 7200 }, 600, 900),
    { todaySeconds: 4200, totalSeconds: 8100 },
  );
});

test("study totals clamp invalid negative inputs", () => {
  assert.deepEqual(
    combineStudyStats({ todaySeconds: -1, totalSeconds: -2 }, -3, -4),
    { todaySeconds: 0, totalSeconds: 0 },
  );
});
